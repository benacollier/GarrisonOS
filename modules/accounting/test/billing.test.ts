import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateProratedRent, generateMonthlyRentCharges } from '../backend/billing.js';
import { createTestDb, runInTenantContext } from '../../../test/helpers.js';
import { PropertiesRepository } from '../../properties/backend/repository.js';
import { LeasesRepository } from '../../leases/backend/repository.js';
import { AccountingRepository } from '../backend/repository.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';

describe('Accounting Module - Monthly Billing & Proration', () => {
  before(() => {
    getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
  });

  it('calculates mid-month rent proration correctly', () => {
    // 30-day month (e.g. September), Monthly rent: $1,500.00 (150000 cents), Starting on 16th (15 days remaining)
    // Formula: floor(150000 / 30 * 15) = 75000 cents ($750.00)
    const proratedSep = calculateProratedRent(150000, 2026, 8, 16);
    assert.equal(proratedSep, 75000);

    // 31-day month (e.g. August), Monthly rent: $1,800.00 (180000 cents), Starting on 10th (22 days remaining)
    // Formula: floor(180000 / 31 * 22) = 127741 cents ($1,277.41)
    const proratedAug = calculateProratedRent(180000, 2026, 7, 10);
    assert.equal(proratedAug, 127741);
  });

  it('generates recurring rent charges idempotently', () => {
    runInTenantContext('tenant-billing-test', () => {
      // 1. Create property, unit, and active lease
      const prop = PropertiesRepository.createProperty({
        name: 'Billing Test House',
        property_type: 'single_family',
        address_line1: '123 Billing Ln',
        city: 'Asheville',
        state: 'NC',
        postal_code: '28801'
      });

      const unit = PropertiesRepository.createUnit({
        property_id: prop.id,
        unit_number: '1',
        market_rent_cents: 160000
      });

      const lease = LeasesRepository.createLease({
        unit_id: unit.id,
        status: 'active',
        start_date: Date.UTC(2026, 0, 1),
        end_date: Date.UTC(2026, 11, 31),
        rent_amount_cents: 160000
      });

      // 2. Run billing generator for 2026-10
      const run1 = generateMonthlyRentCharges('2026-10');
      assert.equal(run1.chargesCreated, 1);
      assert.equal(run1.totalChargesCents, 160000);
      assert.equal(run1.skippedExisting, 0);

      // Verify transaction on ledger
      const txs = AccountingRepository.getLeaseTransactions(lease.id);
      assert.equal(txs.length, 1);
      assert.equal(txs[0]?.amount_cents, 160000);
      assert.equal(txs[0]?.reference_number, `rent_charge:${lease.id}:2026-10`);

      // 3. Run billing generator again for the SAME month (should skip and create 0 charges)
      const run2 = generateMonthlyRentCharges('2026-10');
      assert.equal(run2.chargesCreated, 0);
      assert.equal(run2.skippedExisting, 1);

      // Verify no duplicate charges added
      const txsAfter = AccountingRepository.getLeaseTransactions(lease.id);
      assert.equal(txsAfter.length, 1);
    });
  });
});

