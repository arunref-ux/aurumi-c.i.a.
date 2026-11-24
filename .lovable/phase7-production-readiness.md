# Production readiness — not production authorization

Classification: controlled fictional prototype candidate only, pending exact final-SHA CI and independent Codex GO. No production infrastructure was introduced or published.

| Area | Prototype implementation | Missing prerequisite | Priority / owner |
|---|---|---|---|
| Identity/authorization | Seeded selector, six scoped service roles, independent decisions | Server-authenticated identity, tenant isolation, role administration and adversarial security verification | P0 / security + platform |
| Durable persistence | Browser-local validated storage, acknowledged writes, rollback, quarantine, retries | Transactional server persistence, concurrency control, backups/restore drills, retention, migration strategy | P0 / platform |
| Integrity/evidence | Explicit versioned browser consistency contracts, exact-version verification and historical assurance | Authenticated server records, tamper-resistant audit, evidence custody/retention, authorization review | P0 / security + governance |
| Public Business Fit | Isolated local bearer handles, pinned definitions, consented simulated leads | Secure server sessions, abuse/rate controls, privacy notice, consent/withdrawal/retention, protected contact storage | P0 / security + privacy |
| Aurumi integrations | Typed mock adapters, pinned capability/pricing sources | Authorized endpoints/accounts, scopes, idempotency, retries, reconciliation, webhook verification, monitoring | P1 / each owning Aurumi app |
| Commercial/legal | Illustrative prices, configured sourced taxes, simulated acceptance | Approved pricing/tax policy, agreement templates, enforceable signature workflow, actual authorization/commission/payment rules | P0 / commercial + legal |
| Security/privacy | Scoped projections and validation | Threat model, penetration testing, encryption, secret handling, access logs, residency, deletion/export, incident procedures | P0 / security + privacy |
| Operations | Local test/print evidence | Production deployment approval, observability/SLOs, alerting, incident and support runbooks, accessibility review, browser/device matrix | P1 / operations + QA |

Real-customer use is blocked until P0 prerequisites are authorized, implemented and independently verified. P1s need an agreed pilot gate. Browser-storage hashes are not cryptographic authentication. Operational free text is not automatically sanitized. Recovery retries protection locally without an administrative identity; production recovery access policy must be explicitly established.

## Integration ownership
ShopTalk owns CRM/lead/opportunity authority; Tasks & Calendar owns real tasks/reviews; Demand Studio owns unmet requirements; DevHarmony/connector registry/AI Studio own verified capabilities; Pricing Studio owns prices; Tenant Success/Health owns telemetry; File Hub owns evidence custody; Employee Info owns upstream identity references. Specialized adapters are wired to actual mock journeys; generic document/demand registry entries are diagnostic placeholders. Research is curated/unverified; health is fixed illustrative signals. No production endpoints, email, public share link or live signature is invented.

## Final corrective pass (P7-P1-01 and print acceptance)

- **P7-P1-01 reproduction:** `issue()` wrote version, workspace, parent status and audit as separate best-effort saves; a failed write left memory `shared` but storage `approved` (A), or a saved issuance with an `approved` parent that could not be retried (B).
- **Root cause:** issuance did not use the acknowledged `store.durable` commit used by Phases 5–6.
- **Correction:** all issuance changes run inside one `store.durable` commit (one storage write plus read-back). On failure memory and audit roll back, no success is returned; unacknowledged read-back puts the store into protected recovery, and `retryRecovery()` reconciles to the stored copy. The version/parent write boundary no longer exists.
- **Existing partial records:** a version carrying an issuance record under an `approved` parent is rejected with an explicit "only partially saved" message and left untouched; it is never silently completed. No migration.
- **Concurrency:** validation and commit are synchronous after the price-book await, so a second request sees the issuance and is rejected; one audit entry.
- **Tests:** `src/test/phase7-durable-issuance.test.ts` (A, B, B2, C, D, E; real services, injected write and read-back failures, persisted and in-memory assertions including audit). Historical fixtures unchanged and passing. Proposal fixtures now attach an in-memory store because issuance requires acknowledged storage.
- **Print:** five A4 PDFs preserved in `qa-evidence/phase7-print/` with `MANIFEST.md` (checksums, browser, settings). One print defect fixed (amounts split in the line table).
- **Validation:** Vitest 674/674 (667 retained + 7 new), `tsgo -b --noEmit` 0 errors, ESLint 0 errors/31 warnings, automatic build OK, browser issuance → reload shows `shared` with one audit entry. Exact-SHA GitHub Actions for the new commit: not yet verified.
- **Limits:** "acknowledged" means a synchronous browser-storage write confirmed by read-back, not a production transaction.
