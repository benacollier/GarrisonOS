import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInTenantContext } from './helpers.js';
import { PropertiesRepository } from '../modules/properties/backend/repository.js';
import { ContactsRepository } from '../modules/contacts/backend/repository.js';
import { LeasesRepository } from '../modules/leases/backend/repository.js';
import { AccountingRepository } from '../modules/accounting/backend/repository.js';
import { MaintenanceRepository } from '../modules/maintenance/backend/repository.js';
import { closeDatabase, getDatabase } from '../database/client.js';

describe('Cross-Tenant Data Isolation & Security Guardrails', () => {
  before(() => {
    // Initialize in-memory database with migrations
    const db = getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
  });

  it('strictly isolates properties, portfolios, and units between tenants', () => {
    // 1. Create property & unit in Tenant Alpha
    const propAlpha = runInTenantContext('tenant-alpha', () => {
      const p = PropertiesRepository.createProperty({
        name: 'Alpha Tower',
        property_type: 'multi_family',
        address_line1: '100 Alpha St',
        city: 'Alpha City',
        state: 'NC',
        postal_code: '28801'
      });
      PropertiesRepository.createUnit({
        property_id: p.id,
        unit_number: '101',
        market_rent_cents: 150000
      });
      return p;
    });

    // 2. Query properties & units from Tenant Beta
    runInTenantContext('tenant-beta', () => {
      const propsBeta = PropertiesRepository.listProperties();
      assert.equal(propsBeta.length, 0);

      const propById = PropertiesRepository.getPropertyById(propAlpha.id);
      assert.equal(propById, null);

      const unitsBeta = PropertiesRepository.listUnits();
      assert.equal(unitsBeta.length, 0);
    });
  });

  it('strictly isolates contacts directory between tenants', () => {
    const contactAlpha = runInTenantContext('tenant-alpha', () => {
      return ContactsRepository.createContact({
        contact_type: 'tenant',
        first_name: 'John',
        last_name: 'Alpha',
        email: 'john@alpha.local'
      });
    });

    runInTenantContext('tenant-beta', () => {
      const contactsBeta = ContactsRepository.listContacts();
      assert.equal(contactsBeta.length, 0);

      const contactById = ContactsRepository.getContactById(contactAlpha.id);
      assert.equal(contactById, null);
    });
  });

  it('strictly isolates financial transactions and rent roll between tenants', () => {
    runInTenantContext('tenant-alpha', () => {
      AccountingRepository.createTransaction({
        transaction_type: 'payment',
        category: 'rent',
        amount_cents: 150000,
        transaction_date: Date.now(),
        description: 'Alpha Rent Payment'
      });
    });

    runInTenantContext('tenant-beta', () => {
      const txBeta = AccountingRepository.listTransactions();
      assert.equal(txBeta.length, 0);

      const scheduleEBeta = AccountingRepository.getScheduleEReport();
      assert.equal(scheduleEBeta.totalIncomeCents, 0);
      assert.equal(scheduleEBeta.totalOperatingExpenseCents, 0);
    });
  });

  it('strictly isolates maintenance work orders between tenants', () => {
    const { prop, wo } = runInTenantContext('tenant-alpha', () => {
      const p = PropertiesRepository.createProperty({
        name: 'Alpha Maintenance Prop',
        property_type: 'single_family',
        address_line1: '99 Repair Way',
        city: 'Asheville',
        state: 'NC',
        postal_code: '28801'
      });
      const w = MaintenanceRepository.createWorkOrder({
        property_id: p.id,
        title: 'Alpha Broken Pipe',
        description: 'Urgent leak in Alpha building',
        priority: 'emergency',
        category: 'plumbing'
      });
      return { prop: p, wo: w };
    });

    runInTenantContext('tenant-beta', () => {
      const woBeta = MaintenanceRepository.listWorkOrders();
      assert.equal(woBeta.length, 0);

      const woById = MaintenanceRepository.getWorkOrderById(wo.id);
      assert.equal(woById, null);
    });
  });
});
