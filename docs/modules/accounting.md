# Accounting & General Ledger Module

The **Accounting** module (`modules/accounting/`) implements a native, immutable double-entry General Ledger engine, standard Chart of Accounts mapping aligned with IRS Schedule E and QuickBooks, Trial Balance reporting, tenant lease ledger calculations, and automated monthly billing.

---

## 1. Native Double-Entry General Ledger Architecture

GarrisonOS enforces first-class double-entry bookkeeping with strict zero-sum debit/credit balance proofs across all operational activity.

### 1.1. Core Tables & Invariants

* **`journal_entries`**: Header table tracking sequentially numbered transactions (`entry_number` per tenant), accounting date (`date_ms`), descriptive memo, source tracking (`source_type`, `source_id`), posting timestamp, and optional link to reversing entries (`reversed_by_entry_id`).
* **`journal_lines`**: Itemized lines enforcing non-negative integer cents:
  $$\sum \text{debit\_cents} \equiv \sum \text{credit\_cents} > 0$$
  Each line belongs to an account in `chart_of_accounts`, and must satisfy:
  $$\text{CHECK }((\text{debit} > 0 \land \text{credit} = 0) \lor (\text{credit} > 0 \land \text{debit} = 0))$$
  Lines optionally attach granular dimensions: `property_id`, `unit_id`, and `contact_id`.

### 1.2. Operational Event Mappings

Every operational event posts a balanced double-entry journal entry:

| Operational Activity | Source Type | Debit Line | Credit Line |
| :--- | :--- | :--- | :--- |
| **Rent / Fee Invoicing** | `rent_billing` / `charge` | Accounts Receivable (`#1100`) | Rental Income (`#4010`) / Fee Income |
| **Tenant Rent Payment** | `tenant_payment` / `payment` | Operating Checking (`#1010`) | Accounts Receivable (`#1100`) |
| **Vendor Repair Expense** | `maintenance_expense` / `expense` | Repairs & Maintenance (`#5100`) | Operating Checking (`#1010`) / AP |
| **Security Deposit Inflow** | `deposit_inflow` | Security Deposit Trust (`#1020`) | Tenant Security Deposits Held (`#2100`) |
| **Security Deposit Refund** | `deposit_return` | Tenant Security Deposits Held (`#2100`) | Security Deposit Trust (`#1020`) |
| **Deposit Applied to Rent** | `deposit_deduction` | Tenant Security Deposits Held (`#2100`) | Accounts Receivable (`#1100`) |
| **Reversals / Voids** | `reversal` | Exact opposite lines of original entry | Exact opposite lines of original entry |

---

## 2. IRS Schedule E Tax Categorization

Operating expenses align with standard IRS Form 1040 Schedule E line items:

* `advertising` (#5010)
* `auto_travel` (#5020)
* `cleaning_maintenance` (#5030)
* `commissions` (#5040)
* `insurance` (#5050)
* `legal_professional` (#5060)
* `management_fees` (#5070)
* `mortgage_interest` (#5080)
* `other_interest` (#5090)
* `repairs` (#5100)
* `supplies` (#5110)
* `property_taxes` (#5120)
* `utilities` (#5130)
* `hoa_fees` (#5140)
* `capital_improvement` (#1500)

---

## 3. Financial Mathematics & Algorithms

### 3.1. Tenant Running Balance

$$\text{Tenant Balance} = \sum (\text{charges} + \text{deposit\_returns} + \text{deposit\_deductions}) - \sum (\text{payments} + \text{refunds})$$

From double-entry journal lines on Accounts Receivable:
$$\text{Tenant Receivable Balance} = \sum \text{Debits} - \sum \text{Credits}$$

### 3.2. Payment Priority Waterfall

When recording partial payments against an unpaid ledger, funds apply in strict order:
$$\text{Late Fees} \longrightarrow \text{Utility / Other Charges} \longrightarrow \text{Oldest Unpaid Rent} \longrightarrow \text{Current Month Rent}$$

### 3.3. Mid-Month Rent Proration

$$\text{Prorated Rent Cents} = \left\lfloor \frac{\text{Monthly Rent Cents}}{\text{Days in Month}} \times \text{Days Remaining (inclusive)} \right\rfloor$$

### 3.4. Net Operating Income (NOI)

$$\text{NOI} = \text{Operating Income (Rent, Fees)} - \text{Operating Expenses (Schedule E)}$$

---

## 4. API Endpoints

### 4.1. General Ledger & Invariants
* `GET /api/v1/accounting/trial-balance`: Live Trial Balance report verifying that total debits equal total credits
* `GET /api/v1/accounting/journal-entries`: Paginated list of double-entry journal entries with itemized lines
* `GET /api/v1/accounting/journal-entries/:id`: Fetch single journal entry by ID
* `POST /api/v1/accounting/journal-entries`: Post manual balanced journal entry
* `POST /api/v1/accounting/journal-entries/:id/reverse`: Post reversal entry and link `reversed_by_entry_id`
* `POST /api/v1/accounting/backfill-ledger`: Idempotently backfill historical single-entry transactions

### 4.2. Operational Transactions & Billing
* `GET /api/v1/accounting/transactions`: List transactions with filters (`type`, `category`, `lease_id`, `date range`)
* `POST /api/v1/accounting/transactions`: Post a transaction (automatically creates balanced double-entry journal entry)
* `DELETE /api/v1/accounting/transactions/:id`: Void a transaction (posts reversal journal entry)
* `GET /api/v1/accounting/balance/:leaseId`: Calculate running balance and itemized statement for a lease
* `POST /api/v1/accounting/generate-rent-charges`: Trigger automated recurring monthly billing run
* `POST /api/v1/accounting/deposit-disposition`: Finalize deposit trust payout and damage deductions

### 4.3. Exports & External Compatibility
* `GET /api/v1/accounting/export/rent-roll.csv`: Stream Rent Roll CSV
* `GET /api/v1/accounting/export/schedule-e.csv`: Stream IRS Schedule E P&L breakdown CSV
* `GET /api/v1/accounting/export/ledger/:leaseId.csv`: Stream itemized tenant ledger statement CSV
* `GET /api/v1/accounting/chart-of-accounts`: List Chart of Accounts
* `POST /api/v1/accounting/chart-of-accounts`: Create general ledger account
* `PUT /api/v1/accounting/chart-of-accounts/:id`: Update general ledger account
* `GET /api/v1/accounting/quickbooks/preview`: Preview persistent double-entry journal entries for export
* `GET /api/v1/accounting/export/quickbooks/qbo-journal.csv`: Export QuickBooks Online Journal Entry batch CSV
* `GET /api/v1/accounting/export/quickbooks/desktop.iif`: Export QuickBooks Desktop IIF format
* `GET /api/v1/accounting/export/quickbooks/bank-feed.qbo`: Export Web Connect (.QBO) bank feed

---

## 5. QuickBooks Compatibility Architecture

GarrisonOS exports directly from persistent General Ledger entries into standard accounting formats:

1. **Chart of Accounts (COA) Standard Mapping**:
   * **Bank (1010 Operating Checking, 1020 Security Deposit Trust Checking)**: Operating vs escrow cash segregation.
   * **Accounts Receivable (1100 Tenant Receivables)**: Invoiced rent, utility, and fee charges.
   * **Current Liabilities (2100 Tenant Security Deposits Held)**: Escrow liabilities.
   * **Income (4010 Rental Income, 4020 Late Fee Income, etc.)**: Operating revenues.
   * **Operating Expenses (5010–5140)**: Aligned with IRS Form 1040 Schedule E lines.

2. **Class & Customer Tracking**:
   * Each journal line maps the GarrisonOS `property_id` to a QuickBooks **Class** for granular property-level P&L reporting.
   * Payer/Payee contacts map to QuickBooks **Customer:Job** or **Vendor**.

3. **Universal QuickBooks Formats**:
   * **QuickBooks Online (QBO) Journal CSV**: Conforms to Intuit's batch journal import structure.
   * **QuickBooks Desktop (IIF)**: Tab-delimited transaction blocks (`!TRNS`/`!SPL`/`!ENDTRNS`).
   * **Web Connect (QBO/OFX)**: OFX 2.1 SGML/XML banking import for bank feed reconciliation.
