# GarrisonOS REST API & EventBus Specification

This document provides the canonical API specification and EventBus topic contract for **GarrisonOS**. It details endpoint contracts, request/response payload schemas, parameter validation rules, error formats, and asynchronous event choreography across the core engine and modular subsystems.

All endpoints adhere to the engineering standards established in [`AGENTS.md`](../../AGENTS.md):
- **Standard Envelopes**: Conform strictly to `api/response.ts` (`successResponse`, `errorResponse`).
- **Context Extraction**: Zero parameter leakage — `operator_id` is never accepted in request bodies or route parameters; it is extracted implicitly via `RequestContext.getOperatorId()`.
- **Numeric Validation**: Bounded validation guards (`Number.isInteger()`, `Number.isFinite()`).
- **Error Hygiene**: SQL statements, driver errors, and stack traces are never leaked in error payloads.

---

## 1. REST API Envelopes & Conventions

### 1.1 Success Response Envelope
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 50
  }
}
```

### 1.2 Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invoice amount must be a positive integer in cents",
    "details": []
  }
}
```

Standard Error Codes:
- `VALIDATION_ERROR` (HTTP 400): Malformed payload or failed domain assertion.
- `UNAUTHORIZED` (HTTP 401): Missing, expired, or invalid session token.
- `FORBIDDEN` (HTTP 403): User lacks required RBAC permissions for the resource.
- `NOT_FOUND` (HTTP 404): Target entity does not exist or belongs to another operator.
- `CONFLICT` (HTTP 409): Unique constraint violation or concurrency collision.
- `INTERNAL_ERROR` (HTTP 500): Unexpected system fault (details logged server-side).

---

## 2. Platform Governance & Operator Subuser APIs

### 2.1 Platform Operators Governance
* `GET /api/v1/system/operators`: List all operators on the instance (Platform Owner & System Managers only).
* `POST /api/v1/system/operators`: Provision a new operator and owner user with configurable storage quota (Platform Owner only).
* `PUT /api/v1/system/operators/:id`: Update operator name, storage quota bytes (Platform Owner & System Managers).
* `DELETE /api/v1/system/operators/:id`: Soft-delete operator and all its users (Platform Master Owner only).

### 2.2 Platform System Managers ("Minions of the Owner")
* `GET /api/v1/system/managers`: List platform system managers (Platform Owner only).
* `POST /api/v1/system/managers`: Provision a new platform manager (`is_system_user = 1`, `role = system_manager`) assisting with platform administration.
* `DELETE /api/v1/system/managers/:id`: Soft-delete platform manager (Platform Owner only; cannot delete self).

### 2.3 Operator Team & Subuser Management
* `GET /api/v1/users`: List subusers belonging to the caller's operator organization.
* `POST /api/v1/users`: Provision a subuser with role (`leasing_agent`, `assistant`, `maintenance`, `auditor`, `viewer`), `allowed_modules: string[]`, and `allowed_portfolios: string[]`.
* `GET /api/v1/users/:id`: Get subuser profile with module and portfolio whitelist.
* `PUT /api/v1/users/:id`: Update subuser profile, role, password, `allowed_modules`, or `allowed_portfolios`.
* `DELETE /api/v1/users/:id`: Soft-delete subuser (blocks deletion of sole remaining owner).

---

## 3. Four-Tier Asset Hierarchy: Properties & Buildings APIs

### 3.1 Buildings Management
* `GET /api/v1/properties/:id/buildings`: List all buildings located within a property parcel.
* `POST /api/v1/properties/:id/buildings`: Create a new building under a property parcel:
  ```json
  {
    "name": "North Tower",
    "building_number": "Bldg-A",
    "floors": 4,
    "notes": "Four-story residential wing"
  }
  ```
* `GET /api/v1/buildings/:id`: Retrieve building details with parent property reference.
* `PUT /api/v1/buildings/:id`: Update building name, number, floor count, or notes.
* `DELETE /api/v1/buildings/:id`: Soft-delete building record.

### 3.2 Units with Structural Links
* `POST /api/v1/properties/:id/units`: Accepts optional `building_id` linking the unit directly to a physical building within the parcel.
* `GET /api/v1/properties/units/:id`: Returns unit details including linked `building_id`.
* `PUT /api/v1/properties/units/:id`: Re-assign or update `building_id`.

---

## 4. Accounts Payable (AP) & Vendor Invoicing Subsystem

### 2.1 List Bills
* **Endpoint**: `GET /api/v1/accounting/bills`
* **Query Parameters**:
  - `vendor_id` (string, optional): Filter by vendor UUIDv7.
  - `status` (string, optional): `draft`, `pending_approval`, `approved`, `partially_paid`, `paid`, `voided`.
  - `due_before` (integer, optional): UTC epoch ms.
  - `limit` (integer, optional, default: 50, max: 100).
  - `page` (integer, optional, default: 1).
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "018f9a21-7000-7c23-8bc1-1234567890ab",
      "vendor_id": "018f9a21-6543-7a12-8bc1-abcdef123456",
      "invoice_number": "INV-2026-089",
      "invoice_date": 1789500000000,
      "due_date": 1792092000000,
      "payment_terms": "net_30",
      "subtotal_cents": 45000,
      "tax_cents": 0,
      "total_amount_cents": 45000,
      "status": "approved",
      "work_order_id": "018f9a21-4321-7b34-8bc1-fedcba654321",
      "cost_plus_markup_bps": 1000,
      "created_at": 1789500100000
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 50 }
}
```

### 2.2 Create Bill with Allocations
* **Endpoint**: `POST /api/v1/accounting/bills`
* **Request Body**:
```json
{
  "vendor_id": "018f9a21-6543-7a12-8bc1-abcdef123456",
  "invoice_number": "INV-2026-089",
  "invoice_date": 1789500000000,
  "due_date": 1792092000000,
  "payment_terms": "net_30",
  "work_order_id": "018f9a21-4321-7b34-8bc1-fedcba654321",
  "cost_plus_markup_bps": 1000,
  "notes": "Emergency plumbing valve replacement",
  "allocations": [
    {
      "property_id": "018f9a21-1111-7c22-8bc1-111111111111",
      "unit_id": "018f9a21-2222-7c22-8bc1-222222222222",
      "gl_account_id": "018f9a21-3333-7c22-8bc1-333333333333",
      "amount_cents": 45000,
      "description": "Plumbing repairs"
    }
  ]
}
```
* **Response (201 Created)**: Returns created bill record with allocations.

### 2.3 Approve Bill
* **Endpoint**: `POST /api/v1/accounting/bills/:id/approve`
* **Permission**: `accounting:bills:approve`
* **Behavior**: Transitions bill status to `approved`, creates double-entry journal entry (Debit `Expense Account`, Credit `2010 Accounts Payable`), and publishes `bill.approved` event.
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "018f9a21-7000-7c23-8bc1-1234567890ab",
    "status": "approved",
    "approved_at": 1789500500000,
    "journal_entry_id": "018f9a21-8888-7c22-8bc1-888888888888"
  }
}
```

### 2.4 Disburse Bill Payment (Check / ACH / Card)
* **Endpoint**: `POST /api/v1/accounting/bills/disbursements`
* **Permission**: `accounting:bills:disburse`
* **Request Body**:
```json
{
  "vendor_id": "018f9a21-6543-7a12-8bc1-abcdef123456",
  "disbursement_account_id": "018f9a21-1010-7c22-8bc1-101010101010",
  "disbursement_date": 1789501000000,
  "disbursement_method": "check",
  "check_number": "1042",
  "payee_name": "Apex Plumbing Services LLC",
  "memo": "Payment for INV-2026-089",
  "lines": [
    {
      "bill_id": "018f9a21-7000-7c23-8bc1-1234567890ab",
      "allocated_amount_cents": 45000
    }
  ]
}
```
* **Response (201 Created)**: Creates disbursement, marks bill as `paid`, posts double-entry transaction (Debit `2010 Accounts Payable`, Credit `1010 Operating Checking`), and publishes `bill.disbursed` event.

---

## 3. Zero-Dependency PDF Check Printing & Check Register

### 3.1 Generate Print Check PDF
* **Endpoint**: `POST /api/v1/accounting/checks/print`
* **Permission**: `accounting:checks:print`
* **Request Body**:
```json
{
  "disbursement_ids": [
    "018f9a21-9999-7c22-8bc1-999999999999"
  ],
  "template_type": "voucher_check_top", // 'standard_3_per_page', 'voucher_check_top', 'voucher_check_middle'
  "starting_check_number": 1042
}
```
* **Response (200 OK)**:
  - Header: `Content-Type: application/pdf`
  - Header: `Content-Disposition: attachment; filename="checks_20260918_1042.pdf"`
  - Body: Binary stream conforming strictly to ISO 32000-1 (PDF 1.4), rendered natively via pure TypeScript vector writer with millimeter alignment.

### 3.2 Void Check
* **Endpoint**: `POST /api/v1/accounting/checks/void`
* **Permission**: `accounting:checks:void`
* **Request Body**:
```json
{
  "disbursement_id": "018f9a21-9999-7c22-8bc1-999999999999",
  "reason": "Printer alignment error on check stock"
}
```
* **Response (200 OK)**: Reverses the disbursement journal entry, marks check as void in the check register, returns allocated bills back to `approved` state.

---

## 4. Bank Deposits & Clearing Subsystem

### 4.1 List Undeposited Receipts
* **Endpoint**: `GET /api/v1/accounting/undeposited-funds`
* **Response (200 OK)**: Lists all payments posted to `1030 Undeposited Funds` awaiting batching.

### 4.2 Create Bank Deposit
* **Endpoint**: `POST /api/v1/accounting/bank-deposits`
* **Permission**: `accounting:deposits:create`
* **Request Body**:
```json
{
  "bank_account_id": "018f9a21-1020-7c22-8bc1-102010201020", // Trust or Operating account
  "deposit_date": 1789505000000,
  "deposit_reference": "DEP-2026-09-18",
  "memo": "Deposit of 4 tenant rent checks",
  "source_transaction_ids": [
    "018f9a21-tx01-7c22-8bc1-tx01tx01tx01",
    "018f9a21-tx02-7c22-8bc1-tx02tx02tx02"
  ]
}
```
* **Response (201 Created)**: Generates clearing journal entry (Debit `1010/1020 Bank Checking`, Credit `1030 Undeposited Funds`) and groups receipts into a single statement-matched deposit slip for Three-Way Bank Reconciliation.

---

## 5. Client Portfolio Accounting & Management Fees

### 5.1 Record Client Capital Contribution
* **Endpoint**: `POST /api/v1/accounting/client-contributions`
* **Request Body**:
```json
{
  "client_contact_id": "018f9a21-cl01-7c22-8bc1-cl01cl01cl01",
  "portfolio_id": "018f9a21-pf01-7c22-8bc1-pf01pf01pf01",
  "property_id": "018f9a21-pr01-7c22-8bc1-pr01pr01pr01",
  "contribution_date": 1789500000000,
  "amount_cents": 500000, // $5,000.00
  "destination_account_id": "018f9a21-1010-7c22-8bc1-101010101010",
  "reference_number": "WIRE-48201",
  "memo": "HVAC replacement reserve capital"
}
```
* **Ledger Invariant**: Debit `1010 Operating Checking`, Credit `3010 Client Capital`.

### 5.2 Disburse Client Draw / Distribution
* **Endpoint**: `POST /api/v1/accounting/client-distributions`
* **Request Body**:
```json
{
  "client_contact_id": "018f9a21-cl01-7c22-8bc1-cl01cl01cl01",
  "portfolio_id": "018f9a21-pf01-7c22-8bc1-pf01pf01pf01",
  "distribution_date": 1789506000000,
  "amount_cents": 345000, // $3,450.00
  "source_account_id": "018f9a21-1010-7c22-8bc1-101010101010",
  "disbursement_method": "ach",
  "memo": "Monthly net operating cash distribution"
}
```
* **Ledger Invariant**: Debit `3020 Client Distributions`, Credit `1010 Operating Checking`.

---

## 6. Leasing AR & Fee Policy Engine

### 6.1 Recurring Lease Charges
* **Endpoint**: `POST /api/v1/leases/:id/recurring-charges`
* **Request Body**:
```json
{
  "charge_category": "pet_rent",
  "amount_cents": 3500, // $35.00
  "gl_account_id": "018f9a21-4020-7c22-8bc1-402040204020",
  "billing_frequency": "monthly",
  "billing_day": 1,
  "description": "Monthly pet rent (1 dog)"
}
```

### 6.2 Apply Concession or Credit Memo
* **Endpoint**: `POST /api/v1/leases/:id/credits`
* **Request Body**:
```json
{
  "credit_type": "promotional_concession",
  "amount_cents": 25000, // $250.00
  "gl_account_id": "018f9a21-4900-7c22-8bc1-490049004900",
  "reason": "Move-in special concession",
  "effective_date": 1789500000000
}
```

---

## 7. Universal Document Attachments API

### 7.1 Upload Attachment
* **Endpoint**: `POST /api/v1/attachments`
* **Content-Type**: `multipart/form-data`
* **Form Fields**:
  - `entity_type` (string): `lease`, `property`, `unit`, `contact`, `work_order`, `bill`.
  - `entity_id` (string): UUIDv7 of parent entity.
  - `file` (binary): Document or image file.
* **Processing Guarantees**:
  - Automatically strips EXIF metadata on image files (eliminating GPS and device identifiers).
  - Downsamples oversized images to safe, compact dimensions (max 1920x1080 WebP/JPEG).
  - Validates PDF structure and rejects files containing interactive `/JavaScript`, `/JS`, or executable triggers.
  - Generates cryptographic SHA-256 checksum and saves to sandboxed path outside web root.
* **Response (201 Created)**: Returns attachment metadata record.

### 7.2 Download Attachment
* **Endpoint**: `GET /api/v1/attachments/:id/download`
* **Response (200 OK)**:
  - Header: `Content-Disposition: attachment; filename="sanitized_name.ext"`
  - Header: `X-Content-Type-Options: nosniff`
  - Stream: Sandboxed binary stream verified against traversal attacks.

---

## 8. Public-Facing Tenant Self-Service Portal (`portal.<domain>`)

All portal routes execute under dedicated subdomain host routing with independent session cookies and strict rate limits.

### 8.1 Request Magic Link
* **Endpoint**: `POST /portal/login`
* **Request Body**: `{ "email": "tenant@example.com" }`
* **Rate Limit**: Maximum 5 requests per 15 minutes per IP.
* **Behavior**: Verifies tenant lease status; dispatches HMAC-signed login token (15-minute validity) via SMTP.

### 8.2 Verify Magic Link
* **Endpoint**: `GET /portal/verify?token=...`
* **Behavior**: Validates cryptographic signature and expiration; issues secure HTTP-only session cookie scoped to `portal.<domain>`.

### 8.3 Submit Maintenance Request
* **Endpoint**: `POST /portal/maintenance/new`
* **Content-Type**: `multipart/form-data`
* **Form Fields**: `category`, `description`, `priority`, `photos[]`.
* **Behavior**: Strips EXIF metadata, downsamples images, creates work order associated with tenant unit, and publishes `work_order.created` event.

---

## 9. Asynchronous In-Process EventBus Contracts

All modules communicate asynchronously via `EventBus` (`core/events.ts`). Every subscriber executes inside a `try/catch` block to guarantee process resilience.

| Event Topic | Payload Parameters | Trigger Condition | Primary Subscribers |
| :--- | :--- | :--- | :--- |
| `bill.approved` | `operatorId`, `billId`, `amountCents`, `vendorId` | Bill transitions from draft to approved | Accounting (posts AP journal entry), Maintenance (tags work order expense) |
| `bill.disbursed` | `operatorId`, `disbursementId`, `billIds[]`, `totalCents` | Payment disbursed to vendor | Accounting (settles AP liability, check register audit) |
| `check.printed` | `operatorId`, `disbursementId`, `checkNumber` | Check batch PDF generated | Accounting (marks `check_printed = 1`, logs check number) |
| `bank.deposit_cleared` | `operatorId`, `depositId`, `totalCents`, `accountNumber` | Deposit batch submitted | Accounting (debits bank account, credits undeposited funds) |
| `client.distribution.posted`| `operatorId`, `distributionId`, `portfolioId`, `cents` | Client net cash draw disbursed | Accounting (posts equity reduction, generates distribution notice) |
| `lease.charge_accrued` | `operatorId`, `leaseId`, `category`, `cents` | Recurring charge generator runs | Accounting (posts receivable entry to tenant ledger) |
| `lease.late_fee_applied` | `operatorId`, `leaseId`, `feeCents`, `delinquentCents` | Delinquency policy triggers | Accounting (posts late fee receivable), Notifications (alerts tenant) |
| `attachment.uploaded` | `operatorId`, `attachmentId`, `entityType`, `entityId` | Document upload sanitized | Audit (records file checksum and metadata) |
