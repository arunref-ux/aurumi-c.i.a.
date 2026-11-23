import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState, PageHeader, StatusPill } from "@/components/app/ui-bits";
import { inputCls, Progress } from "@/components/assessment/fields";
import { PersistenceNote } from "@/components/assessment/shared";
import { ReviewSection } from "@/components/solution/review";
import {
  AISection,
  AlternativesSection,
  ArchitectureSection,
  CatalogSection,
  IntegrationsSection,
  NeedsSection,
  OverviewSection,
  PartnerSection,
  RecommendationsSection,
  RoadmapSection,
  ValueSection,
} from "@/components/solution/sections";
import type { SolutionView } from "@/data/solution-studio";
import { SOLUTION_STATUS_LABEL } from "@/domain/solution";
import { useSolution } from "@/lib/solution-queries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { key: "overview", label: "Overview & baseline" },
  { key: "needs", label: "Needs & opportunities" },
  { key: "recommendations", label: "Recommendations" },
  { key: "catalog", label: "Offering catalog" },
  { key: "integrations", label: "Integrations" },
  { key: "ai", label: "AI & conversational" },
  { key: "architecture", label: "Architecture & dependencies" },
  { key: "value", label: "Value & business case" },
  { key: "roadmap", label: "Roadmap" },
  { key: "alternatives", label: "Alternatives" },
  { key: "partner", label: "Partner solution", partnerOnly: true },
  { key: "review", label: "Review & readiness" },
] as const;
type Key = (typeof SECTIONS)[number]["key"];
const TITLE = "Solution design — C.I.A. Workspace";
const DESC =
  "Needs, recommendations, integrations, AI design, value, roadmap, alternatives and review.";

export const Route = createFileRoute("/solutions/$solutionId")({
  validateSearch: (s: Record<string, unknown>): { section?: Key } =>
    SECTIONS.some((x) => x.key === s["section"]) ? { section: s["section"] as Key } : {},
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
  const { solutionId } = Route.useParams();
  const { section = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useSession();
  const q = useSolution(solutionId);
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading solution…</p>;
  if (q.isError || !q.data)
    return (
      <>
        <PageHeader title="Solution unavailable" />
        <EmptyState
          title="This solution doesn't exist or you don't have access to it."
          body={`Viewing as ${user.name}.`}
        />
        <Link to="/solutions" className="mt-4 inline-block text-sm underline">
          Back to solutions
        </Link>
      </>
    );
  const v = q.data;
  const s = v.solution;
  const list = SECTIONS.filter((x) => !("partnerOnly" in x) || s.kind === "partner");
  const go = (k: Key) => void navigate({ search: { section: k }, replace: true });
  const okKeys: Partial<Record<Key, boolean | undefined>> = {
    needs: v.readiness.find((i) => i.key === "needs")?.ok,
    recommendations: v.readiness.find((i) => i.key === "justified")?.ok,
    integrations: v.readiness.find((i) => i.key === "integrations")?.ok,
    ai: v.readiness.find((i) => i.key === "ai")?.ok,
    architecture: v.readiness.find((i) => i.key === "roadmap")?.ok,
    value: v.readiness.find((i) => i.key === "value")?.ok,
    alternatives: v.readiness.find((i) => i.key === "alternatives")?.ok,
  };
  return (
    <>
      <Link
        to="/solutions"
        className="mb-3 inline-block text-xs text-muted-foreground hover:underline"
      >
        ← All solutions
      </Link>
      <PageHeader
        eyebrow={`${s.kind === "tenant" ? "Business / Tenant" : "Partner / Opportunity"} solution · ${s.optionLabel} · revision ${s.revision}`}
        title={s.title}
        description={s.subjectName}
        actions={
          <StatusPill
            tone={
              s.status === "approved"
                ? "success"
                : s.status === "returned"
                  ? "danger"
                  : s.status === "in_review"
                    ? "warning"
                    : "neutral"
            }
          >
            {SOLUTION_STATUS_LABEL[s.status]}
          </StatusPill>
        }
      />
      <div className="mb-2 max-w-sm">
        <Progress value={v.readinessPercent} label="Solution readiness" />
      </div>
      <PersistenceNote />
      {v.newerSnapshot && (
        <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-xs">
          A newer approved assessment (v{v.newerSnapshot.version}) exists. This solution stays on v
          {s.baseline.snapshotVersion} until rebased under Review.
        </p>
      )}
      {!v.permissions.canEdit && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs">
          Read-only:{" "}
          {s.status === "in_review" || s.status === "approved"
            ? `this solution is ${SOLUTION_STATUS_LABEL[s.status].toLowerCase()}.`
            : "you don't have edit access."}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <nav aria-label="Solution sections">
          <select
            aria-label="Section"
            className={cn(inputCls, "lg:hidden")}
            value={section}
            onChange={(e) => go(e.target.value as Key)}
          >
            {list.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          <ul className="hidden flex-col gap-0.5 lg:flex">
            {list.map((x) => {
              const ok = okKeys[x.key];
              return (
                <li key={x.key}>
                  <button
                    onClick={() => go(x.key)}
                    aria-current={section === x.key ? "page" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      section === x.key ? "bg-card font-medium shadow-card" : "hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={
                        ok === undefined
                          ? "text-muted-foreground"
                          : ok
                            ? "text-success"
                            : "text-warning"
                      }
                    >
                      {ok === undefined ? "·" : ok ? "●" : "○"}
                    </span>
                    {x.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div key={`${user.id}-${s.id}`} className="min-w-0">
          <Body section={section} view={v} />
        </div>
      </div>
    </>
  );
}

function Body({ section, view }: { section: Key; view: SolutionView }) {
  switch (section) {
    case "needs":
      return <NeedsSection view={view} />;
    case "recommendations":
      return <RecommendationsSection view={view} />;
    case "catalog":
      return <CatalogSection view={view} />;
    case "integrations":
      return <IntegrationsSection view={view} />;
    case "ai":
      return <AISection view={view} />;
    case "architecture":
      return <ArchitectureSection view={view} />;
    case "value":
      return <ValueSection view={view} />;
    case "roadmap":
      return <RoadmapSection view={view} />;
    case "alternatives":
      return <AlternativesSection view={view} />;
    case "partner":
      return <PartnerSection view={view} />;
    case "review":
      return <ReviewSection view={view} />;
    default:
      return <OverviewSection view={view} />;
  }
}
