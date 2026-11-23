import { createFileRoute, Link } from "@tanstack/react-router";
import { EmptyState, PageHeader, StatusPill } from "@/components/app/ui-bits";
import { inputCls, Progress } from "@/components/assessment/fields";
import { PersistenceNote } from "@/components/assessment/shared";
import { ReviewSection, ShareSection, VersionsSection } from "@/components/proposal/review";
import {
  CommercialsSection,
  ContentSection,
  DeliverablesSection,
  OptionsSection,
  OverviewSection,
  RisksSection,
  TimelineSection,
} from "@/components/proposal/sections";
import type { ProposalView } from "@/data/proposal-studio";
import { PROPOSAL_STATUS_LABEL, TRACKS } from "@/domain/proposal";
import { useProposal } from "@/lib/proposal-queries";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { STATUS_TONE } from "./proposals.index";

const SECTIONS = [
  { key: "overview", label: "A. Overview" },
  { key: "content", label: "B. Proposal content" },
  { key: "scope", label: "C. Scope & deliverables" },
  { key: "commercials", label: "D. Commercials" },
  { key: "risks", label: "E. Assumptions, risks & exclusions" },
  { key: "timeline", label: "F. Timeline & responsibilities" },
  { key: "options", label: "G. Alternatives & options" },
  { key: "review", label: "H. Internal review & approval" },
  { key: "share", label: "I. Issue, share & responses" },
  { key: "versions", label: "J. Versions & preview" },
] as const;
type Key = (typeof SECTIONS)[number]["key"];
const READY_KEY: Partial<Record<Key, string>> = {
  content: "content",
  scope: "deliverables",
  commercials: "commercials",
  risks: "risks",
  timeline: "timeline",
  options: "options",
};
const TITLE = "Proposal — C.I.A. Workspace";
const DESC = "Proposal content, deliverables, commercials, review, issue and version history.";

export const Route = createFileRoute("/proposals/$proposalId")({
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
  const { proposalId } = Route.useParams();
  const { section = "overview" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useSession();
  const q = useProposal(proposalId);
  if (q.isPending) return <p className="text-sm text-muted-foreground">Loading proposal…</p>;
  if (q.isError || !q.data)
    return (
      <>
        <PageHeader title="Proposal unavailable" />
        <EmptyState
          title={
            q.error instanceof Error && q.error.name === "LegacyProposalError"
              ? q.error.message
              : "This proposal doesn't exist or you don't have access to it."
          }
          body={`Viewing as ${user.name}.`}
        />
        <Link to="/proposals" className="mt-4 inline-block text-sm underline">
          Back to proposals
        </Link>
      </>
    );
  const v = q.data;
  const p = v.proposal;
  const go = (k: Key) => void navigate({ search: { section: k }, replace: true });
  return (
    <>
      <Link
        to="/proposals"
        className="mb-3 inline-block text-xs text-muted-foreground hover:underline"
      >
        ← All proposals
      </Link>
      <PageHeader
        eyebrow={`${TRACKS[p.track].label} · revision ${p.revision}${v.versions[0] ? ` · latest v${v.versions[0].versionNumber}` : ""}`}
        title={p.title}
        description={`For ${v.workspace.recipient.name}`}
        actions={
          <StatusPill tone={STATUS_TONE[p.status]}>{PROPOSAL_STATUS_LABEL[p.status]}</StatusPill>
        }
      />
      <div className="mb-2 max-w-sm">
        <Progress value={v.readinessPercent} label="Proposal readiness" />
      </div>
      <PersistenceNote />
      {v.newerSource && (
        <p className="mb-4 rounded-md bg-info-soft px-3 py-2 text-xs">
          A newer approved solution (v{v.newerSource.version}) exists. This proposal stays on v
          {p.source.solutionSnapshotVersion} until rebased under Review.
        </p>
      )}
      {p.status === "approved" && (
        <p className="mb-4 rounded-md bg-warning-soft px-3 py-2 text-xs">
          Approved. Any edit now invalidates the approval and needs a new review.
        </p>
      )}
      {!v.permissions.canEdit && (
        <p className="mb-4 rounded-md bg-muted px-3 py-2 text-xs">
          Read-only:{" "}
          {["in_review", "shared", "accepted", "declined", "expired"].includes(p.status)
            ? `this proposal is ${PROPOSAL_STATUS_LABEL[p.status].toLowerCase()}.`
            : "you don't have edit access."}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[250px_1fr]">
        <nav aria-label="Proposal sections">
          <select
            aria-label="Section"
            className={cn(inputCls, "lg:hidden")}
            value={section}
            onChange={(e) => go(e.target.value as Key)}
          >
            {SECTIONS.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
          <ul className="hidden flex-col gap-0.5 lg:flex">
            {SECTIONS.map((x) => {
              const rk = READY_KEY[x.key];
              const ok = rk ? v.readiness.find((i) => i.key === rk)?.ok : undefined;
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
        <div key={`${user.id}-${p.id}`} className="min-w-0">
          <Body section={section} view={v} />
        </div>
      </div>
    </>
  );
}

function Body({ section, view }: { section: Key; view: ProposalView }) {
  switch (section) {
    case "content":
      return <ContentSection view={view} />;
    case "scope":
      return <DeliverablesSection view={view} />;
    case "commercials":
      return <CommercialsSection view={view} />;
    case "risks":
      return <RisksSection view={view} />;
    case "timeline":
      return <TimelineSection view={view} />;
    case "options":
      return <OptionsSection view={view} />;
    case "review":
      return <ReviewSection view={view} />;
    case "share":
      return <ShareSection view={view} />;
    case "versions":
      return <VersionsSection view={view} />;
    default:
      return <OverviewSection view={view} />;
  }
}
