# GarrisonOS Documentation

Welcome to the official documentation for **GarrisonOS**, the zero-dependency, open-source property management platform engineered for independent landlords, property managers, and real estate operators.

> [!WARNING]
> **Pre-Production Disclaimer**: GarrisonOS is currently in active pre-production prototyping. It is not ready for production environments and should not be installed by end users until an official stable release is made available.

---

## Documentation Navigation

```text
docs/
├── ROADMAP.md             # Phased MVP development roadmap and milestone deliverables
├── architecture/          # Core engine design, multi-tenancy, data schemas, and blueprints
│   ├── overview.md        # Polyglot architecture, zero-dependency engine, and request lifecycle
│   ├── multi-tenancy.md   # Strict operator isolation, AsyncLocalStorage, and X-Operator-ID
│   ├── data-model.md      # SQLite WAL, RFC 9562 UUIDv7, Integer Cents, Millisecond timestamps
│   ├── bootstrap-spec.md  # Canonical architectural bootstrap blueprint and MVP specification
│   └── technical-debt.md  # Architecture critique, failure-mode analysis, and technical debt log
│
├── modules/               # Self-contained domain module specifications
│   ├── overview.md        # Drop-in module architecture, module.json manifest, and lifecycle
│   ├── properties.md      # Portfolios, properties, and rentable unit inventory
│   ├── contacts.md        # Directory of tenants, owners, vendors, and emergency contacts
│   ├── leases.md          # Lease agreements, terms, signatories, and lifecycle transitions
│   ├── accounting.md      # Double-entry GL, statutory trust accounting, 3-way reconciliation, Schedule E, and QuickBooks
│   ├── maintenance.md     # Work order triage, vendor dispatch, and expense conversion
│   └── backup.md          # Point-in-time snapshots, operator data portability, and disaster recovery
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

* **Roadmap**: [MVP Roadmap](ROADMAP.md)
* **Core Architecture**: [Architecture Overview](architecture/overview.md) | [Multi-Tenancy Guide](architecture/multi-tenancy.md) | [Data Model Standards](architecture/data-model.md)
* **Domain Modules**: [Properties](modules/properties.md) | [Contacts](modules/contacts.md) | [Leases](modules/leases.md) | [Accounting](modules/accounting.md) | [Maintenance](modules/maintenance.md) | [Backup](modules/backup.md)
* **API & Events**: [REST API Reference](api/rest-api.md) | [EventBus Reference](api/events.md)
* **Developer Workflow**: [Getting Started](development/getting-started.md) | [Frontend Guide](development/frontend-guide.md) | [Testing Guide](development/testing.md) | [Developer Tooling](development/tooling.md)
* **Production Operations**: [Self-Hosting Guide](deployment/self-hosting.md) | [Configuration Reference](deployment/configuration.md) | [Database Maintenance](deployment/backup-and-maintenance.md)
* **Legal & Security**: [Contributor License Agreement](legal/CLA.md) | [Attributions](../ATTRIBUTIONS.md) | [Security Policy](../SECURITY.md) | [Project License](../LICENSE)
