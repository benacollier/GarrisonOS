import { test, describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInOperatorContext } from '../../../test/helpers.js';
import { PropertiesRepository } from '../backend/repository.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';

describe('Properties Module - Lifecycle & Inventory Management', () => {
  before(() => {
    getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
  });

  it('creates, updates, and deletes legal portfolios', () => {
    runInOperatorContext('tenant-prop-test', () => {
      // Create portfolio
      const portfolio = PropertiesRepository.createPortfolio({
        name: 'Blue Ridge Holdings LLC',
        tax_id: 'XX-XXXXXXX',
        notes: 'Primary residential holding entity'
      });
      assert.ok(portfolio.id);
      assert.equal(portfolio.name, 'Blue Ridge Holdings LLC');

      // Update portfolio
      const updated = PropertiesRepository.updatePortfolio(portfolio.id, {
        notes: 'Updated holding entity notes'
      });
      assert.equal(updated?.notes, 'Updated holding entity notes');

      // List portfolios
      const list = PropertiesRepository.listPortfolios();
      assert.ok(list.some((p) => p.id === portfolio.id));

      // Delete portfolio
      const deleted = PropertiesRepository.deletePortfolio(portfolio.id);
      assert.equal(deleted, true);
      assert.equal(PropertiesRepository.getPortfolioById(portfolio.id), null);
    });
  });

  it('manages property and unit lifecycle, vacancies, and occupancy metrics', () => {
    runInOperatorContext('tenant-prop-test', () => {
      // 1. Create property
      const prop = PropertiesRepository.createProperty({
        name: 'Highland Ridge Apartments',
        property_type: 'multi_family',
        address_line1: '500 Highland Way',
        city: 'Asheville',
        state: 'NC',
        postal_code: '28804',
        year_built: 2020
      });
      assert.ok(prop.id);
      assert.equal(prop.name, 'Highland Ridge Apartments');

      // 2. Create units
      const unit1 = PropertiesRepository.createUnit({
        property_id: prop.id,
        unit_number: '101',
        bedrooms: 2,
        bathrooms: 2,
        market_rent_cents: 180000,
        status: 'vacant'
      });
      assert.ok(unit1.id);
      assert.equal(unit1.status, 'vacant');

      const unit2 = PropertiesRepository.createUnit({
        property_id: prop.id,
        unit_number: '102',
        bedrooms: 1,
        bathrooms: 1,
        market_rent_cents: 140000,
        status: 'vacant'
      });
      assert.ok(unit2.id);

      // 3. Update unit status to occupied
      PropertiesRepository.updateUnitStatus(unit1.id, 'occupied');
      const refreshedUnit1 = PropertiesRepository.getUnitById(unit1.id);
      assert.equal(refreshedUnit1?.status, 'occupied');

      // 4. Calculate occupancy metrics
      const metrics = PropertiesRepository.getOccupancyMetrics();
      assert.ok(metrics.totalUnits >= 2);
      assert.ok(metrics.occupiedUnits >= 1);
      assert.ok(metrics.occupancyRatePercentage > 0);
      assert.ok(metrics.totalMarketRentCents >= 320000);

      // 5. Clean up
      PropertiesRepository.deleteUnit(unit2.id);
      assert.equal(PropertiesRepository.getUnitById(unit2.id), null);
    });
  });
});

