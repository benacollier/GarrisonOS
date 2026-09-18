# Drop-in Module Architecture

GarrisonOS organizes all domain capabilities into self-contained modules located under `modules/[module_name]/`.

---

## 1. Module Structure Contract

Each module encapsulates its complete vertical slice:

```text
modules/[module_name]/
├── module.json                # Module manifest & UI slot registrations
├── backend/
│   ├── migrations/            # SQL DDL migrations (e.g. 0001_module_name.sql)
│   ├── routes.ts              # REST API endpoint definitions & handlers
│   ├── events.ts              # EventBus subscriber registrations
│   └── repository.ts          # Data access layer & SQL queries
├── frontend/
│   ├── hooks.ts               # Nav menu items, dashboard cards & detail tabs
│   └── pages/                 # Pure TypeScript SSR view templates (web/lib/html.ts)
└── test/
    └── [module_name].test.ts  # Co-located unit and integration test suite
```

---

## 2. Module Manifest (`module.json`)

The manifest declares the module identity, UI slots, and dependencies. The application version is sourced from the repository root `VERSION` file and injected by the module loader:

```json
{
  "id": "accounting",
  "name": "Accounting & Financials",
  "description": "Double-entry trust ledger, Client Accounting, Accounts Payable, billing cycles, IRS Schedule E, and 3-way reconciliation.",
  "navigation": [
    {
      "label": "Accounting",
      "route": "/accounting",
      "icon": "banknote",
      "order": 40,
      "section": "core"
    }
  ],
  "slots": [
    "dashboard.metrics",
    "lease.details.tabs"
  ],
  "dependencies": [
    "properties",
    "contacts",
    "leases"
  ]
}
```

---

## 3. Dynamic Module Discovery & Lifecycle

On startup, `core/module-loader.ts` discovers and initializes modules through the following stages:

1. **Manifest Parsing**: Reads and validates `module.json`.
2. **Topological Migration**: Discovers all SQL migration scripts in `backend/migrations/` and executes unapplied migrations in topological dependency order.
3. **Route Mounting**: Calls `registerRoutes(router)` to mount REST endpoints under `/api/v1/[module_name]`.
4. **Event Registration**: Calls `registerSubscribers(eventBus)` to attach listeners for cross-module events.
5. **UI Aggregation**: Pure TypeScript SSR framework (`web/lib/hook-registry.ts`) discovers navigation menus and composite dashboard widgets.

---

## 4. Module Inventory & Near-Term Roadmap Capabilities

For complete entity schemas and REST API endpoint specifications, refer to:
- [Domain Models Specification](../architecture/domain-models.md)
- [API Specification](../architecture/api-spec.md)

| Module | Core Responsibility | Current Capabilities | Near-Term Roadmap Deliverables (Sprints 3–5) |
| :--- | :--- | :--- | :--- |
| **`accounting`** | Fiduciary & Operational Financials | Double-entry general ledger, statutory trust segregation (`1010` vs `1020`), Three-Way Bank Reconciliation, Form 1099-NEC aggregation, Schedule E. | Single-entry `transactions` sunset (Sprint 4); Client Accounting & Fee Agreements (Sprint 4); Accounts Payable, ANSI PDF Check Printing & Bank Deposits (Sprint 5). |
| **`backup`** | Data Portability & Disaster Recovery | Hot SQLite snapshots, automated `BackupScheduler` daemon, vacuuming, retention pruning, SHA-256 verification. | Packaging physical media attachments into verified backup archives alongside database snapshots (Sprint 3). |
| **`contacts`** | Directory & Tax Compliance | Multi-role directory (tenants, clients, vendors), trade specializations, visual W-9 verification flags, tax classifications. | Universal threaded conversation notes (Sprint 4); prospect applicant intake (Future Horizon). |
| **`leases`** | Rental Contracts & Receivables | Multi-party signatories, renewal modal, termination notice workflow, statutory deposit disposition countdowns. | Recurring itemized lease charges, late fee policy rules, credits/concessions, and tenant deposit refunds (Sprint 4). |
| **`maintenance`** | Maintenance & Work Orders | Work order lifecycle, priority triage, trade-filtered vendor dispatch, automated make-ready orders. | Preventative recurring schedules (Sprint 4); expense recovery links to AP bills (Sprint 5); subtasks & timecards (Future Horizon). |
| **`properties`** | Physical & Organizational Inventory | Portfolios, properties, units, vacancy metrics, unit turnover state machine. | Universal document attachments (Sprint 3); dynamic custom fields engine (Sprint 5). |

---

## 5. Architectural Invariants

1. **Zero Cross-Module Direct Imports**: Modules must never import directly from another module's internal files.
2. **Asynchronous Cross-Module Communication**: All inter-module communication must use the in-process `EventBus` (`core/events.ts`).
3. **Resilient Event Listeners**: All event subscribers must wrap their handlers in `try/catch` blocks to protect background execution flows.
