import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInOperatorContext } from '../../../test/helpers.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';
import { JournalService } from '../backend/journal.js';
import { ChartOfAccountsRepository } from '../backend/chart_of_accounts.js';
import { AccountingRepository } from '../backend/repository.js';
import { generateUUIDv7 } from '../../../core/crypto.js';

describe('Accounting Module - Statutory Trust Accounting & Regulatory Compliance', () => {
  before(() => {
    getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
  });

  it('enforces statutory trust non-commingling invariant: rejects posting 1020 directly to operating revenue/expense', () => {
    runInOperatorContext('tenant-compliance-test', () => {
      ChartOfAccountsRepository.ensureDefaultAccounts();
      const accounts = ChartOfAccountsRepository.listAccounts();
      const trustBank = accounts.find((a) => a.account_number === '1020')!;
      const operatingBank = accounts.find((a) => a.account_number === '1010')!;
      const rentIncome = accounts.find((a) => a.account_number === '4010')!;
      const depositLiability = accounts.find((a) => a.account_number === '2100')!;
      const repairExpense = accounts.find((a) => a.account_number === '6010') || accounts.find((a) => a.account_type === 'Expense')!;

      // 1. Direct commingling attempt: Crediting rental income directly into trust account must be rejected
      assert.throws(() => {
        JournalService.postEntry({
          memo: 'Illegal commingling: Rent into Trust',
          source_type: 'payment',
          lines: [
            { account_id: trustBank.id, debit_cents: 120000, credit_cents: 0, description: 'Trust Bank' },
            { account_id: rentIncome.id, debit_cents: 0, credit_cents: 120000, description: 'Operating Rent Income' }
          ]
        });
      }, /Trust accounting violation: Security Deposit Trust funds/);

      // 2. Direct commingling attempt: Paying operating repairs directly out of trust account must be rejected
      assert.throws(() => {
        JournalService.postEntry({
          memo: 'Illegal commingling: Operating repair out of Trust',
          source_type: 'expense',
          lines: [
            { account_id: repairExpense.id, debit_cents: 45000, credit_cents: 0, description: 'Repair Expense' },
            { account_id: trustBank.id, debit_cents: 0, credit_cents: 45000, description: 'Trust Bank' }
          ]
        });
      }, /Trust accounting violation: Security Deposit Trust funds/);

      // 3. Compliant trust entry: Collecting security deposit into trust bank with offsetting deposit liability
      const validTrustDeposit = JournalService.postEntry({
        memo: 'Tenant Security Deposit Inflow',
        source_type: 'deposit_collection',
        lines: [
          { account_id: trustBank.id, debit_cents: 200000, credit_cents: 0, description: 'Deposit into Trust Checking' },
          { account_id: depositLiability.id, debit_cents: 0, credit_cents: 200000, description: 'Tenant Deposit Liability' }
        ]
      });
      assert.ok(validTrustDeposit.id);
      assert.equal(validTrustDeposit.total_debit_cents, 200000);
      assert.equal(validTrustDeposit.total_credit_cents, 200000);
    });
  });

  it('computes statutory Three-Way Bank Reconciliation with parity across GL trust, liability, and lease subledgers', () => {
    runInOperatorContext('tenant-reconciliation-test', () => {
      const db = getDatabase();
      ChartOfAccountsRepository.ensureDefaultAccounts();
      const accounts = ChartOfAccountsRepository.listAccounts();
      const trustBank = accounts.find((a) => a.account_number === '1020')!;
      const depositLiability = accounts.find((a) => a.account_number === '2100')!;

      // Setup property, unit, contacts, and lease with $1,500 security deposit
      const propId = generateUUIDv7();
      const unitId = generateUUIDv7();
      const leaseId = generateUUIDv7();
      const contactId = generateUUIDv7();
      const now = Date.now();

      db.prepare(`
        INSERT INTO properties (id, operator_id, name, address_line1, city, state, postal_code, property_type, created_at, updated_at)
        VALUES (?, 'tenant-reconciliation-test', 'Sunset Villas', '123 Ocean Way', 'San Diego', 'CA', '92109', 'multi_family', ?, ?)
      `).run(propId, now, now);

      db.prepare(`
        INSERT INTO units (id, operator_id, property_id, unit_number, status, market_rent_cents, created_at, updated_at)
        VALUES (?, 'tenant-reconciliation-test', ?, '101', 'occupied', 180000, ?, ?)
      `).run(unitId, propId, now, now);

      db.prepare(`
        INSERT INTO contacts (id, operator_id, contact_type, first_name, last_name, email, phone, created_at, updated_at)
        VALUES (?, 'tenant-reconciliation-test', 'tenant', 'Alice', 'Walker', 'alice@test.local', '555-0100', ?, ?)
      `).run(contactId, now, now);

      db.prepare(`
        INSERT INTO leases (id, operator_id, unit_id, start_date, end_date, rent_amount_cents, deposit_held_cents, status, created_at, updated_at)
        VALUES (?, 'tenant-reconciliation-test', ?, ?, ?, 180000, 150000, 'active', ?, ?)
      `).run(leaseId, unitId, now - 30 * 86400000, now + 335 * 86400000, now, now);

      const leaseContactId = generateUUIDv7();
      db.prepare(`
        INSERT INTO lease_contacts (id, operator_id, lease_id, contact_id, role, is_financially_responsible, created_at)
        VALUES (?, 'tenant-reconciliation-test', ?, ?, 'primary_tenant', 1, ?)
      `).run(leaseContactId, leaseId, contactId, now);

      // Post balanced trust journal entry for the $1,500 deposit
      JournalService.postEntry({
        memo: 'Initial Security Deposit Receipt - Alice Walker',
        source_type: 'deposit_collection',
        source_id: leaseId,
        lines: [
          { account_id: trustBank.id, debit_cents: 150000, credit_cents: 0, description: 'Trust Checking Inflow' },
          { account_id: depositLiability.id, debit_cents: 0, credit_cents: 150000, description: 'Deposit Liability' }
        ]
      });

      // Run Three-Way Reconciliation with empirical bank statement balance
      const rec = AccountingRepository.getThreeWayReconciliation(undefined, 150000);

      assert.equal(rec.bank_statement_balance_cents, 150000, 'Bank statement balance must be 150000 cents');
      assert.equal(rec.gl_trust_cash_cents, 150000, 'GL Trust Cash must be 150000 cents ($1,500.00)');
      assert.equal(rec.tenant_deposits_liability_cents, 150000, 'Tenant Deposit Liability must be 150000 cents');
      assert.equal(rec.lease_deposits_total_cents, 150000, 'Sum of active lease deposits must be 150000 cents');
      assert.equal(rec.in_balance, true, 'Three-way reconciliation must be in balance');
      assert.equal(rec.reconciliation_difference_cents, 0, 'Reconciliation difference must be 0');
      assert.equal(rec.leases.length, 1);
      assert.ok(rec.leases[0]);
      assert.equal(rec.leases[0]!.lease_id, leaseId);
      assert.equal(rec.leases[0]!.primary_tenant_name, 'Alice Walker');
      assert.equal(rec.leases[0]!.deposit_held_cents, 150000);

      // Verify out-of-balance detection when bank statement differs
      const outOfBalanceRec = AccountingRepository.getThreeWayReconciliation(undefined, 160000);
      assert.equal(outOfBalanceRec.in_balance, false);
      assert.equal(outOfBalanceRec.reconciliation_difference_cents, 10000);

      // Verify terminated leases are excluded from active lease subledgers
      const terminatedLeaseId = generateUUIDv7();
      db.prepare(`
        INSERT INTO leases (id, operator_id, unit_id, start_date, end_date, rent_amount_cents, deposit_held_cents, status, created_at, updated_at)
        VALUES (?, 'tenant-reconciliation-test', ?, ?, ?, 180000, 100000, 'terminated', ?, ?)
      `).run(terminatedLeaseId, unitId, now - 60 * 86400000, now - 5 * 86400000, now, now);

      const filteredRec = AccountingRepository.getThreeWayReconciliation();
      assert.equal(filteredRec.lease_deposits_total_cents, 150000, 'Terminated lease deposit must not be included');
      assert.equal(filteredRec.leases.length, 1);
    });
  });

  it('aggregates annual vendor maintenance payments and flags IRS 1099-NEC threshold by tax year', () => {
    runInOperatorContext('tenant-1099-test', () => {
      const db = getDatabase();
      const now = Date.now();
      const taxYear = 2026;
      const yearDate = Date.UTC(taxYear, 5, 15, 12, 0, 0); // June 15 of 2026

      // Create two vendors: one qualifying (> $2,000 in 2026) and one under threshold (< $2,000)
      const vendor1Id = generateUUIDv7();
      const vendor2Id = generateUUIDv7();

      db.prepare(`
        INSERT INTO contacts (id, operator_id, contact_type, first_name, last_name, company_name, tax_id_last4, email, phone, created_at, updated_at)
        VALUES (?, 'tenant-1099-test', 'vendor', 'Bob', 'Builder', 'Apex Plumbing Services LLC', '9876', 'bob@apex.local', '555-0200', ?, ?)
      `).run(vendor1Id, now, now);

      db.prepare(`
        INSERT INTO contacts (id, operator_id, contact_type, first_name, last_name, company_name, tax_id_last4, email, phone, created_at, updated_at)
        VALUES (?, 'tenant-1099-test', 'vendor', 'Carol', 'Cleaner', 'Sparkle Cleaning Co', '1234', 'carol@sparkle.local', '555-0300', ?, ?)
      `).run(vendor2Id, now, now);

      // Record payments: Vendor 1 receives $2,500.00 (250,000 cents), Vendor 2 receives $800.00 (80,000 cents)
      AccountingRepository.createTransaction({
        transaction_type: 'expense',
        category: 'repairs',
        amount_cents: 250000,
        transaction_date: yearDate,
        description: 'Main water line replacement',
        payee_contact_id: vendor1Id
      });

      AccountingRepository.createTransaction({
        transaction_type: 'expense',
        category: 'cleaning_maintenance',
        amount_cents: 80000,
        transaction_date: yearDate,
        description: 'Common area carpet shampooing',
        payee_contact_id: vendor2Id
      });

      const report = AccountingRepository.getVendor1099Report(taxYear);

      assert.equal(report.tax_year, 2026);
      assert.equal(report.threshold_cents, 200000, 'Threshold for 2026 must be 200,000 cents ($2,000.00)');
      assert.equal(report.total_vendors_count, 2);
      assert.equal(report.qualifying_vendors_count, 1, 'Only Apex Plumbing should meet $2,000 threshold');
      assert.equal(report.total_qualifying_payments_cents, 250000);

      const qualifyingVendor = report.vendors.find((v) => v.vendor_id === vendor1Id)!;
      assert.ok(qualifyingVendor);
      assert.equal(qualifyingVendor.vendor_name, 'Apex Plumbing Services LLC');
      assert.equal(qualifyingVendor.total_payments_cents, 250000);
      assert.equal(qualifyingVendor.threshold_met, true);
      assert.equal(qualifyingVendor.tax_id_last4, '9876');

      const nonQualifyingVendor = report.vendors.find((v) => v.vendor_id === vendor2Id)!;
      assert.ok(nonQualifyingVendor);
      assert.equal(nonQualifyingVendor.total_payments_cents, 80000);
      assert.equal(nonQualifyingVendor.threshold_met, false);

      // Verify historical tax year threshold selection (prior to 2026 is 60,000 cents / $600.00)
      const historicalReport = AccountingRepository.getVendor1099Report(2025);
      assert.equal(historicalReport.threshold_cents, 60000, 'Historical threshold for 2025 must be 60,000 cents ($600.00)');
    });
  });

  it('calculates statutory move-out deposit disposition timelines and countdown alerts', () => {
    const now = Date.now();
    const MS_PER_DAY = 86400000;
    const moveOutDate = now - 5 * MS_PER_DAY; // Moved out 5 days ago

    // California: 21 days
    const caTimeline = AccountingRepository.getStatutoryDispositionTimeline(moveOutDate, 'CA');
    assert.equal(caTimeline.statutory_limit_days, 21);
    assert.equal(caTimeline.state_code, 'CA');
    assert.equal(caTimeline.days_remaining, 16);
    assert.equal(caTimeline.is_past_due, false);

    // New York: 14 days
    const nyTimeline = AccountingRepository.getStatutoryDispositionTimeline(moveOutDate, 'NY');
    assert.equal(nyTimeline.statutory_limit_days, 14);
    assert.equal(nyTimeline.state_code, 'NY');
    assert.equal(nyTimeline.days_remaining, 9);
    assert.equal(nyTimeline.is_past_due, false);

    // Texas: 30 days
    const txTimeline = AccountingRepository.getStatutoryDispositionTimeline(moveOutDate, 'TX');
    assert.equal(txTimeline.statutory_limit_days, 30);
    assert.equal(txTimeline.state_code, 'TX');
    assert.equal(txTimeline.days_remaining, 25);
    assert.equal(txTimeline.is_past_due, false);

    // Past due test: Moved out 40 days ago in NY (limit 14 days)
    const pastDueMoveOut = now - 40 * MS_PER_DAY;
    const overdueTimeline = AccountingRepository.getStatutoryDispositionTimeline(pastDueMoveOut, 'NY');
    assert.equal(overdueTimeline.is_past_due, true);
    assert.ok(overdueTimeline.days_remaining < 0);

    // Unsupported jurisdiction must throw error
    assert.throws(() => {
      AccountingRepository.getStatutoryDispositionTimeline(moveOutDate, 'ZZ');
    }, /Unsupported jurisdiction 'ZZ'/);
  });
});
