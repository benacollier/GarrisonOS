import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInTenantContext } from '../../../test/helpers.js';
import { PropertiesRepository } from '../../properties/backend/repository.js';
import { ContactsRepository } from '../../contacts/backend/repository.js';
import { MaintenanceRepository } from '../backend/repository.js';
import { AccountingRepository } from '../../accounting/backend/repository.js';
import { eventBus } from '../../../core/events.js';
import { registerSubscribers as registerAccountingSubscribers } from '../../accounting/backend/events.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';

describe('Maintenance Module - Work Orders & Event Dispatch', () => {
  before(() => {
    getDatabase({ inMemory: true });
    createTestDb();
    registerAccountingSubscribers(eventBus);
  });

  after(() => {
    closeDatabase();
  });

  it('manages work order lifecycle, priority triage, vendor assignment, and metrics', () => {
    runInTenantContext('tenant-maint-test', () => {
      // 1. Setup property and vendor
      const prop = PropertiesRepository.createProperty({
        name: 'Valley View Apartments',
        property_type: 'multi_family',
        address_line1: '200 Valley View Dr',
        city: 'Asheville',
        state: 'NC',
        postal_code: '28806'
      });

      const vendor = ContactsRepository.createContact({
        contact_type: 'vendor',
        first_name: 'Carlos',
        last_name: 'Santana',
        company_name: 'Santana HVAC Experts',
        vendor_specialty: 'hvac'
      });

      // 2. Create high-priority work order
      const wo = MaintenanceRepository.createWorkOrder({
        property_id: prop.id,
        title: 'AC Unit Freezing Up',
        description: 'Compressor is iced over in common area',
        priority: 'high',
        category: 'hvac',
        permission_to_enter: true,
        estimated_cost_cents: 45000
      });

      assert.ok(wo.id);
      assert.equal(wo.status, 'open');
      assert.equal(wo.priority, 'high');

      // 3. Assign vendor and schedule repair
      const scheduledDate = Date.now() + 86400000;
      const assignedWo = MaintenanceRepository.updateWorkOrder(wo.id, {
        vendor_contact_id: vendor.id,
        status: 'assigned',
        scheduled_date: scheduledDate
      });

      assert.equal(assignedWo?.status, 'assigned');
      assert.equal(assignedWo?.vendor_contact_id, vendor.id);

      // 4. Check maintenance metrics
      const metrics = MaintenanceRepository.getMaintenanceMetrics();
      assert.ok(metrics.openWorkOrders >= 1);

      // 5. Complete work order
      const completedWo = MaintenanceRepository.completeWorkOrder(wo.id, 42000);
      assert.equal(completedWo?.status, 'completed');
      assert.equal(completedWo?.actual_cost_cents, 42000);
    });
  });

  it('triggers accounting expense creation when work_order.completed event is published', async () => {
    await runInTenantContext('tenant-maint-test', async () => {
      const prop = PropertiesRepository.createProperty({
        name: 'Event Bus Test Property',
        property_type: 'single_family',
        address_line1: '77 Dispatch Way',
        city: 'Asheville',
        state: 'NC',
        postal_code: '28801'
      });

      const wo = MaintenanceRepository.createWorkOrder({
        property_id: prop.id,
        title: 'Roof Shingle Repair',
        description: 'Replace storm damaged shingles',
        priority: 'medium',
        category: 'structural',
        actual_cost_cents: 85000
      });

      // Emit work_order.completed event through EventBus
      eventBus.publish('work_order.completed', {
        tenantId: 'tenant-maint-test',
        workOrderId: wo.id,
        propertyId: prop.id,
        unitId: null,
        actualCostCents: 85000
      });

      // Give event loop a microtick to process subscriber
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify transaction recorded in Accounting module
      const txs = AccountingRepository.listTransactions({ transaction_type: 'expense' });
      const repairTx = txs.find((t) => t.reference_number === `wo:${wo.id}`);
      assert.ok(repairTx);
      assert.equal(repairTx.amount_cents, 85000);
      assert.equal(repairTx.category, 'repairs');
    });
  });
});
