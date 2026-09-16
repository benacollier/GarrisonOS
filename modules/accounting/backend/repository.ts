import { getDatabase, withTransaction } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';
import {
  TransactionRecord,
  calculateTenantBalance,
  calculateScheduleE,
  ScheduleEReport
} from './ledger.js';
import { JournalService, CreateJournalLineInput } from './journal.js';
import { ChartOfAccountsRepository } from './chart_of_accounts.js';

export interface CreateTransactionData {
  transaction_type: TransactionRecord['transaction_type'];
  category: string;
  amount_cents: number;
  transaction_date: number;
  description: string;
  payment_method?: string | null;
  reference_number?: string | null;
  property_id?: string | null;
  unit_id?: string | null;
  lease_id?: string | null;
  payer_contact_id?: string | null;
  payee_contact_id?: string | null;
}

export interface RentRollItem {
  lease_id: string;
  property_id: string;
  property_name: string;
  unit_id: string;
  unit_number: string;
  status: string;
  tenant_name: string;
  monthly_rent_cents: number;
  deposit_held_cents: number;
  balance_cents: number;
}

export class AccountingRepository {
  public static listTransactions(filter?: {
    lease_id?: string;
    property_id?: string;
    unit_id?: string;
    transaction_type?: string;
    category?: string;
    start_date?: number;
    end_date?: number;
    qb_unexported_only?: boolean;
  }): TransactionRecord[] {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    let sql = 'SELECT * FROM transactions WHERE tenant_id = ? AND deleted_at IS NULL';
    const params: any[] = [tenantId];

    if (filter?.lease_id) {
      sql += ' AND lease_id = ?';
      params.push(filter.lease_id);
    }
    if (filter?.property_id) {
      sql += ' AND property_id = ?';
      params.push(filter.property_id);
    }
    if (filter?.unit_id) {
      sql += ' AND unit_id = ?';
      params.push(filter.unit_id);
    }
    if (filter?.transaction_type) {
      sql += ' AND transaction_type = ?';
      params.push(filter.transaction_type);
    }
    if (filter?.category) {
      sql += ' AND category = ?';
      params.push(filter.category);
    }
    if (filter?.start_date) {
      sql += ' AND transaction_date >= ?';
      params.push(filter.start_date);
    }
    if (filter?.end_date) {
      sql += ' AND transaction_date <= ?';
      params.push(filter.end_date);
    }
    if (filter?.qb_unexported_only) {
      sql += ' AND qb_exported_at IS NULL';
    }

    sql += ' ORDER BY transaction_date DESC, created_at DESC';
    return db.prepare(sql).all(...params) as unknown as TransactionRecord[];
  }

  public static getTransactionById(id: string): TransactionRecord | null {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM transactions
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).get(id, tenantId) as TransactionRecord | undefined;
    return row || null;
  }

  /**
   * Create a financial transaction and automatically post its corresponding
   * balanced double-entry journal entry atomically.
   */
  public static createTransaction(data: CreateTransactionData, dbInstance?: any): TransactionRecord {
    const tenantId = RequestContext.getTenantId();
    const db = dbInstance || getDatabase();
    ChartOfAccountsRepository.ensureDefaultAccounts(dbInstance);
    const id = generateUUIDv7();
    const now = Date.now();
    const amount = Math.abs(data.amount_cents);

    if (amount <= 0) {
      throw new Error('Transaction amount must be greater than 0 cents.');
    }

    const requireAccount = (mapping: string) => {
      const account = ChartOfAccountsRepository.getAccountByMapping(mapping, dbInstance);
      if (!account) {
        throw new Error(`Chart of accounts is missing an active account mapped to '${mapping}'.`);
      }
      return account;
    };

    const mappedAccount = ChartOfAccountsRepository.getAccountByMapping(data.category, dbInstance);
    const lines: CreateJournalLineInput[] = [];

    switch (data.transaction_type) {
      case 'charge': {
        const accountsReceivable = requireAccount('accounts_receivable');
        const revAccount = mappedAccount || requireAccount('rent');
        lines.push(
          {
            account_id: accountsReceivable.id,
            debit_cents: amount,
            credit_cents: 0,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payer_contact_id,
            description: data.description
          },
          {
            account_id: revAccount.id,
            debit_cents: 0,
            credit_cents: amount,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payer_contact_id,
            description: data.description
          }
        );
        break;
      }
      case 'payment': {
        const operatingBank = requireAccount('operating_bank');
        const accountsReceivable = requireAccount('accounts_receivable');
        lines.push(
          {
            account_id: operatingBank.id,
            debit_cents: amount,
            credit_cents: 0,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payer_contact_id,
            description: data.description
          },
          {
            account_id: accountsReceivable.id,
            debit_cents: 0,
            credit_cents: amount,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payer_contact_id,
            description: data.description
          }
        );
        break;
      }
      case 'expense': {
        const operatingBank = requireAccount('operating_bank');
        const expAccount = mappedAccount || requireAccount('repairs');
        lines.push(
          {
            account_id: expAccount.id,
            debit_cents: amount,
            credit_cents: 0,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payee_contact_id,
            description: data.description
          },
          {
            account_id: operatingBank.id,
            debit_cents: 0,
            credit_cents: amount,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payee_contact_id,
            description: data.description
          }
        );
        break;
      }
      case 'refund': {
        const operatingBank = requireAccount('operating_bank');
        const accountsReceivable = requireAccount('accounts_receivable');
        lines.push(
          {
            account_id: accountsReceivable.id,
            debit_cents: amount,
            credit_cents: 0,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payee_contact_id,
            description: data.description
          },
          {
            account_id: operatingBank.id,
            debit_cents: 0,
            credit_cents: amount,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payee_contact_id,
            description: data.description
          }
        );
        break;
      }
      case 'deposit_inflow': {
        const trustBank = requireAccount('trust_bank');
        const depositLiability = requireAccount('security_deposit');
        lines.push(
          {
            account_id: trustBank.id,
            debit_cents: amount,
            credit_cents: 0,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payer_contact_id,
            description: data.description
          },
          {
            account_id: depositLiability.id,
            debit_cents: 0,
            credit_cents: amount,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payer_contact_id,
            description: data.description
          }
        );
        break;
      }
      case 'deposit_return': {
        const trustBank = requireAccount('trust_bank');
        const depositLiability = requireAccount('security_deposit');
        lines.push(
          {
            account_id: depositLiability.id,
            debit_cents: amount,
            credit_cents: 0,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payee_contact_id,
            description: data.description
          },
          {
            account_id: trustBank.id,
            debit_cents: 0,
            credit_cents: amount,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payee_contact_id,
            description: data.description
          }
        );
        break;
      }
      case 'deposit_deduction': {
        const accountsReceivable = requireAccount('accounts_receivable');
        const depositLiability = requireAccount('security_deposit');
        lines.push(
          {
            account_id: depositLiability.id,
            debit_cents: amount,
            credit_cents: 0,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payer_contact_id,
            description: data.description
          },
          {
            account_id: accountsReceivable.id,
            debit_cents: 0,
            credit_cents: amount,
            property_id: data.property_id,
            unit_id: data.unit_id,
            contact_id: data.payer_contact_id,
            description: data.description
          }
        );
        break;
      }
      default:
        throw new Error(`Unsupported transaction type: ${data.transaction_type}`);
    }

    let journalEntryId: string | null = null;

    const executeCreate = (conn: any) => {
      // 1. Post double-entry journal entry atomically
      const journalEntry = JournalService.postEntry({
        date_ms: data.transaction_date,
        memo: data.description,
        source_type: data.transaction_type,
        source_id: id,
        lines
      }, conn);
      journalEntryId = journalEntry.id;

      conn.prepare(`
        INSERT INTO transactions (
          id, tenant_id, transaction_type, category, amount_cents,
          transaction_date, description, payment_method, reference_number,
          property_id, unit_id, lease_id, payer_contact_id, payee_contact_id,
          journal_entry_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        tenantId,
        data.transaction_type,
        data.category,
        amount,
        data.transaction_date,
        data.description,
        data.payment_method || null,
        data.reference_number || null,
        data.property_id || null,
        data.unit_id || null,
        data.lease_id || null,
        data.payer_contact_id || null,
        data.payee_contact_id || null,
        journalEntryId,
        now,
        now
      );
    };

    if (dbInstance) {
      executeCreate(dbInstance);
    } else {
      withTransaction((tx) => {
        executeCreate(tx);
      }, db);
    }

    return AccountingRepository.getTransactionById(id)!;
  }

  /**
   * Reverse a transaction and its double-entry journal entry.
   */
  public static deleteTransaction(id: string): boolean {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const now = Date.now();

    const txRecord = this.getTransactionById(id);
    if (!txRecord) return false;

    withTransaction((tx) => {
      if (txRecord.journal_entry_id) {
        const entry = JournalService.getEntryById(txRecord.journal_entry_id, tx);
        if (!entry) {
          throw new Error('Linked journal entry not found.');
        }
        if (!entry.reversed_by_entry_id) {
          JournalService.reverseEntry(txRecord.journal_entry_id, `Transaction deleted/voided`, tx);
        }
      }

      tx.prepare(`
        UPDATE transactions SET deleted_at = ?
        WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
      `).run(now, id, tenantId);
    }, db);

    return true;
  }

  public static getLeaseTransactions(leaseId: string): TransactionRecord[] {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM transactions
      WHERE lease_id = ? AND tenant_id = ? AND deleted_at IS NULL
      ORDER BY transaction_date ASC, created_at ASC
    `).all(leaseId, tenantId) as unknown as TransactionRecord[];
  }

  public static getLeaseBalance(leaseId: string): {
    leaseId: string;
    balanceCents: number;
    transactionCount: number;
  } {
    const transactions = AccountingRepository.getLeaseTransactions(leaseId);
    const balanceCents = calculateTenantBalance(transactions);
    return {
      leaseId,
      balanceCents,
      transactionCount: transactions.length
    };
  }

  public static getRentRoll(): RentRollItem[] {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT
        l.id as lease_id,
        p.id as property_id,
        p.name as property_name,
        u.id as unit_id,
        u.unit_number,
        l.status,
        l.rent_amount_cents as monthly_rent_cents,
        l.deposit_held_cents,
        c.first_name || ' ' || c.last_name as tenant_name
      FROM leases l
      JOIN units u ON l.unit_id = u.id AND u.deleted_at IS NULL
      JOIN properties p ON u.property_id = p.id AND p.deleted_at IS NULL
      LEFT JOIN lease_contacts lc ON l.id = lc.lease_id AND lc.role = 'primary_tenant' AND lc.deleted_at IS NULL
      LEFT JOIN contacts c ON lc.contact_id = c.id AND c.deleted_at IS NULL
      WHERE l.tenant_id = ? AND l.deleted_at IS NULL AND l.status IN ('active', 'renewed', 'month_to_month', 'expiring')
      ORDER BY p.name ASC, u.unit_number ASC
    `).all(tenantId) as unknown as Array<Omit<RentRollItem, 'balance_cents'>>;

    return rows.map((r) => {
      const balance = AccountingRepository.getLeaseBalance(r.lease_id).balanceCents;
      return {
        ...r,
        tenant_name: r.tenant_name || 'No Primary Tenant',
        balance_cents: balance
      };
    });
  }

  public static getScheduleEReport(filter?: { year?: number; property_id?: string }): ScheduleEReport {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    let sql = 'SELECT * FROM transactions WHERE tenant_id = ? AND deleted_at IS NULL';
    const params: any[] = [tenantId];

    if (filter?.property_id) {
      sql += ' AND property_id = ?';
      params.push(filter.property_id);
    }

    if (filter?.year) {
      const yearStart = Date.UTC(filter.year, 0, 1, 0, 0, 0, 0);
      const yearEnd = Date.UTC(filter.year, 11, 31, 23, 59, 59, 999);
      sql += ' AND transaction_date >= ? AND transaction_date <= ?';
      params.push(yearStart, yearEnd);
    }

    const txs = db.prepare(sql).all(...params) as unknown as TransactionRecord[];
    return calculateScheduleE(txs);
  }

  public static processDepositDisposition(
    leaseId: string,
    deductions: Array<{ description: string; amount_cents: number; category?: string }>
  ): {
    leaseId: string;
    depositHeldCents: number;
    unpaidChargesCents: number;
    damageDeductionsCents: number;
    finalRefundCents: number;
    createdTransactions: TransactionRecord[];
  } {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    const lease = db.prepare(`
      SELECT l.*, u.property_id
      FROM leases l
      LEFT JOIN units u ON l.unit_id = u.id AND u.tenant_id = l.tenant_id
      WHERE l.id = ? AND l.tenant_id = ? AND l.deleted_at IS NULL
    `).get(leaseId, tenantId) as any;

    if (!lease) {
      throw new Error('Lease not found');
    }

    const currentBalance = AccountingRepository.getLeaseBalance(leaseId).balanceCents;
    const unpaidRentCents = Math.max(0, currentBalance);
    const depositHeldCents = lease.deposit_held_cents || 0;

    const damageTotalCents = deductions.reduce((sum, d) => sum + Math.abs(d.amount_cents), 0);
    const totalDeductionsCents = unpaidRentCents + damageTotalCents;
    const finalRefundCents = Math.max(0, depositHeldCents - totalDeductionsCents);

    const createdTxs: TransactionRecord[] = [];

    withTransaction((tx) => {
      const now = Date.now();

      // 1. Post damage deduction transactions if any
      for (const d of deductions) {
        const created = AccountingRepository.createTransaction({
          transaction_type: 'deposit_deduction',
          category: d.category || 'repairs',
          amount_cents: Math.abs(d.amount_cents),
          transaction_date: now,
          description: `Deposit Deduction: ${d.description}`,
          property_id: lease.property_id || null,
          unit_id: lease.unit_id || null,
          lease_id: leaseId
        }, tx);
        createdTxs.push(created);
      }

      // 2. Post deposit return transaction if refund remains
      if (finalRefundCents > 0) {
        const created = AccountingRepository.createTransaction({
          transaction_type: 'deposit_return',
          category: 'security_deposit',
          amount_cents: finalRefundCents,
          transaction_date: now,
          description: 'Security Deposit Refund Return',
          property_id: lease.property_id || null,
          unit_id: lease.unit_id || null,
          lease_id: leaseId
        }, tx);
        createdTxs.push(created);
      }

      // 3. Update lease deposit held to 0 and terminate lease if active
      tx.prepare(`
        UPDATE leases SET deposit_held_cents = 0, status = 'terminated', updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).run(now, leaseId, tenantId);
    }, db);

    return {
      leaseId,
      depositHeldCents,
      unpaidChargesCents: unpaidRentCents,
      damageDeductionsCents: damageTotalCents,
      finalRefundCents,
      createdTransactions: createdTxs
    };
  }
}
