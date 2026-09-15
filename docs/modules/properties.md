# Properties Module

The **Properties** module (`modules/properties/`) manages physical real estate portfolios, buildings, and rentable unit inventories.

---

## 1. Domain Entities

### Portfolios (`portfolios`)
Represents ownership entities (such as an LLC, holding company, or individual trust).
* `id` (UUIDv7): Primary key
* `tenant_id` (UUIDv7): Owning tenant
* `name` (TEXT): Entity name (e.g., "Maple Ridge Holdings LLC")
* `tax_id` (TEXT): Employer Identification Number (EIN) or SSN last 4

### Properties (`properties`)
Represents physical physical locations, buildings, or parcels.
* `id` (UUIDv7): Primary key
* `tenant_id` (UUIDv7): Owning tenant
* `portfolio_id` (UUIDv7): Parent ownership portfolio
* `name` (TEXT): Building/Property name
* `property_type` (TEXT): `single_family`, `multi_family`, `condo`, `townhouse`, `commercial`
* `address_line1`, `address_line2`, `city`, `state`, `postal_code`
* `year_built` (INTEGER)

### Units (`units`)
Represents distinct rentable living or commercial units within a property.
* `id` (UUIDv7): Primary key
* `tenant_id` (UUIDv7): Owning tenant
* `property_id` (UUIDv7): Parent physical property
* `unit_number` (TEXT): e.g. "101", "Unit A", "Main"
* `status` (TEXT): `vacant`, `occupied`, `notice_given`, `turnover`, `maintenance_hold`
* `bedrooms` (INTEGER), `bathrooms` (REAL), `square_feet` (INTEGER)
* `market_rent_cents` (INTEGER cents)
* `target_deposit_cents` (INTEGER cents)

---

## 2. API Endpoints

* `GET /api/v1/properties/portfolios`: List portfolios with property counts
* `POST /api/v1/properties/portfolios`: Create portfolio
* `GET /api/v1/properties`: List properties with unit vacancy stats
* `POST /api/v1/properties`: Create property
* `GET /api/v1/properties/:id`: Get property details and unit list
* `PUT /api/v1/properties/:id`: Update property
* `DELETE /api/v1/properties/:id`: Soft delete property
* `POST /api/v1/properties/:id/units`: Create unit under property
* `GET /api/v1/properties/units/:unitId`: Get unit details
* `PUT /api/v1/properties/units/:unitId`: Update unit details / status

