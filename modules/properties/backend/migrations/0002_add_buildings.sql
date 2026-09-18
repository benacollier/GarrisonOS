-- Migration 0002: Physical Buildings Entity within Properties
CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL REFERENCES operators(id),
    property_id TEXT NOT NULL REFERENCES properties(id),
    name TEXT NOT NULL,
    building_number TEXT,
    floors INTEGER,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_buildings_operator_property ON buildings(operator_id, property_id) WHERE deleted_at IS NULL;

-- Add building_id to units table for 4-tier asset hierarchy: Portfolio -> Property -> Building -> Unit
ALTER TABLE units ADD COLUMN building_id TEXT REFERENCES buildings(id);

CREATE INDEX IF NOT EXISTS idx_units_operator_building ON units(operator_id, building_id) WHERE deleted_at IS NULL;
