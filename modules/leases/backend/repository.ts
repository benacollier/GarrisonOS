import { getDatabase, withTransaction } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';

/**
 * Contractual lease agreement entity.
 */
export interface Lease {
  /** Unique lease identifier (UUIDv7). */
  id: string;
  /** Primary operator isolation identifier. */
  operator_id: string;
  /** Legacy tenant isolation identifier (backward-compatibility alias). */
  tenant_id?: string;
  /** Identifier of the leased unit. */
  unit_id: string;
  /** Current state of the lease contract lifecycle. */
  status: 'draft' | 'active' | 'expiring' | 'renewed' | 'terminated' | 'month_to_month';
  /** Lease commencement timestamp in epoch milliseconds. */
  start_date: number;
  /** Lease termination timestamp in epoch milliseconds. */
  end_date: number;
  /** Monthly recurring rent amount in integer cents. */
  rent_amount_cents: number;
  /** Required security deposit in integer cents. */
  security_deposit_cents: number;
  /** Security deposit amount currently held in escrow. */
  deposit_held_cents: number;
  /** Day of the month rent is due (1-28). */
  rent_due_day: number;
  /** Grace period in days before late fee accrues. */
  late_fee_grace_days: number;
  /** Fixed late fee amount in integer cents. */
  late_fee_amount_cents: number;
  /** Created timestamp in epoch milliseconds. */
  created_at: number;
  /** Updated timestamp in epoch milliseconds. */
  updated_at: number;
  /** Soft-deletion timestamp in epoch milliseconds, or null if active. */
  deleted_at?: number | null;
}

/**
 * Junction entity associating contacts with leases as signatories or occupants.
 */
export interface LeaseContact {
  /** Unique junction record identifier (UUIDv7). */
  id: string;
  /** Primary operator isolation identifier. */
  operator_id: string;
  /** Legacy tenant isolation identifier (backward-compatibility alias). */
  tenant_id?: string;
  /** Identifier of the associated lease contract. */
  lease_id: string;
  /** Identifier of the associated contact. */
  contact_id: string;
  /** Role of the contact on the lease. */
  role: 'primary_tenant' | 'co_tenant' | 'guarantor' | 'occupant';
  /** 1 if financially responsible for lease obligations, 0 otherwise. */
  is_financially_responsible: number;
  /** Creation timestamp in epoch milliseconds. */
  created_at: number;
  /** Soft-deletion timestamp in epoch milliseconds, or null if active. */
  deleted_at?: number | null;
  /** Contact first name from joined contact record. */
  first_name?: string;
  /** Contact last name from joined contact record. */
  last_name?: string;
  /** Contact email from joined contact record. */
  email?: string;
  /** Contact phone from joined contact record. */
  phone?: string;
}

/**
 * Lease entity enriched with joined unit, property, and signatory contact details.
 */
export interface LeaseWithDetails extends Lease {
  /** Assigned unit number. */
  unit_number?: string;
  /** Name of the property containing the unit. */
  property_name?: string;
  /** Identifier of the containing property. */
  property_id?: string;
  /** Array of associated signatories and occupants. */
  contacts?: LeaseContact[];
}

/**
 * Data access and query repository for lease contracts and signatories.
 */
export class LeasesRepository {
  /**
   * List all leases for the active operator, optionally filtered by status or unit.
   *
   * @param filter - Optional criteria for lease status or unit ID.
   * @returns Array of leases with joined property/unit details.
   */
  public static listLeases(filter?: { status?: string; unit_id?: string }): LeaseWithDetails[] {
    const operatorId = RequestContext.getOperatorId();
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
      WHERE l.operator_id = ? AND l.deleted_at IS NULL
    `;
    const params: any[] = [operatorId];

    if (filter?.status) {
      sql += ' AND l.status = ?';
      params.push(filter.status);
    }
    if (filter?.unit_id) {
      sql += ' AND l.unit_id = ?';
      params.push(filter.unit_id);
    }

    sql += ' ORDER BY l.start_date DESC';
    const rows = db.prepare(sql).all(...params) as unknown as LeaseWithDetails[];
    return rows.map((row) => ({
      ...row,
      tenant_id: row.operator_id
    }));
  }

  /**
   * Retrieve a lease by identifier along with its associated contacts.
   *
   * @param id - Lease identifier.
   * @returns Detailed lease record or null if not found.
   */
  public static getLeaseById(id: string): LeaseWithDetails | null {
    const operatorId = RequestContext.getOperatorId();
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
      WHERE l.id = ? AND l.operator_id = ? AND l.deleted_at IS NULL
    `).get(id, operatorId) as LeaseWithDetails | undefined;

    if (!lease) return null;

    lease.tenant_id = lease.operator_id;

    const contacts = db.prepare(`
      SELECT
        lc.*,
        c.first_name,
        c.last_name,
        c.email,
        c.phone
      FROM lease_contacts lc
      JOIN contacts c ON lc.contact_id = c.id AND c.deleted_at IS NULL
      WHERE lc.lease_id = ? AND lc.operator_id = ? AND lc.deleted_at IS NULL
      ORDER BY lc.role ASC
    `).all(id, operatorId) as unknown as LeaseContact[];

    lease.contacts = contacts.map((c) => ({
      ...c,
      tenant_id: c.operator_id
    }));
    return lease;
  }

  /**
   * Create a new lease agreement and optionally register signatories.
   *
   * @param data - Lease terms and optional signatory contacts.
   * @returns Newly created lease with joined details.
   */
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
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const leaseId = generateUUIDv7();
    const now = Date.now();

    return withTransaction((tx) => {
      tx.prepare(`
        INSERT INTO leases (
          id, operator_id, unit_id, status, start_date, end_date,
          rent_amount_cents, security_deposit_cents, deposit_held_cents,
          rent_due_day, late_fee_grace_days, late_fee_amount_cents,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        leaseId,
        operatorId,
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
              id, operator_id, lease_id, contact_id, role,
              is_financially_responsible, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            generateUUIDv7(),
            operatorId,
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

  /**
   * Update terms or dates of an existing lease.
   *
   * @param id - Lease identifier.
   * @param data - Mutable lease fields.
   * @returns Updated lease with details or null if not found.
   */
  public static updateLease(id: string, data: Partial<Omit<Lease, 'id' | 'operator_id' | 'created_at' | 'updated_at' | 'deleted_at'>>): LeaseWithDetails | null {
    const existing = LeasesRepository.getLeaseById(id);
    if (!existing) return null;

    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const updated = { ...existing, ...data, updated_at: now };

    db.prepare(`
      UPDATE leases SET
        unit_id = ?, status = ?, start_date = ?, end_date = ?,
        rent_amount_cents = ?, security_deposit_cents = ?, deposit_held_cents = ?,
        rent_due_day = ?, late_fee_grace_days = ?, late_fee_amount_cents = ?,
        updated_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
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
      operatorId
    );

    return LeasesRepository.getLeaseById(id);
  }

  /**
   * Transition the status of a lease contract.
   *
   * @param id - Lease identifier.
   * @param status - Target status enum.
   * @returns Updated lease or null if not found.
   */
  public static updateLeaseStatus(id: string, status: Lease['status']): LeaseWithDetails | null {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();

    db.prepare(`
      UPDATE leases SET status = ?, updated_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(status, now, id, operatorId);

    return LeasesRepository.getLeaseById(id);
  }

  /**
   * Link a contact as a signatory or occupant to a lease.
   *
   * @param leaseId - Lease identifier.
   * @param contactId - Contact identifier.
   * @param role - Role of contact on lease.
   * @param isFinanciallyResponsible - True if financially responsible.
   * @returns True if linked or updated.
   */
  public static addLeaseContact(
    leaseId: string,
    contactId: string,
    role: LeaseContact['role'],
    isFinanciallyResponsible: boolean = true
  ): boolean {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();

    const info = db.prepare(`
      INSERT INTO lease_contacts (
        id, operator_id, lease_id, contact_id, role,
        is_financially_responsible, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(operator_id, lease_id, contact_id) WHERE deleted_at IS NULL DO UPDATE SET
        role = excluded.role,
        is_financially_responsible = excluded.is_financially_responsible,
        deleted_at = NULL
    `).run(
      generateUUIDv7(),
      operatorId,
      leaseId,
      contactId,
      role,
      isFinanciallyResponsible ? 1 : 0,
      now
    );

    return info.changes > 0;
  }

  /**
   * Detach a contact from a lease.
   *
   * @param leaseId - Lease identifier.
   * @param contactId - Contact identifier.
   * @returns True if detached.
   */
  public static removeLeaseContact(leaseId: string, contactId: string): boolean {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();

    const info = db.prepare(`
      UPDATE lease_contacts SET deleted_at = ?
      WHERE lease_id = ? AND contact_id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(now, leaseId, contactId, operatorId);

    return info.changes > 0;
  }

  /**
   * Soft-delete a lease agreement.
   *
   * @param id - Lease identifier.
   * @returns True if deleted, false if not found.
   */
  public static deleteLease(id: string): boolean {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();

    const info = db.prepare(`
      UPDATE leases SET deleted_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(now, id, operatorId);

    return info.changes > 0;
  }
}
