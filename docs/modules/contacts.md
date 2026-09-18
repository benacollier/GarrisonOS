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
* `operator_id` (UUIDv7): Owning operator instance
* `contact_type` (TEXT): Role category (`tenant`, `owner`, `vendor`, `guarantor`, `prospect`, `emergency`)
* `first_name` (TEXT), `last_name` (TEXT)
* `company_name` (TEXT): For vendors or commercial entities
* `email` (TEXT), `phone` (TEXT), `secondary_phone` (TEXT)
* `tax_id_last4` (TEXT): For Form 1099-NEC or SSN recordkeeping
* `vendor_specialty` (TEXT): Trade specialization (e.g. `plumbing`, `electrical`, `hvac`, `carpentry`, `roofing`, `general_contracting`)
* `tax_classification` (TEXT): Legal tax status (e.g. `individual_sole_proprietorship`, `llc`, `c_corp`, `s_corp`, `partnership`)
* `w9_received` (INTEGER): W-9 on file status (`0` = Pending, `1` = Verified)
* `notes` (TEXT)
* `created_at`, `updated_at`, `deleted_at`

---

## 3. Vendor Compliance & 1099-NEC Reporting

The contacts module tracks vendor compliance and independent contractor taxation:

* **W-9 Tracking**: Contacts table displays visual indicators (`W-9 Verified` green badge vs `W-9 Pending` amber alert badge) to safeguard operators against non-compliant disbursements.
* **Trade Specialization**: Allows the maintenance dispatch workflow to filter and assign qualified vendors matching the required trade.
* **Tax Classification**: Captures legal structure (`sole_proprietorship`, `llc`, `corporation`) to automate Form 1099-NEC reporting thresholds.

---

## 4. API Endpoints

* `GET /api/v1/contacts`: List contacts (supports `?type=tenant|vendor|owner` and `?search=query`)
* `POST /api/v1/contacts`: Create a new contact
* `GET /api/v1/contacts/:id`: Fetch contact details, active leases, and assigned work orders
* `PUT /api/v1/contacts/:id`: Update contact details (including W-9 status and tax classification)
* `DELETE /api/v1/contacts/:id`: Soft delete contact
