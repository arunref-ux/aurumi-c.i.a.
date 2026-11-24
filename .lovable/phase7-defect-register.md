# Phase 7 defect and deferred-item register

Severity: P0 critical, P1 release blocker, P2 nonblocking defect/usability, P3 enhancement. Resolved historical findings are not reopened without reproduced regression.

| ID | Severity | Reproduction / impact | Modules | Proposed correction / disposition | Evidence / final retest |
|---|---|---|---|---|---|
| D01 | P2 | Supplied runtime telemetry shows server `11/21/2026` vs browser `21/11/2026` hydration mismatch; Overview date formatting uses unspecified locale | Overview and similar visible dates | Use deterministic display locale/time zone; verify server/browser variants | Confirmed telemetry; retest pending |
| D02 | P2 | Overview shows disabled creation buttons marked “Available in a later phase” although all studios are implemented | Overview | Replace misleading placeholders with permission-aware links to implemented studios | Static confirmed; browser retest pending |
| D03 | P2 | Proposal tax/billing period and printed identity/version deferred | Proposal | Inspect actual document/PDF before minimal correction | Not yet reproduced |
| D04 | P2 | Completion amendment/concern/identity presentation deferred | Engagement reports | Inspect actual report/PDF before minimal correction | Not yet reproduced |
| DF01 | P2 | Share impossible-calendar expiry and historical unmarked simulated sharing | Proposal | Validate concrete counterexample and distinguish history-only compatibility from new actions | Pending |
| DF02 | P2 | Assessment connector evidence binding, Solution catalog scope/async stale writes | Assessment/Solution | Inspect approved tests and concrete counterexamples; no unsupported regression claims | Pending |
| DF03 | P2 | Malformed nested partner/revision persistence, structured action refs, roadmap sequencing | Solution | Inspect `.lovable/phase3-deferred.md`; targeted testing or documented prototype acceptance | Pending |
| DF04 | P2 | Draft/withdrawal workflow refinements | Engagements | Evaluate current supported states, then prototype acceptance or minimal correction | Pending |
| DF05 | P3 | Production identity, storage, integrations, signatures, monitoring | All | Production-hardening matrix only; explicitly excluded implementation | Open by design |

No confirmed P0/P1 findings at inventory time; this is not a release exit verdict.