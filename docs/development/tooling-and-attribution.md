# Development Tooling, AI Workers & Attribution Guide

This guide documents the development tooling, multi-tier background AI worker architecture, and open-source attributions utilized across the GarrisonOS developer environment.

---

## 1. Multi-Tier Background Reconnaissance Architecture

To minimize primary model context consumption and safeguard API quotas (e.g. Gemini 3.8 Flash Low RPM/TPM limits), GarrisonOS developers and coding agents utilize a tiered background worker system via the `llm-worker-tools` Model Context Protocol (MCP) server:

```text
[Tier 1: Cloud Primary] ──► Direct NVIDIA NIM (Nemotron 3 Super)
       │ (if network down, 429, or timeout)
       ▼
[Tier 2: Zero-Cost Local] ──► Local Ollama (Qwen 2.5 Coder 14B, <= 24k tokens)
       │ (if Ollama stopped, OOM, or model missing)
       ▼
[Tier 3: Guarded Fallback] ──► Primary Agent (Targeted Line Slices Only)
```

### Tier Specifications & Attributions

* **Tier 1 (Cloud Primary - High Throughput & Massive Context)**:
  * **Engine**: [NVIDIA NIM (Inference Microservices)](https://build.nvidia.com/)
  * **Model**: `nvidia/nemotron-3-super-120b-a12b`
  * **Characteristics**: ~42 tokens/sec throughput, ~9.8s latency, 128k+ context ceiling, 0 local GPU VRAM consumption.
  * **Configuration**: Configured via `LLM_BACKEND_BASE_URL=https://integrate.api.nvidia.com/v1` and personal NVIDIA developer API keys in `~/.llm-worker-tools/.env`.
* **Tier 2 (Offline Backup - Zero API Cost, Local Sovereignty)**:
  * **Engine**: [Ollama](https://ollama.com/) *(MIT License)*
  * **Model**: [Qwen 2.5 Coder 14B](https://github.com/QwenLM/Qwen2.5-Coder) by Alibaba Cloud *(Apache-2.0 License)*
  * **Characteristics**: Runs locally on host hardware. Governed by a strict $\le 24\text{k}$ token single-shot ceiling guard to prevent VRAM exhaustion or multi-chunk turn delays.
  * **Configuration**: `LLM_FALLBACK_BASE_URL=http://localhost:11434/v1`.
* **Tier 3 (Guarded Primary Fallback)**:
  * Triggered only if both Tier 1 and Tier 2 are unavailable.
  * Strictly governed by Section 7 of [AGENTS.md](../../AGENTS.md) (mandatory line-range slicing with `StartLine`/`EndLine`, max 80–120 lines; whole-file dumping is prohibited).

---

## 2. Low-Token Test Reporter

* **Script**: `scripts/test.js`
* **Default Behavior**: Buffers `node:test` execution and outputs a single succinct line on success:

  ```text
  ✔ All test suites passed (21 suites in 1.29s, 0 failures).
  ```

  *(Reduces token consumption from ~2,500 tokens down to ~12 tokens per run).*
* **Failure Mode**: Immediately dumps full stdout/stderr, failed assertions, and stack traces on any failure.
* **Diagnostic Flag**: Supports `--verbose` or `-v` (`npm test -- --verbose` or `node scripts/test.js --verbose`) for manual full TAP/spec logs.

---

## 3. Comprehensive Repository Compliance Scanner

* **Script**: `scripts/check-hygiene.js`
* **Execution**: `npm run check:hygiene` or `npm run check` (runs in <150ms with zero runtime dependencies).
* **Automated Invariant Checks**:
  1. **Dependency Whitelist**: Enforces standard `node:*` and relative imports. Rejects prohibited npm packages (`express`, `zod`, `uuid`, etc.).
  2. **Strict Equality**: Enforces `===` and `!==` across all TypeScript and PHP source code.
  3. **Synchronous SQLite Invariant**: Flags any `await db.prepare` or `await db.exec` on `node:sqlite.DatabaseSync`.
  4. **Tenant Isolation**: Flags `:tenant_id` appearing in API route paths or client request bodies/queries.
  5. **SQL Portability**: Enforces parameterized queries (`?`), PostgreSQL compatibility (rejects `AUTOINCREMENT`, `INSERT OR REPLACE/IGNORE`), and UTC timestamps (rejects SQLite `datetime` functions).
  6. **Fail-Closed Security**: Validates cryptographic SHA256 checksum verification and non-zero exit codes in installer scripts.
  7. **Host Path & Credential Hygiene**: Scans for host-specific filesystem paths (`C:\Users\...`, `/home/...`) and exposed secrets.

---

## 4. Development Tooling Attributions

GarrisonOS acknowledges and credits the following open-source tools and infrastructure powering our development environment:

* **[LLM Worker Tools](https://github.com/OhOkThisIsFine/llm-worker-tools)**: Ambient background context reduction and scaffolding MCP server.
* **[NVIDIA NIM](https://build.nvidia.com/)**: Cloud inference microservices powering high-throughput background codebase reconnaissance.
* **[Ollama](https://ollama.com/)** *(MIT License)*: Local large language model execution runtime driving offline fallback operations.
* **[Qwen 2.5 Coder](https://github.com/QwenLM/Qwen2.5-Coder)** *(Apache-2.0 License)*: Code generation and analysis model developed by Alibaba Cloud.
* **[Betterleaks](https://github.com/betterleaks/betterleaks)** *(Apache-2.0 License)*: Zero-dependency secret and credential scanner.
* **[markdownlint-cli](https://github.com/igorshubovych/markdownlint-cli)** *(MIT License)*: Markdown syntax and style verification.
* **[TypeScript](https://www.typescriptlang.org/)** *(Apache-2.0 License)*: Compile-time static type system and compiler.
