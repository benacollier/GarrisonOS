import { getDatabase, withTransaction } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';
import {
  TransactionRecord,
  calculateTenantBalance,
  calculateScheduleE,
  ScheduleEReport
} from './ledger.js';

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

  public static createTransaction(data: CreateTransactionData): TransactionRecord {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const id = generateUUIDv7();
    const now = Date.now();

    db.prepare(`
      INSERT INTO transactions (
        id, tenant_id, transaction_type, category, amount_cents,
        transaction_date, description, payment_method, reference_number,
        property_id, unit_id, lease_id, payer_contact_id, payee_contact_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tenantId,
      data.transaction_type,
      data.category,
      Math.abs(data.amount_cents),
      data.transaction_date,
      data.description,
      data.payment_method || null,
      data.reference_number || null,
      data.property_id || null,
      data.unit_id || null,
      data.lease_id || null,
      data.payer_contact_id || null,
      data.payee_contact_id || null,
      now,
      now
    );

    return AccountingRepository.getTransactionById(id)!;
  }

  public static deleteTransaction(id: string): boolean {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const now = Date.now();
    const info = db.prepare(`
      UPDATE transactions SET deleted_at = ?
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).run(now, id, tenantId);
    return info.changes > 0;
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
      SELECT * FROM leases WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
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
        const txId = generateUUIDv7();
        tx.prepare(`
          INSERT INTO transactions (
            id, tenant_id, transaction_type, category, amount_cents,
            transaction_date, description, property_id, unit_id, lease_id,
            created_at, updated_at
          ) VALUES (?, ?, 'deposit_deduction', ?, ?, ?, ?, (SELECT property_id FROM units WHERE id = ?), ?, ?, ?, ?)
        `).run(
          txId,
          tenantId,
          d.category || 'repairs',
          Math.abs(d.amount_cents),
          now,
          `Deposit Deduction: ${d.description}`,
          lease.unit_id,
          lease.unit_id,
          leaseId,
          now,
          now
        );
        createdTxs.push(AccountingRepository.getTransactionById(txId)!);
      }

      // 2. Post deposit return transaction if refund remains
      if (finalRefundCents > 0) {
        const txId = generateUUIDv7();
        tx.prepare(`
          INSERT INTO transactions (
            id, tenant_id, transaction_type, category, amount_cents,
            transaction_date, description, property_id, unit_id, lease_id,
            created_at, updated_at
          ) VALUES (?, ?, 'deposit_return', 'security_deposit', ?, ?, 'Security Deposit Refund Return', (SELECT property_id FROM units WHERE id = ?), ?, ?, ?, ?)
        `).run(
          txId,
          tenantId,
          finalRefundCents,
          now,
          lease.unit_id,
          lease.unit_id,
          leaseId,
          now,
          now
        );
        createdTxs.push(AccountingRepository.getTransactionById(txId)!);
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
