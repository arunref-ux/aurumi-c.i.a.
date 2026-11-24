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

Additional reproduction D05 (P1): Solution child write/approval/rebase captures state before an asynchronous catalog read, then can overwrite newer work or approve a returned record. Controlled interleaving tests in `phase7-solution-concurrency.test.ts` establish the observed behavior before correction. Minimal fingerprint/re-authorization guard proposed; no integrity contract changes.

D06 (P2): malformed restored partner `hypothesis: 7` passes the loose shell and `solutionReadiness` invokes `.trim()` on it; archived revisions likewise accept malformed nested children. Boundary regressions preserve valid live/sibling content and require intact quarantine. Targeted restoration validation only; immutable historical snapshots and hash contracts unchanged.

## Final dispositions
- D01/D02 resolved: deterministic UTC/locale formatting; browser-local Overview deferred until hydration; enabled permission-aware studio links. Fresh persisted desktop/mobile navigation has no page errors.
- D03/D04 resolved for sampled outputs: proposal ID/version/status and distinct tax periods/basis; completion identity, obligation status, concerns and authorization comments. Actual A4 pages rendered and inspected.
- DF01 resolved impossible new-share expiry: Feb 30 now rejected; valid existing Phase 4 actions remain passing. Historical issued sharing remains simulated and does not grant fresh approval/issue.
- D05 confirmed P1, resolved: three controlled interleaving regressions failed before correction and pass afterward. Catalog-await decisions re-authorize/fingerprint actor/source/current content; stale reads fetch catalog before scoped record reads. No released hash changes.
- D06 confirmed P2, resolved: malformed mutable partner fields isolated/blanked with original quarantine; invalid revision quarantined intact; live and valid sibling records retained. Two boundary regressions pass.
- D07 P2 mobile navigation: opening did not focus dialog, Escape did not close; resolved focus containment/opener restoration and scroll lock, verified at tablet/mobile sizes.
- D08 P2 intake select accessible names included option contents, preventing exact identification; added explicit names for status/professional/type. Fresh actual browser conversion and linked assessment read-back pass.
- DF02: exact connector evidence and scope validation already exist; no reclassification from labels alone. Await risks corrected as D05. Canonical product/version compatibility remains a production integration dependency.
- DF03: partner/revision validation corrected as D06. Structured references already exist. Roadmap remains indicative planning, not a scheduler: accepted prototype P2, no new planning engine.
- DF04: additional draft/withdrawal UX accepted prototype P2; existing service lifecycle remains governed. No new workflow states added.
- DF05: production identity/storage/privacy/legal/integrations/monitoring are explicitly excluded, remain production prerequisites.

No remaining demonstrated application P0/P1 after executed retests. This does not close Phase 7: final-SHA CI and independent Codex GO are outstanding. Full clicked browser execution of every J01–J10 and amended/180-minute report printing are explicitly not claimed. A long new complete-chain test exceeded Vitest's default 5s under full parallel load; only that test gets a 30s timeout, with all assertions preserved. Fixture-input mistakes were corrected to real accepted contracts, not by relaxing application validation.
