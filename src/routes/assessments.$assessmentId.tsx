import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState, PageHeader, StatusPill } from "@/components/app/ui-bits";
import { ErrorNote, inputCls, Progress } from "@/components/assessment/fields";
import {
  FindingsSection,
  OverviewSection,
  PartnerSection,
  ProfileSection,
  QuestionsSection,
} from "@/components/assessment/sections-core";
import {
  EvidenceSection,
  ProcessesSection,
  RequirementsSection,
  SystemsSection,
} from "@/components/assessment/sections-records";
import { ReviewSection } from "@/components/assessment/sections-review";
import type { WorkspaceView } from "@/data/assessment-studio";
import type { SectionKey } from "@/domain/assessment";
import { useAssessmentWorkspace } from "@/lib/assessment-queries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { PersistenceNote, STATUS_TONE } from "@/components/assessment/shared";

const TITLE = "Assessment workspace — C.I.A. Workspace";
const DESC =
  "Section-by-section assessment: profile, systems, processes, requirements, evidence and review.";
const SECTIONS: { key: SectionKey; label: string; partnerOnly?: boolean }[] = [
  { key: "overview", label: "Overview" },
  { key: "profile", label: "Business profile" },
  { key: "partner", label: "Partner details", partnerOnly: true },
  { key: "systems", label: "Software & systems" },
  { key: "processes", label: "Processes & pain points" },
  { key: "requirements", label: "Goals & requirements" },
  { key: "evidence", label: "Research & evidence" },
  { key: "findings", label: "Findings & summary" },
  { key: "questions", label: "Questions" },
  { key: "review", label: "Review & readiness" },
];

export const Route = createFileRoute("/assessments/$assessmentId")({
  validateSearch: (s: Record<string, unknown>): { section?: SectionKey } =>
    SECTIONS.some((x) => x.key === s["section"]) ? { section: s["section"] as SectionKey } : {},
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
  component: Workspace,
});

function Workspace() {
  const { assessmentId } = Route.useParams();
  const { section = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useSession();
  const q = useAssessmentWorkspace(assessmentId);
  if (q.isPending)
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Loading assessment…
      </p>
    );
  if (q.isError || !q.data)
    return (
      <>
        <PageHeader title="Assessment unavailable" />
        <EmptyState
          title="This assessment doesn't exist or you don't have access to it."
          body={`Viewing as ${user.name}.`}
        />
        <Link to="/assessments" className="mt-4 inline-block text-sm underline">
          Back to assessments
        </Link>
      </>
    );
  const v = q.data;
  const { assessment: a } = v;
  const list = SECTIONS.filter((s) => !s.partnerOnly || a.type === "partner");
  const status = (k: SectionKey) => v.sections.find((s) => s.key === k);
  const go = (k: SectionKey) => void navigate({ search: { section: k }, replace: true });

  return (
    <>
      <Link
        to="/assessments"
        className="mb-3 inline-block text-xs text-muted-foreground hover:underline"
      >
        ← All assessments
      </Link>
      <PageHeader
        eyebrow={`${a.type === "tenant" ? "Tenant / Business" : "Partner / Opportunity"} assessment · ${a.id}`}
        title={a.title}
        description={a.subjectName}
        actions={<StatusPill tone={STATUS_TONE[a.status]}>{a.status.replace("_", " ")}</StatusPill>}
      />
      <div className="mb-2 max-w-sm">
        <Progress value={v.completeness} label="Assessment completeness" />
      </div>
      <PersistenceNote />
      {!v.permissions.canEdit && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs">
          Read-only:{" "}
          {["under_review", "approved", "completed", "archived"].includes(a.status)
            ? `this assessment is ${a.status.replace("_", " ")}.`
            : "you don't have edit access."}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Assessment sections">
          <select
            aria-label="Section"
            className={cn(inputCls, "lg:hidden")}
            value={section}
            onChange={(e) => go(e.target.value as SectionKey)}
          >
            {list.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <ul className="hidden flex-col gap-0.5 lg:flex">
            {list.map((s) => {
              const st = status(s.key);
              return (
                <li key={s.key}>
                  <button
                    onClick={() => go(s.key)}
                    aria-current={section === s.key ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      section === s.key ? "bg-card font-medium shadow-card" : "hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={
                        st
                          ? st.complete
                            ? "text-success"
                            : "text-warning"
                          : "text-muted-foreground"
                      }
                    >
                      {st ? (st.complete ? "●" : "○") : "·"}
                    </span>
                    <span className="flex-1">{s.label}</span>
                    {st && (
                      <span className="sr-only">{st.complete ? "complete" : "incomplete"}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div key={`${user.id}-${a.id}`} className="min-w-0">
          <SectionBody section={section} view={v} />
          <ErrorNote error={null} />
        </div>
      </div>
    </>
  );
}

function SectionBody({ section, view }: { section: SectionKey; view: WorkspaceView }) {
  switch (section) {
    case "profile":
      return <ProfileSection view={view} />;
    case "partner":
      return <PartnerSection view={view} />;
    case "systems":
      return <SystemsSection view={view} />;
    case "processes":
      return <ProcessesSection view={view} />;
    case "requirements":
      return <RequirementsSection view={view} />;
    case "evidence":
      return <EvidenceSection view={view} />;
    case "findings":
      return <FindingsSection view={view} />;
    case "questions":
      return <QuestionsSection view={view} />;
    case "review":
      return <ReviewSection view={view} />;
    default:
      return <OverviewSection view={view} />;
  }
}
