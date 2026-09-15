import { getDatabase, withTransaction } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';

export interface Lease {
  id: string;
  tenant_id: string;
  unit_id: string;
  status: 'draft' | 'active' | 'expiring' | 'renewed' | 'terminated' | 'month_to_month';
  start_date: number;
  end_date: number;
  rent_amount_cents: number;
  security_deposit_cents: number;
  deposit_held_cents: number;
  rent_due_day: number;
  late_fee_grace_days: number;
  late_fee_amount_cents: number;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
}

export interface LeaseContact {
  id: string;
  tenant_id: string;
  lease_id: string;
  contact_id: string;
  role: 'primary_tenant' | 'co_tenant' | 'guarantor' | 'occupant';
  is_financially_responsible: number;
  created_at: number;
  deleted_at?: number | null;
  // Joined fields
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
}

export interface LeaseWithDetails extends Lease {
  unit_number?: string;
  property_name?: string;
  property_id?: string;
  contacts?: LeaseContact[];
}

export class LeasesRepository {
  public static listLeases(filter?: { status?: string; unit_id?: string }): LeaseWithDetails[] {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    let sql = `
      SELECT
        l.*,
        u.unit_number,
        p.name as property_name,
        p.id as property_id
      FROM leases l
      LEFT JOIN units u ON l.unit_id = u.id AND u.deleted_at IS NULL
      LEFT JOIN properties p ON u.property_id = p.id AND p.deleted_at IS NULL
      WHERE l.tenant_id = ? AND l.deleted_at IS NULL
    `;
    const params: any[] = [tenantId];

    if (filter?.status) {
      sql += ' AND l.status = ?';
      params.push(filter.status);
    }
    if (filter?.unit_id) {
      sql += ' AND l.unit_id = ?';
      params.push(filter.unit_id);
    }

    sql += ' ORDER BY l.start_date DESC';
    return db.prepare(sql).all(...params) as unknown as LeaseWithDetails[];
  }

  public static getLeaseById(id: string): LeaseWithDetails | null {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();

    const lease = db.prepare(`
      SELECT
        l.*,
        u.unit_number,
        p.name as property_name,
        p.id as property_id
      FROM leases l
      LEFT JOIN units u ON l.unit_id = u.id AND u.deleted_at IS NULL
      LEFT JOIN properties p ON u.property_id = p.id AND p.deleted_at IS NULL
      WHERE l.id = ? AND l.tenant_id = ? AND l.deleted_at IS NULL
    `).get(id, tenantId) as LeaseWithDetails | undefined;

    if (!lease) return null;

    const contacts = db.prepare(`
      SELECT
        lc.*,
        c.first_name,
        c.last_name,
        c.email,
        c.phone
      FROM lease_contacts lc
      JOIN contacts c ON lc.contact_id = c.id AND c.deleted_at IS NULL
      WHERE lc.lease_id = ? AND lc.tenant_id = ? AND lc.deleted_at IS NULL
      ORDER BY lc.role ASC
    `).all(id, tenantId) as unknown as LeaseContact[];

    lease.contacts = contacts;
    return lease;
  }

  public static createLease(data: {
    unit_id: string;
    status?: Lease['status'];
    start_date: number;
    end_date: number;
    rent_amount_cents: number;
    security_deposit_cents?: number;
    deposit_held_cents?: number;
    rent_due_day?: number;
    late_fee_grace_days?: number;
    late_fee_amount_cents?: number;
    contacts?: Array<{ contact_id: string; role: LeaseContact['role']; is_financially_responsible?: boolean }>;
  }): LeaseWithDetails {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const leaseId = generateUUIDv7();
    const now = Date.now();

    return withTransaction((tx) => {
      tx.prepare(`
        INSERT INTO leases (
          id, tenant_id, unit_id, status, start_date, end_date,
          rent_amount_cents, security_deposit_cents, deposit_held_cents,
          rent_due_day, late_fee_grace_days, late_fee_amount_cents,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        leaseId,
        tenantId,
        data.unit_id,
        data.status || 'draft',
        data.start_date,
        data.end_date,
        data.rent_amount_cents,
        data.security_deposit_cents || 0,
        data.deposit_held_cents || 0,
        data.rent_due_day ?? 1,
        data.late_fee_grace_days ?? 5,
        data.late_fee_amount_cents ?? 0,
        now,
        now
      );

      if (data.contacts && Array.isArray(data.contacts)) {
        for (const c of data.contacts) {
          tx.prepare(`
            INSERT INTO lease_contacts (
              id, tenant_id, lease_id, contact_id, role,
              is_financially_responsible, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            generateUUIDv7(),
            tenantId,
            leaseId,
            c.contact_id,
            c.role,
            c.is_financially_responsible === false ? 0 : 1,
            now
          );
        }
      }

      return LeasesRepository.getLeaseById(leaseId)!;
    }, db);
  }

  public static updateLease(id: string, data: Partial<Omit<Lease, 'id' | 'tenant_id' | 'created_at' | 'updated_at' | 'deleted_at'>>): LeaseWithDetails | null {
    const existing = LeasesRepository.getLeaseById(id);
    if (!existing) return null;

    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const now = Date.now();
    const updated = { ...existing, ...data, updated_at: now };

    db.prepare(`
      UPDATE leases SET
        unit_id = ?, status = ?, start_date = ?, end_date = ?,
        rent_amount_cents = ?, security_deposit_cents = ?, deposit_held_cents = ?,
        rent_due_day = ?, late_fee_grace_days = ?, late_fee_amount_cents = ?,
        updated_at = ?
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).run(
      updated.unit_id,
      updated.status,
      updated.start_date,
      updated.end_date,
      updated.rent_amount_cents,
      updated.security_deposit_cents,
      updated.deposit_held_cents,
      updated.rent_due_day,
      updated.late_fee_grace_days,
      updated.late_fee_amount_cents,
      now,
      id,
      tenantId
    );

    return LeasesRepository.getLeaseById(id);
  }

  public static updateLeaseStatus(id: string, status: Lease['status']): LeaseWithDetails | null {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const now = Date.now();

    db.prepare(`
      UPDATE leases SET status = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).run(status, now, id, tenantId);

    return LeasesRepository.getLeaseById(id);
  }

  public static addLeaseContact(
    leaseId: string,
    contactId: string,
    role: LeaseContact['role'],
    isFinanciallyResponsible: boolean = true
  ): boolean {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const now = Date.now();

    const info = db.prepare(`
      INSERT INTO lease_contacts (
        id, tenant_id, lease_id, contact_id, role,
        is_financially_responsible, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, lease_id, contact_id) WHERE deleted_at IS NULL DO UPDATE SET
        role = excluded.role,
        is_financially_responsible = excluded.is_financially_responsible,
        deleted_at = NULL
    `).run(
      generateUUIDv7(),
      tenantId,
      leaseId,
      contactId,
      role,
      isFinanciallyResponsible ? 1 : 0,
      now
    );

    return info.changes > 0;
  }

  public static removeLeaseContact(leaseId: string, contactId: string): boolean {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const now = Date.now();

    const info = db.prepare(`
      UPDATE lease_contacts SET deleted_at = ?
      WHERE lease_id = ? AND contact_id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).run(now, leaseId, contactId, tenantId);

    return info.changes > 0;
  }

  public static deleteLease(id: string): boolean {
    const tenantId = RequestContext.getTenantId();
    const db = getDatabase();
    const now = Date.now();

    const info = db.prepare(`
      UPDATE leases SET deleted_at = ?
      WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL
    `).run(now, id, tenantId);

    return info.changes > 0;
  }
}
