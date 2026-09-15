# Accounting & Financials Module

The **Accounting** module (`modules/accounting/`) implements single-entry cash-basis bookkeeping, IRS Schedule E tax categorization, running tenant balance tracking, automated rent charge generation, and payment waterfall allocation.

---

## 1. Single-Entry Cash Ledger (`transactions`)

All transactions are recorded as positive integer cents accompanied by a `transaction_type`:

| `transaction_type` | Impact | Description |
| :--- | :--- | :--- |
| `charge` | Increases Tenant Balance | Invoiced amount owed by tenant (rent, late fee, utility rebill) |
| `payment` | Decreases Tenant Balance | Cash received from tenant applied against charges |
| `expense` | Outflow (Schedule E) | Operating disbursement paid to vendors, utilities, or taxes |
| `refund` | Increases Tenant Balance | Money returned to tenant |
| `deposit_inflow` | Escrow / Trust Inflow | Tenant security deposit collected into trust |
| `deposit_return` | Escrow / Trust Outflow | Security deposit refunded to tenant upon move-out |
| `deposit_deduction` | Escrow Transfer | Deposit applied to unpaid rent or property repair damages |

---

## 2. IRS Schedule E Tax Categorization

Operating expenses align with standard IRS Form 1040 Schedule E line items:

* `advertising`
* `auto_travel`
* `cleaning_maintenance`
* `commissions`
* `insurance`
* `legal_professional`
* `management_fees`
* `mortgage_interest`
* `other_interest`
* `repairs`
* `supplies`
* `property_taxes`
* `utilities`
* `hoa_fees`
* `capital_improvement`

---

## 3. Financial Mathematics & Algorithms

### 3.1. Tenant Running Balance

$$\text{Tenant Balance} = \sum (\text{charges} + \text{deposit\_returns} + \text{deposit\_deductions}) - \sum (\text{payments} + \text{refunds})$$

### 3.2. Payment Priority Waterfall

When recording partial payments against an unpaid ledger, funds apply in strict order:
$$\text{Late Fees} \longrightarrow \text{Utility / Other Charges} \longrightarrow \text{Oldest Unpaid Rent} \longrightarrow \text{Current Month Rent}$$

### 3.3. Mid-Month Rent Proration

$$\text{Prorated Rent Cents} = \left\lfloor \frac{\text{Monthly Rent Cents}}{\text{Days in Month}} \times \text{Days Remaining (inclusive)} \right\rfloor$$

### 3.4. Net Operating Income (NOI)

$$\text{NOI} = \text{Operating Income (Rent, Fees)} - \text{Operating Expenses (Schedule E)}$$

---

## 4. API Endpoints

* `GET /api/v1/accounting/transactions`: List transactions with filters (`type`, `category`, `lease_id`, `date range`)
* `POST /api/v1/accounting/transactions`: Post a financial transaction
* `GET /api/v1/accounting/ledger/:leaseId`: Calculate running balance and itemized statement for a lease
* `POST /api/v1/accounting/generate-rent-charges`: Trigger automated recurring monthly billing run
* `POST /api/v1/accounting/deposit-disposition`: Finalize deposit trust payout and damage deductions
* `GET /api/v1/accounting/export/rent-roll.csv`: Stream Rent Roll CSV
* `GET /api/v1/accounting/export/schedule-e.csv`: Stream IRS Schedule E P&L breakdown CSV
* `GET /api/v1/accounting/export/ledger/:leaseId.csv`: Stream itemized tenant ledger statement CSV
* `GET /api/v1/accounting/chart-of-accounts`: List Chart of Accounts
* `POST /api/v1/accounting/chart-of-accounts`: Create general ledger account
* `PUT /api/v1/accounting/chart-of-accounts/:id`: Update general ledger account
* `GET /api/v1/accounting/quickbooks/preview`: Preview balanced double-entry journal entries
* `GET /api/v1/accounting/export/quickbooks/qbo-journal.csv`: Export QuickBooks Online Journal Entry batch CSV
* `GET /api/v1/accounting/export/quickbooks/desktop.iif`: Export QuickBooks Desktop IIF format
* `GET /api/v1/accounting/export/quickbooks/bank-feed.qbo`: Export Web Connect (.QBO) bank feed

---

## 5. QuickBooks Compatibility Architecture

GarrisonOS translates property operations into general ledger double-entry debits and credits:

1. **Chart of Accounts (COA) Standard Mapping**:
   * **Bank (1010 Operating Checking, 1020 Security Deposit Trust Checking)**: Operating vs escrow cash segregation.
   * **Accounts Receivable (1100 Tenant Receivables)**: Invoiced rent, utility, and fee charges.
   * **Current Liabilities (2100 Tenant Security Deposits Held)**: Escrow liabilities.
   * **Income (4010 Rental Income, 4020 Late Fee Income, etc.)**: Operating revenues.
   * **Operating Expenses (5010–5140)**: Aligned with IRS Form 1040 Schedule E lines.

2. **Class & Customer Tracking**:
   * Each journal entry maps the GarrisonOS `property_id` to a QuickBooks **Class** for granular property-level P&L reporting.
   * Payer/Payee contacts map to QuickBooks **Customer:Job** or **Vendor**.

3. **Universal QuickBooks Formats**:
   * **QuickBooks Online (QBO) Journal CSV**: Conforms to Intuit's batch journal import structure.
   * **QuickBooks Desktop (IIF)**: Tab-delimited transaction blocks (`!TRNS`/`!SPL`/`!ENDTRNS`).
   * **Web Connect (QBO/OFX)**: OFX 2.1 SGML/XML banking import for bank feed reconciliation.
