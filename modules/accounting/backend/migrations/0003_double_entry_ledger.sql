-- Native Double-Entry General Ledger Architecture
-- Creates immutable journal_entries and journal_lines tables

CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    entry_number INTEGER NOT NULL,
    date_ms INTEGER NOT NULL,
    memo TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT,
    posted_at INTEGER NOT NULL,
    reversed_by_entry_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    FOREIGN KEY (operator_id) REFERENCES operators(id),
    FOREIGN KEY (reversed_by_entry_id) REFERENCES journal_entries(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_je_operator_entry_number ON journal_entries(operator_id, entry_number);
CREATE INDEX IF NOT EXISTS idx_je_operator_date ON journal_entries(operator_id, date_ms);
CREATE INDEX IF NOT EXISTS idx_je_operator_source ON journal_entries(operator_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS journal_lines (
    id TEXT PRIMARY KEY,
    operator_id TEXT NOT NULL,
    journal_entry_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    debit_cents INTEGER NOT NULL DEFAULT 0 CHECK (debit_cents >= 0),
    credit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_cents >= 0),
    property_id TEXT,
    unit_id TEXT,
    contact_id TEXT,
    description TEXT,
    created_at INTEGER NOT NULL,
    CHECK ((debit_cents > 0 AND credit_cents = 0) OR (credit_cents > 0 AND debit_cents = 0)),
    FOREIGN KEY (operator_id) REFERENCES operators(id),
    FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
    FOREIGN KEY (property_id) REFERENCES properties(id),
    FOREIGN KEY (unit_id) REFERENCES units(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE INDEX IF NOT EXISTS idx_jl_operator_account ON journal_lines(operator_id, account_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jl_operator_entry ON journal_lines(operator_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jl_operator_property_unit ON journal_lines(operator_id, property_id, unit_id);
CREATE INDEX IF NOT EXISTS idx_jl_operator_contact ON journal_lines(operator_id, contact_id);

-- Add compatibility column on transactions referencing journal_entries
ALTER TABLE transactions ADD COLUMN journal_entry_id TEXT REFERENCES journal_entries(id);
CREATE INDEX IF NOT EXISTS idx_tx_journal_entry ON transactions(operator_id, journal_entry_id);

