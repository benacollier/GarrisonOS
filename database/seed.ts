import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import process from 'node:process';
import { getDatabase, withTransaction } from './client.js';
import { runMigrations } from './migrator.js';
import { generateUUIDv7, hashPassword } from '../core/crypto.js';

/**
 * Seeds a comprehensive, realistic demo dataset for GarrisonOS including
 * an operator account, portfolios, properties, 20 units representing all 4
 * unit statuses, 17 active leases, 1 terminated lease with notice and move-out history,
 * 7 vendors with W-9 and tax classifications, 1099-NEC vendor payments, and
 * 8 diverse work orders.
 *
 * @param dbInstance - Optional SQLite DatabaseSync instance to seed into.
 * @returns Promise resolving when seeding is complete.
 */
export async function seedDatabase(dbInstance?: DatabaseSync): Promise<void> {
  const db = dbInstance || getDatabase();

  // Run migrations first
  runMigrations(db);

  const now = Date.now();
  const OPERATOR_ID = 'operator-demo';
  const passwordHash = await hashPassword('Password123!');

  withTransaction((tx) => {
    // 1. Clean existing demo data if present in reverse dependency order
    tx.prepare('DELETE FROM quickbooks_export_logs WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM journal_lines WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM journal_entries WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM chart_of_accounts WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM transactions WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM work_orders WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM lease_contacts WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM leases WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM units WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM buildings WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM properties WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM portfolios WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM contacts WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM audit_logs WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM user_portfolio_access WHERE user_id IN (SELECT id FROM users WHERE operator_id = ?)').run(OPERATOR_ID);
    tx.prepare('DELETE FROM user_module_access WHERE user_id IN (SELECT id FROM users WHERE operator_id = ?)').run(OPERATOR_ID);
    tx.prepare('DELETE FROM users WHERE operator_id = ?').run(OPERATOR_ID);
    tx.prepare('DELETE FROM operators WHERE id = ?').run(OPERATOR_ID);

    // 2. Create Operator Account
    tx.prepare(`
      INSERT INTO operators (id, name, subdomain, currency, created_at, updated_at)
      VALUES (?, ?, ?, 'USD', ?, ?)
    `).run(OPERATOR_ID, 'Garrison Heritage Properties', 'demo', now, now);

    // 3. Create Operator User (Password: Password123!)
    const userId = generateUUIDv7();
    tx.prepare(`
      INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, token_version, is_system_user, created_at, updated_at)
      VALUES (?, ?, 'operator@garrisonos.local', ?, 'Alexander', 'Garrison', 'owner', 1, 0, ?, ?)
    `).run(userId, OPERATOR_ID, passwordHash, now, now);

    // 4. Create Portfolios
    const portfolio1Id = generateUUIDv7();
    const portfolio2Id = generateUUIDv7();
    tx.prepare(`
      INSERT INTO portfolios (id, operator_id, name, tax_id, notes, created_at, updated_at)
      VALUES (?, ?, 'Blue Ridge Residential LLC', 'XX-XXX4819', 'Single family residential holdings', ?, ?),
             (?, ?, 'Piedmont Multifamily Holdings', 'XX-XXX9201', 'Duplex and small multifamily portfolio', ?, ?)
    `).run(portfolio1Id, OPERATOR_ID, now, now, portfolio2Id, OPERATOR_ID, now, now);

    // 4b. Create Sample Subuser (Leasing Agent with Portfolio & Module Scoping)
    const subuserId = generateUUIDv7();
    tx.prepare(`
      INSERT INTO users (id, operator_id, email, password_hash, first_name, last_name, role, token_version, is_system_user, created_at, updated_at)
      VALUES (?, ?, 'leasing@garrisonos.local', ?, 'Sarah', 'Jenkins', 'leasing_agent', 1, 0, ?, ?)
    `).run(subuserId, OPERATOR_ID, passwordHash, now, now);

    // Grant access to Piedmont Multifamily portfolio only
    tx.prepare(`
      INSERT INTO user_portfolio_access (id, operator_id, user_id, portfolio_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(generateUUIDv7(), OPERATOR_ID, subuserId, portfolio2Id, now);

    // Grant module access to properties, tenants, work_orders
    for (const mod of ['properties', 'tenants', 'work_orders']) {
      tx.prepare(`
        INSERT INTO user_module_access (id, operator_id, user_id, module_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(generateUUIDv7(), OPERATOR_ID, subuserId, mod, now);
    }

    // 5. Create 7 Vendors & Trades with W-9 & Tax Classification
    const vendorPlumbingId = generateUUIDv7();
    const vendorHvacId = generateUUIDv7();
    const vendorElectricId = generateUUIDv7();
    const vendorGeneralId = generateUUIDv7();
    const vendorApplianceId = generateUUIDv7();
    const vendorMakeReadyId = generateUUIDv7();
    const vendorPaintingId = generateUUIDv7();

    tx.prepare(`
      INSERT INTO contacts (
        id, operator_id, contact_type, first_name, last_name, company_name, email, phone,
        tax_id_last4, vendor_specialty, w9_received, tax_classification, created_at, updated_at
      ) VALUES
        (?, ?, 'vendor', 'Marcus', 'Vance', 'Apex Plumbing Services', 'marcus@apexplumb.local', '(555) 301-4401', '4401', 'Plumbing', 1, 'llc', ?, ?),
        (?, ?, 'vendor', 'Elena', 'Reyes', 'CoolAir Climate Systems', 'elena@coolair.local', '(555) 301-4402', '4402', 'HVAC', 1, 'corporation', ?, ?),
        (?, ?, 'vendor', 'David', 'Kowalski', 'VoltMaster Electric', 'david@voltmaster.local', '(555) 301-4403', '4403', 'Electrical', 1, 'llc', ?, ?),
        (?, ?, 'vendor', 'Sam', 'Hawkins', 'Hawkins General Repair', 'sam@hawkinsrepair.local', '(555) 301-4404', '4404', 'General Contractor', 1, 'individual', ?, ?),
        (?, ?, 'vendor', 'Frank', 'Castillo', 'Elite Appliance Pro', 'frank@eliteappliance.local', '(555) 301-4405', '4405', 'Appliance', 1, 'individual', ?, ?),
        (?, ?, 'vendor', 'Maria', 'Santos', 'CleanTurn Turnover Services', 'maria@cleanturn.local', '(555) 301-4406', '4406', 'Make-Ready', 1, 'llc', ?, ?),
        (?, ?, 'vendor', 'Tyler', 'Brooks', 'Blue Ridge Pro Painters', 'tyler@blueridgepainters.local', '(555) 301-4407', NULL, 'Painting', 0, 'partnership', ?, ?)
    `).run(
      vendorPlumbingId, OPERATOR_ID, now, now,
      vendorHvacId, OPERATOR_ID, now, now,
      vendorElectricId, OPERATOR_ID, now, now,
      vendorGeneralId, OPERATOR_ID, now, now,
      vendorApplianceId, OPERATOR_ID, now, now,
      vendorMakeReadyId, OPERATOR_ID, now, now,
      vendorPaintingId, OPERATOR_ID, now, now
    );

    // 6. Create Properties & 20 Units Representing All 4 Statuses:
    // occupied (17), vacant (1), turnover (1), maintenance_hold (1)
    interface CreatedUnit {
      unitId: string;
      propertyId: string;
      rentCents: number;
      unitNumber: string;
      propertyName: string;
    }

    const createdUnits: CreatedUnit[] = [];

    // 10 Single Family Residences (10 units: 9 occupied, 1 maintenance_hold)
    const sfhSpecs = [
      { name: '104 Oakwood Drive', addr: '104 Oakwood Dr', city: 'Asheville', state: 'NC', zip: '28801', rent: 185000, bd: 3, ba: 2, sqft: 1450, status: 'occupied' as const },
      { name: '212 Meadow Lane', addr: '212 Meadow Ln', city: 'Asheville', state: 'NC', zip: '28803', rent: 195000, bd: 3, ba: 2, sqft: 1600, status: 'occupied' as const },
      { name: '318 Pinecrest Road', addr: '318 Pinecrest Rd', city: 'Black Mountain', state: 'NC', zip: '28711', rent: 175000, bd: 3, ba: 1.5, sqft: 1320, status: 'occupied' as const },
      { name: '425 Highland Avenue', addr: '425 Highland Ave', city: 'Asheville', state: 'NC', zip: '28804', rent: 220000, bd: 4, ba: 2.5, sqft: 2100, status: 'occupied' as const },
      { name: '509 Willow Creek Way', addr: '509 Willow Creek Way', city: 'Weaverville', state: 'NC', zip: '28787', rent: 165000, bd: 2, ba: 2, sqft: 1200, status: 'occupied' as const },
      { name: '614 Cedar Ridge Court', addr: '614 Cedar Ridge Ct', city: 'Asheville', state: 'NC', zip: '28805', rent: 210000, bd: 4, ba: 2, sqft: 1900, status: 'occupied' as const },
      { name: '722 Magnolia Circle', addr: '722 Magnolia Cir', city: 'Fletcher', state: 'NC', zip: '28732', rent: 180000, bd: 3, ba: 2, sqft: 1550, status: 'occupied' as const },
      { name: '831 Chestnut Terrace', addr: '831 Chestnut Ter', city: 'Asheville', state: 'NC', zip: '28801', rent: 240000, bd: 4, ba: 3, sqft: 2350, status: 'occupied' as const },
      { name: '940 Sycamore Street', addr: '940 Sycamore St', city: 'Black Mountain', state: 'NC', zip: '28711', rent: 155000, bd: 2, ba: 1, sqft: 1100, status: 'maintenance_hold' as const },
      { name: '1055 Laurel Ridge Trail', addr: '1055 Laurel Ridge Trl', city: 'Weaverville', state: 'NC', zip: '28787', rent: 260000, bd: 4, ba: 3.5, sqft: 2800, status: 'occupied' as const }
    ];

    let sycamorePropId = '';
    let sycamoreHoldUnitId = '';

    for (const sfh of sfhSpecs) {
      const propId = generateUUIDv7();
      tx.prepare(`
        INSERT INTO properties (id, operator_id, portfolio_id, name, property_type, address_line1, city, state, postal_code, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'single_family', ?, ?, ?, ?, ?, ?)
      `).run(propId, OPERATOR_ID, portfolio1Id, sfh.name, sfh.addr, sfh.city, sfh.state, sfh.zip, now, now);

      const unitId = generateUUIDv7();
      tx.prepare(`
        INSERT INTO units (id, operator_id, property_id, unit_number, status, bedrooms, bathrooms, square_feet, market_rent_cents, target_deposit_cents, created_at, updated_at)
        VALUES (?, ?, ?, 'Main', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(unitId, OPERATOR_ID, propId, sfh.status, sfh.bd, sfh.ba, sfh.sqft, sfh.rent, sfh.rent, now, now);

      if (sfh.status === 'occupied') {
        createdUnits.push({ unitId, propertyId: propId, rentCents: sfh.rent, unitNumber: 'Main', propertyName: sfh.name });
      } else {
        sycamorePropId = propId;
        sycamoreHoldUnitId = unitId;
      }
    }

    // 3 Duplexes (6 units: all 6 occupied)
    const duplexSpecs = [
      { name: 'Riverside Duplex', addr: '142 Riverside Dr', city: 'Woodfin', state: 'NC', zip: '28804', uA: 140000, uB: 145000 },
      { name: 'Lookout Mountain Duplex', addr: '88 Lookout Rd', city: 'Asheville', state: 'NC', zip: '28804', uA: 150000, uB: 150000 },
      { name: 'Haw Creek Duplex', addr: '304 Haw Creek Rd', city: 'Asheville', state: 'NC', zip: '28805', uA: 135000, uB: 135000 }
    ];

    for (const dup of duplexSpecs) {
      const propId = generateUUIDv7();
      tx.prepare(`
        INSERT INTO properties (id, operator_id, portfolio_id, name, property_type, address_line1, city, state, postal_code, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'multi_family', ?, ?, ?, ?, ?, ?)
      `).run(propId, OPERATOR_ID, portfolio2Id, dup.name, dup.addr, dup.city, dup.state, dup.zip, now, now);

      for (const [unitNum, rent] of [['A', dup.uA], ['B', dup.uB]] as const) {
        const unitId = generateUUIDv7();
        tx.prepare(`
          INSERT INTO units (id, operator_id, property_id, unit_number, status, bedrooms, bathrooms, square_feet, market_rent_cents, target_deposit_cents, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'occupied', 2, 1.5, 950, ?, ?, ?, ?)
        `).run(unitId, OPERATOR_ID, propId, unitNum, rent, rent, now, now);
        createdUnits.push({ unitId, propertyId: propId, rentCents: rent, unitNumber: unitNum, propertyName: dup.name });
      }
    }

    // 1 4-Plex (4 units: 101/102 occupied, 201 turnover, 202 vacant) with Building entity
    const fourPlexPropId = generateUUIDv7();
    tx.prepare(`
      INSERT INTO properties (id, operator_id, portfolio_id, name, property_type, address_line1, city, state, postal_code, created_at, updated_at)
      VALUES (?, ?, ?, 'Broadview 4-Plex', 'multi_family', '512 Broadview Terrace', 'Asheville', 'NC', '28806', ?, ?)
    `).run(fourPlexPropId, OPERATOR_ID, portfolio2Id, now, now);

    const buildingId = generateUUIDv7();
    tx.prepare(`
      INSERT INTO buildings (id, operator_id, property_id, name, building_number, floors, notes, created_at, updated_at)
      VALUES (?, ?, ?, 'Building A', 'Bldg-A', 2, 'Two-story residential quadplex building', ?, ?)
    `).run(buildingId, OPERATOR_ID, fourPlexPropId, now, now);

    const fourPlexUnits = [
      { num: '101', rent: 125000, status: 'occupied' as const },
      { num: '102', rent: 125000, status: 'occupied' as const },
      { num: '201', rent: 130000, status: 'turnover' as const },
      { num: '202', rent: 130000, status: 'vacant' as const }
    ];

    let unit201Id = '';

    for (const fpu of fourPlexUnits) {
      const unitId = generateUUIDv7();
      tx.prepare(`
        INSERT INTO units (id, operator_id, property_id, building_id, unit_number, status, bedrooms, bathrooms, square_feet, market_rent_cents, target_deposit_cents, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 2, 1, 800, ?, ?, ?, ?)
      `).run(unitId, OPERATOR_ID, fourPlexPropId, buildingId, fpu.num, fpu.status, fpu.rent, fpu.rent, now, now);

      if (fpu.status === 'occupied') {
        createdUnits.push({ unitId, propertyId: fourPlexPropId, rentCents: fpu.rent, unitNumber: fpu.num, propertyName: 'Broadview 4-Plex' });
      } else if (fpu.status === 'turnover') {
        unit201Id = unitId;
      }
    }

    // 7. Create Tenants & Active Leases for Occupied Units (17 units)
    const tenantNames = [
      ['Lucas', 'Bennett'], ['Sophia', 'Chen'], ['James', 'Wilson'], ['Emily', 'Rodriguez'],
      ['Benjamin', 'Taylor'], ['Olivia', 'Martinez'], ['William', 'Anderson'], ['Ava', 'Thomas'],
      ['Henry', 'Jackson'], ['Mia', 'White'], ['Alexander', 'Harris'], ['Charlotte', 'Martin'],
      ['Daniel', 'Thompson'], ['Amelia', 'Garcia'], ['Matthew', 'Robinson'], ['Harper', 'Clark'],
      ['Jackson', 'Lewis']
    ];

    const yearStartMs = Date.UTC(2026, 0, 1);
    const yearEndMs = Date.UTC(2026, 11, 31);

    for (let i = 0; i < createdUnits.length; i++) {
      const unit = createdUnits[i]!;
      const pair = tenantNames[i] ?? ['Resident', `Tenant-${i + 1}`];
      const fName = pair[0] ?? 'Resident';
      const lName = pair[1] ?? `Tenant-${i + 1}`;
      const contactId = generateUUIDv7();

      tx.prepare(`
        INSERT INTO contacts (id, operator_id, contact_type, first_name, last_name, email, phone, created_at, updated_at)
        VALUES (?, ?, 'tenant', ?, ?, ?, ?, ?, ?)
      `).run(
        contactId,
        OPERATOR_ID,
        fName,
        lName,
        `${fName.toLowerCase()}.${lName.toLowerCase()}@example.com`,
        `(555) 441-01${(i + 10).toString().slice(0, 2)}`,
        now,
        now
      );

      const leaseId = generateUUIDv7();
      let leaseStatus = 'active';
      let leaseEnd = yearEndMs;

      // Make unit 1 expiring soon
      if (i === 1) {
        leaseStatus = 'expiring';
        leaseEnd = now + (20 * 24 * 60 * 60 * 1000);
      }
      // Make unit 2 month-to-month
      if (i === 2) {
        leaseStatus = 'month_to_month';
      }

      tx.prepare(`
        INSERT INTO leases (
          id, operator_id, unit_id, status, start_date, end_date,
          rent_amount_cents, security_deposit_cents, deposit_held_cents,
          rent_due_day, late_fee_grace_days, late_fee_amount_cents,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 5, 5000, ?, ?)
      `).run(
        leaseId,
        OPERATOR_ID,
        unit.unitId,
        leaseStatus,
        yearStartMs,
        leaseEnd,
        unit.rentCents,
        unit.rentCents,
        unit.rentCents,
        now,
        now
      );

      tx.prepare(`
        INSERT INTO lease_contacts (id, operator_id, lease_id, contact_id, role, is_financially_responsible, created_at)
        VALUES (?, ?, ?, ?, 'primary_tenant', 1, ?)
      `).run(generateUUIDv7(), OPERATOR_ID, leaseId, contactId, now);

      // Security deposit trust inflow
      tx.prepare(`
        INSERT INTO transactions (
          id, operator_id, transaction_type, category, amount_cents,
          transaction_date, description, property_id, unit_id, lease_id, payer_contact_id,
          created_at, updated_at
        ) VALUES (?, ?, 'deposit_inflow', 'security_deposit', ?, ?, 'Security Deposit Held in Trust', ?, ?, ?, ?, ?, ?)
      `).run(
        generateUUIDv7(),
        OPERATOR_ID,
        unit.rentCents,
        yearStartMs,
        unit.propertyId,
        unit.unitId,
        leaseId,
        contactId,
        now,
        now
      );

      // 8. Generate monthly charges & payments for past months (Jan - Sep 2026)
      const currentMonth = 8; // Sep (0-indexed 8)
      const isDelinquentTenant = (i === 0); // Unit 0 is delinquent for Aug & Sep

      for (let m = 0; m <= currentMonth; m++) {
        const monthDueMs = Date.UTC(2026, m, 1);
        const yyyyMm = `2026-${(m + 1).toString().padStart(2, '0')}`;

        // Monthly charge
        tx.prepare(`
          INSERT INTO transactions (
            id, operator_id, transaction_type, category, amount_cents,
            transaction_date, description, reference_number,
            property_id, unit_id, lease_id, created_at, updated_at
          ) VALUES (?, ?, 'charge', 'rent', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          generateUUIDv7(),
          OPERATOR_ID,
          unit.rentCents,
          monthDueMs,
          `Monthly Rent – ${yyyyMm}`,
          `rent_charge:${leaseId}:${yyyyMm}`,
          unit.propertyId,
          unit.unitId,
          leaseId,
          now,
          now
        );

        // Record payment for on-time tenants (and for delinquent tenant except Aug/Sep)
        if (!isDelinquentTenant || m < currentMonth - 1) {
          const payDateMs = Date.UTC(2026, m, 2);
          tx.prepare(`
            INSERT INTO transactions (
              id, operator_id, transaction_type, category, amount_cents,
              transaction_date, description, payment_method, reference_number,
              property_id, unit_id, lease_id, payer_contact_id, created_at, updated_at
            ) VALUES (?, ?, 'payment', 'rent', ?, ?, ?, 'ach', ?, ?, ?, ?, ?, ?, ?)
          `).run(
            generateUUIDv7(),
            OPERATOR_ID,
            unit.rentCents,
            payDateMs,
            `Rent Payment – ${yyyyMm}`,
            `ACH-${leaseId.slice(0, 4)}-${yyyyMm}`,
            unit.propertyId,
            unit.unitId,
            leaseId,
            contactId,
            now,
            now
          );
        } else if (isDelinquentTenant) {
          // Add late fee charge for delinquent tenant
          tx.prepare(`
            INSERT INTO transactions (
              id, operator_id, transaction_type, category, amount_cents,
              transaction_date, description, property_id, unit_id, lease_id, created_at, updated_at
            ) VALUES (?, ?, 'charge', 'late_fee', 5000, ?, 'Late Fee – 5-Day Grace Period Expired', ?, ?, ?, ?, ?)
          `).run(
            generateUUIDv7(),
            OPERATOR_ID,
            Date.UTC(2026, m, 6),
            unit.propertyId,
            unit.unitId,
            leaseId,
            now,
            now
          );
        }
      }
    }

    // 9. Historical Terminated Lease for Unit 201 (Notice Given & Move-Out History)
    const terminatedLeaseId = generateUUIDv7();
    const pastTenantId = generateUUIDv7();
    tx.prepare(`
      INSERT INTO contacts (id, operator_id, contact_type, first_name, last_name, email, phone, created_at, updated_at)
      VALUES (?, ?, 'tenant', 'Noah', 'Campbell', 'noah.campbell@example.com', '(555) 441-0199', ?, ?)
    `).run(pastTenantId, OPERATOR_ID, now - (400 * 86400000), now - (45 * 86400000));

    tx.prepare(`
      INSERT INTO leases (
        id, operator_id, unit_id, status, start_date, end_date,
        notice_date, move_out_date,
        rent_amount_cents, security_deposit_cents, deposit_held_cents,
        rent_due_day, late_fee_grace_days, late_fee_amount_cents,
        created_at, updated_at
      ) VALUES (?, ?, ?, 'terminated', ?, ?, ?, ?, 130000, 130000, 0, 1, 5, 5000, ?, ?)
    `).run(
      terminatedLeaseId,
      OPERATOR_ID,
      unit201Id,
      Date.UTC(2025, 0, 1),
      Date.UTC(2025, 11, 31),
      Date.UTC(2026, 6, 15),
      Date.UTC(2026, 7, 31),
      now - (400 * 86400000),
      Date.UTC(2026, 7, 31)
    );

    tx.prepare(`
      INSERT INTO lease_contacts (id, operator_id, lease_id, contact_id, role, is_financially_responsible, created_at)
      VALUES (?, ?, ?, ?, 'primary_tenant', 1, ?)
    `).run(generateUUIDv7(), OPERATOR_ID, terminatedLeaseId, pastTenantId, now - (400 * 86400000));

    // 10. Record Property Operating Expenses (IRS Schedule E) & 1099-NEC Vendor Payments
    const propertyExpenses = [
      { prop: createdUnits[0]!.propertyId, payee: null, cat: 'insurance', amount: 145000, desc: 'Annual Landlord Hazard & Liability Insurance' },
      { prop: createdUnits[0]!.propertyId, payee: null, cat: 'property_taxes', amount: 285000, desc: 'County Real Estate Ad Valorem Property Tax' },
      { prop: createdUnits[1]!.propertyId, payee: vendorPlumbingId, cat: 'repairs', amount: 32000, desc: 'Emergency Plumbing Drain Clear & Snaking' },
      { prop: createdUnits[2]!.propertyId, payee: vendorPlumbingId, cat: 'repairs', amount: 200000, desc: 'Main Water Service Line & Sewer Lateral Replacement' },
      { prop: createdUnits[3]!.propertyId, payee: vendorGeneralId, cat: 'repairs', amount: 215000, desc: 'Structural Subfloor & Foundation Crawlspace Remediation' },
      { prop: fourPlexPropId, payee: vendorHvacId, cat: 'repairs', amount: 85000, desc: 'HVAC Seasonal Inspection and Dual-Zone Filter Replacement' },
      { prop: fourPlexPropId, payee: vendorHvacId, cat: 'repairs', amount: 60000, desc: 'Smart Thermostat Installation and Condenser Service' },
      { prop: fourPlexPropId, payee: vendorMakeReadyId, cat: 'cleaning_maintenance', amount: 45000, desc: 'Deep Clean & Make-Ready Turnover Service Unit 201' },
      { prop: fourPlexPropId, payee: null, cat: 'utilities', amount: 48000, desc: 'Common Area Hallway Electric & Exterior Lighting' },
      { prop: fourPlexPropId, payee: null, cat: 'management_fees', amount: 55000, desc: 'Professional Portfolio Accounting & Advisory' }
    ];

    for (const exp of propertyExpenses) {
      tx.prepare(`
        INSERT INTO transactions (
          id, operator_id, transaction_type, category, amount_cents,
          transaction_date, description, property_id, payee_contact_id, payment_method, created_at, updated_at
        ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?, 'direct_deposit', ?, ?)
      `).run(
        generateUUIDv7(),
        OPERATOR_ID,
        exp.cat,
        exp.amount,
        Date.UTC(2026, 4, 15),
        exp.desc,
        exp.prop,
        exp.payee,
        now,
        now
      );
    }

    // 11. Create 8 Diverse Work Orders Across Priorities, Categories, and Statuses
    tx.prepare(`
      INSERT INTO work_orders (
        id, operator_id, property_id, unit_id, title, description,
        status, priority, category, permission_to_enter, vendor_contact_id,
        scheduled_date, completed_date, estimated_cost_cents, actual_cost_cents, created_at, updated_at
      ) VALUES
        (?, ?, ?, ?, 'Master Bathroom Toilet Leak', 'Water leaking onto bathroom floor from tank flange seal. Urgent fix.', 'in_progress', 'emergency', 'plumbing', 1, ?, ?, NULL, 25000, 0, ?, ?),
        (?, ?, ?, ?, 'HVAC AC Unit Making Buzzing Noise', 'Air conditioning compressor outside vibrating loud when running.', 'assigned', 'high', 'hvac', 1, ?, ?, NULL, 35000, 0, ?, ?),
        (?, ?, ?, ?, 'Main Electrical Panel Breaker Tripping', 'Kitchen dedicated circuit breaker tripping under load.', 'in_progress', 'high', 'electrical', 1, ?, ?, NULL, 28000, 0, ?, ?),
        (?, ?, ?, ?, 'Turnover Make-Ready: Broadview 4-Plex Unit 201', 'Full make-ready turnover: deep clean, lock rekeying, touch-up painting.', 'assigned', 'medium', 'cosmetic', 1, ?, ?, NULL, 45000, 0, ?, ?),
        (?, ?, ?, ?, 'Kitchen Cabinet Hinge Loose', 'Upper cabinet door hinge over sink is loose and sagging.', 'open', 'low', 'other', 1, NULL, NULL, NULL, 9500, 0, ?, ?),
        (?, ?, ?, ?, 'Foundation & Subfloor Stabilization', 'Crawlspace beam reinforcement and floor leveling following inspection.', 'in_progress', 'high', 'structural', 1, ?, ?, NULL, 180000, 0, ?, ?),
        (?, ?, ?, ?, 'Garbage Disposal Replacement', 'Disposal motor seized. Replaced with new 3/4 HP continuous-feed unit.', 'completed', 'medium', 'appliance', 1, ?, ?, ?, 16500, 16500, ?, ?),
        (?, ?, ?, ?, 'Screen Door Latch Sticking', 'Front storm door handle sticking. Resident resolved latch independently.', 'cancelled', 'low', 'other', 1, NULL, NULL, NULL, 6000, 0, ?, ?)
    `).run(
      generateUUIDv7(), OPERATOR_ID, createdUnits[0]!.propertyId, createdUnits[0]!.unitId, vendorPlumbingId, now + 3600000, now - 7200000, now,
      generateUUIDv7(), OPERATOR_ID, createdUnits[1]!.propertyId, createdUnits[1]!.unitId, vendorHvacId, now + 86400000, now - 86400000, now,
      generateUUIDv7(), OPERATOR_ID, createdUnits[3]!.propertyId, createdUnits[3]!.unitId, vendorElectricId, now + 172800000, now - 14400000, now,
      generateUUIDv7(), OPERATOR_ID, fourPlexPropId, unit201Id, vendorMakeReadyId, now + 86400000, now - 3600000, now,
      generateUUIDv7(), OPERATOR_ID, createdUnits[5]!.propertyId, createdUnits[5]!.unitId, now - 18000000, now,
      generateUUIDv7(), OPERATOR_ID, sycamorePropId, sycamoreHoldUnitId, vendorGeneralId, now + 259200000, now - (3 * 86400000), now,
      generateUUIDv7(), OPERATOR_ID, createdUnits[2]!.propertyId, createdUnits[2]!.unitId, vendorApplianceId, now - (6 * 86400000), now - (5 * 86400000), now - (7 * 86400000), now - (5 * 86400000),
      generateUUIDv7(), OPERATOR_ID, createdUnits[4]!.propertyId, createdUnits[4]!.unitId, now - (4 * 86400000), now - (2 * 86400000)
    );
  }, db);
}

// CLI Execution
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('seed.ts') ||
  process.argv[1].endsWith('seed.js') ||
  (import.meta.url && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
);

if (isDirectExecution) {
  seedDatabase()
    .then(() => {
      process.stdout.write('Successfully seeded realistic 20-unit GarrisonOS portfolio dataset.\n');
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`Seeding failed: ${String(err)}\n`);
      process.exit(1);
    });
}
