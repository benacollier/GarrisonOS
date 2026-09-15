# GarrisonOS Documentation

Welcome to the official documentation for **GarrisonOS**, the zero-dependency, open-source property management platform engineered for independent landlords, property managers, and real estate operators.

---

## Documentation Navigation

```text
docs/
├── architecture/          # Core engine design, multi-tenancy, data schemas, and blueprints
│   ├── overview.md        # Polyglot architecture, zero-dependency engine, and request lifecycle
│   ├── multi-tenancy.md   # Strict row-level isolation, AsyncLocalStorage, and X-Tenant-ID
│   ├── data-model.md      # SQLite WAL, RFC 9562 UUIDv7, Integer Cents, Millisecond timestamps
│   ├── bootstrap-spec.md  # Canonical architectural bootstrap blueprint and MVP specification
│   └── technical-debt.md  # Architecture critique, failure-mode analysis, and technical debt log
│
├── modules/               # Self-contained domain module specifications
│   ├── overview.md        # Drop-in module architecture, module.json manifest, and lifecycle
│   ├── properties.md      # Portfolios, properties, and rentable unit inventory
│   ├── contacts.md        # Directory of tenants, owners, vendors, and emergency contacts
│   ├── leases.md          # Lease agreements, terms, signatories, and lifecycle transitions
│   ├── accounting.md      # Single-entry cash ledger, IRS Schedule E, proration, waterfall payments
│   └── maintenance.md     # Work order triage, vendor dispatch, and expense conversion
│
├── api/                   # REST API and EventBus contracts
│   ├── rest-api.md        # Zero-dependency HTTP REST endpoints, headers, and error envelopes
│   └── events.md          # Asynchronous in-process EventBus topic catalog and payload contracts
│
├── development/           # Contributor and developer guides
│   ├── getting-started.md # Local development prerequisites, build pipeline, and running services
│   ├── frontend-guide.md  # Native PHP presentation layer, slots, session hygiene, and CSS system
│   └── testing.md         # Zero-dependency test runner standards (node:test, node:assert)
│
├── deployment/            # Production deployment and system operations
│   ├── self-hosting.md    # Production setup, Systemd / Supervisord, PHP-FPM, and Reverse Proxy
│   ├── configuration.md   # Environment variables and security keys reference
│   └── backup-and-maintenance.md # SQLite WAL checkpointing, vacuuming, and automated backups
│
└── legal/                 # Legal agreements and licensing
    └── CLA.md             # Individual Contributor License Agreement (CLA)
```

---

## Quick Reference Links

* **Core Architecture**: [Architecture Overview](architecture/overview.md) | [Multi-Tenancy Guide](architecture/multi-tenancy.md) | [Data Model Standards](architecture/data-model.md)
* **Domain Modules**: [Properties](modules/properties.md) | [Contacts](modules/contacts.md) | [Leases](modules/leases.md) | [Accounting](modules/accounting.md) | [Maintenance](modules/maintenance.md)
* **API & Events**: [REST API Reference](api/rest-api.md) | [EventBus Reference](api/events.md)
* **Developer Workflow**: [Getting Started](development/getting-started.md) | [Frontend Guide](development/frontend-guide.md) | [Testing Guide](development/testing.md)
* **Production Operations**: [Self-Hosting Guide](deployment/self-hosting.md) | [Configuration Reference](deployment/configuration.md) | [Database Maintenance](deployment/backup-and-maintenance.md)
* **Legal & Security**: [Contributor License Agreement](legal/CLA.md) | [Security Policy](../SECURITY.md) | [Project License](../LICENSE)

