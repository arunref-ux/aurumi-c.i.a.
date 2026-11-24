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