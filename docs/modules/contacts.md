# Contacts Module

The **Contacts** module (`modules/contacts/`) maintains a unified directory of all human individuals and business organizations associated with the property portfolio.

---

## 1. Contact Roles & Types

Every contact entity (`contacts`) is classified by role:

| `contact_type` | Description | Typical Use Cases |
| :--- | :--- | :--- |
| `tenant` | Resident leasing a property unit | Signatory on residential leases, tenant ledger balance |
| `owner` | Beneficial owner or investor | Portfolio reporting, owner disbursements |
| `vendor` | Contractor or service provider | Maintenance work orders, plumbing, HVAC, electrical dispatch |
| `guarantor` | Financial co-signer | Lease backing |
| `prospect` | Potential applicant | Inquiries, touring |
| `emergency` | Emergency contact | Tenant safety reference |

---

## 2. Schema Definition (`contacts`)

* `id` (UUIDv7): Primary key
* `tenant_id` (UUIDv7): Owning tenant
* `contact_type` (TEXT): Role category
* `first_name` (TEXT), `last_name` (TEXT)
* `company_name` (TEXT): For vendors or commercial entities
* `email` (TEXT), `phone` (TEXT), `secondary_phone` (TEXT)
* `tax_id_last4` (TEXT): For 1099 or SSN recordkeeping
* `vendor_specialty` (TEXT): e.g. "plumbing", "electrical", "hvac", "roofing"
* `notes` (TEXT)
* `created_at`, `updated_at`, `deleted_at`

---

## 3. API Endpoints

* `GET /api/v1/contacts`: List contacts (supports `?type=tenant|vendor|owner` and `?search=query`)
* `POST /api/v1/contacts`: Create a new contact
* `GET /api/v1/contacts/:id`: Fetch contact details, active leases, and assigned work orders
* `PUT /api/v1/contacts/:id`: Update contact details
* `DELETE /api/v1/contacts/:id`: Soft delete contact

