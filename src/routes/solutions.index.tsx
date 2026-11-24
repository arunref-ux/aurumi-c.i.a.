import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState, PageHeader, Panel, StatusPill } from "@/components/app/ui-bits";
import {
  btnPrimary,
  ErrorNote,
  inputCls,
  Progress,
  SelectField,
  TextField,
} from "@/components/assessment/fields";
import { PersistenceNote } from "@/components/assessment/shared";
import { can } from "@/domain/permissions";
import { SOLUTION_STATUS_LABEL } from "@/domain/solution";
import {
  useSolutionCandidates,
  useSolutionList,
  useSolutionMutation,
} from "@/lib/solution-queries";
import { useSession } from "@/lib/session";
import { loadDemoSolutions } from "@/data/demo-solutions";

const TITLE = "Solution Studio — C.I.A. Workspace";
const DESC = "Turn approved assessments into explainable, technically credible solution designs.";
export const Route = createFileRoute("/solutions/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SolutionList,
});

const TONE = {
  draft: "neutral",
  in_review: "warning",
  approved: "success",
  returned: "danger",
} as const;

function SolutionList() {
  const { user } = useSession();
  const q = useSolutionList();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (q.data ?? [])
      .filter(
        (r) =>
          !s ||
          [r.solution.title, r.solution.subjectName, r.solution.optionLabel].some((x) =>
            x.toLowerCase().includes(s),
          ),
      )
      .sort((a, b) => b.solution.updatedAt.localeCompare(a.solution.updatedAt));
  }, [q.data, search]);
  return (
    <>
      <PageHeader
        eyebrow="Solution Studio"
        title="Solution designs"
        description="Built only from approved assessment snapshots. Aurumi is one option among many — never the default answer."
        actions={
          can(user, "solution.create") && (
            <button className={btnPrimary} onClick={() => setCreating((c) => !c)}>
              {creating ? "Close" : "New solution"}
            </button>
          )
        }
      />
      <PersistenceNote />
      {creating && <CreatePanel onDone={() => setCreating(false)} />}
      <div className="mb-4 max-w-sm">
        <input
          aria-label="Search solutions"
          className={inputCls}
          placeholder="Search by customer or solution name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Loading solutions…</p>
      ) : rows.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            title="No solution designs yet"
            body="Approve an assessment first, then create a solution from its hand-off snapshot."
          />
          {can(user, "solution.create") && <SampleButton />}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Solution</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Assessment</th>
                <th className="px-3 py-2 font-medium">Professional</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Readiness</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.solution.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link
                      to="/solutions/$solutionId"
                      params={{ solutionId: r.solution.id }}
                      search={{}}
                      className="font-medium hover:underline"
                    >
                      {r.solution.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {r.solution.subjectName} · {r.solution.optionLabel}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    {r.solution.kind === "tenant" ? "Business / Tenant" : "Partner / Opportunity"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to="/assessments/$assessmentId"
                      params={{ assessmentId: r.solution.assessmentId }}
                      search={{}}
                      className="text-xs underline"
                    >
                      {r.solution.assessmentId} · v{r.solution.baseline.snapshotVersion}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{r.ownerName}</td>
                  <td className="px-3 py-2">
                    <StatusPill tone={TONE[r.solution.status]}>
                      {SOLUTION_STATUS_LABEL[r.solution.status]}
                    </StatusPill>
                  </td>
                  <td className="w-36 px-3 py-2">
                    <Progress value={r.readiness} label="Readiness" />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.solution.updatedAt.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CreatePanel({ onDone }: { onDone: () => void }) {
  const c = useSolutionCandidates();
  const create = useSolutionMutation((s) => s.create);
  const navigate = useNavigate();
  const [pick, setPick] = useState("");
  const [title, setTitle] = useState("");
  const [option, setOption] = useState("");
  const options = Object.fromEntries(
    (c.data ?? []).flatMap((a) =>
      a.snapshots.map((s) => [
        `${a.assessmentId}|${s.id}`,
        `${a.assessmentTitle} · ${a.subjectName} · v${s.version}${s.compatible ? "" : " (incompatible)"}${s.existingSolutions.length ? ` · ${s.existingSolutions.length} solution(s)` : ""}`,
      ]),
    ),
  );
  const [assessmentId, snapshotId] = pick.split("|");
  const snap = (c.data ?? [])
    .find((a) => a.assessmentId === assessmentId)
    ?.snapshots.find((s) => s.id === snapshotId);
  const isAlt = !!snap?.existingSolutions.length;
  return (
    <Panel title="New solution">
      {c.data && c.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No approved assessments you can access yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField
            label="Approved assessment snapshot"
            value={pick}
            options={{ "": "Choose…", ...options }}
            onChange={setPick}
          />
          <TextField label="Solution name" value={title} onChange={setTitle} required />
          {snap && !snap.compatible && (
            <p className="text-xs text-destructive md:col-span-2">{snap.reason}</p>
          )}
          {isAlt && (
            <div className="md:col-span-2">
              <p className="mb-2 text-xs">
                A solution already exists for this snapshot (
                {snap!.existingSolutions.map((x) => `${x.title} — ${x.optionLabel}`).join("; ")}).
                Name a separate option to create an alternative.
              </p>
              <TextField label="Option name" value={option} onChange={setOption} required />
            </div>
          )}
          <div className="md:col-span-2">
            <button
              className={btnPrimary}
              disabled={!pick || !title.trim() || !snap?.compatible || create.isPending}
              onClick={async () => {
                const sol = await create.mutateAsync([
                  {
                    assessmentId: assessmentId!,
                    snapshotId: snapshotId!,
                    title,
                    optionLabel: option,
                    asAlternative: isAlt,
                  },
                ]);
                onDone();
                void navigate({
                  to: "/solutions/$solutionId",
                  params: { solutionId: sol.id },
                  search: {},
                });
              }}
            >
              Create solution
            </button>
          </div>
          <ErrorNote error={create.error} />
        </div>
      )}
    </Panel>
  );
}

function SampleButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <div className="text-center">
      <button
        className={btnPrimary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await loadDemoSolutions();
          } catch (e) {
            setError(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Loading sample solutions…" : "Load sample solutions"}
      </button>
      <p className="mt-1 text-xs text-muted-foreground">
        Adds three fictional reference designs (approved, in review, draft).
      </p>
      <ErrorNote error={error} />
    </div>
  );
}
