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
│   ├── hooks.php              # Nav menu items, dashboard cards & detail tabs
│   └── pages/                 # PHP server-rendered view templates
└── test/
    └── [module_name].test.ts  # Co-located unit and integration test suite
```

---

## 2. Module Manifest (`module.json`)

The manifest declares the module identity, version, UI slots, and dependencies:

```json
{
  "id": "accounting",
  "name": "Accounting & Financials",
  "version": "1.0.0",
  "description": "Cash-basis ledger, billing cycles, IRS Schedule E, and balance tracking.",
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
2. **Database Migration**: Discovers all SQL migration scripts in `backend/migrations/` and executes unapplied migrations sequentially.
3. **Route Mounting**: Calls `registerRoutes(router)` to mount REST endpoints under `/api/v1/[module_name]`.
4. **Event Registration**: Calls `registerSubscribers(eventBus)` to attach listeners for cross-module events.
5. **UI Aggregation**: PHP `web/lib/hooks.php` scans `frontend/hooks.php` to populate navigation menus and composite dashboard widgets.
