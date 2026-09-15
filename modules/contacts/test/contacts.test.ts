import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInTenantContext } from '../../../test/helpers.js';
import { ContactsRepository } from '../backend/repository.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';

describe('Contacts Module - Directory & Vendor Registry', () => {
  before(() => {
    getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
  });

  it('creates, filters, updates, and soft-deletes contacts across all role categories', () => {
    runInTenantContext('tenant-contact-test', () => {
      // 1. Create a tenant contact
      const tenantContact = ContactsRepository.createContact({
        contact_type: 'tenant',
        first_name: 'Sarah',
        last_name: 'Jenkins',
        email: 'sarah.j@example.com',
        phone: '555-0199',
        tax_id_last4: '4321'
      });
      assert.ok(tenantContact.id);
      assert.equal(tenantContact.first_name, 'Sarah');

      // 2. Create a vendor contact
      const vendorContact = ContactsRepository.createContact({
        contact_type: 'vendor',
        first_name: 'Robert',
        last_name: 'Perez',
        company_name: 'Perez Rapid Plumbing',
        vendor_specialty: 'plumbing',
        email: 'robert@perezplumbing.local',
        phone: '555-0188'
      });
      assert.ok(vendorContact.id);
      assert.equal(vendorContact.vendor_specialty, 'plumbing');

      // 3. Filter contacts by contact_type
      const vendors = ContactsRepository.listContacts({ contact_type: 'vendor' });
      assert.ok(vendors.some((c) => c.id === vendorContact.id));
      assert.ok(!vendors.some((c) => c.id === tenantContact.id));

      // 4. Search contacts by query
      const searchResults = ContactsRepository.listContacts({ query: 'Jenkins' });
      assert.equal(searchResults.length, 1);
      assert.equal(searchResults[0]?.id, tenantContact.id);

      // 5. Update contact details
      const updated = ContactsRepository.updateContact(tenantContact.id, {
        phone: '555-0999',
        notes: 'Preferred communication via SMS'
      });
      assert.equal(updated?.phone, '555-0999');
      assert.equal(updated?.notes, 'Preferred communication via SMS');

      // 6. Soft delete contact
      const deleted = ContactsRepository.deleteContact(tenantContact.id);
      assert.equal(deleted, true);
      assert.equal(ContactsRepository.getContactById(tenantContact.id), null);
    });
  });
});
