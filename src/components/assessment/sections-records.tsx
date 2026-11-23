/** Inventory, processes, requirements and evidence sections. */
import { useState } from "react";
import { Panel, StatusPill, type Tone } from "@/components/app/ui-bits";
import type { WorkspaceView } from "@/data/assessment-studio";
import {
  API_AVAILABILITY,
  COMPATIBILITY,
  DEPLOYMENTS,
  evidenceLabel,
  FINDING_FIELDS,
  FREQUENCY,
  LEVELS,
  POSITIVE_COMPATIBILITY,
  REQUIREMENT_CATEGORIES,
  SATISFACTION,
  SYSTEM_CLASSIFICATIONS,
  type EvidenceRecord,
  type InventorySystem,
} from "@/domain/assessment";
import type { EvidenceStatus, ResearchFinding } from "@/domain/types";
import { research } from "@/integrations/adapters/mock";
import { useStudioMutation } from "@/lib/assessment-queries";
import { CollectionEditor } from "./collection-editor";
import { btnGhost, ErrorNote } from "./fields";

const opts = (list: { id: string }[], label: (x: never) => string) =>
  Object.fromEntries(list.map((x) => [x.id, label(x as never)]));

const COMPAT_TONE: Record<string, Tone> = {
  unknown: "neutral",
  not_supported: "danger",
  planned: "info",
  beta: "warning",
  supported: "success",
};
export const EVIDENCE_TONE: Partial<Record<EvidenceStatus, Tone>> = {
  confirmed_fact: "success",
  research_finding: "info",
  ai_inference: "warning",
  professional_assumption: "neutral",
};

export function EvidenceBadge({ e }: { e: Pick<ResearchFinding, "status" | "verification"> }) {
  return <StatusPill tone={EVIDENCE_TONE[e.status] ?? "neutral"}>{evidenceLabel(e)}</StatusPill>;
}

// ---------- Systems ----------
export function SystemsSection({ view }: { view: WorkspaceView }) {
  const { assessment: a, workspace: ws, permissions } = view;
  const up = useStudioMutation((s) => s.upsertChild);
  const rm = useStudioMutation((s) => s.removeChild);
  const verified = ws.evidence.filter((e) => e.verification.state === "verified");
  return (
    <Panel title={`Current software & systems (${ws.systems.length})`}>
      <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-xs">
        Listing a system here never means Aurumi has a connector for it. Connector compatibility is
        tracked separately and stays <strong>Unknown</strong> until verified evidence says
        otherwise.
      </p>
      <CollectionEditor<InventorySystem>
        items={ws.systems}
        canEdit={permissions.canEdit}
        emptyTitle="No systems recorded"
        emptyBody="Add any software, spreadsheet, paper process or custom tool the business relies on."
        addLabel="Add system"
        itemLabel={(s) => s.name}
        fields={[
          { key: "name", label: "Product / system name", kind: "text", required: true },
          { key: "vendor", label: "Vendor / provider (if known)", kind: "text" },
          {
            key: "classification",
            label: "Classification",
            kind: "select",
            options: SYSTEM_CLASSIFICATIONS,
          },
          { key: "category", label: "Category / function", kind: "text" },
          { key: "deployment", label: "Deployment model", kind: "select", options: DEPLOYMENTS },
          { key: "departments", label: "Departments using it", kind: "text" },
          { key: "processesSupported", label: "Business processes supported", kind: "text" },
          { key: "userCount", label: "Approximate user count", kind: "text" },
          { key: "usage", label: "Current usage", kind: "text" },
          { key: "satisfaction", label: "Satisfaction", kind: "select", options: SATISFACTION },
          {
            key: "apiAvailability",
            label: "Existing API / integration availability",
            kind: "select",
            options: API_AVAILABILITY,
          },
          { key: "limitations", label: "Known limitations", kind: "textarea" },
          { key: "integrationNeeds", label: "Integration needs", kind: "textarea" },
          { key: "notes", label: "Notes", kind: "textarea" },
          {
            key: "evidenceIds",
            label: "Research / evidence references",
            kind: "multi",
            options: opts(ws.evidence, (e: EvidenceRecord) => e.statement.slice(0, 60)),
          },
          {
            key: "compatStatus",
            label: "Aurumi connector compatibility",
            kind: "select",
            options: COMPATIBILITY,
            help: "Planned, beta or supported require linked verified evidence.",
          },
          { key: "compatNote", label: "Compatibility note", kind: "text" },
          {
            key: "compatEvidence",
            label: "Verified evidence for compatibility",
            kind: "multi",
            options: opts(verified, (e: EvidenceRecord) => e.statement.slice(0, 60)),
          },
        ]}
        blank={() => ({
          name: "",
          vendor: "",
          classification: "commercial",
          category: "",
          deployment: "unknown",
          satisfaction: "unknown",
          apiAvailability: "unknown",
          evidenceIds: [],
          compatStatus: "unknown",
          compatEvidence: [],
          compatNote: "",
        })}
        fromItem={(s) => ({
          ...s,
          compatStatus: s.compatibility.status,
          compatEvidence: s.compatibility.evidenceIds,
          compatNote: s.compatibility.note,
        })}
        toInput={({ compatStatus, compatEvidence, compatNote, ...rest }) => {
          const clean = Object.fromEntries(
            Object.entries(rest).map(([k, v]) => [k, v ?? (k === "evidenceIds" ? [] : "")]),
          );
          return {
            ...clean,
            compatibility: {
              status: compatStatus ?? "unknown",
              evidenceIds: compatEvidence ?? [],
              note: compatNote ?? "",
            },
          };
        }}
        summary={(s) => (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{s.name}</p>
              <StatusPill>{SYSTEM_CLASSIFICATIONS[s.classification]}</StatusPill>
              <StatusPill tone={COMPAT_TONE[s.compatibility.status] ?? "neutral"}>
                Connector: {COMPATIBILITY[s.compatibility.status]}
              </StatusPill>
            </div>
            <p className="text-xs text-muted-foreground">
              {[
                s.vendor || "Vendor unknown",
                s.category,
                s.departments && `Used by ${s.departments}`,
                s.userCount && `${s.userCount} users`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {s.limitations && <p className="text-xs">Limitations: {s.limitations}</p>}
          </div>
        )}
        extra={(s) =>
          permissions.canEdit ? <ResearchHelper assessmentId={a.id} system={s} /> : null
        }
        onSave={(d) => up.mutateAsync([a.id, "systems", d as never])}
        onRemove={(id) => rm.mutateAsync([a.id, "systems", id])}
      />
      {ws.systems.some((s) => POSITIVE_COMPATIBILITY.includes(s.compatibility.status)) && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Positive compatibility shown above is backed by verified evidence.
        </p>
      )}
    </Panel>
  );
}

/** Simulated AI research: results are AI inferences / unverified findings until a person verifies them. */
function ResearchHelper({
  assessmentId,
  system,
}: {
  assessmentId: string;
  system: InventorySystem;
}) {
  const [state, setState] = useState<{
    busy: boolean;
    findings: ResearchFinding[] | null;
    error: string | null;
  }>({
    busy: false,
    findings: null,
    error: null,
  });
  const up = useStudioMutation((s) => s.upsertChild);
  const run = async () => {
    setState({ busy: true, findings: null, error: null });
    const r = await research.lookupSoftware(system.name);
    setState(
      r.ok
        ? { busy: false, findings: r.data.findings, error: null }
        : { busy: false, findings: null, error: r.error },
    );
  };
  return (
    <div className="mt-2 border-t pt-2">
      {!state.findings && (
        <button className={btnGhost} onClick={run} disabled={state.busy}>
          {state.busy ? "Researching…" : "Run simulated research"}
        </button>
      )}
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state.findings && (
        <ul className="mt-1 flex flex-col gap-1.5">
          <li className="text-[11px] text-muted-foreground">
            Simulated research results — not verified.
          </li>
          {state.findings.map((f, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
              <EvidenceBadge e={f} />
              <span className="flex-1">{f.statement}</span>
              <button
                className={btnGhost}
                onClick={() =>
                  up.mutate([
                    assessmentId,
                    "evidence",
                    {
                      attribute: f.attribute,
                      statement: f.statement,
                      status: f.status as never,
                      sources: f.sources,
                      researchedAt: f.researchedAt,
                      confidence: f.confidence,
                      verification: { state: "unverified" },
                      ...(f.generatedBy ? { generatedBy: f.generatedBy } : {}),
                      links: [{ kind: "system", id: system.id }],
                      notes: "Imported from simulated research.",
                    },
                  ])
                }
              >
                Save as evidence
              </button>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={up.error} />
    </div>
  );
}

// ---------- Processes & pain points ----------
export function ProcessesSection({ view }: { view: WorkspaceView }) {
  const { assessment: a, workspace: ws, permissions } = view;
  const up = useStudioMutation((s) => s.upsertChild);
  const rm = useStudioMutation((s) => s.removeChild);
  const systems = opts(ws.systems, (s: InventorySystem) => s.name);
  const evidence = opts(ws.evidence, (e: EvidenceRecord) => e.statement.slice(0, 60));
  return (
    <div className="flex flex-col gap-6">
      <Panel title={`Business processes (${ws.processes.length})`}>
        <CollectionEditor
          items={ws.processes}
          canEdit={permissions.canEdit}
          emptyTitle="No processes yet"
          addLabel="Add process"
          itemLabel={(p) => p.name}
          fields={[
            { key: "name", label: "Process", kind: "text", required: true },
            { key: "department", label: "Department / function", kind: "text" },
            { key: "currentProcess", label: "How it works today", kind: "textarea" },
            { key: "relatedSystemIds", label: "Related systems", kind: "multi", options: systems },
            { key: "evidenceIds", label: "Supporting evidence", kind: "multi", options: evidence },
          ]}
          blank={() => ({
            name: "",
            department: "",
            currentProcess: "",
            relatedSystemIds: [],
            evidenceIds: [],
          })}
          summary={(p) => (
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {p.department || "Department not set"} ·{" "}
                {ws.painPoints.filter((x) => x.processId === p.id).length} pain point(s)
              </p>
              {p.currentProcess && <p className="mt-1 text-xs">{p.currentProcess}</p>}
            </div>
          )}
          onSave={(d) => up.mutateAsync([a.id, "processes", d as never])}
          onRemove={(id) => rm.mutateAsync([a.id, "processes", id])}
        />
      </Panel>
      <Panel title={`Pain points (${ws.painPoints.length})`}>
        {ws.processes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a process first, then record its pain points.
          </p>
        ) : (
          <CollectionEditor
            items={ws.painPoints}
            canEdit={permissions.canEdit}
            emptyTitle="No pain points yet"
            addLabel="Add pain point"
            itemLabel={(p) => p.description}
            fields={[
              {
                key: "processId",
                label: "Process",
                kind: "select",
                options: opts(ws.processes, (p: { name: string }) => p.name),
              },
              {
                key: "description",
                label: "Pain point or inefficiency",
                kind: "textarea",
                required: true,
              },
              { key: "impact", label: "Operational impact", kind: "text" },
              { key: "frequency", label: "Frequency", kind: "select", options: FREQUENCY },
              { key: "severity", label: "Severity", kind: "select", options: LEVELS },
              { key: "priority", label: "Priority", kind: "select", options: LEVELS },
              { key: "desiredOutcome", label: "Desired outcome", kind: "text" },
              { key: "workaround", label: "Current workaround", kind: "text" },
              {
                key: "relatedSystemIds",
                label: "Related systems",
                kind: "multi",
                options: systems,
              },
              {
                key: "evidenceIds",
                label: "Supporting evidence",
                kind: "multi",
                options: evidence,
              },
            ]}
            blank={() => ({
              processId: ws.processes[0]?.id ?? "",
              description: "",
              frequency: "unknown",
              severity: "medium",
              priority: "medium",
              relatedSystemIds: [],
              evidenceIds: [],
            })}
            summary={(p) => (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{p.description}</p>
                  <StatusPill
                    tone={p.severity === "high" || p.severity === "critical" ? "danger" : "neutral"}
                  >
                    {LEVELS[p.severity]} severity
                  </StatusPill>
                </div>
                <p className="text-xs text-muted-foreground">
                  {ws.processes.find((x) => x.id === p.processId)?.name} · {FREQUENCY[p.frequency]}
                  {p.desiredOutcome && ` · Wants: ${p.desiredOutcome}`}
                </p>
              </div>
            )}
            onSave={(d) => up.mutateAsync([a.id, "painPoints", d as never])}
            onRemove={(id) => rm.mutateAsync([a.id, "painPoints", id])}
          />
        )}
      </Panel>
    </div>
  );
}

// ---------- Requirements ----------
export function RequirementsSection({ view }: { view: WorkspaceView }) {
  const { assessment: a, workspace: ws, permissions } = view;
  const up = useStudioMutation((s) => s.upsertChild);
  const rm = useStudioMutation((s) => s.removeChild);
  const confirmed = ws.requirements.filter((r) => r.basis === "confirmed").length;
  return (
    <Panel
      title={`Goals & requirements (${confirmed} confirmed · ${ws.requirements.length - confirmed} assumptions)`}
    >
      <CollectionEditor
        items={[...ws.requirements].sort((x, y) =>
          x.basis === y.basis ? 0 : x.basis === "confirmed" ? -1 : 1,
        )}
        canEdit={permissions.canEdit}
        emptyTitle="No requirements yet"
        emptyBody="Capture objectives, capabilities, budget, timeline and constraints."
        addLabel="Add requirement"
        itemLabel={(r) => r.statement}
        fields={[
          { key: "category", label: "Type", kind: "select", options: REQUIREMENT_CATEGORIES },
          {
            key: "basis",
            label: "Basis",
            kind: "select",
            options: {
              confirmed: "Confirmed by the business",
              assumption: "Assumption (not confirmed)",
            },
          },
          { key: "statement", label: "Requirement", kind: "textarea", required: true },
          { key: "priority", label: "Priority", kind: "select", options: LEVELS },
          {
            key: "evidenceIds",
            label: "Supporting evidence",
            kind: "multi",
            options: opts(ws.evidence, (e: EvidenceRecord) => e.statement.slice(0, 60)),
          },
        ]}
        blank={() => ({
          category: "required_capability",
          basis: "confirmed",
          statement: "",
          priority: "medium",
          evidenceIds: [],
        })}
        summary={(r) => (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone={r.basis === "confirmed" ? "success" : "warning"}>
                {r.basis === "confirmed" ? "Confirmed" : "Assumption"}
              </StatusPill>
              <span className="text-xs text-muted-foreground">
                {REQUIREMENT_CATEGORIES[r.category]} · {LEVELS[r.priority]}
              </span>
            </div>
            <p className="mt-1 text-sm">{r.statement}</p>
          </div>
        )}
        onSave={(d) => up.mutateAsync([a.id, "requirements", d as never])}
        onRemove={(id) => rm.mutateAsync([a.id, "requirements", id])}
      />
    </Panel>
  );
}

// ---------- Evidence ----------
const toDate = (iso: string | undefined) => (iso ? iso.slice(0, 10) : "");
const toIso = (d: unknown) => (typeof d === "string" && d ? `${d}T00:00:00Z` : "");

export function EvidenceSection({ view }: { view: WorkspaceView }) {
  const { assessment: a, workspace: ws, permissions, names } = view;
  const up = useStudioMutation((s) => s.upsertChild);
  const rm = useStudioMutation((s) => s.removeChild);
  const linkOptions: Record<string, string> = {
    ...Object.fromEntries(ws.systems.map((s) => [`system:${s.id}`, `System · ${s.name}`])),
    ...Object.fromEntries(ws.processes.map((p) => [`process:${p.id}`, `Process · ${p.name}`])),
    ...Object.fromEntries(
      ws.painPoints.map((p) => [
        `pain_point:${p.id}`,
        `Pain point · ${p.description.slice(0, 40)}`,
      ]),
    ),
    ...Object.fromEntries(
      ws.requirements.map((r) => [
        `requirement:${r.id}`,
        `Requirement · ${r.statement.slice(0, 40)}`,
      ]),
    ),
    ...Object.fromEntries(FINDING_FIELDS.map(([k, l]) => [`finding:${k}`, `Finding · ${l}`])),
  };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Panel title={`Research & evidence (${ws.evidence.length})`}>
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {(
          ["confirmed_fact", "research_finding", "ai_inference", "professional_assumption"] as const
        ).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <EvidenceBadge e={{ status: s, verification: { state: "unverified" } }} />
            {ws.evidence.filter((e) => e.status === s).length}
          </span>
        ))}
      </div>
      <CollectionEditor<EvidenceRecord>
        items={ws.evidence}
        canEdit={permissions.canEdit}
        emptyTitle="No evidence yet"
        emptyBody="Record sources for claims. AI output stays an inference until a person verifies it."
        addLabel="Add evidence"
        itemLabel={(e) => e.statement}
        fields={[
          { key: "statement", label: "Claim or finding", kind: "textarea", required: true },
          {
            key: "attribute",
            label: "About (e.g. vendor, API availability)",
            kind: "text",
            required: true,
          },
          {
            key: "status",
            label: "Evidence classification",
            kind: "select",
            options: {
              research_finding: "Reported information (unverified until checked)",
              confirmed_fact: "Verified / confirmed fact",
              ai_inference: "AI-generated inference",
              professional_assumption: "Professional assumption",
            },
          },
          {
            key: "sourceType",
            label: "Source type",
            kind: "select",
            options: {
              interview: "Interview",
              vendor_site: "Vendor website",
              vendor_documentation: "Vendor documentation",
              third_party: "Third party",
              curated_catalog: "Curated catalog",
              ai_model: "AI model",
            },
          },
          { key: "sourceTitle", label: "Source name", kind: "text" },
          { key: "sourceUrl", label: "URL / reference", kind: "text" },
          { key: "researchedAt", label: "Research date (YYYY-MM-DD)", kind: "text" },
          { key: "retrievedAt", label: "Retrieval date (YYYY-MM-DD)", kind: "text" },
          {
            key: "confidence",
            label: "Confidence",
            kind: "select",
            options: { high: "High", medium: "Medium", low: "Low", unknown: "Unknown" },
          },
          {
            key: "confidenceNote",
            label: "Confidence rationale (required if unknown)",
            kind: "text",
          },
          {
            key: "verification",
            label: "Verification status",
            kind: "select",
            options: {
              unverified: "Unverified",
              verified: "Verified (by me, now)",
              disputed: "Disputed",
            },
          },
          { key: "verificationNote", label: "Verification method / dispute note", kind: "text" },
          { key: "generatedBy", label: "Generated by (for AI inferences)", kind: "text" },
          { key: "links", label: "Linked to", kind: "multi", options: linkOptions },
          { key: "notes", label: "Notes", kind: "textarea" },
        ]}
        blank={() => ({
          statement: "",
          attribute: "",
          status: "research_finding",
          sourceType: "interview",
          sourceTitle: "",
          sourceUrl: "",
          researchedAt: today,
          retrievedAt: today,
          confidence: "medium",
          confidenceNote: "",
          verification: "unverified",
          verificationNote: "",
          generatedBy: "",
          links: [],
          notes: "",
        })}
        fromItem={(e) => {
          const src = e.sources[0];
          return {
            statement: e.statement,
            attribute: e.attribute,
            status: e.status,
            sourceType: src?.sourceType ?? "interview",
            sourceTitle: src?.title ?? "",
            sourceUrl: src?.url ?? "",
            researchedAt: toDate(e.researchedAt),
            retrievedAt: toDate(src?.retrievedAt),
            confidence: e.confidence.level,
            confidenceNote:
              e.confidence.level === "unknown"
                ? e.confidence.reason
                : (e.confidence.rationale ?? ""),
            verification: e.verification.state,
            verificationNote:
              e.verification.state === "verified"
                ? e.verification.method
                : e.verification.state === "disputed"
                  ? e.verification.note
                  : "",
            generatedBy: e.generatedBy ?? "",
            links: e.links.map((l) => `${l.kind}:${l.id}`),
            notes: e.notes,
          };
        }}
        toInput={(v) => {
          const s = (k: string) => String(v[k] ?? "");
          const conf = s("confidence");
          const ver = s("verification");
          return {
            statement: s("statement"),
            attribute: s("attribute"),
            status: s("status"),
            sources: s("sourceTitle")
              ? [
                  {
                    title: s("sourceTitle"),
                    sourceType: s("sourceType"),
                    retrievedAt: toIso(v["retrievedAt"]),
                    ...(s("sourceUrl") ? { url: s("sourceUrl") } : {}),
                  },
                ]
              : [],
            researchedAt: toIso(v["researchedAt"]),
            confidence:
              conf === "unknown"
                ? { level: "unknown", reason: s("confidenceNote") }
                : {
                    level: conf,
                    ...(s("confidenceNote") ? { rationale: s("confidenceNote") } : {}),
                  },
            verification:
              ver === "verified"
                ? { state: "verified", method: s("verificationNote") }
                : ver === "disputed"
                  ? { state: "disputed", note: s("verificationNote") }
                  : { state: "unverified" },
            ...(s("generatedBy") ? { generatedBy: s("generatedBy") } : {}),
            links: ((v["links"] as string[]) ?? []).map((x) => {
              const [kind, ...rest] = x.split(":");
              return { kind, id: rest.join(":") };
            }),
            notes: s("notes"),
          };
        }}
        summary={(e) => (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <EvidenceBadge e={e} />
              <span className="text-xs text-muted-foreground">
                Confidence: {e.confidence.level}
                {e.verification.state === "verified" &&
                  ` · Verified by ${names[e.verification.verifiedBy] ?? "Colleague"} (${e.verification.method})`}
                {e.verification.state === "disputed" && " · Disputed"}
              </span>
            </div>
            <p className="text-sm">{e.statement}</p>
            <p className="text-[11px] text-muted-foreground">
              {e.sources.length
                ? e.sources.map((s) => `${s.title}${s.url ? ` (${s.url})` : ""}`).join("; ")
                : "No source recorded"}{" "}
              · researched {toDate(e.researchedAt)}
              {e.links.length > 0 && ` · linked to ${e.links.length} item(s)`}
            </p>
          </div>
        )}
        onSave={(d) => up.mutateAsync([a.id, "evidence", d as never])}
        onRemove={(id) => rm.mutateAsync([a.id, "evidence", id])}
      />
    </Panel>
  );
}
