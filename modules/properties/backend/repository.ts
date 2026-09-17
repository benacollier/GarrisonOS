import { getDatabase } from '../../../database/client.js';
import { RequestContext } from '../../../core/context.js';
import { generateUUIDv7 } from '../../../core/crypto.js';

export interface Portfolio {
  id: string;
  operator_id: string;
  tenant_id?: string;
  name: string;
  tax_id?: string | null;
  notes?: string | null;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
}

export interface Property {
  id: string;
  operator_id: string;
  tenant_id?: string;
  portfolio_id?: string | null;
  name: string;
  property_type: 'single_family' | 'multi_family' | 'condo' | 'townhouse' | 'commercial';
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  year_built?: number | null;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
}

export interface Unit {
  id: string;
  operator_id: string;
  tenant_id?: string;
  property_id: string;
  unit_number: string;
  status: 'vacant' | 'occupied' | 'notice_given' | 'turnover' | 'maintenance_hold';
  bedrooms: number;
  bathrooms: number;
  square_feet?: number | null;
  market_rent_cents: number;
  target_deposit_cents: number;
  created_at: number;
  updated_at: number;
  deleted_at?: number | null;
}

export class PropertiesRepository {
  // --- Portfolios ---
  public static listPortfolios(): Portfolio[] {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    return db.prepare(`
      SELECT * FROM portfolios
      WHERE operator_id = ? AND deleted_at IS NULL
      ORDER BY name ASC
    `).all(operatorId) as unknown as Portfolio[];
  }

  public static getPortfolioById(id: string): Portfolio | null {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM portfolios
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).get(id, operatorId) as Portfolio | undefined;
    return row || null;
  }

  public static createPortfolio(data: { name: string; tax_id?: string; notes?: string }): Portfolio {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const id = generateUUIDv7();
    const now = Date.now();

    db.prepare(`
      INSERT INTO portfolios (id, operator_id, name, tax_id, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, operatorId, data.name, data.tax_id || null, data.notes || null, now, now);

    return PropertiesRepository.getPortfolioById(id)!;
  }

  public static updatePortfolio(id: string, data: Partial<{ name: string; tax_id: string; notes: string }>): Portfolio | null {
    const existing = PropertiesRepository.getPortfolioById(id);
    if (!existing) return null;

    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();

    const name = data.name !== undefined ? data.name : existing.name;
    const tax_id = data.tax_id !== undefined ? data.tax_id : existing.tax_id;
    const notes = data.notes !== undefined ? data.notes : existing.notes;

    db.prepare(`
      UPDATE portfolios
      SET name = ?, tax_id = ?, notes = ?, updated_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(name, tax_id || null, notes || null, now, id, operatorId);

    return PropertiesRepository.getPortfolioById(id);
  }

  public static deletePortfolio(id: string): boolean {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const info = db.prepare(`
      UPDATE portfolios SET deleted_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(now, id, operatorId);
    return info.changes > 0;
  }

  // --- Properties ---
  public static listProperties(filter?: { portfolio_id?: string }): Property[] {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    let sql = 'SELECT * FROM properties WHERE operator_id = ? AND deleted_at IS NULL';
    const params: any[] = [operatorId];

    if (filter?.portfolio_id) {
      sql += ' AND portfolio_id = ?';
      params.push(filter.portfolio_id);
    }
    sql += ' ORDER BY name ASC';

    return db.prepare(sql).all(...params) as unknown as Property[];
  }

  public static getPropertyById(id: string): Property | null {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM properties
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).get(id, operatorId) as Property | undefined;
    return row || null;
  }

  public static createProperty(data: {
    name: string;
    property_type: Property['property_type'];
    address_line1: string;
    address_line2?: string;
    city: string;
    state: string;
    postal_code: string;
    portfolio_id?: string;
    year_built?: number;
  }): Property {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const id = generateUUIDv7();
    const now = Date.now();

    db.prepare(`
      INSERT INTO properties (
        id, operator_id, portfolio_id, name, property_type,
        address_line1, address_line2, city, state, postal_code,
        year_built, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      operatorId,
      data.portfolio_id || null,
      data.name,
      data.property_type,
      data.address_line1,
      data.address_line2 || null,
      data.city,
      data.state,
      data.postal_code,
      data.year_built || null,
      now,
      now
    );

    return PropertiesRepository.getPropertyById(id)!;
  }

  public static updateProperty(id: string, data: Partial<Omit<Property, 'id' | 'operator_id' | 'tenant_id' | 'created_at' | 'updated_at' | 'deleted_at'>>): Property | null {
    const existing = PropertiesRepository.getPropertyById(id);
    if (!existing) return null;

    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();

    const updated = { ...existing, ...data, updated_at: now };

    db.prepare(`
      UPDATE properties SET
        portfolio_id = ?, name = ?, property_type = ?,
        address_line1 = ?, address_line2 = ?, city = ?, state = ?, postal_code = ?,
        year_built = ?, updated_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(
      updated.portfolio_id || null,
      updated.name,
      updated.property_type,
      updated.address_line1,
      updated.address_line2 || null,
      updated.city,
      updated.state,
      updated.postal_code,
      updated.year_built || null,
      now,
      id,
      operatorId
    );

    return PropertiesRepository.getPropertyById(id);
  }

  public static deleteProperty(id: string): boolean {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const info = db.prepare(`
      UPDATE properties SET deleted_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(now, id, operatorId);
    return info.changes > 0;
  }

  // --- Units ---
  public static listUnits(filter?: { property_id?: string; status?: string }): Unit[] {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    let sql = 'SELECT * FROM units WHERE operator_id = ? AND deleted_at IS NULL';
    const params: any[] = [operatorId];

    if (filter?.property_id) {
      sql += ' AND property_id = ?';
      params.push(filter.property_id);
    }
    if (filter?.status) {
      sql += ' AND status = ?';
      params.push(filter.status);
    }
    sql += ' ORDER BY unit_number ASC';

    return db.prepare(sql).all(...params) as unknown as Unit[];
  }

  public static getUnitById(id: string): Unit | null {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const row = db.prepare(`
      SELECT * FROM units
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).get(id, operatorId) as Unit | undefined;
    return row || null;
  }

  public static createUnit(data: {
    property_id: string;
    unit_number: string;
    status?: Unit['status'];
    bedrooms?: number;
    bathrooms?: number;
    square_feet?: number;
    market_rent_cents: number;
    target_deposit_cents?: number;
  }): Unit {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const id = generateUUIDv7();
    const now = Date.now();

    db.prepare(`
      INSERT INTO units (
        id, operator_id, property_id, unit_number, status,
        bedrooms, bathrooms, square_feet, market_rent_cents, target_deposit_cents,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      operatorId,
      data.property_id,
      data.unit_number,
      data.status || 'vacant',
      data.bedrooms ?? 1,
      data.bathrooms ?? 1.0,
      data.square_feet || null,
      data.market_rent_cents || 0,
      data.target_deposit_cents || 0,
      now,
      now
    );

    return PropertiesRepository.getUnitById(id)!;
  }

  public static updateUnit(id: string, data: Partial<Omit<Unit, 'id' | 'operator_id' | 'tenant_id' | 'created_at' | 'updated_at' | 'deleted_at'>>): Unit | null {
    const existing = PropertiesRepository.getUnitById(id);
    if (!existing) return null;

    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const updated = { ...existing, ...data, updated_at: now };

    db.prepare(`
      UPDATE units SET
        property_id = ?, unit_number = ?, status = ?,
        bedrooms = ?, bathrooms = ?, square_feet = ?,
        market_rent_cents = ?, target_deposit_cents = ?, updated_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(
      updated.property_id,
      updated.unit_number,
      updated.status,
      updated.bedrooms,
      updated.bathrooms,
      updated.square_feet || null,
      updated.market_rent_cents,
      updated.target_deposit_cents,
      now,
      id,
      operatorId
    );

    return PropertiesRepository.getUnitById(id);
  }

  public static updateUnitStatus(id: string, status: Unit['status']): boolean {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const info = db.prepare(`
      UPDATE units SET status = ?, updated_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(status, now, id, operatorId);
    return info.changes > 0;
  }

  public static deleteUnit(id: string): boolean {
    const operatorId = RequestContext.getOperatorId();
    const db = getDatabase();
    const now = Date.now();
    const info = db.prepare(`
      UPDATE units SET deleted_at = ?
      WHERE id = ? AND operator_id = ? AND deleted_at IS NULL
    `).run(now, id, operatorId);
    return info.changes > 0;
  }

  // --- Metrics ---
  public static getOccupancyMetrics(): {
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    occupancyRatePercentage: number;
    totalMarketRentCents: number;
  } {
    const units = PropertiesRepository.listUnits();
    const totalUnits = units.length;
    const occupiedUnits = units.filter((u) => u.status === 'occupied').length;
    const vacantUnits = totalUnits - occupiedUnits;
    const occupancyRatePercentage = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 10000) / 100 : 0;
    const totalMarketRentCents = units.reduce((sum, u) => sum + (u.market_rent_cents || 0), 0);

    return {
      totalUnits,
      occupiedUnits,
      vacantUnits,
      occupancyRatePercentage,
      totalMarketRentCents
    };
  }
}
