import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInOperatorContext } from '../helpers.js';
import { createToken, verifyTokenWithDatabase, generateUUIDv7 } from '../../core/crypto.js';
import { eventBus } from '../../core/events.js';
import { registerSubscribers as registerPropertySubscribers } from '../../modules/properties/backend/events.js';
import { PropertiesRepository } from '../../modules/properties/backend/repository.js';
import { ContactsRepository } from '../../modules/contacts/backend/repository.js';
import { LeasesRepository } from '../../modules/leases/backend/repository.js';
import { MaintenanceRepository } from '../../modules/maintenance/backend/repository.js';
import { ChartOfAccountsRepository } from '../../modules/accounting/backend/chart_of_accounts.js';
import { JournalService } from '../../modules/accounting/backend/journal.js';

describe('End-to-End Property Management Lifecycle (E2E)', () => {
  let db: any;
  const operatorId = 'op-e2e-lifecycle';
  const adminUserId = 'user-e2e-admin';
  const secretKey = 'garrison-e2e-secret-key-super-secure-32chars';

  before(() => {
    db = createTestDb();
    registerPropertySubscribers(eventBus);

    // Bootstrap Operator and Admin User
    const now = Date.now();
    db.prepare(`
      INSERT INTO operators (id, name, subdomain, currency, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(operatorId, 'E2E Asset Management LLC', 'e2e-assets', 'USD', now, now);

    db.prepare(`
      INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, token_version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(adminUserId, operatorId, 'admin@e2e-assets.local', '$scrypt$dummy', 'Admin', 'User', 'owner', 1, now, now);
  });

  after(() => {
    try {
      db.close();
    } catch {
      // Ignore if already closed
    }
  });

  it('executes complete multi-step real estate portfolio lifecycle', async () => {
    await runInOperatorContext(operatorId, async () => {
      // ----------------------------------------------------------------------
      // Step 1: Authentication & Token Revocation Invariant Proof
      // ----------------------------------------------------------------------
      const sessionToken = createToken(
        {
          sub: adminUserId,
          opid: operatorId,
          role: 'owner',
          exp: Math.floor(Date.now() / 1000) + 3600,
          tv: 1
        },
        secretKey
      );

      const verified = verifyTokenWithDatabase(sessionToken, secretKey, db);
      assert.ok(verified !== null, 'Session token with matching tv must verify');
      assert.equal(verified?.sub, adminUserId);

      // Verify unversioned legacy tokens fail-closed
      const unversionedToken = createToken(
        {
          sub: adminUserId,
          opid: operatorId,
          role: 'owner',
          exp: Math.floor(Date.now() / 1000) + 3600
        },
        secretKey
      );
      assert.equal(verifyTokenWithDatabase(unversionedToken, secretKey, db), null);

      // ----------------------------------------------------------------------
      // Step 2: Chart of Accounts Provisioning
      // ----------------------------------------------------------------------
      ChartOfAccountsRepository.ensureDefaultAccounts();
      const opChecking = ChartOfAccountsRepository.getAccountByMapping('operating_bank');
      const trustChecking = ChartOfAccountsRepository.getAccountByMapping('trust_bank');
      const arAccount = ChartOfAccountsRepository.getAccountByMapping('accounts_receivable');
      const depositLiability = ChartOfAccountsRepository.getAccountByMapping('security_deposit');
      const rentIncome = ChartOfAccountsRepository.getAccountByMapping('rent');
      const repairExpense = ChartOfAccountsRepository.getAccountByMapping('repairs');

      assert.ok(opChecking, '1010 Operating Checking must be provisioned');
      assert.ok(trustChecking, '1020 Security Deposit Trust Checking must be provisioned');
      assert.ok(arAccount, '1100 Accounts Receivable must be provisioned');
      assert.ok(depositLiability, '2100 Tenant Security Deposits Held must be provisioned');
      assert.ok(rentIncome, '4010 Rental Income must be provisioned');
      assert.ok(repairExpense, '5100 Repairs & Maintenance must be provisioned');

      // ----------------------------------------------------------------------
      // Step 3: Portfolio, Property & Unit Creation
      // ----------------------------------------------------------------------
      const portfolio = PropertiesRepository.createPortfolio({
        name: 'Apex Residential Portfolio'
      });
      assert.ok(portfolio.id);

      const property = PropertiesRepository.createProperty({
        portfolio_id: portfolio.id,
        name: 'Highland Oaks Apartments',
        address_line1: '450 Highland Way',
        city: 'Austin',
        state: 'TX',
        postal_code: '78701',
        property_type: 'multi_family'
      });
      assert.ok(property.id);

      const unit = PropertiesRepository.createUnit({
        property_id: property.id,
        unit_number: '204',
        bedrooms: 2,
        bathrooms: 2,
        square_feet: 1050,
        market_rent_cents: 185000,
        target_deposit_cents: 185000
      });
      assert.equal(unit.status, 'vacant', 'Newly created unit must start as vacant');

      // ----------------------------------------------------------------------
      // Step 4: Contact Directory Onboarding (Tenant & W-9 Vendor)
      // ----------------------------------------------------------------------
      const tenantContact = ContactsRepository.createContact({
        contact_type: 'tenant',
        first_name: 'Elena',
        last_name: 'Rostova',
        email: 'elena.rostova@example.com',
        phone: '512-555-4321'
      });
      assert.equal(tenantContact.contact_type, 'tenant');

      const vendorContact = ContactsRepository.createContact({
        contact_type: 'vendor',
        first_name: 'Marcus',
        last_name: 'Stone',
        company_name: 'Stone Plumbing & Mechanical LLC',
        email: 'service@stoneplumbing.local',
        phone: '512-555-8888',
        vendor_specialty: 'Plumbing',
        tax_classification: 'llc',
        tax_id_last4: '4412',
        w9_received: 1
      });
      assert.equal(vendorContact.contact_type, 'vendor');
      assert.equal(vendorContact.w9_received, 1, 'Vendor W-9 status must be recorded');
      assert.equal(vendorContact.vendor_specialty, 'Plumbing');

      // ----------------------------------------------------------------------
      // Step 5: Lease Execution & Deposit Fiduciary Trust Segregation
      // ----------------------------------------------------------------------
      const leaseStart = Date.now();
      const leaseEnd = leaseStart + 365 * 24 * 60 * 60 * 1000;
      const lease = LeasesRepository.createLease({
        unit_id: unit.id,
        start_date: leaseStart,
        end_date: leaseEnd,
        rent_amount_cents: 185000,
        security_deposit_cents: 185000,
        rent_due_day: 1
      });
      assert.equal(lease.status, 'draft');

      LeasesRepository.addLeaseContact(lease.id, tenantContact.id, 'primary_tenant', true);

      // Activate lease and verify event-driven unit occupancy transition
      const activeLease = LeasesRepository.updateLeaseStatus(lease.id, 'active');
      assert.equal(activeLease?.status, 'active');

      // Publish lease.activated event and verify unit turns occupied
      await eventBus.publish('lease.activated', {
        leaseId: lease.id,
        unitId: unit.id,
        operatorId,
        tenantId: operatorId,
        rentAmountCents: 185000
      });

      // Allow setImmediate loop to flush event handlers
      await new Promise((resolve) => setTimeout(resolve, 50));

      const occupiedUnit = PropertiesRepository.getUnitById(unit.id);
      assert.equal(occupiedUnit?.status, 'occupied', 'Unit status must transition to occupied');

      // Post Security Deposit trust receipt (Debit 1020 Trust Bank, Credit 2100 Deposit Liability)
      JournalService.postEntry({
        memo: `Tenant Security Deposit - Unit 204 - ${tenantContact.first_name} ${tenantContact.last_name}`,
        source_type: 'security_deposit',
        source_id: lease.id,
        lines: [
          {
            account_id: trustChecking!.id,
            debit_cents: 185000,
            credit_cents: 0,
            property_id: property.id,
            unit_id: unit.id,
            contact_id: tenantContact.id
          },
          {
            account_id: depositLiability!.id,
            debit_cents: 0,
            credit_cents: 185000,
            property_id: property.id,
            unit_id: unit.id,
            contact_id: tenantContact.id
          }
        ]
      });

      // ----------------------------------------------------------------------
      // Step 6: Monthly Rent Billing & Operating Cash Receipt
      // ----------------------------------------------------------------------
      // Charge monthly rent: Debit 1100 AR, Credit 4010 Rental Income
      JournalService.postEntry({
        memo: 'Rent Charge - October 2026',
        source_type: 'rent_charge',
        source_id: lease.id,
        lines: [
          {
            account_id: arAccount!.id,
            debit_cents: 185000,
            credit_cents: 0,
            property_id: property.id,
            unit_id: unit.id,
            contact_id: tenantContact.id
          },
          {
            account_id: rentIncome!.id,
            debit_cents: 0,
            credit_cents: 185000,
            property_id: property.id,
            unit_id: unit.id,
            contact_id: tenantContact.id
          }
        ]
      });

      // Collect rent payment: Debit 1010 Operating Bank, Credit 1100 AR
      JournalService.postEntry({
        memo: `Rent Payment Received - ${tenantContact.last_name}`,
        source_type: 'rent_payment',
        source_id: lease.id,
        lines: [
          {
            account_id: opChecking!.id,
            debit_cents: 185000,
            credit_cents: 0,
            property_id: property.id,
            unit_id: unit.id,
            contact_id: tenantContact.id
          },
          {
            account_id: arAccount!.id,
            debit_cents: 0,
            credit_cents: 185000,
            property_id: property.id,
            unit_id: unit.id,
            contact_id: tenantContact.id
          }
        ]
      });

      // ----------------------------------------------------------------------
      // Step 7: Maintenance Work Order, Vendor Dispatch & Expense Posting
      // ----------------------------------------------------------------------
      const workOrder = MaintenanceRepository.createWorkOrder({
        property_id: property.id,
        unit_id: unit.id,
        title: 'Main Water Shutoff Valve Replacement',
        description: 'Corroded valve failing to hold seal; replace with quarter-turn brass ball valve.',
        priority: 'emergency',
        category: 'plumbing',
        estimated_cost_cents: 32000
      });
      assert.equal(workOrder.status, 'open');

      // Dispatch qualified plumbing vendor
      const dispatched = MaintenanceRepository.updateWorkOrder(workOrder.id, {
        vendor_contact_id: vendorContact.id,
        status: 'assigned'
      });
      assert.equal(dispatched?.status, 'assigned');
      assert.equal(dispatched?.vendor_contact_id, vendorContact.id);

      // Complete work order with actual invoice cost ($320.00)
      const completedWO = MaintenanceRepository.completeWorkOrder(workOrder.id, 32000);
      assert.equal(completedWO?.status, 'completed');
      assert.equal(completedWO?.actual_cost_cents, 32000);

      // Record invoice payment: Debit 5100 Repairs Expense, Credit 1010 Operating Checking
      JournalService.postEntry({
        memo: `Plumbing Repair Invoice #${workOrder.id.slice(0, 8)} - Stone Plumbing`,
        source_type: 'work_order',
        source_id: workOrder.id,
        lines: [
          {
            account_id: repairExpense!.id,
            debit_cents: 32000,
            credit_cents: 0,
            property_id: property.id,
            unit_id: unit.id,
            contact_id: vendorContact.id
          },
          {
            account_id: opChecking!.id,
            debit_cents: 0,
            credit_cents: 32000,
            property_id: property.id,
            unit_id: unit.id,
            contact_id: vendorContact.id
          }
        ]
      });

      // ----------------------------------------------------------------------
      // Step 8: Lease Termination, Event-Driven Turnover & Deposit Disposition
      // ----------------------------------------------------------------------
      LeasesRepository.updateLeaseStatus(lease.id, 'terminated');

      // Publish lease.terminated event and verify unit automatically transitions to 'turnover'
      await eventBus.publish('lease.terminated', {
        leaseId: lease.id,
        unitId: unit.id,
        operatorId,
        tenantId: operatorId
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const turnoverUnit = PropertiesRepository.getUnitById(unit.id);
      assert.equal(turnoverUnit?.status, 'turnover', 'Unit must transition to turnover upon lease termination');

      // Refund full security deposit: Debit 2100 Deposit Liability, Credit 1020 Trust Bank
      JournalService.postEntry({
        memo: `Full Deposit Refund - Elena Rostova - Move-Out Inspection Passed`,
        source_type: 'deposit_refund',
        source_id: lease.id,
        lines: [
          {
            account_id: depositLiability!.id,
            debit_cents: 185000,
            credit_cents: 0,
            property_id: property.id,
            unit_id: unit.id,
            contact_id: tenantContact.id
          },
          {
            account_id: trustChecking!.id,
            debit_cents: 0,
            credit_cents: 185000,
            property_id: property.id,
            unit_id: unit.id,
            contact_id: tenantContact.id
          }
        ]
      });

      // Unit Turnover Complete -> Operator transitions unit back to vacant
      const statusUpdated = PropertiesRepository.updateUnitStatus(unit.id, 'vacant');
      assert.equal(statusUpdated, true);

      const readyUnit = PropertiesRepository.getUnitById(unit.id);
      assert.equal(readyUnit?.status, 'vacant', 'Unit must return to vacant after turnover completion');

      // ----------------------------------------------------------------------
      // Step 9: Final Ledger Parity & Integrity Verification
      // ----------------------------------------------------------------------
      const opLines = db.prepare(`
        SELECT SUM(debit_cents) as total_debit, SUM(credit_cents) as total_credit
        FROM journal_lines
        WHERE account_id = ? AND operator_id = ?
      `).get(opChecking!.id, operatorId) as { total_debit: number; total_credit: number };

      // Net operating cash = $1,850.00 rent collected - $320.00 repair = $1,530.00 (153000 cents)
      const opNetBalance = opLines.total_debit - opLines.total_credit;
      assert.equal(opNetBalance, 153000, 'Operating checking balance must equal $1,530.00');

      const trustLines = db.prepare(`
        SELECT SUM(debit_cents) as total_debit, SUM(credit_cents) as total_credit
        FROM journal_lines
        WHERE account_id = ? AND operator_id = ?
      `).get(trustChecking!.id, operatorId) as { total_debit: number; total_credit: number };

      // Trust balance must equal exactly 0 after full deposit refund (no commingling, zero-sum)
      const trustNetBalance = trustLines.total_debit - trustLines.total_credit;
      assert.equal(trustNetBalance, 0, 'Trust bank balance must be exactly 0 after full refund');

      const depositLiabilityLines = db.prepare(`
        SELECT SUM(debit_cents) as total_debit, SUM(credit_cents) as total_credit
        FROM journal_lines
        WHERE account_id = ? AND operator_id = ?
      `).get(depositLiability!.id, operatorId) as { total_debit: number; total_credit: number };

      const depositLiabilityBalance = depositLiabilityLines.total_credit - depositLiabilityLines.total_debit;
      assert.equal(depositLiabilityBalance, 0, 'Security deposit liability must be extinguished');
    }, adminUserId);
  });
});
