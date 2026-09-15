import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInTenantContext } from '../../../test/helpers.js';
import { PropertiesRepository } from '../../properties/backend/repository.js';
import { ContactsRepository } from '../../contacts/backend/repository.js';
import { LeasesRepository } from '../backend/repository.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';

describe('Leases Module - Agreement Lifecycle & Signatories', () => {
  before(() => {
    getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
  });

  it('creates leases with signatories and manages contract lifecycle transitions', () => {
    runInTenantContext('tenant-lease-test', () => {
      // 1. Setup property, unit, and contact
      const prop = PropertiesRepository.createProperty({
        name: 'Oak Tree Townhomes',
        property_type: 'townhouse',
        address_line1: '100 Oak Tree Ln',
        city: 'Asheville',
        state: 'NC',
        postal_code: '28805'
      });

      const unit = PropertiesRepository.createUnit({
        property_id: prop.id,
        unit_number: 'A1',
        market_rent_cents: 195000
      });

      const tenant = ContactsRepository.createContact({
        contact_type: 'tenant',
        first_name: 'David',
        last_name: 'Miller',
        email: 'david.m@example.com'
      });

      const guarantor = ContactsRepository.createContact({
        contact_type: 'guarantor',
        first_name: 'Arthur',
        last_name: 'Miller',
        email: 'arthur.m@example.com'
      });

      // 2. Create draft lease with signatories
      const startDate = Date.UTC(2026, 5, 1);
      const endDate = Date.UTC(2027, 4, 31);
      const lease = LeasesRepository.createLease({
        unit_id: unit.id,
        status: 'draft',
        start_date: startDate,
        end_date: endDate,
        rent_amount_cents: 195000,
        security_deposit_cents: 195000,
        deposit_held_cents: 195000,
        rent_due_day: 1,
        late_fee_grace_days: 5,
        late_fee_amount_cents: 7500,
        contacts: [
          { contact_id: tenant.id, role: 'primary_tenant', is_financially_responsible: true },
          { contact_id: guarantor.id, role: 'guarantor', is_financially_responsible: true }
        ]
      });

      assert.ok(lease.id);
      assert.equal(lease.status, 'draft');
      assert.equal(lease.contacts?.length, 2);

      // 3. Activate lease
      const activatedLease = LeasesRepository.updateLeaseStatus(lease.id, 'active');
      assert.equal(activatedLease?.status, 'active');

      // 4. List leases by status
      const activeLeases = LeasesRepository.listLeases({ status: 'active' });
      assert.ok(activeLeases.some((l) => l.id === lease.id));

      // 5. Add occupant signatory
      const occupant = ContactsRepository.createContact({
        contact_type: 'tenant',
        first_name: 'Emily',
        last_name: 'Miller'
      });
      const added = LeasesRepository.addLeaseContact(lease.id, occupant.id, 'occupant', false);
      assert.equal(added, true);

      const refreshed = LeasesRepository.getLeaseById(lease.id);
      assert.equal(refreshed?.contacts?.length, 3);

      // 6. Terminate lease
      const terminated = LeasesRepository.updateLeaseStatus(lease.id, 'terminated');
      assert.equal(terminated?.status, 'terminated');
    });
  });
});
