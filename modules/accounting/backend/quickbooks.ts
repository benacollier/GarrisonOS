import { getDatabase, withTransaction } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';
import { TransactionRecord } from './ledger.js';
import { ChartOfAccountsRepository, ChartOfAccountRecord } from './chart_of_accounts.js';

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
   * Synthesize balanced double-entry General Ledger journal entries from GarrisonOS transactions.
   */
  public static generateJournalEntries(transactions: TransactionRecord[]): JournalEntry[] {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    // Cache properties and contacts for dimension mapping (Class & Customer/Vendor Name)
    const propertyRows = db.prepare(`
      SELECT id, name FROM properties WHERE tenant_id = ? AND deleted_at IS NULL
    `).all(tenantId) as Array<{ id: string; name: string }>;
    const propertyMap = new Map<string, string>(propertyRows.map((p) => [p.id, p.name]));

    const contactRows = db.prepare(`
      SELECT id, first_name, last_name, company_name FROM contacts WHERE tenant_id = ? AND deleted_at IS NULL
    `).all(tenantId) as Array<{ id: string; first_name: string; last_name: string; company_name: string | null }>;
    const contactMap = new Map<string, string>();
    for (const c of contactRows) {
      const name = c.company_name || `${c.first_name} ${c.last_name}`.trim();
      contactMap.set(c.id, name);
    }

    // Default GL accounts
    const operatingBank = ChartOfAccountsRepository.getAccountByMapping('operating_bank') || {
      account_number: '1010',
      account_name: 'Operating Checking',
      account_type: 'Bank'
    };
    const trustBank = ChartOfAccountsRepository.getAccountByMapping('trust_bank') || {
      account_number: '1020',
      account_name: 'Security Deposit Trust Checking',
      account_type: 'Bank'
    };
    const accountsReceivable = ChartOfAccountsRepository.getAccountByMapping('accounts_receivable') || {
      account_number: '1100',
      account_name: 'Accounts Receivable (Tenant Receivables)',
      account_type: 'AccountsReceivable'
    };
    const depositLiability = ChartOfAccountsRepository.getAccountByMapping('security_deposit') || {
      account_number: '2100',
      account_name: 'Tenant Security Deposits Held',
      account_type: 'OtherCurrentLiability'
    };

    const entries: JournalEntry[] = [];

    for (const tx of transactions) {
      if (tx.deleted_at || tx.amount_cents <= 0) continue;

      const className = tx.property_id ? (propertyMap.get(tx.property_id) || 'General') : 'General';
      const entityName = (tx.payer_contact_id && contactMap.get(tx.payer_contact_id)) ||
                         (tx.payee_contact_id && contactMap.get(tx.payee_contact_id)) ||
                         '';

      const entryId = generateUUIDv7();
      const lines: JournalLine[] = [];

      // Resolve category-specific revenue or expense account
      const mappedAccount = ChartOfAccountsRepository.getAccountByMapping(tx.category);

      switch (tx.transaction_type) {
        case 'charge': {
          // Tenant Charge:
          // Debit: Accounts Receivable (1100)
          // Credit: Income Account (e.g. 4010 Rental Income, 4020 Late Fee Income)
          const revenueAccount = mappedAccount || {
            account_number: '4010',
            account_name: 'Rental Income',
            account_type: 'Income'
          };

          lines.push({
            id: generateUUIDv7(),
            account_number: accountsReceivable.account_number || '1100',
            account_name: accountsReceivable.account_name,
            account_type: accountsReceivable.account_type,
            debit_cents: tx.amount_cents,
            credit_cents: 0,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });

          lines.push({
            id: generateUUIDv7(),
            account_number: revenueAccount.account_number || '4010',
            account_name: revenueAccount.account_name,
            account_type: revenueAccount.account_type,
            debit_cents: 0,
            credit_cents: tx.amount_cents,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });
          break;
        }

        case 'payment': {
          // Tenant Payment:
          // Debit: Operating Bank (1010)
          // Credit: Accounts Receivable (1100)
          lines.push({
            id: generateUUIDv7(),
            account_number: operatingBank.account_number || '1010',
            account_name: operatingBank.account_name,
            account_type: operatingBank.account_type,
            debit_cents: tx.amount_cents,
            credit_cents: 0,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });

          lines.push({
            id: generateUUIDv7(),
            account_number: accountsReceivable.account_number || '1100',
            account_name: accountsReceivable.account_name,
            account_type: accountsReceivable.account_type,
            debit_cents: 0,
            credit_cents: tx.amount_cents,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });
          break;
        }

        case 'expense': {
          // Property Operating Expense (Schedule E):
          // Debit: Expense Account (e.g. 5100 Repairs, 5120 Taxes, 5130 Utilities)
          // Credit: Operating Bank (1010)
          const expenseAccount = mappedAccount || {
            account_number: '5100',
            account_name: 'Repairs & Maintenance',
            account_type: 'Expense'
          };

          lines.push({
            id: generateUUIDv7(),
            account_number: expenseAccount.account_number || '5100',
            account_name: expenseAccount.account_name,
            account_type: expenseAccount.account_type,
            debit_cents: tx.amount_cents,
            credit_cents: 0,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });

          lines.push({
            id: generateUUIDv7(),
            account_number: operatingBank.account_number || '1010',
            account_name: operatingBank.account_name,
            account_type: operatingBank.account_type,
            debit_cents: 0,
            credit_cents: tx.amount_cents,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });
          break;
        }

        case 'deposit_inflow': {
          // Security Deposit Collection into Escrow:
          // Debit: Security Deposit Trust Checking (1020)
          // Credit: Tenant Security Deposits Held Liability (2100)
          lines.push({
            id: generateUUIDv7(),
            account_number: trustBank.account_number || '1020',
            account_name: trustBank.account_name,
            account_type: trustBank.account_type,
            debit_cents: tx.amount_cents,
            credit_cents: 0,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });

          lines.push({
            id: generateUUIDv7(),
            account_number: depositLiability.account_number || '2100',
            account_name: depositLiability.account_name,
            account_type: depositLiability.account_type,
            debit_cents: 0,
            credit_cents: tx.amount_cents,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });
          break;
        }

        case 'deposit_return': {
          // Security Deposit Returned to Tenant:
          // Debit: Tenant Security Deposits Held Liability (2100)
          // Credit: Security Deposit Trust Checking (1020)
          lines.push({
            id: generateUUIDv7(),
            account_number: depositLiability.account_number || '2100',
            account_name: depositLiability.account_name,
            account_type: depositLiability.account_type,
            debit_cents: tx.amount_cents,
            credit_cents: 0,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });

          lines.push({
            id: generateUUIDv7(),
            account_number: trustBank.account_number || '1020',
            account_name: trustBank.account_name,
            account_type: trustBank.account_type,
            debit_cents: 0,
            credit_cents: tx.amount_cents,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });
          break;
        }

        case 'deposit_deduction': {
          // Security Deposit Applied to Damages or Unpaid Rent:
          // Debit: Tenant Security Deposits Held Liability (2100)
          // Credit: Operating Checking (or Rental Income/Repairs Rebill)
          lines.push({
            id: generateUUIDv7(),
            account_number: depositLiability.account_number || '2100',
            account_name: depositLiability.account_name,
            account_type: depositLiability.account_type,
            debit_cents: tx.amount_cents,
            credit_cents: 0,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });

          lines.push({
            id: generateUUIDv7(),
            account_number: accountsReceivable.account_number || '1100',
            account_name: accountsReceivable.account_name,
            account_type: accountsReceivable.account_type,
            debit_cents: 0,
            credit_cents: tx.amount_cents,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });
          break;
        }

        case 'refund': {
          // Tenant Refund:
          // Debit: Accounts Receivable (or Rental Income)
          // Credit: Operating Bank (1010)
          lines.push({
            id: generateUUIDv7(),
            account_number: accountsReceivable.account_number || '1100',
            account_name: accountsReceivable.account_name,
            account_type: accountsReceivable.account_type,
            debit_cents: tx.amount_cents,
            credit_cents: 0,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });

          lines.push({
            id: generateUUIDv7(),
            account_number: operatingBank.account_number || '1010',
            account_name: operatingBank.account_name,
            account_type: operatingBank.account_type,
            debit_cents: 0,
            credit_cents: tx.amount_cents,
            description: tx.description,
            entity_name: entityName,
            class_name: className
          });
          break;
        }
      }

      if (lines.length > 0) {
        entries.push({
          entry_id: entryId,
          transaction_id: tx.id,
          date_ms: tx.transaction_date,
          reference_number: tx.reference_number || `TX-${tx.id.slice(0, 8)}`,
          memo: tx.description,
          lines
        });
      }
    }

    return entries;
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

      // In IIF, TRNS is the primary line, subsequent are SPL lines.
      // Debits are positive (+), Credits are negative (-) in IIF convention.
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
    const serverDate = now.toISOString().replace(/[-:T]/g, '').slice(0, 14) + '[-5:EST]';

    let stmtTrns = '';

    for (const tx of transactions) {
      if (tx.deleted_at || tx.amount_cents <= 0) continue;
      txIds.push(tx.id);

      const d = new Date(tx.transaction_date);
      const dtPosted = d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + '[-5:EST]';

      let trnType = 'OTHER';
      let amountStr = '';

      if (tx.transaction_type === 'payment' || tx.transaction_type === 'deposit_inflow') {
        trnType = 'CREDIT'; // Deposit into bank
        amountStr = (tx.amount_cents / 100).toFixed(2);
        totalDebitCents += tx.amount_cents; // Bank debit = cash increase
      } else if (tx.transaction_type === 'expense' || tx.transaction_type === 'refund' || tx.transaction_type === 'deposit_return') {
        trnType = 'DEBIT'; // Outflow disbursement
        amountStr = (-tx.amount_cents / 100).toFixed(2);
        totalCreditCents += tx.amount_cents; // Bank credit = cash decrease
      } else {
        // Non-cash bank transactions (e.g. non-cash accrued charges) skipped for OFX bank feed
        continue;
      }

      stmtTrns += `
<STMTTRN>
<TRNTYPE>${trnType}</TRNTYPE>
<DTPOSTED>${dtPosted}</DTPOSTED>
<TRNAMT>${amountStr}</TRNAMT>
<FITID>${tx.id}</FITID>
<CHECKNUM>${tx.reference_number || ''}</CHECKNUM>
<NAME>${QuickBooksService.sanitizeXml(tx.description)}</NAME>
<MEMO>${QuickBooksService.sanitizeXml(tx.category)}</MEMO>
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
<INTU.BID>3000</INTU.BID>
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
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const now = Date.now();
    const logId = generateUUIDv7();

    withTransaction((tx) => {
      // 1. Insert audit log
      tx.prepare(`
        INSERT INTO quickbooks_export_logs (
          id, tenant_id, export_type, transaction_count, total_debit_cents,
          total_credit_cents, exported_by_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        logId,
        tenantId,
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
          WHERE id = ? AND tenant_id = ?
        `);

        for (const tid of result.transactionIds) {
          updateStmt.run(now, tid, tenantId);
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
