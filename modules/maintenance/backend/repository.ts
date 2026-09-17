import { getDatabase } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';

export interface WorkOrder {
  id: string;
  operator_id: string;
  tenant_id?: string;
  property_id: string;
  unit_id?: string | null;
  title: string;
  description: string;
  status: 'open' | 'assigned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'emergency';
  category: 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'cosmetic' | 'pest' | 'other';
  permission_to_enter: number;
  entry_instructions?: string | null;
  requested_by_contact_id?: string | null;
  vendor_contact_id?: string | null;
  scheduled_date?: number | null;
  completed_date?: number | null;
  estimated_cost_cents: number;
  actual_cost_cents: number;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
}

export interface WorkOrderWithDetails extends WorkOrder {
  property_name?: string;
  unit_number?: string;
  vendor_name?: string;
  requested_by_name?: string;
}

export class MaintenanceRepository {
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
      JOIN properties p ON w.property_id = p.id
      LEFT JOIN units u ON w.unit_id = u.id
      LEFT JOIN contacts v ON w.vendor_contact_id = v.id
      LEFT JOIN contacts r ON w.requested_by_contact_id = r.id
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

    return db.prepare(sql).all(...params) as unknown as WorkOrderWithDetails[];
  }

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
      JOIN properties p ON w.property_id = p.id
      LEFT JOIN units u ON w.unit_id = u.id
      LEFT JOIN contacts v ON w.vendor_contact_id = v.id
      LEFT JOIN contacts r ON w.requested_by_contact_id = r.id
      WHERE w.id = ? AND w.operator_id = ? AND w.deleted_at IS NULL
    `).get(id, operatorId) as WorkOrderWithDetails | undefined;

    return row || null;
  }

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

  public static updateWorkOrder(id: string, data: Partial<Omit<WorkOrder, 'id' | 'operator_id' | 'created_at' | 'updated_at' | 'deleted_at'>>): WorkOrderWithDetails | null {
    const existing = MaintenanceRepository.getWorkOrderById(id);
    if (!existing) return null;

    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const updated = { ...existing, ...data, updated_at: now };

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
