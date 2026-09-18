import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { createTestDb, runInOperatorContext } from '../../../test/helpers.js';
import { PropertiesRepository } from '../backend/repository.js';
import { closeDatabase, getDatabase } from '../../../database/client.js';

describe('Properties Module - Building Management & Asset Hierarchy', () => {
  before(() => {
    getDatabase({ inMemory: true });
    createTestDb();
  });

  after(() => {
    closeDatabase();
  });

  it('creates, reads, updates, and soft-deletes buildings', () => {
    runInOperatorContext('tenant-building-test', () => {
      // 1. Create property
      const property = PropertiesRepository.createProperty({
        name: 'Grandview Complex',
        property_type: 'multi_family',
        address_line1: '100 Grandview Blvd',
        city: 'Charlotte',
        state: 'NC',
        postal_code: '28202',
      });
      assert.ok(property.id);

      // 2. Create building within property
      const building = PropertiesRepository.createBuilding({
        property_id: property.id,
        name: 'Building 1 - North Tower',
        building_number: 'Bldg-1',
        floors: 4,
        notes: 'North residential tower with 4 floors',
      });
      assert.ok(building.id);
      assert.equal(building.name, 'Building 1 - North Tower');
      assert.equal(building.building_number, 'Bldg-1');
      assert.equal(building.floors, 4);
      assert.equal(building.property_id, property.id);

      // 3. List buildings for the property
      const buildings = PropertiesRepository.listBuildings(property.id);
      assert.equal(buildings.length, 1);
      assert.equal(buildings[0]!.id, building.id);

      // 4. Update building
      const updated = PropertiesRepository.updateBuilding(building.id, {
        name: 'Building 1 - North Tower (Renovated)',
        floors: 5,
      });
      assert.ok(updated);
      assert.equal(updated?.name, 'Building 1 - North Tower (Renovated)');
      assert.equal(updated?.floors, 5);

      // 5. Link a unit to this building
      const unit = PropertiesRepository.createUnit({
        property_id: property.id,
        building_id: building.id,
        unit_number: '101',
        bedrooms: 2,
        bathrooms: 2,
        market_rent_cents: 160000,
        status: 'vacant',
      });
      assert.ok(unit.id);
      assert.equal(unit.building_id, building.id);

      const fetchedUnit = PropertiesRepository.getUnitById(unit.id);
      assert.equal(fetchedUnit?.building_id, building.id);

      // 6. Delete building (soft delete)
      const deleted = PropertiesRepository.deleteBuilding(building.id);
      assert.equal(deleted, true);

      // Verify building is no longer retrieved
      assert.equal(PropertiesRepository.getBuildingById(building.id), null);
      const remainingBuildings = PropertiesRepository.listBuildings(property.id);
      assert.equal(remainingBuildings.length, 0);

      // Verify linked unit has building_id cleared
      const unlinkedUnit = PropertiesRepository.getUnitById(unit.id);
      assert.equal(unlinkedUnit?.building_id, null);
    });
  });

  it('validates building linkage on unit creation and update', () => {
    runInOperatorContext('operator-validation-test', () => {
      const prop1 = PropertiesRepository.createProperty({
        name: 'Prop 1',
        property_type: 'multi_family',
        address_line1: '100 Main St',
        city: 'Charlotte',
        state: 'NC',
        postal_code: '28202',
      });
      const prop2 = PropertiesRepository.createProperty({
        name: 'Prop 2',
        property_type: 'multi_family',
        address_line1: '200 Main St',
        city: 'Charlotte',
        state: 'NC',
        postal_code: '28202',
      });
      const bldg1 = PropertiesRepository.createBuilding({
        property_id: prop1.id,
        name: 'Building 1',
      });

      // Creating unit in prop2 with building from prop1 must fail
      assert.throws(() => {
        PropertiesRepository.createUnit({
          property_id: prop2.id,
          building_id: bldg1.id,
          unit_number: '201',
          market_rent_cents: 100000,
        });
      }, /Invalid building_id/);

      // Creating unit with non-existent building must fail
      assert.throws(() => {
        PropertiesRepository.createUnit({
          property_id: prop1.id,
          building_id: 'non-existent-id',
          unit_number: '102',
          market_rent_cents: 100000,
        });
      }, /Invalid building_id/);

      // Creating valid unit succeeds
      const validUnit = PropertiesRepository.createUnit({
        property_id: prop1.id,
        building_id: bldg1.id,
        unit_number: '103',
        market_rent_cents: 100000,
      });
      assert.equal(validUnit.building_id, bldg1.id);

      // Updating unit with invalid building fails
      assert.throws(() => {
        PropertiesRepository.updateUnit(validUnit.id, {
          building_id: 'invalid-id'
        });
      }, /Invalid building_id/);
    });
  });

  it('enforces operator isolation for building operations', () => {
    let propAId = '';
    let bldgAId = '';

    runInOperatorContext('operator-alpha', () => {
      const propA = PropertiesRepository.createProperty({
        name: 'Alpha Heights',
        property_type: 'multi_family',
        address_line1: '1 Alpha St',
        city: 'Raleigh',
        state: 'NC',
        postal_code: '27601',
      });
      propAId = propA.id;

      const bldgA = PropertiesRepository.createBuilding({
        property_id: propAId,
        name: 'Alpha Wing',
      });
      bldgAId = bldgA.id;

      assert.ok(PropertiesRepository.getBuildingById(bldgAId));
    });

    // Operator Beta should NOT see or be able to mutate Operator Alpha's building
    runInOperatorContext('operator-beta', () => {
      assert.equal(PropertiesRepository.getBuildingById(bldgAId), null);
      assert.equal(PropertiesRepository.listBuildings(propAId).length, 0);

      const updateAttempt = PropertiesRepository.updateBuilding(bldgAId, { name: 'Compromised' });
      assert.equal(updateAttempt, null);

      const deleteAttempt = PropertiesRepository.deleteBuilding(bldgAId);
      assert.equal(deleteAttempt, false);
    });
  });
});
