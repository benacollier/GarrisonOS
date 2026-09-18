-- Add vendor W-9 verification status and tax classification
ALTER TABLE contacts ADD COLUMN w9_received INTEGER NOT NULL DEFAULT 0 CHECK (w9_received IN (0, 1));
ALTER TABLE contacts ADD COLUMN tax_classification TEXT;
