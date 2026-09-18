import { getDatabase } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';

/**
 * Maintenance work order entity.
 */
export interface WorkOrder {
  /** Unique work order identifier (UUIDv7). */
  id: string;
  /** Primary operator isolation identifier. */
  operator_id: string;
  /** Legacy tenant isolation identifier (backward-compatibility alias). */
  tenant_id?: string;
  /** Identifier of the associated property. */
  property_id: string;
  /** Optional identifier of the associated unit. */
  unit_id?: string | null;
  /** Short summary of the repair or maintenance issue. */
  title: string;
  /** Detailed description of the requested work. */
  description: string;
  /** Current workflow status. */
  status: 'open' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  /** Urgency level of the work order. */
  priority: 'low' | 'medium' | 'high' | 'emergency';
  /** Trade or domain classification. */
  category: 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'cosmetic' | 'pest' | 'other';
  /** 1 if technician has permission to enter, 0 otherwise. */
  permission_to_enter: number;
  /** Access instructions or lockbox codes. */
  entry_instructions?: string | null;
  /** Contact ID of the person who reported the issue. */
  requested_by_contact_id?: string | null;
  /** Contact ID of the assigned vendor or technician. */
  vendor_contact_id?: string | null;
  /** Scheduled service timestamp in epoch milliseconds. */
  scheduled_date?: number | null;
  /** Completion timestamp in epoch milliseconds. */
  completed_date?: number | null;
  /** Estimated cost in integer cents. */
  estimated_cost_cents: number;
  /** Actual recorded cost in integer cents. */
  actual_cost_cents: number;
  /** Created timestamp in epoch milliseconds. */
  created_at: number;
  /** Last updated timestamp in epoch milliseconds. */
  updated_at: number;
  /** Soft-deletion timestamp in epoch milliseconds, or null if active. */
  deleted_at?: number | null;
}

/**
 * Maintenance work order enriched with joined relation names.
 */
export interface WorkOrderWithDetails extends WorkOrder {
  /** Name of the associated property. */
  property_name?: string;
  /** Unit number or identifier. */
  unit_number?: string;
  /** Full name of the assigned vendor. */
  vendor_name?: string;
  /** Full name of the requesting contact. */
  requested_by_name?: string;
}

/**
 * Data access and query repository for maintenance work orders.
 */
export class MaintenanceRepository {
  /**
   * Validate that all supplied relation IDs belong to the active operator.
   * Prevents cross-operator Insecure Direct Object References (IDOR).
   *
   * @param operatorId - Active operator context identifier.
   * @param propertyId - Property identifier to validate.
   * @param unitId - Optional unit identifier to validate against property and operator.
   * @param requestedByContactId - Optional requesting contact identifier.
   * @param vendorContactId - Optional vendor contact identifier.
   */
  private static validateOwnership(
    operatorId: string,
    propertyId?: string,
    unitId?: string | null,
    requestedByContactId?: string | null,
    vendorContactId?: string | null
  ): void {
    const db = getDatabase();

    if (propertyId) {
      const prop = db.prepare('SELECT id FROM properties WHERE id = ? AND operator_id = ? AND deleted_at IS NULL').get(propertyId, operatorId);
      if (!prop) {
        throw new Error(`Property ${propertyId} not found or does not belong to the active operator`);
      }
    }

    if (unitId && propertyId) {
      const unit = db.prepare('SELECT id FROM units WHERE id = ? AND operator_id = ? AND property_id = ? AND deleted_at IS NULL').get(unitId, operatorId, propertyId);
      if (!unit) {
        throw new Error(`Unit ${unitId} not found or does not belong to property ${propertyId} for the active operator`);
      }
    }

    if (requestedByContactId) {
      const contact = db.prepare('SELECT id FROM contacts WHERE id = ? AND operator_id = ? AND deleted_at IS NULL').get(requestedByContactId, operatorId);
      if (!contact) {
        throw new Error(`Contact ${requestedByContactId} not found or does not belong to the active operator`);
      }
    }

    if (vendorContactId) {
      const vendor = db.prepare('SELECT id FROM contacts WHERE id = ? AND operator_id = ? AND deleted_at IS NULL').get(vendorContactId, operatorId);
      if (!vendor) {
        throw new Error(`Vendor contact ${vendorContactId} not found or does not belong to the active operator`);
      }
    }
  }

  /**
   * List all work orders for the active operator, optionally filtered.
   *
   * @param filter - Optional criteria for status, priority, property, or unit.
   * @returns Array of work orders with joined details.
   */
  public static listWorkOrders(filter?: {
    status?: string;
    priority?: string;
    property_id?: string;
    unit_id?: string;
  }): WorkOrderWithDetails[] {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();

    let sql = `
      SELECT
        w.*,
        p.name as property_name,
        u.unit_number,
        v.first_name || ' ' || v.last_name as vendor_name,
        r.first_name || ' ' || r.last_name as requested_by_name
      FROM work_orders w
      JOIN properties p ON w.property_id = p.id AND p.operator_id = w.operator_id AND p.deleted_at IS NULL
      LEFT JOIN units u ON w.unit_id = u.id AND u.operator_id = w.operator_id AND u.deleted_at IS NULL
      LEFT JOIN contacts v ON w.vendor_contact_id = v.id AND v.operator_id = w.operator_id AND v.deleted_at IS NULL
      LEFT JOIN contacts r ON w.requested_by_contact_id = r.id AND r.operator_id = w.operator_id AND r.deleted_at IS NULL
      WHERE w.operator_id = ? AND w.deleted_at IS NULL
    `;
    const params: any[] = [operatorId];

    if (filter?.status) {
      sql += ' AND w.status = ?';
      params.push(filter.status);
    }
    if (filter?.priority) {
      sql += ' AND w.priority = ?';
      params.push(filter.priority);
    }
    if (filter?.property_id) {
      sql += ' AND w.property_id = ?';
      params.push(filter.property_id);
    }
    if (filter?.unit_id) {
      sql += ' AND w.unit_id = ?';
      params.push(filter.unit_id);
    }

    sql += " ORDER BY CASE w.priority WHEN 'emergency' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, w.created_at DESC";

    const rows = db.prepare(sql).all(...params) as unknown as WorkOrderWithDetails[];
    return rows.map((row) => ({
      ...row,
      tenant_id: row.operator_id
    }));
  }

  /**
   * Retrieve a work order by identifier within the active operator context.
   *
   * @param id - Work order identifier.
   * @returns Detailed work order record or null if not found.
   */
  public static getWorkOrderById(id: string): WorkOrderWithDetails | null {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();

    const row = db.prepare(`
      SELECT
        w.*,
        p.name as property_name,
        u.unit_number,
        v.first_name || ' ' || v.last_name as vendor_name,
        r.first_name || ' ' || r.last_name as requested_by_name
      FROM work_orders w
      JOIN properties p ON w.property_id = p.id AND p.operator_id = w.operator_id AND p.deleted_at IS NULL
      LEFT JOIN units u ON w.unit_id = u.id AND u.operator_id = w.operator_id AND u.deleted_at IS NULL
      LEFT JOIN contacts v ON w.vendor_contact_id = v.id AND v.operator_id = w.operator_id AND v.deleted_at IS NULL
      LEFT JOIN contacts r ON w.requested_by_contact_id = r.id AND r.operator_id = w.operator_id AND r.deleted_at IS NULL
      WHERE w.id = ? AND w.operator_id = ? AND w.deleted_at IS NULL
    `).get(id, operatorId) as WorkOrderWithDetails | undefined;

    if (!row) return null;
    return {
      ...row,
      tenant_id: row.operator_id
    };
  }

  /**
   * Create a new maintenance work order.
   * Validates that property, unit, and contact references belong to the active operator.
   *
   * @param data - Work order creation payload.
   * @returns Created work order with joined details.
   */
  public static createWorkOrder(data: {
    property_id: string;
    unit_id?: string;
    title: string;
    description: string;
    status?: WorkOrder['status'];
    priority?: WorkOrder['priority'];
    category?: WorkOrder['category'];
    permission_to_enter?: boolean;
    entry_instructions?: string;
    requested_by_contact_id?: string;
    vendor_contact_id?: string;
    scheduled_date?: number;
    estimated_cost_cents?: number;
    actual_cost_cents?: number;
  }): WorkOrderWithDetails {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const id = generateUUIDv7();
    const now = Date.now();

    // Validate operator ownership of all supplied relation IDs
    MaintenanceRepository.validateOwnership(
      operatorId,
      data.property_id,
      data.unit_id,
      data.requested_by_contact_id,
      data.vendor_contact_id
    );

    db.prepare(`
      INSERT INTO work_orders (
        id, operator_id, property_id, unit_id, title, description,
        status, priority, category, permission_to_enter, entry_instructions,
        requested_by_contact_id, vendor_contact_id, scheduled_date,
        estimated_cost_cents, actual_cost_cents, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      operatorId,
      data.property_id,
      data.unit_id || null,
      data.title,
      data.description,
      data.status || 'open',
      data.priority || 'medium',
      data.category || 'other',
      data.permission_to_enter === false ? 0 : 1,
      data.entry_instructions || null,
      data.requested_by_contact_id || null,
      data.vendor_contact_id || null,
      data.scheduled_date || null,
      data.estimated_cost_cents || 0,
      data.actual_cost_cents || 0,
      now,
      now
    );

    return MaintenanceRepository.getWorkOrderById(id)!;
  }

  /**
   * Update an existing work order.
   * Validates ownership of updated property, unit, or contact references.
   *
   * @param id - Work order identifier.
   * @param data - Mutable work order fields.
   * @returns Updated work order with details or null if not found.
   */
  public static updateWorkOrder(id: string, data: Partial<Omit<WorkOrder, 'id' | 'operator_id' | 'created_at' | 'updated_at' | 'deleted_at'>>): WorkOrderWithDetails | null {
    const existing = MaintenanceRepository.getWorkOrderById(id);
    if (!existing) return null;

    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const updated = { ...existing, ...data, updated_at: now };

    // Validate operator ownership of any modified or existing relation IDs
    MaintenanceRepository.validateOwnership(
      operatorId,
      updated.property_id,
      updated.unit_id,
      updated.requested_by_contact_id,
      updated.vendor_contact_id
    );

    db.prepare(`
      UPDATE work_orders SET
        property_id = ?, unit_id = ?, title = ?, description = ?,
        status = ?, priority = ?, category = ?, permission_to_enter = ?,
        entry_instructions = ?, requested_by_contact_id = ?, vendor_contact_id = ?,
        scheduled_date = ?, completed_date = ?, estimated_cost_cents = ?,
        actual_cost_cents = ?, updated_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(
      updated.property_id,
      updated.unit_id || null,
      updated.title,
      updated.description,
      updated.status,
      updated.priority,
      updated.category,
      updated.permission_to_enter,
      updated.entry_instructions || null,
      updated.requested_by_contact_id || null,
      updated.vendor_contact_id || null,
      updated.scheduled_date || null,
      updated.completed_date || null,
      updated.estimated_cost_cents,
      updated.actual_cost_cents,
      now,
      id,
      operatorId
    );

    return MaintenanceRepository.getWorkOrderById(id);
  }

  /**
   * Mark a work order as completed and record its final actual cost.
   *
   * @param id - Work order identifier.
   * @param actualCostCents - Final cost in integer cents.
   * @returns Updated work order or null if not found.
   */
  public static completeWorkOrder(id: string, actualCostCents?: number): WorkOrderWithDetails | null {
    const existing = MaintenanceRepository.getWorkOrderById(id);
    if (!existing) return null;

    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const finalCost = actualCostCents !== undefined ? actualCostCents : existing.actual_cost_cents;

    db.prepare(`
      UPDATE work_orders SET
        status = 'completed',
        completed_date = ?,
        actual_cost_cents = ?,
        updated_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(now, finalCost, now, id, operatorId);

    return MaintenanceRepository.getWorkOrderById(id);
  }

  /**
   * Soft-delete a work order.
   *
   * @param id - Work order identifier.
   * @returns True if deleted, false if not found.
   */
  public static deleteWorkOrder(id: string): boolean {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const info = db.prepare(`
      UPDATE work_orders SET deleted_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(now, id, operatorId);
    return info.changes > 0;
  }

  /**
   * Compute aggregated metrics for dashboard presentation.
   *
   * @returns Counts of open, emergency, in-progress, and recently completed work orders.
   */
  public static getMaintenanceMetrics(): {
    openWorkOrders: number;
    emergencyWorkOrders: number;
    inProgressWorkOrders: number;
    completedLast30Days: number;
  } {
    const orders = MaintenanceRepository.listWorkOrders();
    const openOrders = orders.filter((o) => ['open', 'assigned', 'in_progress', 'on_hold'].includes(o.status));
    const emergencyOrders = openOrders.filter((o) => o.priority === 'emergency');
    const inProgressOrders = openOrders.filter((o) => o.status === 'in_progress');

    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const completedLast30Days = orders.filter((o) => o.status === 'completed' && (o.completed_date || 0) >= thirtyDaysAgo);

    return {
      openWorkOrders: openOrders.length,
      emergencyWorkOrders: emergencyOrders.length,
      inProgressWorkOrders: inProgressOrders.length,
      completedLast30Days: completedLast30Days.length
    };
  }
}

