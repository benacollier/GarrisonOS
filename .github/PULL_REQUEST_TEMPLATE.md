# Pull Request

## Description

<!-- Provide a brief description of the changes introduced by this PR. -->

## Related Issues

<!-- Link any related issues or discussions (e.g., Fixes #123). -->

## Type of Change

- [ ] `feat`: New feature or capability (`type/feat`)
- [ ] `fix`: Bug fix (`type/fix`)
- [ ] `docs`: Documentation updates (`type/docs`)
- [ ] `test`: New or updated tests (`type/test`)
- [ ] `refactor`: Code refactoring with no behavior change (`type/refactor`)
- [ ] `ci`: CI/CD workflow and automation improvements (`type/ci`)
- [ ] `security`: Security enhancements or vulnerability fixes (`type/security`)
- [ ] `chore`: Tooling, maintenance, or configuration changes (`type/chore`)

## Walkthrough & Changes Summary

<!-- Provide a brief, bulleted walkthrough of changes made, grouped by component or file. Avoid excessive detail. -->
- **Component / File**: Summary of change.

## Verification & Testing Evidence

<!-- Briefly record test commands run and verification results. -->
- **Automated Tests**: e.g., `npm.cmd test` or `node scripts/test.js <module>` passed.
- **Manual Verification**: Brief note on validation.

## Contributor Checklist

Please verify each of the following before submitting:

- [ ] **Zero External Runtime Dependencies**: Relies solely on Node.js built-ins and native PHP standard extensions. No runtime packages added.
- [ ] **Strict Multi-Tenancy**: All operational queries filter by `tenant_id` resolved implicitly via `RequestContext`.
- [ ] **Financial & Entity Standards**: Monetary amounts in integer cents; primary keys in RFC 9562 UUIDv7; timestamps in epoch ms.
- [ ] **Path Hygiene**: No machine-specific or absolute paths hardcoded; all paths use `node:path` relative lookups or standard env vars.
- [ ] **Secret Scanning & Hygiene**: Repository hygiene checks pass (`npm run check:hygiene`) and zero secrets or credentials committed (verified by Betterleaks).
- [ ] **Automated Tests**: Unit/integration tests added in `test/` or `modules/<module_name>/test/` and pass with `npm test`.
- [ ] **Conventional Commits**: Commit messages follow the specification (e.g. `feat(scope): ...`).
- [ ] **CLA**: I have read and agree to the [Contributor License Agreement (CLA)](docs/legal/CLA.md).
