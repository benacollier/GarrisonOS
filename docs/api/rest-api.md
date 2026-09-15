# Zero-Dependency REST API Reference

The GarrisonOS REST API is exposed by the headless Node.js backend (`api/server.ts`) listening by default on `http://127.0.0.1:3000`.

---

## 1. Request Headers

| Header | Required | Description |
| :--- | :--- | :--- |
| `X-Tenant-ID` | **Yes\*** | UUIDv7 of the active tenant context (\*except public endpoints) |
| `Authorization` | Optional | `Bearer <signed_hmac_token>` for authenticated endpoints |
| `X-Request-ID` | Optional | Client correlation ID (generated automatically if omitted) |
| `Content-Type` | Optional | `application/json` for state-modifying requests |

---

## 2. Response Envelopes

All JSON responses conform to standardized envelopes:

### Success Response (`HTTP 200 / 201`)

```json
{
  "success": true,
  "data": {
    "id": "018d9f4e-28b3-7a91-91bc-0a75bc89a712",
    "name": "Oakwood Apartments"
  },
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 25
  }
}
```

### Error Response (`HTTP 4xx / 5xx`)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The provided payload contains invalid or missing fields.",
    "details": [
      { "field": "amount_cents", "issue": "Must be a positive integer" }
    ]
  }
}
```

### Error Codes

* `VALIDATION_ERROR` (`400`)
* `UNAUTHORIZED` (`401`)
* `FORBIDDEN` (`403`)
* `NOT_FOUND` (`404`)
* `CONFLICT` (`409`)
* `RATE_LIMITED` (`429`)
* `INTERNAL_ERROR` (`500`)

---

## 3. Core System Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | Liveness check returning status and uptime |
| `GET` | `/ready` | Public | Readiness check verifying SQLite database connectivity |
| `POST` | `/api/v1/auth/login` | Public (Rate Limited) | Authenticate user credentials and return signed HMAC token |
| `GET` | `/api/v1/system/backup` | Admin | Trigger WAL checkpoint and create database snapshot |

---

## 4. Module Endpoint Directory

### Properties & Units

* `GET /api/v1/properties`: List properties
* `POST /api/v1/properties`: Create property
* `GET /api/v1/properties/:id`: Get property with units
* `PUT /api/v1/properties/:id`: Update property
* `DELETE /api/v1/properties/:id`: Soft delete property
* `POST /api/v1/properties/:id/units`: Create unit under property
* `GET /api/v1/properties/units/:unitId`: Get unit
* `PUT /api/v1/properties/units/:unitId`: Update unit

### Contacts

* `GET /api/v1/contacts`: Query contacts with role and search filters
* `POST /api/v1/contacts`: Create contact
* `GET /api/v1/contacts/:id`: Contact details and linked entities
* `PUT /api/v1/contacts/:id`: Update contact
* `DELETE /api/v1/contacts/:id`: Soft delete contact

### Leases

* `GET /api/v1/leases`: List leases
* `POST /api/v1/leases`: Create lease with signatories
* `GET /api/v1/leases/:id`: Get lease details and signatories
* `PUT /api/v1/leases/:id`: Update lease terms
* `POST /api/v1/leases/:id/signatories`: Add signatory

### Accounting

* `GET /api/v1/accounting/transactions`: List financial transactions
* `POST /api/v1/accounting/transactions`: Record charge, payment, or expense
* `GET /api/v1/accounting/ledger/:leaseId`: Calculate running balance
* `POST /api/v1/accounting/generate-rent-charges`: Trigger monthly recurring rent billing
* `POST /api/v1/accounting/deposit-disposition`: Settle move-out security deposit
* `GET /api/v1/accounting/export/rent-roll.csv`: Stream Rent Roll CSV
* `GET /api/v1/accounting/export/schedule-e.csv`: Stream Schedule E CSV
* `GET /api/v1/accounting/export/ledger/:leaseId.csv`: Stream Ledger Statement CSV
* `GET /api/v1/accounting/chart-of-accounts`: List Chart of Accounts
* `POST /api/v1/accounting/chart-of-accounts`: Create general ledger account
* `PUT /api/v1/accounting/chart-of-accounts/:id`: Update general ledger account
* `GET /api/v1/accounting/quickbooks/preview`: Preview balanced double-entry journal entries
* `GET /api/v1/accounting/export/quickbooks/qbo-journal.csv`: Export QuickBooks Online Journal Entry batch CSV
* `GET /api/v1/accounting/export/quickbooks/desktop.iif`: Export QuickBooks Desktop IIF format
* `GET /api/v1/accounting/export/quickbooks/bank-feed.qbo`: Export Web Connect (.QBO) bank feed

### Maintenance

* `GET /api/v1/maintenance`: List work orders
* `POST /api/v1/maintenance`: Create work order
* `GET /api/v1/maintenance/:id`: Work order details
* `PUT /api/v1/maintenance/:id`: Update work order status and costs
* `DELETE /api/v1/maintenance/:id`: Soft delete work order
