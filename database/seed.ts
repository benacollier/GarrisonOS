import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { getDatabase, withTransaction } from './client.js';
import { runMigrations } from './migrator.js';
import { generateUUIDv7, hashPassword } from '../core/crypto.js';

export async function seedDatabase(dbInstance?: DatabaseSync): Promise<void> {
  const db = dbInstance || getDatabase();

  // Run migrations first
  runMigrations(db);

  const now = Date.now();
  const TENANT_ID = 'tenant-demo';

  await withTransaction(async (tx) => {
    // 1. Clean existing demo data if present
    tx.prepare('DELETE FROM transactions WHERE tenant_id = ?').run(TENANT_ID);
    tx.prepare('DELETE FROM work_orders WHERE tenant_id = ?').run(TENANT_ID);
    tx.prepare('DELETE FROM lease_contacts WHERE tenant_id = ?').run(TENANT_ID);
    tx.prepare('DELETE FROM leases WHERE tenant_id = ?').run(TENANT_ID);
    tx.prepare('DELETE FROM units WHERE tenant_id = ?').run(TENANT_ID);
    tx.prepare('DELETE FROM properties WHERE tenant_id = ?').run(TENANT_ID);
    tx.prepare('DELETE FROM portfolios WHERE tenant_id = ?').run(TENANT_ID);
    tx.prepare('DELETE FROM contacts WHERE tenant_id = ?').run(TENANT_ID);
    tx.prepare('DELETE FROM audit_logs WHERE tenant_id = ?').run(TENANT_ID);
    tx.prepare('DELETE FROM users WHERE tenant_id = ?').run(TENANT_ID);
    tx.prepare('DELETE FROM tenants WHERE id = ?').run(TENANT_ID);

    // 2. Create Tenant Account
    tx.prepare(`
      INSERT INTO tenants (id, name, subdomain, currency, created_at, updated_at)
      VALUES (?, ?, ?, 'USD', ?, ?)
    `).run(TENANT_ID, 'Garrison Heritage Properties', 'demo', now, now);

    // 3. Create Operator User (Password: Password123!)
    const passwordHash = await hashPassword('Password123!');
    const userId = generateUUIDv7();
    tx.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, role, created_at, updated_at)
      VALUES (?, ?, 'operator@garrisonos.local', ?, 'Alexander', 'Garrison', 'owner', ?, ?)
    `).run(userId, TENANT_ID, passwordHash, now, now);

    // 4. Create Portfolios
    const portfolio1Id = generateUUIDv7();
    const portfolio2Id = generateUUIDv7();
    tx.prepare(`
      INSERT INTO portfolios (id, tenant_id, name, tax_id, notes, created_at, updated_at)
      VALUES (?, ?, 'Blue Ridge Residential LLC', 'XX-XXX4819', 'Single family residential holdings', ?, ?),
             (?, ?, 'Piedmont Multifamily Holdings', 'XX-XXX9201', 'Duplex and small multifamily portfolio', ?, ?)
    `).run(portfolio1Id, TENANT_ID, now, now, portfolio2Id, TENANT_ID, now, now);

    // 5. Create Vendors & Contacts
    const vendorPlumbingId = generateUUIDv7();
    const vendorHvacId = generateUUIDv7();
    const vendorElectricId = generateUUIDv7();
    const vendorGeneralId = generateUUIDv7();

    tx.prepare(`
      INSERT INTO contacts (id, tenant_id, contact_type, first_name, last_name, company_name, email, phone, vendor_specialty, created_at, updated_at)
      VALUES
        (?, ?, 'vendor', 'Marcus', 'Vance', 'Apex Plumbing Services', 'marcus@apexplumb.local', '(555) 301-4401', 'Plumbing', ?, ?),
        (?, ?, 'vendor', 'Elena', 'Reyes', 'CoolAir Climate Systems', 'elena@coolair.local', '(555) 301-4402', 'HVAC', ?, ?),
        (?, ?, 'vendor', 'David', 'Kowalski', 'VoltMaster Electric', 'david@voltmaster.local', '(555) 301-4403', 'Electrical', ?, ?),
        (?, ?, 'vendor', 'Sam', 'Hawkins', 'Hawkins General Repair', 'sam@hawkinsrepair.local', '(555) 301-4404', 'General Contractor', ?, ?)
    `).run(
      vendorPlumbingId, TENANT_ID, now, now,
      vendorHvacId, TENANT_ID, now, now,
      vendorElectricId, TENANT_ID, now, now,
      vendorGeneralId, TENANT_ID, now, now
    );

    // 6. Create Properties & 20 Units
    // 10 Single Family Residences (10 units)
    const sfhSpecs = [
      { name: '104 Oakwood Drive', addr: '104 Oakwood Dr', city: 'Asheville', state: 'NC', zip: '28801', rent: 185000, bd: 3, ba: 2, sqft: 1450 },
      { name: '212 Meadow Lane', addr: '212 Meadow Ln', city: 'Asheville', state: 'NC', zip: '28803', rent: 195000, bd: 3, ba: 2, sqft: 1600 },
      { name: '318 Pinecrest Road', addr: '318 Pinecrest Rd', city: 'Black Mountain', state: 'NC', zip: '28711', rent: 175000, bd: 3, ba: 1.5, sqft: 1320 },
      { name: '425 Highland Avenue', addr: '425 Highland Ave', city: 'Asheville', state: 'NC', zip: '28804', rent: 220000, bd: 4, ba: 2.5, sqft: 2100 },
      { name: '509 Willow Creek Way', addr: '509 Willow Creek Way', city: 'Weaverville', state: 'NC', zip: '28787', rent: 165000, bd: 2, ba: 2, sqft: 1200 },
      { name: '614 Cedar Ridge Court', addr: '614 Cedar Ridge Ct', city: 'Asheville', state: 'NC', zip: '28805', rent: 210000, bd: 4, ba: 2, sqft: 1900 },
      { name: '722 Magnolia Circle', addr: '722 Magnolia Cir', city: 'Fletcher', state: 'NC', zip: '28732', rent: 180000, bd: 3, ba: 2, sqft: 1550 },
      { name: '831 Chestnut Terrace', addr: '831 Chestnut Ter', city: 'Asheville', state: 'NC', zip: '28801', rent: 240000, bd: 4, ba: 3, sqft: 2350 },
      { name: '940 Sycamore Street', addr: '940 Sycamore St', city: 'Black Mountain', state: 'NC', zip: '28711', rent: 155000, bd: 2, ba: 1, sqft: 1100 },
      { name: '1055 Laurel Ridge Trail', addr: '1055 Laurel Ridge Trl', city: 'Weaverville', state: 'NC', zip: '28787', rent: 260000, bd: 4, ba: 3.5, sqft: 2800 }
    ];

    interface CreatedUnit {
      unitId: string;
      propertyId: string;
      rentCents: number;
      unitNumber: string;
      propertyName: string;
    }

    const createdUnits: CreatedUnit[] = [];

    for (const sfh of sfhSpecs) {
      const propId = generateUUIDv7();
      tx.prepare(`
        INSERT INTO properties (id, tenant_id, portfolio_id, name, property_type, address_line1, city, state, postal_code, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'single_family', ?, ?, ?, ?, ?, ?)
      `).run(propId, TENANT_ID, portfolio1Id, sfh.name, sfh.addr, sfh.city, sfh.state, sfh.zip, now, now);

      const unitId = generateUUIDv7();
      tx.prepare(`
        INSERT INTO units (id, tenant_id, property_id, unit_number, status, bedrooms, bathrooms, square_feet, market_rent_cents, target_deposit_cents, created_at, updated_at)
        VALUES (?, ?, ?, 'Main', 'occupied', ?, ?, ?, ?, ?, ?, ?)
      `).run(unitId, TENANT_ID, propId, sfh.bd, sfh.ba, sfh.sqft, sfh.rent, sfh.rent, now, now);

      createdUnits.push({ unitId, propertyId: propId, rentCents: sfh.rent, unitNumber: 'Main', propertyName: sfh.name });
    }

    // 3 Duplexes (6 units)
    const duplexSpecs = [
      { name: 'Riverside Duplex', addr: '142 Riverside Dr', city: 'Woodfin', state: 'NC', zip: '28804', uA: 140000, uB: 145000 },
      { name: 'Lookout Mountain Duplex', addr: '88 Lookout Rd', city: 'Asheville', state: 'NC', zip: '28804', uA: 150000, uB: 150000 },
      { name: 'Haw Creek Duplex', addr: '304 Haw Creek Rd', city: 'Asheville', state: 'NC', zip: '28805', uA: 135000, uB: 135000 }
    ];

    for (const dup of duplexSpecs) {
      const propId = generateUUIDv7();
      tx.prepare(`
        INSERT INTO properties (id, tenant_id, portfolio_id, name, property_type, address_line1, city, state, postal_code, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'multi_family', ?, ?, ?, ?, ?, ?)
      `).run(propId, TENANT_ID, portfolio2Id, dup.name, dup.addr, dup.city, dup.state, dup.zip, now, now);

      for (const [unitNum, rent] of [['A', dup.uA], ['B', dup.uB]] as const) {
        const unitId = generateUUIDv7();
        tx.prepare(`
          INSERT INTO units (id, tenant_id, property_id, unit_number, status, bedrooms, bathrooms, square_feet, market_rent_cents, target_deposit_cents, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'occupied', 2, 1.5, 950, ?, ?, ?, ?)
        `).run(unitId, TENANT_ID, propId, unitNum, rent, rent, now, now);
        createdUnits.push({ unitId, propertyId: propId, rentCents: rent, unitNumber: unitNum, propertyName: dup.name });
      }
    }

    // 1 4-Plex (4 units)
    const fourPlexPropId = generateUUIDv7();
    tx.prepare(`
      INSERT INTO properties (id, tenant_id, portfolio_id, name, property_type, address_line1, city, state, postal_code, created_at, updated_at)
      VALUES (?, ?, ?, 'Broadview 4-Plex', 'multi_family', '512 Broadview Terrace', 'Asheville', 'NC', '28806', ?, ?)
    `).run(fourPlexPropId, TENANT_ID, portfolio2Id, now, now);

    const fourPlexUnits = [
      { num: '101', rent: 125000, status: 'occupied' as const },
      { num: '102', rent: 125000, status: 'occupied' as const },
      { num: '201', rent: 130000, status: 'turnover' as const }, // 1 Turnover vacant
      { num: '202', rent: 130000, status: 'vacant' as const }     // 1 Ready vacant
    ];

    for (const fpu of fourPlexUnits) {
      const unitId = generateUUIDv7();
      tx.prepare(`
        INSERT INTO units (id, tenant_id, property_id, unit_number, status, bedrooms, bathrooms, square_feet, market_rent_cents, target_deposit_cents, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 2, 1, 800, ?, ?, ?, ?)
      `).run(unitId, TENANT_ID, fourPlexPropId, fpu.num, fpu.status, fpu.rent, fpu.rent, now, now);
      if (fpu.status === 'occupied') {
        createdUnits.push({ unitId, propertyId: fourPlexPropId, rentCents: fpu.rent, unitNumber: fpu.num, propertyName: 'Broadview 4-Plex' });
      }
    }

    // 7. Create Tenants & Leases for all occupied units (18 units)
    const tenantNames = [
      ['Lucas', 'Bennett'], ['Sophia', 'Chen'], ['James', 'Wilson'], ['Emily', 'Rodriguez'],
      ['Benjamin', 'Taylor'], ['Olivia', 'Martinez'], ['William', 'Anderson'], ['Ava', 'Thomas'],
      ['Henry', 'Jackson'], ['Mia', 'White'], ['Alexander', 'Harris'], ['Charlotte', 'Martin'],
      ['Daniel', 'Thompson'], ['Amelia', 'Garcia'], ['Matthew', 'Robinson'], ['Harper', 'Clark'],
      ['Jackson', 'Lewis'], ['Evelyn', 'Walker']
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
        INSERT INTO contacts (id, tenant_id, contact_type, first_name, last_name, email, phone, created_at, updated_at)
        VALUES (?, ?, 'tenant', ?, ?, ?, ?, ?, ?)
      `).run(
        contactId,
        TENANT_ID,
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
          id, tenant_id, unit_id, status, start_date, end_date,
          rent_amount_cents, security_deposit_cents, deposit_held_cents,
          rent_due_day, late_fee_grace_days, late_fee_amount_cents,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 5, 5000, ?, ?)
      `).run(
        leaseId,
        TENANT_ID,
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
        INSERT INTO lease_contacts (id, tenant_id, lease_id, contact_id, role, is_financially_responsible, created_at)
        VALUES (?, ?, ?, ?, 'primary_tenant', 1, ?)
      `).run(generateUUIDv7(), TENANT_ID, leaseId, contactId, now);

      // Security deposit trust inflow
      tx.prepare(`
        INSERT INTO transactions (
          id, tenant_id, transaction_type, category, amount_cents,
          transaction_date, description, property_id, unit_id, lease_id, payer_contact_id,
          created_at, updated_at
        ) VALUES (?, ?, 'deposit_inflow', 'security_deposit', ?, ?, 'Security Deposit Held in Trust', ?, ?, ?, ?, ?, ?)
      `).run(
        generateUUIDv7(),
        TENANT_ID,
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
            id, tenant_id, transaction_type, category, amount_cents,
            transaction_date, description, reference_number,
            property_id, unit_id, lease_id, created_at, updated_at
          ) VALUES (?, ?, 'charge', 'rent', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          generateUUIDv7(),
          TENANT_ID,
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
              id, tenant_id, transaction_type, category, amount_cents,
              transaction_date, description, payment_method, reference_number,
              property_id, unit_id, lease_id, payer_contact_id, created_at, updated_at
            ) VALUES (?, ?, 'payment', 'rent', ?, ?, ?, 'ach', ?, ?, ?, ?, ?, ?, ?)
          `).run(
            generateUUIDv7(),
            TENANT_ID,
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
              id, tenant_id, transaction_type, category, amount_cents,
              transaction_date, description, property_id, unit_id, lease_id, created_at, updated_at
            ) VALUES (?, ?, 'charge', 'late_fee', 5000, ?, 'Late Fee – 5-Day Grace Period Expired', ?, ?, ?, ?, ?)
          `).run(
            generateUUIDv7(),
            TENANT_ID,
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

    // 9. Record Property Operating Expenses (IRS Schedule E)
    const propertyExpenses = [
      { prop: createdUnits[0]!.propertyId, cat: 'insurance', amount: 145000, desc: 'Annual Landlord Hazard & Liability Insurance' },
      { prop: createdUnits[0]!.propertyId, cat: 'property_taxes', amount: 285000, desc: 'County Real Estate Ad Valorem Property Tax' },
      { prop: createdUnits[1]!.propertyId, cat: 'repairs', amount: 32000, desc: 'Emergency Plumbing Drain Clear & Snaking' },
      { prop: createdUnits[2]!.propertyId, cat: 'cleaning_maintenance', amount: 25000, desc: 'Annual Gutter Cleaning & Pressure Washing' },
      { prop: fourPlexPropId, cat: 'utilities', amount: 48000, desc: 'Common Area Hallway Electric & Exterior Lighting' },
      { prop: fourPlexPropId, cat: 'management_fees', amount: 55000, desc: 'Professional Portfolio Accounting & Advisory' },
      { prop: fourPlexPropId, cat: 'repairs', amount: 85000, desc: 'HVAC Seasonal Inspection and Filter Replacement' }
    ];

    for (const exp of propertyExpenses) {
      tx.prepare(`
        INSERT INTO transactions (
          id, tenant_id, transaction_type, category, amount_cents,
          transaction_date, description, property_id, payment_method, created_at, updated_at
        ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, 'direct_deposit', ?, ?)
      `).run(
        generateUUIDv7(),
        TENANT_ID,
        exp.cat,
        exp.amount,
        Date.UTC(2026, 4, 15),
        exp.desc,
        exp.prop,
        now,
        now
      );
    }

    // 10. Create Work Orders (2 Open, 1 Emergency, 6 Completed)
    tx.prepare(`
      INSERT INTO work_orders (
        id, tenant_id, property_id, unit_id, title, description,
        status, priority, category, permission_to_enter, vendor_contact_id,
        estimated_cost_cents, actual_cost_cents, created_at, updated_at
      ) VALUES
        (?, ?, ?, ?, 'Master Bathroom Toilet Leak', 'Water leaking onto bathroom floor from tank flange seal. Tenant requested urgent fix.', 'open', 'emergency', 'plumbing', 1, ?, 25000, 0, ?, ?),
        (?, ?, ?, ?, 'HVAC AC Unit Making Buzzing Noise', 'Air conditioning compressor outside making loud vibrating noise when kicking on.', 'in_progress', 'high', 'hvac', 1, ?, 35000, 0, ?, ?),
        (?, ?, ?, ?, 'Garbage Disposal Jammed', 'Disposal jammed with citrus peel. Cleared flywheel and tested reset.', 'completed', 'medium', 'appliance', 1, ?, 12000, 12000, ?, ?)
    `).run(
      generateUUIDv7(), TENANT_ID, createdUnits[0]!.propertyId, createdUnits[0]!.unitId, vendorPlumbingId, now - 3600000, now,
      generateUUIDv7(), TENANT_ID, createdUnits[1]!.propertyId, createdUnits[1]!.unitId, vendorHvacId, now - 86400000, now,
      generateUUIDv7(), TENANT_ID, createdUnits[2]!.propertyId, createdUnits[2]!.unitId, vendorGeneralId, now - (15 * 86400000), now
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
