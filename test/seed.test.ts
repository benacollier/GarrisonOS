import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { getDatabase, closeDatabase } from '../database/client.js';
import { seedDatabase } from '../database/seed.js';
import { runInOperatorContext } from './helpers.js';
import { AccountingRepository } from '../modules/accounting/backend/repository.js';

describe('Seed Dataset Verification & Integrity', () => {
  let db: any;
  const operatorId = 'operator-demo';

  before(async () => {
    db = getDatabase({ inMemory: true });
    await seedDatabase(db);
  });

  after(() => {
    closeDatabase();
  });

  it('populates operator, user, and portfolios', () => {
    const operator = db.prepare('SELECT * FROM operators WHERE id = ?').get(operatorId) as any;
    assert.ok(operator);
    assert.equal(operator.name, 'Garrison Heritage Properties');

    const user = db.prepare('SELECT * FROM users WHERE operator_id = ?').get(operatorId) as any;
    assert.ok(user);
    assert.equal(user.email, 'operator@garrisonos.local');
    assert.equal(user.role, 'owner');

    const portfolios = db.prepare('SELECT * FROM portfolios WHERE operator_id = ?').all(operatorId);
    assert.equal(portfolios.length, 2);
  });

  it('populates 20 total rentable units representing all 4 unit statuses', () => {
    const units = db.prepare('SELECT * FROM units WHERE operator_id = ?').all(operatorId) as any[];
    assert.equal(units.length, 20);

    const statuses = units.map(u => u.status);
    const occupiedCount = statuses.filter(s => s === 'occupied').length;
    const vacantCount = statuses.filter(s => s === 'vacant').length;
    const turnoverCount = statuses.filter(s => s === 'turnover').length;
    const holdCount = statuses.filter(s => s === 'maintenance_hold').length;

    assert.equal(occupiedCount, 17, 'Must seed 17 occupied units');
    assert.equal(vacantCount, 1, 'Must seed 1 vacant unit (Broadview 4-Plex 202)');
    assert.equal(turnoverCount, 1, 'Must seed 1 turnover unit (Broadview 4-Plex 201)');
    assert.equal(holdCount, 1, 'Must seed 1 maintenance hold unit (940 Sycamore Street)');
  });

  it('populates 7 vendors with trades, W-9 statuses, and tax classifications', () => {
    const vendors = db.prepare('SELECT * FROM contacts WHERE operator_id = ? AND contact_type = ?').all(operatorId, 'vendor') as any[];
    assert.equal(vendors.length, 7);

    const w9Verified = vendors.filter(v => v.w9_received === 1);
    const w9Pending = vendors.filter(v => v.w9_received === 0);

    assert.equal(w9Verified.length, 6, 'Must seed 6 verified W-9 vendors');
    assert.equal(w9Pending.length, 1, 'Must seed 1 pending W-9 vendor to demonstrate unverified state');
    assert.equal(w9Pending[0].company_name, 'Blue Ridge Pro Painters');

    const apex = vendors.find(v => v.company_name === 'Apex Plumbing Services');
    assert.ok(apex);
    assert.equal(apex.tax_classification, 'llc');
    assert.equal(apex.vendor_specialty, 'Plumbing');
  });

  it('persists historical terminated lease with notice_date and move_out_date', () => {
    const terminatedLease = db.prepare(`
      SELECT l.*, u.unit_number
      FROM leases l
      JOIN units u ON l.unit_id = u.id
      WHERE l.operator_id = ? AND l.status = 'terminated'
    `).get(operatorId) as any;

    assert.ok(terminatedLease, 'Terminated lease must exist in seed dataset');
    assert.equal(terminatedLease.unit_number, '201');
    assert.ok(terminatedLease.notice_date, 'notice_date must be populated');
    assert.ok(terminatedLease.move_out_date, 'move_out_date must be populated');
    assert.ok(terminatedLease.notice_date < terminatedLease.move_out_date);
  });

  it('populates 8 diverse work orders across categories, priorities, and statuses', () => {
    const workOrders = db.prepare('SELECT * FROM work_orders WHERE operator_id = ?').all(operatorId) as any[];
    assert.equal(workOrders.length, 8);

    const statuses = new Set(workOrders.map(w => w.status));
    assert.ok(statuses.has('open'));
    assert.ok(statuses.has('assigned'));
    assert.ok(statuses.has('in_progress'));
    assert.ok(statuses.has('completed'));
    assert.ok(statuses.has('cancelled'));

    const priorities = new Set(workOrders.map(w => w.priority));
    assert.ok(priorities.has('emergency'));
    assert.ok(priorities.has('high'));
    assert.ok(priorities.has('medium'));
    assert.ok(priorities.has('low'));
  });

  it('aggregates annual 1099-NEC vendor report correctly from seeded operating expenses', () => {
    runInOperatorContext(operatorId, () => {
      const report = AccountingRepository.getVendor1099Report(2026);
      assert.ok(report);
      assert.equal(report.tax_year, 2026);
      assert.equal(report.threshold_cents, 200000); // $2,000 threshold for 2026

      const qualifying = report.vendors.filter(v => v.threshold_met);
      assert.equal(qualifying.length, 2, 'Two vendors should qualify for 1099-NEC: Apex and Hawkins');

      const apexRecord = qualifying.find(v => v.company_name === 'Apex Plumbing Services');
      assert.ok(apexRecord);
      assert.equal(apexRecord.total_payments_cents, 232000); // $2,320.00 >= $2,000.00
      assert.equal(apexRecord.tax_id_last4, '4401');

      const hawkinsRecord = qualifying.find(v => v.company_name === 'Hawkins General Repair');
      assert.ok(hawkinsRecord);
      assert.equal(hawkinsRecord.total_payments_cents, 215000); // $2,150.00 >= $2,000.00
      assert.equal(hawkinsRecord.tax_id_last4, '4404');
    });
  });

  it('re-seeding is idempotent without primary key or foreign key collisions', async () => {
    // Calling seedDatabase a second time must clean and re-seed cleanly
    await seedDatabase(db);
    const unitCount = db.prepare('SELECT COUNT(*) as cnt FROM units WHERE operator_id = ?').get(operatorId) as any;
    assert.equal(unitCount.cnt, 20);
  });
});
