# Data Representation & Identity Standards

GarrisonOS enforces deterministic, integer-first, dialect-agnostic data representation across all entities, database tables, and API payloads.

---

## 1. RFC 9562 UUIDv7 Primary Keys

Every primary key across GarrisonOS is a 128-bit time-ordered **UUIDv7**, formatted as standard 36-character canonical hyphenated strings (e.g. `018d9f4e-28b3-7a91-91bc-0a75bc89a712`).

### Bit Layout

* **Bits 0–47**: 48-bit UNIX Epoch timestamp in milliseconds.
* **Bits 48–51**: Version bitmask `0b0111` (decimal 7).
* **Bits 52–63**: 12-bit pseudorandom entropy or sub-millisecond sequence.
* **Bits 64–65**: Variant bitmask `0b10` (RFC 4122/9562).
* **Bits 66–127**: 62-bit pseudorandom cryptographically secure entropy.

### Benefits

1. **Monotonic Natural Sorting**: New records sort sequentially by insertion time without secondary sorting on timestamp columns.
2. **B-Tree Locality**: Avoids fragmentation common to random UUIDv4 indexes in SQLite.
3. **No External Libraries**: Generated natively via `node:crypto.randomBytes()`.

---

## 2. Financial Precision: Integer Cents

All currency values are strictly stored and computed as **INTEGER cents**. Floating-point arithmetic for currency is strictly prohibited.

| Concept | Example Display Value | Stored Database Value |
| :--- | :--- | :--- |
| Monthly Rent | $1,500.00 | `150000` |
| Security Deposit | $1,750.50 | `175050` |
| Repair Expense | $84.25 | `8425` |

### Rent Proration Calculation

```typescript
// Mid-month proration formula for new leases:
const proratedRentCents = Math.floor((monthlyRentCents / daysInMonth) * daysRemaining);
```

---

## 3. UTC Millisecond Timestamps

All timestamp fields (`created_at`, `updated_at`, `deleted_at`, `start_date`, `end_date`, `transaction_date`) are stored as **INTEGER milliseconds** (UTC epoch ms via `Date.now()`).

### Benefits

* Dialect-agnostic and portable across SQLite, PostgreSQL, and MySQL.
* Avoids date string timezone serialization ambiguities (e.g. `2026-09-14T22:38:37Z` vs local offsets).
* Arithmetic on dates (calculating delinquency grace periods, lease duration) operates on simple integer subtraction.

---

## 4. Standardized Soft Deletes

Operational records are preserved with a `deleted_at INTEGER` column:

* **Active Record**: `deleted_at IS NULL`
* **Deleted Record**: `deleted_at = <epoch_ms>`

All default repository queries include `deleted_at IS NULL`. Compound unique indexes account for soft deletion via partial indexes:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email 
ON users(tenant_id, email) 
WHERE deleted_at IS NULL;
```

---

## 5. Chart of Accounts & General Ledger Mapping

To support seamless integration with external accounting software such as QuickBooks without compromising single-entry operational speed, GarrisonOS defines a standard Chart of Accounts mapping (`chart_of_accounts`) stored with tenant isolation:

* **Account Types**: `Bank`, `AccountsReceivable`, `OtherCurrentAsset`, `AccountsPayable`, `OtherCurrentLiability`, `Equity`, `Income`, `Expense`, `CostOfGoodsSold`.
* **Category Mapping**: Connects operational transaction categories (`rent`, `late_fee`, `repairs`, etc.) and system roles (`operating_bank`, `trust_bank`, `accounts_receivable`, `security_deposits_held`) to GL accounts.
* **Balanced Double-Entry Representation**: Journal entries computed on-the-fly dynamically balance debits and credits in integer cents ($\sum \text{Debits} = \sum \text{Credits}$) and tag transactions with QuickBooks classes and customer/vendor associations.
