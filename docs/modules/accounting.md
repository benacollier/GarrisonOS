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
