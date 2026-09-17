import { getDatabase, withTransaction } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';
import { TransactionRecord } from './ledger.js';
import { ChartOfAccountsRepository, ChartOfAccountRecord } from './chart_of_accounts.js';
import { JournalService, JournalEntryRecord } from './journal.js';
import { AccountingRepository } from './repository.js';

export interface JournalLine {
  id: string;
  account_number: string;
  account_name: string;
  account_type: string;
  debit_cents: number;
  credit_cents: number;
  description: string;
  entity_name: string; // Tenant, Vendor, or Contact
  class_name: string;  // Property name (QuickBooks Class)
}

export interface JournalEntry {
  entry_id: string;
  transaction_id: string;
  date_ms: number;
  reference_number: string;
  memo: string;
  lines: JournalLine[];
}

export interface QuickBooksExportResult {
  content: string;
  filename: string;
  mimeType: string;
  entryCount: number;
  totalDebitCents: number;
  totalCreditCents: number;
  transactionIds: string[];
}

export class QuickBooksService {
  /**
   * Fetch persistent double-entry journal entries from the General Ledger and map
   * them into QuickBooks export structures.
   * If transactions are provided, extracts corresponding persistent journal entries.
   */
  public static generateJournalEntries(transactions?: TransactionRecord[]): JournalEntry[] {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();

    // Cache properties and contacts for dimension mapping (Class & Customer/Vendor Name)
    const propertyRows = db.prepare(`
      SELECT id, name FROM properties WHERE operator_id = ? AND deleted_at IS NULL
    `).all(operatorId) as Array<{ id: string; name: string }>;
    const propertyMap = new Map<string, string>(propertyRows.map((p) => [p.id, p.name]));

    const contactRows = db.prepare(`
      SELECT id, first_name, last_name, company_name FROM contacts WHERE operator_id = ? AND deleted_at IS NULL
    `).all(operatorId) as Array<{ id: string; first_name: string; last_name: string; company_name: string | null }>;
    const contactMap = new Map<string, string>();
    for (const c of contactRows) {
      const name = c.company_name || `${c.first_name} ${c.last_name}`.trim();
      contactMap.set(c.id, name);
    }

    let persistentEntries: JournalEntryRecord[] = [];

    if (transactions !== undefined) {
      if (transactions.length > 0) {
        // Ensure transactions have backfilled journal entries
        JournalService.backfillLegacyTransactions();

        // Refresh transactions from repository to obtain newly backfilled journal_entry_id values.
        // Deleted/voided transactions are intentionally excluded: a null lookup means the stale
        // in-memory transaction should not be exported, even if it still carried a legacy journal_entry_id.
        const refreshedTxs = transactions
          .map((t) => AccountingRepository.getTransactionById(t.id))
          .filter((tx): tx is TransactionRecord => tx !== null);

        const txEntryIds = refreshedTxs
          .map((t) => t.journal_entry_id)
          .filter((id): id is string => Boolean(id));

        if (txEntryIds.length > 0) {
          persistentEntries = txEntryIds
            .map((id) => JournalService.getEntryById(id))
            .filter((e): e is JournalEntryRecord => Boolean(e));
        }
      }
      // If transactions was explicitly passed as empty array ([]), persistentEntries remains []
    } else {
      const result = JournalService.listEntries({ limit: 5000 });
      persistentEntries = result.entries;
    }

    const exportEntries: JournalEntry[] = [];

    for (const pe of persistentEntries) {
      if (pe.deleted_at || !pe.lines || pe.lines.length === 0) continue;

      const lines: JournalLine[] = pe.lines.map((l) => {
        const className = l.property_id ? (propertyMap.get(l.property_id) || 'General') : 'General';
        const entityName = l.contact_id ? (contactMap.get(l.contact_id) || '') : '';

        return {
          id: l.id,
          account_number: l.account_number || '',
          account_name: l.account_name || 'General Account',
          account_type: l.account_type || 'Expense',
          debit_cents: l.debit_cents,
          credit_cents: l.credit_cents,
          description: l.description || pe.memo,
          entity_name: entityName,
          class_name: className
        };
      });

      exportEntries.push({
        entry_id: pe.id,
        transaction_id: pe.source_id || pe.id,
        date_ms: pe.date_ms,
        reference_number: `JE-${pe.entry_number.toString().padStart(5, '0')}`,
        memo: pe.memo,
        lines
      });
    }

    return exportEntries;
  }

  /**
   * QuickBooks Online (QBO) Journal Entry Batch CSV Export.
   * Conforms to official QuickBooks Online Journal Entry import layout:
   * JournalNo,JournalDate,AccountName,Debit,Credit,Description,Name,Class
   */
  public static exportQboJournalCsv(entries: JournalEntry[]): QuickBooksExportResult {
    const headers = [
      'JournalNo',
      'JournalDate',
      'AccountName',
      'Debit',
      'Credit',
      'Description',
      'Name',
      'Class'
    ];

    const rows: string[] = [headers.join(',')];
    let totalDebitCents = 0;
    let totalCreditCents = 0;
    const txIds: string[] = [];

    for (const entry of entries) {
      txIds.push(entry.transaction_id);
      const journalNo = entry.reference_number;
      const d = new Date(entry.date_ms);
      // MM/DD/YYYY format preferred by QBO
      const journalDate = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;

      for (const line of entry.lines) {
        totalDebitCents += line.debit_cents;
        totalCreditCents += line.credit_cents;

        const debitStr = line.debit_cents > 0 ? (line.debit_cents / 100).toFixed(2) : '';
        const creditStr = line.credit_cents > 0 ? (line.credit_cents / 100).toFixed(2) : '';

        // Account designation with number if present
        const accountStr = line.account_number
          ? `${line.account_number} ${line.account_name}`
          : line.account_name;

        const csvLine = [
          QuickBooksService.escapeCsv(journalNo),
          QuickBooksService.escapeCsv(journalDate),
          QuickBooksService.escapeCsv(accountStr),
          debitStr,
          creditStr,
          QuickBooksService.escapeCsv(line.description),
          QuickBooksService.escapeCsv(line.entity_name),
          QuickBooksService.escapeCsv(line.class_name)
        ].join(',');

        rows.push(csvLine);
      }
    }

    return {
      content: rows.join('\r\n'),
      filename: `quickbooks-online-journal-${Date.now()}.csv`,
      mimeType: 'text/csv',
      entryCount: entries.length,
      totalDebitCents,
      totalCreditCents,
      transactionIds: txIds
    };
  }

  /**
   * QuickBooks Desktop IIF (Intuit Interchange Format) Generator.
   * Standard universal format for QuickBooks Desktop Pro/Premier/Enterprise general ledger imports.
   */
  public static exportDesktopIif(entries: JournalEntry[]): QuickBooksExportResult {
    const lines: string[] = [];

    // IIF Transaction Header specification
    lines.push('!TRNS\tTRNSID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO\tCLEAR');
    lines.push('!SPL\tSPLID\tTRNSTYPE\tDATE\tACCNT\tNAME\tCLASS\tAMOUNT\tDOCNUM\tMEMO\tCLEAR');
    lines.push('!ENDTRNS');

    let totalDebitCents = 0;
    let totalCreditCents = 0;
    const txIds: string[] = [];

    for (const entry of entries) {
      txIds.push(entry.transaction_id);
      const d = new Date(entry.date_ms);
      // IIF standard date format is MM/DD/YYYY
      const dateStr = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
      const docNum = entry.reference_number;

      if (entry.lines.length === 0) continue;

      let i = 0;
      for (const line of entry.lines) {
        totalDebitCents += line.debit_cents;
        totalCreditCents += line.credit_cents;

        // IIF net amount: Positive = Debit, Negative = Credit
        const netAmount = line.debit_cents > 0
          ? (line.debit_cents / 100).toFixed(2)
          : (-line.credit_cents / 100).toFixed(2);

        const accountStr = line.account_number
          ? `${line.account_number} ${line.account_name}`
          : line.account_name;

        const rowTag = i === 0 ? 'TRNS' : 'SPL';
        const rowId = line.id;
        const trnsType = 'GENERAL JOURNAL';
        const name = QuickBooksService.sanitizeIif(line.entity_name);
        const className = QuickBooksService.sanitizeIif(line.class_name);
        const memo = QuickBooksService.sanitizeIif(line.description || entry.memo);

        lines.push(`${rowTag}\t${rowId}\t${trnsType}\t${dateStr}\t${accountStr}\t${name}\t${className}\t${netAmount}\t${docNum}\t${memo}\tN`);
        i++;
      }

      lines.push('ENDTRNS');
    }

    return {
      content: lines.join('\r\n'),
      filename: `quickbooks-desktop-${Date.now()}.iif`,
      mimeType: 'application/qbd-iif',
      entryCount: entries.length,
      totalDebitCents,
      totalCreditCents,
      transactionIds: txIds
    };
  }

  /**
   * QuickBooks Web Connect / OFX Banking Format Generator.
   * Enables importing bank receipts and cash disbursements into QuickBooks Bank Feeds.
   */
  public static exportOfxWebConnect(
    transactions: TransactionRecord[],
    bankAccountName = 'Operating Checking'
  ): QuickBooksExportResult {
    let totalDebitCents = 0;
    let totalCreditCents = 0;
    const txIds: string[] = [];

    const now = new Date();
    const serverDate = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);

    let stmtTrns = '';

    for (const tx of transactions) {
      if (tx.deleted_at || tx.amount_cents <= 0) continue;

      let isBankImpact = false;
      let amountSignedCents = 0;
      let trnType = 'OTHER';

      switch (tx.transaction_type) {
        case 'payment':
          isBankImpact = true;
          amountSignedCents = tx.amount_cents;
          trnType = 'CREDIT'; // Deposit into bank
          break;
        case 'expense':
          isBankImpact = true;
          amountSignedCents = -tx.amount_cents;
          trnType = 'DEBIT'; // Outflow from bank
          break;
        case 'refund':
          isBankImpact = true;
          amountSignedCents = -tx.amount_cents;
          trnType = 'DEBIT';
          break;
        case 'deposit_inflow':
          isBankImpact = true;
          amountSignedCents = tx.amount_cents;
          trnType = 'DEP';
          break;
        case 'deposit_return':
          isBankImpact = true;
          amountSignedCents = -tx.amount_cents;
          trnType = 'DEBIT';
          break;
      }

      if (!isBankImpact) continue;

      txIds.push(tx.id);
      if (amountSignedCents > 0) {
        totalDebitCents += amountSignedCents;
      } else {
        totalCreditCents += Math.abs(amountSignedCents);
      }

      const txDate = new Date(tx.transaction_date).toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const amountFormatted = (amountSignedCents / 100).toFixed(2);
      const fitId = `GARRISON-${tx.id.replace(/-/g, '').slice(0, 20)}`;
      const memo = QuickBooksService.sanitizeXml(tx.description || tx.category);

      stmtTrns += `
<STMTTRN>
<TRNTYPE>${trnType}</TRNTYPE>
<DTPOSTED>${txDate}</DTPOSTED>
<TRNAMT>${amountFormatted}</TRNAMT>
<FITID>${fitId}</FITID>
<NAME>${memo.slice(0, 32)}</NAME>
<MEMO>${memo}</MEMO>
</STMTTRN>`;
    }

    const ofxContent = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<DTSERVER>${serverDate}</DTSERVER>
<LANGUAGE>ENG</LANGUAGE>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>${generateUUIDv7()}</TRNUID>
<STATUS>
<CODE>0</CODE>
<SEVERITY>INFO</SEVERITY>
</STATUS>
<STMTRS>
<CURDEF>USD</CURDEF>
<BANKACCTFROM>
<BANKID>123456789</BANKID>
<ACCTID>1010</ACCTID>
<ACCTTYPE>CHECKING</ACCTTYPE>
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${serverDate}</DTSTART>
<DTEND>${serverDate}</DTEND>
${stmtTrns}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

    return {
      content: ofxContent,
      filename: `quickbooks-bank-feed-${Date.now()}.qbo`,
      mimeType: 'application/vnd.intu.qbo',
      entryCount: txIds.length,
      totalDebitCents,
      totalCreditCents,
      transactionIds: txIds
    };
  }

  /**
   * Log export event and mark transactions as exported in the operational database.
   */
  public static recordExport(
    exportType: 'qbo_csv' | 'iif' | 'ofx',
    result: QuickBooksExportResult,
    userId?: string
  ): void {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const logId = generateUUIDv7();

    withTransaction((tx) => {
      // 1. Insert audit log
      tx.prepare(`
        INSERT INTO quickbooks_export_logs (
          id, operator_id, export_type, transaction_count, total_debit_cents,
          total_credit_cents, exported_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logId,
        operatorId,
        exportType,
        result.entryCount,
        result.totalDebitCents,
        result.totalCreditCents,
        userId || null,
        now
      );

      // 2. Mark transactions with export timestamp
      if (result.transactionIds.length > 0) {
        const updateStmt = tx.prepare(`
          UPDATE transactions
          SET qb_exported_at = ?
          WHERE id = ? AND operator_id = ?
        `);

        for (const tid of result.transactionIds) {
          updateStmt.run(now, tid, operatorId);
        }
      }
    }, db);
  }

  private static escapeCsv(field: string): string {
    if (!field) return '""';
    if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return `"${field}"`;
  }

  private static sanitizeIif(field: string): string {
    if (!field) return '';
    return field.replace(/[\t\r\n]/g, ' ').trim();
  }

  private static sanitizeXml(field: string): string {
    if (!field) return '';
    return field
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
