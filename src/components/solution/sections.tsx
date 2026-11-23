/** Solution Studio sections A–J. Source assessment facts are shown read-only. */
import { Link } from "@tanstack/react-router";
import { Panel, StatusPill, type Tone } from "@/components/app/ui-bits";
import { CollectionEditor } from "@/components/assessment/collection-editor";
import { FormSection } from "@/components/assessment/form-section";
import type { SolutionView } from "@/data/solution-studio";
import {
  APPROACHES,
  AVAILABILITY_LABEL,
  CATALOG_KINDS,
  CATALOG_READINESS,
  CRITERIA,
  DISPOSITIONS,
  FEASIBILITY,
  needCandidates,
  NEED_SOURCES,
  PARTNER_SOLUTION_FIELDS,
  PRIORITIES,
  PROVENANCE,
  REC_CATEGORIES,
  REC_STATUS,
  ROADMAP_STAGES,
  SPECULATIVE,
  type AIDesign,
  type Alternative,
  type Availability,
  type CatalogItem,
  type IntegrationDesign,
  type Recommendation,
  type RoadmapPhase,
  type SolutionNeed,
  type ValueItem,
} from "@/domain/solution";
import { useSolutionMutation } from "@/lib/solution-queries";

const AVAIL_TONE: Record<Availability, Tone> = {
  available: "success",
  conditional: "warning",
  proposed: "info",
  unsupported: "danger",
  not_applicable: "neutral",
};
const FEAS_TONE: Record<string, Tone> = {
  confirmed_working: "success",
  implemented_unvalidated: "warning",
  planned: "info",
  possible_uncommitted: "info",
  unknown: "neutral",
  not_supported: "danger",
};
const lines = (s: unknown) =>
  String(s ?? "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
const catName = (v: SolutionView, id: string, fallback?: string) => {
  const i = v.catalog.items.find((x) => x.id === id);
  return i ? `${i.product} — ${i.capability}` : `${fallback ?? id} (no longer in catalog)`;
};
function useChildMutations() {
  const up = useSolutionMutation((s) => s.upsertChild);
  const rm = useSolutionMutation((s) => s.removeChild);
  return { up, rm };
}

// ---------- A. Overview & baseline ----------
export function OverviewSection({ view }: { view: SolutionView }) {
  const { solution: s, workspace: ws, baseline: b, permissions, names } = view;
  const save = useSolutionMutation((x) => x.saveOverview);
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Assessment baseline (read-only)">
        {b ? (
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Customer / partner</dt>
              <dd>{s.subjectName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Assessment</dt>
              <dd>
                <Link to="/assessments/$assessmentId" params={{ assessmentId: s.assessmentId }} search={{}} className="underline">
                  {b.assessment.title}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Source snapshot</dt>
              <dd className="font-mono text-xs">
                {b.id} · v{b.version} · approved {b.approval.approvedAt.slice(0, 10)} by {names[b.approval.approvedBy] ?? "reviewer"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Solution owner / assigned</dt>
              <dd>
                {names[s.ownerId] ?? s.ownerId}
                {s.assignedUserIds.length > 0 && ` · ${s.assignedUserIds.map((u) => names[u] ?? u).join(", ")}`}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Assessment summary</dt>
              <dd className="text-muted-foreground">
                {b.systems.length} systems · {b.painPoints.length} pain points · {b.requirements.length} requirements ·{" "}
                {b.evidence.length} evidence entries · {b.outstandingQuestions.length} outstanding questions
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-destructive">The baseline snapshot is missing. This solution cannot be approved.</p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Assessment facts come from the approved snapshot and cannot be edited here.
        </p>
      </Panel>
      <Panel title="Solution overview">
        <FormSection
          columns={1}
          fields={[
            ["objectives", "Solution objectives"],
            ["executiveSummary", "Executive solution summary"],
            ["constraints", "Key constraints"],
            ["outstandingQuestions", "Outstanding questions"],
            ["assumptions", "Design assumptions"],
          ] as const}
          initial={ws.overview}
          canEdit={permissions.canEdit}
          onSave={(v) => save.mutateAsync([s.id, v])}
        />
      </Panel>
    </div>
  );
}

// ---------- B. Needs ----------
export function NeedsSection({ view }: { view: SolutionView }) {
  const { solution: s, workspace: ws, baseline: b, permissions } = view;
  const { up, rm } = useChildMutations();
  const candidates = b ? needCandidates(b) : [];
  const covered = (n: SolutionNeed) => ws.recommendations.some((r) => r.needIds.includes(n.id));
  const uncovered = ws.needs.filter(
    (n) => (n.priority === "high" || n.priority === "critical") && n.disposition === "addressed" && !covered(n),
  );
  return (
    <Panel title={`Needs & opportunities (${ws.needs.length})`}>
      {uncovered.length > 0 && (
        <p role="status" className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-xs">
          {uncovered.length} high-priority need(s) have no recommendation yet. Address them, or mark them deferred/excluded with a reason.
        </p>
      )}
      <CollectionEditor<SolutionNeed>
        items={ws.needs}
        canEdit={permissions.canEdit}
        emptyTitle="No needs selected"
        emptyBody="Pick the pain points, requirements, systems and risks from the approved assessment that this solution should address."
        addLabel="Select a need"
        itemLabel={(n) => n.source.label}
        fields={[
          {
            key: "source",
            label: "From the approved assessment",
            kind: "select",
            options: Object.fromEntries(candidates.map((c) => [`${c.kind}:${c.id}`, `${NEED_SOURCES[c.kind]} · ${c.label.slice(0, 70)}`])),
          },
          { key: "priority", label: "Priority", kind: "select", options: PRIORITIES },
          { key: "disposition", label: "Will be", kind: "select", options: DISPOSITIONS },
          { key: "impact", label: "Business impact", kind: "textarea" },
          { key: "outcome", label: "Intended outcome", kind: "text" },
          { key: "successCriterion", label: "Acceptance / success criterion", kind: "text" },
          { key: "dispositionNote", label: "Reason (required if deferred or excluded)", kind: "text" },
        ]}
        blank={() => ({ source: candidates[0] ? `${candidates[0].kind}:${candidates[0].id}` : "", priority: "medium", disposition: "addressed" })}
        fromItem={(n) => ({ ...n, source: `${n.source.kind}:${n.source.id}` })}
        toInput={(v) => {
          const [kind, ...rest] = String(v["source"] ?? "").split(":");
          return {
            source: { kind, id: rest.join(":") },
            priority: v["priority"],
            disposition: v["disposition"],
            impact: String(v["impact"] ?? ""),
            outcome: String(v["outcome"] ?? ""),
            successCriterion: String(v["successCriterion"] ?? ""),
            dispositionNote: String(v["dispositionNote"] ?? ""),
          };
        }}
        summary={(n) => (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill>{NEED_SOURCES[n.source.kind]}</StatusPill>
              <StatusPill tone={n.priority === "high" || n.priority === "critical" ? "warning" : "neutral"}>{PRIORITIES[n.priority]}</StatusPill>
              <StatusPill tone={n.disposition === "addressed" ? "info" : "neutral"}>{DISPOSITIONS[n.disposition]}</StatusPill>
              {n.sourceStatus !== "current" && <StatusPill tone="danger">Source {n.sourceStatus}</StatusPill>}
              {n.disposition === "addressed" && !covered(n) && <StatusPill tone="warning">Not covered</StatusPill>}
            </div>
            <p className="text-sm">{n.source.label}</p>
            {n.successCriterion && <p className="text-xs text-muted-foreground">Success: {n.successCriterion}</p>}
          </div>
        )}
        onSave={(d) => up.mutateAsync([s.id, "needs", d as never])}
        onRemove={(id) => rm.mutateAsync([s.id, "needs", id])}
      />
    </Panel>
  );
}

// ---------- C. Recommendations ----------
export function RecommendationsSection({ view }: { view: SolutionView }) {
  const { solution: s, workspace: ws, baseline: b, permissions, availability, names } = view;
  const { up, rm } = useChildMutations();
  return (
    <Panel title={`Recommendations (${ws.recommendations.length})`}>
      <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-xs">
        Recommendation status is your professional view. Product availability comes from the catalog, and a claim counts as
        verified only when its evidence or catalog entry supports it. Non-Aurumi, process and “defer” recommendations are
        equally valid.
      </p>
      <CollectionEditor<Recommendation>
        items={ws.recommendations}
        canEdit={permissions.canEdit}
        emptyTitle="No recommendations yet"
        addLabel="Add recommendation"
        itemLabel={(r) => r.title}
        fields={[
          { key: "title", label: "Title", kind: "text", required: true },
          { key: "category", label: "Category", kind: "select", options: REC_CATEGORIES },
          { key: "status", label: "Professional recommendation status", kind: "select", options: REC_STATUS },
          { key: "provenance", label: "Basis", kind: "select", options: PROVENANCE, help: "Verified bases are checked against cited evidence / catalog." },
          { key: "description", label: "Description", kind: "textarea" },
          { key: "needIds", label: "Addresses needs", kind: "multi", options: Object.fromEntries(ws.needs.map((n) => [n.id, n.source.label.slice(0, 50)])) },
          { key: "rationale", label: "Rationale", kind: "textarea" },
          { key: "approach", label: "Proposed operating approach", kind: "textarea" },
          { key: "expectedOutcome", label: "Expected outcome", kind: "text" },
          { key: "catalogItemIds", label: "Catalog offerings", kind: "multi", options: Object.fromEntries(view.catalog.items.map((i) => [i.id, `${i.product} — ${i.capability} (${CATALOG_READINESS[i.readiness]})`])) },
          { key: "evidenceIds", label: "Evidence from the assessment", kind: "multi", options: Object.fromEntries((b?.evidence ?? []).map((e) => [e.id, `${e.verification.state === "verified" ? "✓ " : ""}${e.statement.slice(0, 60)}`])) },
          { key: "dependsOn", label: "Depends on recommendations", kind: "multi", options: Object.fromEntries(ws.recommendations.map((r) => [r.id, r.title])) },
          { key: "mandatory", label: "Mandatory component", kind: "bool" },
          { key: "dependencies", label: "Other dependencies / prerequisites", kind: "textarea" },
          { key: "assumptions", label: "Key assumptions", kind: "textarea" },
          { key: "risks", label: "Risks & limitations", kind: "textarea" },
          { key: "fallback", label: "Alternative or fallback", kind: "text" },
          { key: "customer", label: "Customer responsibilities", kind: "text" },
          { key: "aurumi", label: "Aurumi responsibilities", kind: "text" },
          { key: "partner", label: "Partner responsibilities", kind: "text" },
        ]}
        blank={() => ({ category: "native_app", status: "proposed", provenance: "professional_judgment", needIds: [], catalogItemIds: [], evidenceIds: [], dependsOn: [], mandatory: true })}
        fromItem={(r) => ({
          ...r,
          catalogItemIds: r.catalogRefs.map((c) => c.itemId),
          evidenceIds: r.evidenceRefs.map((e) => e.evidenceId),
          ...r.responsibilities,
        })}
        toInput={(v) => {
          const t = (k: string) => String(v[k] ?? "");
          return {
            title: t("title"),
            category: t("category"),
            status: t("status"),
            provenance: t("provenance"),
            description: t("description"),
            needIds: (v["needIds"] as string[]) ?? [],
            rationale: t("rationale"),
            approach: t("approach"),
            expectedOutcome: t("expectedOutcome"),
            catalogItemIds: (v["catalogItemIds"] as string[]) ?? [],
            evidenceIds: (v["evidenceIds"] as string[]) ?? [],
            dependsOn: (v["dependsOn"] as string[]) ?? [],
            mandatory: !!v["mandatory"],
            dependencies: t("dependencies"),
            assumptions: t("assumptions"),
            risks: t("risks"),
            fallback: t("fallback"),
            responsibilities: { customer: t("customer"), aurumi: t("aurumi"), partner: t("partner") },
          };
        }}
        summary={(r) => {
          const av = availability[r.id] ?? "unsupported";
          return (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{r.title}</p>
                <StatusPill>{REC_CATEGORIES[r.category]}</StatusPill>
                <StatusPill tone={AVAIL_TONE[av]}>Availability: {AVAILABILITY_LABEL[av]}</StatusPill>
                <StatusPill tone="gold">{REC_STATUS[r.status]}</StatusPill>
                {r.justificationStale && <StatusPill tone="danger">Justification needs review</StatusPill>}
              </div>
              <p className="text-xs text-muted-foreground">
                Basis: {PROVENANCE[r.provenance]} · Owner: {names[r.ownerId] ?? r.ownerId}
                {r.catalogRefs.length > 0 && ` · ${r.catalogRefs.map((c) => catName(view, c.itemId, c.nameAtSelection)).join("; ")}`}
              </p>
              {r.rationale && <p className="text-sm">{r.rationale}</p>}
            </div>
          );
        }}
        onSave={(d) => up.mutateAsync([s.id, "recommendations", d as never])}
        onRemove={(id) => rm.mutateAsync([s.id, "recommendations", id])}
      />
    </Panel>
  );
}

// ---------- D. Catalog ----------
export function CatalogSection({ view }: { view: SolutionView }) {
  const groups = Object.keys(CATALOG_KINDS) as (keyof typeof CATALOG_KINDS)[];
  return (
    <Panel title={`Aurumi offering catalog · ${view.catalog.catalogVersion}`}>
      <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs">
        Read-only, illustrative mock catalog. DevHarmony owns apps and features, the connector registry owns connectors and AI
        Studio owns AI capabilities. Nothing here states a live integration, certification or commercial availability.
      </p>
      {groups.map((g) => {
        const items = view.catalog.items.filter((i) => i.kind === g);
        return (
          <section key={g} className="mb-5">
            <h3 className="mb-2 text-sm font-medium">{CATALOG_KINDS[g]}</h3>
            <ul className="grid gap-2 md:grid-cols-2">
              {items.map((i: CatalogItem) => (
                <li key={i.id} className="rounded-md border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{i.product}</p>
                    <StatusPill tone={i.readiness === "available" ? "success" : i.readiness === "not_supported" ? "danger" : "warning"}>
                      {CATALOG_READINESS[i.readiness]}
                    </StatusPill>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {i.capability} · {i.provider} · v{i.version} · <span className="font-mono">{i.id}</span>
                  </p>
                  {i.useCases.length > 0 && <p className="mt-1 text-xs">Use cases: {i.useCases.join("; ")}</p>}
                  {i.dependencies.length > 0 && <p className="text-xs">Depends on: {i.dependencies.join(", ")}</p>}
                  {i.actions.length > 0 && <p className="text-xs">Actions: {i.actions.join(", ")}</p>}
                  {i.limitations.length > 0 && <p className="text-xs text-muted-foreground">Limits: {i.limitations.join("; ")}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Source: {i.source} · verified {i.verifiedAt.slice(0, 10)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </Panel>
  );
}

// ---------- E. Integrations ----------
export function IntegrationsSection({ view }: { view: SolutionView }) {
  const { solution: s, workspace: ws, baseline: b, permissions } = view;
  const { up, rm } = useChildMutations();
  const connectors = view.catalog.items.filter((i) => i.kind === "connector");
  return (
    <Panel title={`Integration & interoperability (${ws.integrations.length})`}>
      <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-xs">
        An external API never makes an Aurumi connector implemented or supported. “Confirmed working” needs an available
        catalog connector and verified connector evidence linked to the system.
      </p>
      <CollectionEditor<IntegrationDesign>
        items={ws.integrations}
        canEdit={permissions.canEdit}
        emptyTitle="No integrations designed"
        addLabel="Add integration"
        itemLabel={(i) => i.systemName}
        fields={[
          { key: "systemId", label: "Existing system (from the assessment)", kind: "select", options: Object.fromEntries((b?.systems ?? []).map((x) => [x.id, `${x.name}${x.vendor ? ` · ${x.vendor}` : ""}`])) },
          { key: "feasibility", label: "Feasibility", kind: "select", options: FEASIBILITY },
          { key: "proposalKind", label: "Proposed approach", kind: "select", options: { none: "Not decided", connector: "Catalog connector", custom: "Custom integration" } },
          { key: "catalogItemId", label: "Catalog connector", kind: "select", options: { "": "—", ...Object.fromEntries(connectors.map((c) => [c.id, `${c.product} (${CATALOG_READINESS[c.readiness]})`])) } },
          { key: "dataRequired", label: "Required business data", kind: "text" },
          { key: "direction", label: "Direction", kind: "select", options: { unknown: "Unknown", inbound: "Into Aurumi", outbound: "Out of Aurumi", bidirectional: "Both ways" } },
          { key: "access", label: "Read / write", kind: "select", options: { unknown: "Unknown", read: "Read", write: "Write", read_write: "Read & write" } },
          { key: "mechanism", label: "Available integration mechanism", kind: "text" },
          { key: "authNotes", label: "Authentication & authorization", kind: "textarea" },
          { key: "securityNotes", label: "Security / privacy constraints", kind: "textarea" },
          { key: "technicalDependencies", label: "Technical dependencies", kind: "text" },
          { key: "evidenceIds", label: "Evidence", kind: "multi", options: Object.fromEntries((b?.evidence ?? []).map((e) => [e.id, `${e.verification.state === "verified" ? "✓ " : ""}${e.statement.slice(0, 60)}`])) },
          { key: "validationOwner", label: "Owner for integration validation", kind: "text" },
          { key: "openQuestions", label: "Unresolved questions", kind: "textarea" },
        ]}
        blank={() => ({ systemId: b?.systems[0]?.id ?? "", feasibility: "unknown", proposalKind: "none", catalogItemId: "", direction: "unknown", access: "unknown", evidenceIds: [] })}
        fromItem={(i) => ({ ...i, proposalKind: i.proposal.kind, catalogItemId: i.proposal.catalogRef?.itemId ?? "" })}
        toInput={(v) => {
          const t = (k: string) => String(v[k] ?? "");
          return {
            systemId: t("systemId"),
            feasibility: t("feasibility"),
            proposalKind: t("proposalKind"),
            ...(t("catalogItemId") ? { catalogItemId: t("catalogItemId") } : {}),
            dataRequired: t("dataRequired"),
            direction: t("direction"),
            access: t("access"),
            mechanism: t("mechanism"),
            authNotes: t("authNotes"),
            securityNotes: t("securityNotes"),
            technicalDependencies: t("technicalDependencies"),
            evidenceIds: (v["evidenceIds"] as string[]) ?? [],
            validationOwner: t("validationOwner"),
            openQuestions: t("openQuestions"),
          };
        }}
        summary={(i) => (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{i.systemName}</p>
              <StatusPill tone={FEAS_TONE[i.feasibility] ?? "neutral"}>{FEASIBILITY[i.feasibility]}</StatusPill>
              {SPECULATIVE.includes(i.feasibility) && <StatusPill tone="warning">Speculative — not confirmed functionality</StatusPill>}
            </div>
            <p className="text-xs text-muted-foreground">
              {i.proposal.catalogRef ? catName(view, i.proposal.catalogRef.itemId, i.proposal.catalogRef.nameAtSelection) : i.proposal.kind === "custom" ? "Custom integration" : "Approach not decided"}
              {i.validationOwner && ` · validates: ${i.validationOwner}`}
            </p>
          </div>
        )}
        onSave={(d) => up.mutateAsync([s.id, "integrations", d as never])}
        onRemove={(id) => rm.mutateAsync([s.id, "integrations", id])}
      />
    </Panel>
  );
}

// ---------- F. AI ----------
export function AISection({ view }: { view: SolutionView }) {
  const { solution: s, workspace: ws, permissions } = view;
  const { up, rm } = useChildMutations();
  const aiRecs = ws.recommendations.filter((r) => r.category === "ai");
  return (
    <Panel title={`AI & conversational design (${ws.aiDesigns.length})`}>
      <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs">
        Designing a workflow grants no permission to run it. DevHarmony stays authoritative for permissions and action IDs,
        and Aura Runtime enforces them at execution. Only capabilities in the catalog can be mapped.
      </p>
      {aiRecs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add an “AI capability / conversational workflow” recommendation first.</p>
      ) : (
        <CollectionEditor<AIDesign>
          items={ws.aiDesigns}
          canEdit={permissions.canEdit}
          emptyTitle="No AI designs yet"
          addLabel="Add AI design"
          itemLabel={(d) => d.intent || "AI design"}
          fields={[
            { key: "recommendationId", label: "Recommendation", kind: "select", options: Object.fromEntries(aiRecs.map((r) => [r.id, r.title])) },
            { key: "exampleQuestions", label: "Example user questions (one per line)", kind: "textarea" },
            { key: "intent", label: "Business intent & desired result", kind: "textarea" },
            { key: "capabilityItemIds", label: "Required catalog capabilities", kind: "multi", options: Object.fromEntries(view.catalog.items.filter((i) => i.kind !== "roadmap").map((i) => [i.id, `${i.product} — ${i.capability}`])) },
            { key: "businessSkills", label: "Relevant Business Skills", kind: "text" },
            { key: "actionsAndWorkflows", label: "Underlying actions & workflow dependencies", kind: "textarea" },
            { key: "rolesAndScopes", label: "Expected user roles and scopes", kind: "text" },
            { key: "mode", label: "Behaviour", kind: "select", options: { read: "Read only", write: "Write / takes actions" } },
            { key: "humanConfirmation", label: "Requires human confirmation", kind: "bool" },
            { key: "sensitiveDataRisks", label: "Sensitive information risks", kind: "textarea" },
            { key: "fallback", label: "Failure & fallback handling", kind: "textarea" },
          ]}
          blank={() => ({ recommendationId: aiRecs[0]?.id ?? "", mode: "read", humanConfirmation: false, capabilityItemIds: [] })}
          fromItem={(d) => ({ ...d, exampleQuestions: d.exampleQuestions.join("\n"), capabilityItemIds: d.capabilityRefs.map((c) => c.itemId) })}
          toInput={(v) => {
            const t = (k: string) => String(v[k] ?? "");
            return {
              recommendationId: t("recommendationId"),
              exampleQuestions: lines(v["exampleQuestions"]),
              intent: t("intent"),
              capabilityItemIds: (v["capabilityItemIds"] as string[]) ?? [],
              businessSkills: t("businessSkills"),
              actionsAndWorkflows: t("actionsAndWorkflows"),
              rolesAndScopes: t("rolesAndScopes"),
              mode: t("mode"),
              humanConfirmation: !!v["humanConfirmation"],
              sensitiveDataRisks: t("sensitiveDataRisks"),
              fallback: t("fallback"),
            };
          }}
          summary={(d) => (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={d.mode === "write" ? "warning" : "info"}>{d.mode === "write" ? "Takes actions" : "Read only"}</StatusPill>
                {d.humanConfirmation && <StatusPill>Human confirmation</StatusPill>}
              </div>
              {d.exampleQuestions.map((q) => (
                <p key={q} className="text-sm italic">“{q}”</p>
              ))}
              <p className="text-xs text-muted-foreground">{d.capabilityRefs.map((c) => catName(view, c.itemId, c.nameAtSelection)).join("; ") || "No capabilities mapped"}</p>
            </div>
          )}
          onSave={(d) => up.mutateAsync([s.id, "aiDesigns", d as never])}
          onRemove={(id) => rm.mutateAsync([s.id, "aiDesigns", id])}
        />
      )}
    </Panel>
  );
}

// ---------- G. Architecture ----------
export function ArchitectureSection({ view }: { view: SolutionView }) {
  const { workspace: ws, dependencies: dep } = view;
  const title = (id: string) => ws.recommendations.find((r) => r.id === id)?.title ?? id;
  return (
    <div className="flex flex-col gap-6">
      {(dep.missing.length > 0 || dep.cycles.length > 0 || dep.catalogGaps.length > 0) && (
        <Panel title="Dependency problems">
          <ul className="flex flex-col gap-1 text-sm text-destructive">
            {dep.cycles.map((c, i) => (
              <li key={`c${i}`}>Circular: {c.map(title).join(" → ")}</li>
            ))}
            {dep.missing.map((m) => (
              <li key={`${m.from}${m.to}`}>{title(m.from)} depends on a missing recommendation ({m.to})</li>
            ))}
            {dep.catalogGaps.map((g) => (
              <li key={`${g.recommendationId}${g.needs}`}>
                {title(g.recommendationId)}: {catName(view, g.itemId)} needs {catName(view, g.needs)}, which isn’t in the solution
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <Panel title="Need → recommendation → capability → integration → outcome">
        {ws.recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add recommendations to see the dependency view.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ws.recommendations.map((r) => {
              const ints = ws.integrations.filter((i) => i.proposal.catalogRef && r.catalogRefs.some((c) => c.itemId === i.proposal.catalogRef!.itemId));
              return (
                <li key={r.id} className="rounded-md border bg-card p-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    Needs: {r.needIds.map((n) => ws.needs.find((x) => x.id === n)?.source.label.slice(0, 40)).join("; ") || "—"}
                  </p>
                  <p className="font-medium">
                    → {r.title} {r.mandatory ? "(mandatory)" : "(optional)"}
                  </p>
                  <p className="text-xs">→ {r.catalogRefs.map((c) => catName(view, c.itemId, c.nameAtSelection)).join("; ") || "No catalog offering"}</p>
                  <p className="text-xs">→ {ints.map((i) => `${i.systemName}: ${FEASIBILITY[i.feasibility]}`).join("; ") || "No integration"}</p>
                  <p className="text-xs">→ {r.expectedOutcome || "Outcome not stated"}</p>
                  {r.dependsOn.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Depends on: {r.dependsOn.map(title).join(", ")}</p>}
                  {(r.responsibilities.customer || r.responsibilities.aurumi || r.responsibilities.partner) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Customer: {r.responsibilities.customer || "—"} · Aurumi: {r.responsibilities.aurumi || "—"} · Partner: {r.responsibilities.partner || "—"}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// ---------- H. Value ----------
export function ValueSection({ view }: { view: SolutionView }) {
  const { solution: s, workspace: ws, permissions } = view;
  const { up, rm } = useChildMutations();
  return (
    <Panel title={`Value & business case (${ws.values.length})`}>
      <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs">
        Record conservative, sourced assumptions. The app never calculates ROI, savings or cost; any amount is an estimate you
        enter with its assumptions and source. Pricing belongs to Proposal Studio.
      </p>
      <CollectionEditor<ValueItem>
        items={ws.values}
        canEdit={permissions.canEdit}
        emptyTitle="No benefits recorded"
        addLabel="Add benefit"
        itemLabel={(v) => v.description}
        fields={[
          { key: "description", label: "Benefit", kind: "text", required: true },
          { key: "kind", label: "Type", kind: "select", options: { qualitative: "Qualitative", measurable: "Measurable" } },
          { key: "baseline", label: "Current baseline", kind: "text" },
          { key: "target", label: "Proposed target", kind: "text" },
          { key: "method", label: "Measurement method", kind: "text" },
          { key: "timeToValue", label: "Time to value", kind: "text" },
          { key: "confidence", label: "Confidence", kind: "select", options: { unknown: "Unknown", low: "Low", medium: "Medium", high: "High" } },
          { key: "assumptionSource", label: "Source of assumptions", kind: "text" },
          { key: "amount", label: "Estimated amount (optional)", kind: "text" },
          { key: "currency", label: "Currency", kind: "text" },
          { key: "estimateAssumptions", label: "Estimate assumptions", kind: "text" },
          { key: "estimateSource", label: "Estimate source", kind: "text" },
          { key: "risks", label: "Risks to realization", kind: "textarea" },
        ]}
        blank={() => ({ kind: "qualitative", confidence: "unknown" })}
        fromItem={(v) => ({
          ...v,
          amount: v.estimate ? String(v.estimate.amount) : "",
          currency: v.estimate?.currency ?? "",
          estimateAssumptions: v.estimate?.assumptions ?? "",
          estimateSource: v.estimate?.source ?? "",
        })}
        toInput={(v) => {
          const t = (k: string) => String(v[k] ?? "");
          const amount = t("amount").trim();
          return {
            description: t("description"),
            kind: t("kind"),
            baseline: t("baseline"),
            target: t("target"),
            method: t("method"),
            timeToValue: t("timeToValue"),
            confidence: t("confidence"),
            assumptionSource: t("assumptionSource"),
            risks: t("risks"),
            ...(amount
              ? { estimate: { amount: Number(amount), currency: t("currency"), assumptions: t("estimateAssumptions"), source: t("estimateSource") } }
              : {}),
          };
        }}
        summary={(v) => (
          <div className="flex flex-col gap-1">
            <p className="font-medium">{v.description}</p>
            <p className="text-xs text-muted-foreground">
              {v.baseline && `From ${v.baseline} `}
              {v.target && `to ${v.target} · `}confidence {v.confidence} · source: {v.assumptionSource || "not stated"}
            </p>
            {v.estimate && (
              <p className="text-xs">
                <StatusPill tone="warning">Estimate</StatusPill> {v.estimate.currency} {v.estimate.amount.toLocaleString()} — {v.estimate.assumptions} ({v.estimate.source})
              </p>
            )}
          </div>
        )}
        onSave={(d) => up.mutateAsync([s.id, "values", d as never])}
        onRemove={(id) => rm.mutateAsync([s.id, "values", id])}
      />
    </Panel>
  );
}

// ---------- I. Roadmap ----------
export function RoadmapSection({ view }: { view: SolutionView }) {
  const { solution: s, workspace: ws, permissions } = view;
  const { up, rm } = useChildMutations();
  const order = Object.keys(ROADMAP_STAGES);
  const items = [...ws.roadmap].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  return (
    <Panel title={`Implementation roadmap (${ws.roadmap.length})`}>
      <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs">Every phase is a planning assumption. Durations are indicative, never committed dates.</p>
      <CollectionEditor<RoadmapPhase>
        items={items}
        canEdit={permissions.canEdit}
        emptyTitle="No roadmap phases"
        addLabel="Add phase"
        itemLabel={(r) => ROADMAP_STAGES[r.stage]}
        fields={[
          { key: "stage", label: "Phase", kind: "select", options: ROADMAP_STAGES },
          { key: "indicativeDuration", label: "Indicative duration", kind: "text" },
          { key: "deliverables", label: "Deliverables", kind: "textarea" },
          { key: "dependencies", label: "Dependencies", kind: "text" },
          { key: "owners", label: "Owners / responsibilities", kind: "text" },
          { key: "acceptanceCriteria", label: "Acceptance criteria", kind: "textarea" },
          { key: "risks", label: "Risks", kind: "text" },
          { key: "customerActions", label: "Customer actions", kind: "text" },
        ]}
        blank={() => ({ stage: "foundation" })}
        toInput={(v) => Object.fromEntries(["stage", "indicativeDuration", "deliverables", "dependencies", "owners", "acceptanceCriteria", "risks", "customerActions"].map((k) => [k, String(v[k] ?? "")]))}
        summary={(r) => (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{ROADMAP_STAGES[r.stage]}</p>
              <StatusPill>Planning assumption</StatusPill>
              {r.indicativeDuration && <span className="text-xs text-muted-foreground">~{r.indicativeDuration}</span>}
            </div>
            {r.deliverables && <p className="text-sm">{r.deliverables}</p>}
          </div>
        )}
        onSave={(d) => up.mutateAsync([s.id, "roadmap", d as never])}
        onRemove={(id) => rm.mutateAsync([s.id, "roadmap", id])}
      />
    </Panel>
  );
}

// ---------- J. Alternatives ----------
export function AlternativesSection({ view }: { view: SolutionView }) {
  const { solution: s, workspace: ws, permissions } = view;
  const { up, rm } = useChildMutations();
  const save = useSolutionMutation((x) => x.saveOverview);
  return (
    <div className="flex flex-col gap-6">
      <Panel title={`Alternatives & trade-offs (${ws.alternatives.length})`}>
        <CollectionEditor<Alternative>
          items={ws.alternatives}
          canEdit={permissions.canEdit}
          emptyTitle="No alternatives compared"
          emptyBody="Compare at least two approaches, including deferring or improving existing software."
          addLabel="Add approach"
          itemLabel={(a) => APPROACHES[a.approach]}
          fields={[
            { key: "approach", label: "Approach", kind: "select", options: APPROACHES },
            { key: "preferred", label: "Preferred approach", kind: "bool" },
            { key: "summary", label: "Summary", kind: "textarea" },
            ...CRITERIA.map(([k, l]) => ({ key: k, label: l, kind: "text" as const })),
            { key: "limitations", label: "Limitations & trade-offs", kind: "textarea" },
          ]}
          blank={() => ({ approach: "aurumi_led", preferred: false })}
          fromItem={(a) => ({ ...a, ...a.criteria })}
          toInput={(v) => ({
            approach: v["approach"],
            preferred: !!v["preferred"],
            summary: String(v["summary"] ?? ""),
            limitations: String(v["limitations"] ?? ""),
            criteria: Object.fromEntries(CRITERIA.map(([k]) => [k, String(v[k] ?? "")]).filter(([, x]) => x)),
          })}
          summary={(a) => (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{APPROACHES[a.approach]}</p>
                {a.preferred && <StatusPill tone="gold">Preferred</StatusPill>}
              </div>
              {a.summary && <p className="text-sm">{a.summary}</p>}
              <p className="text-xs text-muted-foreground">
                {CRITERIA.filter(([k]) => a.criteria[k]).map(([k, l]) => `${l}: ${a.criteria[k]}`).join(" · ")}
              </p>
              {a.limitations && <p className="text-xs">Trade-offs: {a.limitations}</p>}
            </div>
          )}
          onSave={(d) => up.mutateAsync([s.id, "alternatives", d as never])}
          onRemove={(id) => rm.mutateAsync([s.id, "alternatives", id])}
        />
      </Panel>
      <Panel title="Why the preferred approach">
        <FormSection
          columns={1}
          fields={[["preferredRationale", "Rationale for the preferred approach"]] as const}
          initial={{ preferredRationale: ws.overview.preferredRationale }}
          canEdit={permissions.canEdit}
          onSave={(v) => save.mutateAsync([s.id, v])}
        />
      </Panel>
    </div>
  );
}

// ---------- Partner ----------
export function PartnerSection({ view }: { view: SolutionView }) {
  const { solution: s, workspace: ws, permissions } = view;
  const save = useSolutionMutation((x) => x.savePartner);
  return (
    <Panel title="Partner solution">
      <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-xs">
        No partnership is agreed. This design records a hypothesis and the validation it needs — no commercial terms are implied.
      </p>
      <FormSection
        columns={1}
        fields={PARTNER_SOLUTION_FIELDS}
        initial={Object.fromEntries(PARTNER_SOLUTION_FIELDS.map(([k]) => [k, ws.partner?.[k] ?? ""])) as Record<(typeof PARTNER_SOLUTION_FIELDS)[number][0], string>}
        canEdit={permissions.canEdit}
        onSave={(v) => save.mutateAsync([s.id, v])}
      />
    </Panel>
  );
}
