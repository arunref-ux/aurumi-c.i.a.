import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState, PageHeader, Panel, StatusPill } from "@/components/app/ui-bits";
import {
  btnGhost,
  btnPrimary,
  ErrorNote,
  inputCls,
  Progress,
  SelectField,
  TextField,
} from "@/components/assessment/fields";
import { BUSINESS_CATEGORIES } from "@/data/question-bank";
import { can } from "@/domain/permissions";
import { useAssessmentList, useStudioMutation } from "@/lib/assessment-queries";
import { useSession } from "@/lib/session";
import { PersistenceNote, STATUS_TONE } from "@/components/assessment/shared";

const TITLE = "Assessment Studio — C.I.A. Workspace";
const DESC =
  "Tenant and partner assessments: find, create and resume structured business assessments.";
export const Route = createFileRoute("/assessments/")({
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
  component: StudioList,
});

const STATUS_OPTS = {
  all: "All statuses",
  draft: "Draft",
  in_progress: "In progress",
  under_review: "In review",
  returned: "Returned",
  approved: "Approved",
  completed: "Completed (legacy)",
  archived: "Archived",
};

function StudioList() {
  const { user } = useSession();
  const q = useAssessmentList();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [creating, setCreating] = useState(false);
  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (q.data ?? [])
      .filter(
        (r) =>
          (status === "all" || r.assessment.status === status) &&
          (type === "all" || r.assessment.type === type),
      )
      .filter(
        (r) =>
          !s ||
          [r.assessment.title, r.businessName, r.ownerName, r.assessment.id].some((x) =>
            x.toLowerCase().includes(s),
          ),
      )
      .sort((x, y) => y.assessment.updatedAt.localeCompare(x.assessment.updatedAt));
  }, [q.data, search, status, type]);

  return (
    <>
      <PageHeader
        eyebrow="Assessment Studio"
        title="Assessments"
        description="Structured tenant and partner assessments. Work is saved as you go and survives a refresh."
        actions={
          can(user, "assessment.create") && (
            <button className={btnPrimary} onClick={() => setCreating((c) => !c)}>
              {creating ? "Close" : "Create assessment"}
            </button>
          )
        }
      />
      <PersistenceNote />
      {creating && <CreateForm />}
      <Panel>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input
            aria-label="Search assessments"
            placeholder="Search by name, business, professional or ID"
            className={inputCls}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            aria-label="Status filter"
            className={inputCls}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {Object.entries(STATUS_OPTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select
            aria-label="Type filter"
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="all">All types</option>
            <option value="tenant">Tenant / Business</option>
            <option value="partner">Partner / Opportunity</option>
          </select>
        </div>
        {q.isPending ? (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Loading assessments…
          </p>
        ) : q.isError ? (
          <ErrorNote error={q.error} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No assessments match"
            body={
              q.data?.length
                ? "Try clearing the filters."
                : "You don't have access to any assessments yet."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Assessment</th>
                  <th className="pr-3 font-medium">Type</th>
                  <th className="pr-3 font-medium">Status</th>
                  <th className="pr-3 font-medium">Professional</th>
                  <th className="pr-3 font-medium">Updated</th>
                  <th className="pr-3 font-medium w-40">Completeness</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.assessment.id} className="border-t align-middle">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{r.assessment.title}</p>
                      <p className="text-xs text-muted-foreground">{r.businessName}</p>
                    </td>
                    <td className="pr-3">
                      {r.assessment.type === "tenant" ? "Tenant" : "Partner"}
                    </td>
                    <td className="pr-3">
                      <StatusPill tone={STATUS_TONE[r.assessment.status]}>
                        {r.assessment.status.replace("_", " ")}
                      </StatusPill>
                    </td>
                    <td className="pr-3">{[r.ownerName, ...r.assigneeNames].join(", ")}</td>
                    <td className="pr-3 text-xs text-muted-foreground">
                      {new Date(r.assessment.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="pr-3">
                      <Progress
                        value={r.completeness}
                        label={`${r.assessment.title} completeness`}
                      />
                    </td>
                    <td className="text-right">
                      <Link
                        to="/assessments/$assessmentId"
                        params={{ assessmentId: r.assessment.id }}
                        className={btnGhost}
                      >
                        {["draft", "in_progress", "returned"].includes(r.assessment.status)
                          ? "Resume"
                          : "Open"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function CreateForm() {
  const create = useStudioMutation((s) => s.create);
  const nav = useNavigate();
  const [f, setF] = useState({
    type: "tenant",
    title: "",
    subjectName: "",
    channel: "direct",
    category: "general",
  });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Panel title="New assessment" className="mb-6">
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField
          label="Assessment type"
          value={f.type}
          onChange={set("type")}
          options={{
            tenant: "Tenant / Business assessment",
            partner: "Partner / Opportunity assessment",
          }}
        />
        <SelectField
          label="Business category"
          value={f.category}
          onChange={set("category")}
          options={BUSINESS_CATEGORIES}
        />
        <TextField label="Assessment name" required value={f.title} onChange={set("title")} />
        <TextField
          label="Organization / business"
          required
          value={f.subjectName}
          onChange={set("subjectName")}
        />
        <SelectField
          label="Channel"
          value={f.channel}
          onChange={set("channel")}
          options={{
            direct: "Direct",
            website_self: "Website — self",
            website_boss: "Website — for boss",
            partner_referral: "Partner referral",
            existing_tenant: "Existing tenant",
          }}
        />
      </div>
      <div className="mt-4">
        <button
          className={btnPrimary}
          disabled={create.isPending}
          onClick={async () => {
            const a = await create.mutateAsync([f as never]);
            void nav({ to: "/assessments/$assessmentId", params: { assessmentId: a.id } });
          }}
        >
          {create.isPending ? "Creating…" : "Create and open"}
        </button>
      </div>
      <div className="mt-3">
        <ErrorNote error={create.error} />
      </div>
    </Panel>
  );
}
