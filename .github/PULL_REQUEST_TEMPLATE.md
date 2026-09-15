# Pull Request

## Description

<!-- Provide a brief description of the changes introduced by this PR. -->

## Related Issues

<!-- Link any related issues or discussions (e.g., Fixes #123). -->

## Type of Change

- [ ] `feat`: New feature or capability
- [ ] `fix`: Bug fix
- [ ] `test`: New or updated tests
- [ ] `refactor`: Code refactoring with no behavior change
- [ ] `docs`: Documentation updates

## Walkthrough & Changes Summary

<!-- Provide a structured walkthrough of changes made, grouped by component or file. -->
- **Component / File**: Summary of changes and behavior updates.

## Verification & Testing Evidence

<!-- Detail testing performed, including commands run and outputs observed. -->
- **Automated Tests**: e.g., `npm test` or `node scripts/test.js <module>` passed.
- **Manual Verification**: Observations or flow validations.

## Contributor Checklist

Please verify each of the following before submitting:

- [ ] **Walkthrough Provided**: Walkthrough summary and verification details are provided above.
- [ ] **Zero External Runtime Dependencies**: Relies solely on Node.js built-ins and native PHP standard extensions. No runtime packages added.
- [ ] **Strict Multi-Tenancy**: All operational queries filter by `tenant_id` resolved implicitly via `RequestContext`.
- [ ] **Financial & Entity Standards**: Monetary amounts in integer cents; primary keys in RFC 9562 UUIDv7; timestamps in epoch ms.
- [ ] **Path Hygiene**: No machine-specific or absolute paths hardcoded; all paths use `node:path` relative lookups or standard env vars.
- [ ] **Automated Tests**: Unit/integration tests added in `test/` or `modules/<module_name>/test/` and pass with `npm test`.
- [ ] **Conventional Commits**: Commit messages follow the specification (e.g. `feat(scope): ...`).
- [ ] **CLA**: I have read and agree to the [Contributor License Agreement (CLA)](docs/legal/CLA.md).
