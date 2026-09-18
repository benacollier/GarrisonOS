import { Router } from '../../../api/router.js';
import { successResponse, errorResponse } from '../../../api/response.js';
import { PropertiesRepository } from './repository.js';

export function registerRoutes(router: Router): void {
  // --- Portfolios ---
  router.get('/api/v1/properties/portfolios', (_req, res) => {
    const portfolios = PropertiesRepository.listPortfolios();
    successResponse(res, { portfolios });
  });

  router.post('/api/v1/properties/portfolios', (req, res) => {
    const { name, tax_id, notes } = req.body || {};
    if (!name) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Portfolio name is required', 400);
    }
    const portfolio = PropertiesRepository.createPortfolio({ name, tax_id, notes });
    successResponse(res, { portfolio }, 201);
  });

  router.get('/api/v1/properties/portfolios/:id', (req, res) => {
    const portfolio = PropertiesRepository.getPortfolioById(req.params.id!);
    if (!portfolio) {
      return errorResponse(res, 'NOT_FOUND', 'Portfolio not found', 404);
    }
    successResponse(res, { portfolio });
  });

  router.put('/api/v1/properties/portfolios/:id', (req, res) => {
    const portfolio = PropertiesRepository.updatePortfolio(req.params.id!, req.body || {});
    if (!portfolio) {
      return errorResponse(res, 'NOT_FOUND', 'Portfolio not found', 404);
    }
    successResponse(res, { portfolio });
  });

  router.delete('/api/v1/properties/portfolios/:id', (req, res) => {
    const deleted = PropertiesRepository.deletePortfolio(req.params.id!);
    if (!deleted) {
      return errorResponse(res, 'NOT_FOUND', 'Portfolio not found', 404);
    }
    successResponse(res, { deleted: true });
  });

  // --- Occupancy Metrics ---
  router.getBatchSafe('/api/v1/properties/metrics/occupancy', (_req, res) => {
    const metrics = PropertiesRepository.getOccupancyMetrics();
    successResponse(res, { metrics });
  });

  // --- Units (placed before :id to prevent collision) ---
  router.get('/api/v1/properties/units', (req, res) => {
    const units = PropertiesRepository.listUnits({
      property_id: req.query.property_id,
      status: req.query.status
    });
    successResponse(res, { units });
  });

  router.post('/api/v1/properties/units', (req, res) => {
    const { property_id, unit_number, market_rent_cents } = req.body || {};
    if (!property_id || !unit_number || market_rent_cents === undefined) {
      return errorResponse(res, 'VALIDATION_ERROR', 'property_id, unit_number, and market_rent_cents are required', 400);
    }
    const unit = PropertiesRepository.createUnit(req.body);
    successResponse(res, { unit }, 201);
  });

  router.get('/api/v1/properties/units/:id', (req, res) => {
    const unit = PropertiesRepository.getUnitById(req.params.id!);
    if (!unit) {
      return errorResponse(res, 'NOT_FOUND', 'Unit not found', 404);
    }
    successResponse(res, { unit });
  });

  router.put('/api/v1/properties/units/:id', (req, res) => {
    const unit = PropertiesRepository.updateUnit(req.params.id!, req.body || {});
    if (!unit) {
      return errorResponse(res, 'NOT_FOUND', 'Unit not found', 404);
    }
    successResponse(res, { unit });
  });

  router.delete('/api/v1/properties/units/:id', (req, res) => {
    const deleted = PropertiesRepository.deleteUnit(req.params.id!);
    if (!deleted) {
      return errorResponse(res, 'NOT_FOUND', 'Unit not found', 404);
    }
    successResponse(res, { deleted: true });
  });

  // --- Properties ---
  router.get('/api/v1/properties', (req, res) => {
    const properties = PropertiesRepository.listProperties({
      portfolio_id: req.query.portfolio_id
    });
    successResponse(res, { properties });
  });

  router.post('/api/v1/properties', (req, res) => {
    const { name, property_type, address_line1, city, state, postal_code } = req.body || {};
    if (!name || !property_type || !address_line1 || !city || !state || !postal_code) {
      return errorResponse(
        res,
        'VALIDATION_ERROR',
        'name, property_type, address_line1, city, state, and postal_code are required',
        400
      );
    }
    const property = PropertiesRepository.createProperty(req.body);
    successResponse(res, { property }, 201);
  });

  router.get('/api/v1/properties/:id', (req, res) => {
    const property = PropertiesRepository.getPropertyById(req.params.id!);
    if (!property) {
      return errorResponse(res, 'NOT_FOUND', 'Property not found', 404);
    }
    const buildings = PropertiesRepository.listBuildings(property.id);
    const units = PropertiesRepository.listUnits({ property_id: property.id });
    successResponse(res, { property, buildings, units });
  });

  router.put('/api/v1/properties/:id', (req, res) => {
    const property = PropertiesRepository.updateProperty(req.params.id!, req.body || {});
    if (!property) {
      return errorResponse(res, 'NOT_FOUND', 'Property not found', 404);
    }
    successResponse(res, { property });
  });

  router.delete('/api/v1/properties/:id', (req, res) => {
    const deleted = PropertiesRepository.deleteProperty(req.params.id!);
    if (!deleted) {
      return errorResponse(res, 'NOT_FOUND', 'Property not found', 404);
    }
    successResponse(res, { deleted: true });
  });

  // --- Buildings ---
  router.get('/api/v1/properties/:id/buildings', (req, res) => {
    const property = PropertiesRepository.getPropertyById(req.params.id!);
    if (!property) {
      return errorResponse(res, 'NOT_FOUND', 'Property not found', 404);
    }
    const buildings = PropertiesRepository.listBuildings(property.id);
    successResponse(res, { buildings });
  });

  router.post('/api/v1/properties/:id/buildings', (req, res) => {
    const property = PropertiesRepository.getPropertyById(req.params.id!);
    if (!property) {
      return errorResponse(res, 'NOT_FOUND', 'Property not found', 404);
    }
    const { name, building_number, floors, notes } = req.body || {};
    if (!name) {
      return errorResponse(res, 'VALIDATION_ERROR', 'Building name is required', 400);
    }
    const building = PropertiesRepository.createBuilding({
      property_id: property.id,
      name,
      building_number,
      floors: floors !== undefined ? Number(floors) : null,
      notes
    });
    successResponse(res, { building }, 201);
  });

  router.get('/api/v1/buildings/:id', (req, res) => {
    const building = PropertiesRepository.getBuildingById(req.params.id!);
    if (!building) {
      return errorResponse(res, 'NOT_FOUND', 'Building not found', 404);
    }
    const units = PropertiesRepository.listUnits({ building_id: building.id });
    successResponse(res, { building, units });
  });

  router.put('/api/v1/buildings/:id', (req, res) => {
    const building = PropertiesRepository.updateBuilding(req.params.id!, req.body || {});
    if (!building) {
      return errorResponse(res, 'NOT_FOUND', 'Building not found', 404);
    }
    successResponse(res, { building });
  });

  router.delete('/api/v1/buildings/:id', (req, res) => {
    const deleted = PropertiesRepository.deleteBuilding(req.params.id!);
    if (!deleted) {
      return errorResponse(res, 'NOT_FOUND', 'Building not found', 404);
    }
    successResponse(res, { deleted: true });
  });
}
