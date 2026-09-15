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

## Contributor Checklist
Please verify each of the following before submitting:
- [ ] **Zero External Runtime Dependencies**: Relies solely on Node.js built-ins and native PHP standard extensions. No runtime packages added.
- [ ] **Strict Multi-Tenancy**: All operational queries filter by `tenant_id` resolved implicitly via `RequestContext`.
- [ ] **Financial & Entity Standards**: Monetary amounts in integer cents; primary keys in RFC 9562 UUIDv7; timestamps in epoch ms.
- [ ] **Automated Tests**: Unit/integration tests added in `test/` or `modules/<module_name>/test/` and pass with `npm test`.
- [ ] **Conventional Commits**: Commit messages follow the specification (e.g. `feat(scope): ...`).
- [ ] **CLA**: I have read and agree to the [Contributor License Agreement (CLA)](docs/legal/CLA.md).
