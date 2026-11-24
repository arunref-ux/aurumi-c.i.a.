<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Architecture (C.I.A. Workspace)
- Domain types live in `src/domain/types.ts`; every entity extends BaseRecord (immutable id, audit fields, organizationId) so persistence can be swapped later.
- Authorization is enforced in `src/data/repositories.ts` via `can()` from `src/domain/permissions.ts`; UI hiding is never the only check, because the spec requires service-layer enforcement.
- Data is simulated in-memory (`src/data/store.ts`) behind repositories; screens never import the store, and every read/write is deep-copied, so callers cannot mutate stored state.
- Repository writes take explicit input types checked against runtime field allowlists; assignment, parent and protected status changes are validated in the service, so generic update can't bypass dedicated workflows.
- Research data uses the shared `ResearchFinding` provenance shape validated in `src/domain/research.ts`, so AI inference stays distinguishable from verified fact.
- Other Aurumi apps are reached only through typed adapters in `src/integrations/adapters/` (mock implementations, status "mock"); never invent production endpoints.
- Dashboard numbers are derived from records in `src/domain/metrics.ts`, never stored counters.
- Primary navigation is defined once in `src/components/app/nav.ts`.
- Work proceeds in phases; do not start a new phase without explicit user approval.
- Assessment Studio uses the Promise-based service in `src/data/assessment-studio.ts` (screens use the hooks in `src/lib/assessment-queries.ts`), so a production API can replace the simulated store without UI changes.
- Assessment child records live in one workspace per assessment and inherit the parent's authorization; review statuses (under_review/approved/returned) change only through the service workflow, never via generic updates.
- Approved assessments produce versioned, deep-frozen hand-off snapshots (`src/domain/assessment.ts`) that are never edited, so Solution Studio consumes a stable record.
- Simulated persistence saves work tables to browser storage behind `store.attach()`; directory tables always reload from seed, and saved work always wins over seed.
- Evidence verification survives only non-material edits (`materialEvidenceKey` in `src/domain/assessment.ts`, which includes linked systems/requirements); material changes clear it and re-verification goes through `verifyEvidence`, so a verifier never vouches for content they did not see.
- Positive connector compatibility needs verified evidence whose `applicability` matches that exact status and is linked to the system; statuses are never promoted, because an external API is not an Aurumi connector.
- Hand-off snapshots embed full question definitions plus the question-bank id/version, so they stay interpretable after working questions change.
- Assessment queries key on `store.dataVersion()`, which audit events never move, so logged denials cannot cause refetch loops.
- Restored browser data passes `src/data/persisted-schema.ts`; invalid rows/fields are quarantined with the full original payload, confirmed by read-back; until that copy exists the store is protected (writes and reset throw, nothing persists) and `retryRecovery()` is the only way out, so saved work is never silently lost or overwritten.
- Solution Studio (`src/data/solution-studio.ts`, hooks in `src/lib/solution-queries.ts`) builds solutions only from compatible approved assessment snapshots (schema /2) and pins the baseline; changing it requires the audited `rebase`, which archives the prior revision, so solutions never drift with assessment edits.
- Solution availability, provenance and integration feasibility are derived/validated against the baseline snapshot and the read-only versioned catalog adapter (`src/integrations/adapters/solution-catalog.ts`); labels alone never make a claim verified.
- Solution approval (`solution.approve`, owner/assignees excluded) creates deep-frozen solution hand-off snapshots that embed referenced catalog items and cited evidence, so Proposal Studio never depends on mutable records or current catalog values.
- Recommendation catalog claims must include an item of the kind their category claims (connector→connector, native app→app, AI→AI capability); connector feasibility above "possible" is checked against the catalog `connector` scope (system, direction, operations) and evidence naming that exact connector, so mixed dependencies are allowed but labels never upgrade claims.
- Dependency analysis collects catalog refs from selected recommendations, integrations and AI designs and resolves transitive catalog dependencies; "not recommended" items never satisfy prerequisites, so readiness/approval can't pass with hidden gaps.
- Solution hand-offs (schema /2) embed the full source assessment snapshot and the catalog dependency closure and are checked with `unresolvedHandoffRefs` before saving, so approved solutions are interpretable without live records.
- Proposal Studio rules (source pinning, derived commercials, version-bound approval, simulated sharing) live in `src/data/AGENTS.md`.
- Phase 6 uses dedicated Promise-based services and typed nested delivery/network records behind the shared store; existing professional/user identities are referenced rather than duplicated. Material commits use acknowledged `store.durable`, so failed saves never report completion. Phase 6 immutable records use a separate canonical integrity contract and fail-closed relationship restoration; earlier-phase algorithms remain untouched.
