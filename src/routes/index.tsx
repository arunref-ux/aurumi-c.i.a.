import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight } from "@/components/app/icons";
import { useState } from "react";
import { EmptyState, PageHeader, Panel, StatusPill, type Tone } from "@/components/app/ui-bits";
import { auditLog, directory, repos } from "@/data/repositories";
import { computeMetrics, type DashboardFilters } from "@/domain/metrics";
import type { AssessmentStatus } from "@/domain/types";
import { useSession, useStoreVersion } from "@/lib/session";
import { DeliveryDashboard } from "@/components/delivery/dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — C.I.A. Workspace" },
      {
        name: "description",
        content: "Assessments, proposals and engagements at a glance across Aurumi C.I.A.",
      },
      { property: "og:title", content: "Overview — C.I.A. Workspace" },
      {
        property: "og:description",
        content: "Assessments, proposals and engagements at a glance across Aurumi C.I.A.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Overview,
});

const STATUS_TONE: Record<AssessmentStatus, Tone> = {
  draft: "neutral",
  in_progress: "info",
  under_review: "warning",
  returned: "danger",
  approved: "success",
  completed: "success",
  archived: "neutral",
};
const CHANNELS = {
  all: "All channels",
  direct: "Direct",
  website_self: "Website — self",
  website_boss: "Website — for boss",
  partner_referral: "Partner referral",
  existing_tenant: "Existing tenant",
} as const;
const select =
  "rounded-md border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Overview() {
  const { user } = useSession();
  useStoreVersion();
  const [f, setF] = useState<Omit<DashboardFilters, "now">>({
    type: "all",
    ownerId: "all",
    channel: "all",
    sinceDays: null,
  });
  const ctx = { user };
  const m = computeMetrics(
    repos.assessments.list(ctx),
    repos.proposals.list(ctx),
    repos.engagements.list(ctx),
    { ...f, now: new Date("2026-11-23T12:00:00Z") },
  );
  const activity = auditLog.list(ctx).slice(0, 6);
  const userName = (id: string) => directory.displayName(ctx, id);
  const mine = m.assessments.filter(
    (a) => a.ownerId === user.id || a.assignedUserIds.includes(user.id),
  );

  const kpis = [
    ["Active assessments", m.activeAssessments],
    ["Proposals in preparation", m.proposalsInPreparation],
    ["Awaiting review", m.proposalsAwaitingReview],
    ["Shared", m.proposalsShared],
    ["Accepted", m.proposalsAccepted],
    ["Active engagements", m.activeEngagements],
    ["From website", m.websiteOriginated],
    ["Proposals generated", m.proposalsGenerated],
  ] as const;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${user.name.split(" ")[0]}`}
        description="Everything below reflects only the records your role and scope allow you to see."
        actions={["New Tenant Assessment", "New Partner Assessment", "Create Proposal"].map((a) => (
          <button
            key={a}
            disabled
            title="Available in a later phase"
            className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground disabled:cursor-not-allowed"
          >
            {a}
          </button>
        ))}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <select
          aria-label="Type"
          className={select}
          value={f.type}
          onChange={(e) => setF({ ...f, type: e.target.value as DashboardFilters["type"] })}
        >
          <option value="all">Tenant & partner</option>
          <option value="tenant">Tenant</option>
          <option value="partner">Partner</option>
        </select>
        <select
          aria-label="Professional"
          className={select}
          value={f.ownerId}
          onChange={(e) => setF({ ...f, ownerId: e.target.value })}
        >
          <option value="all">All professionals</option>
          {directory.professionals(ctx).map((p) => (
            <option key={p.id} value={p.userId}>
              {p.displayName}
            </option>
          ))}
        </select>
        <select
          aria-label="Channel"
          className={select}
          value={f.channel}
          onChange={(e) => setF({ ...f, channel: e.target.value as DashboardFilters["channel"] })}
        >
          {Object.entries(CHANNELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Date range"
          className={select}
          value={f.sinceDays ?? ""}
          onChange={(e) =>
            setF({ ...f, sinceDays: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map(([label, v]) => (
          <div key={label} className="rounded-lg border bg-card p-4 shadow-card">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-4xl">{v}</p>
          </div>
        ))}
      </div>

      <DeliveryDashboard />
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel
          title="Assessments"
          className="lg:col-span-2"
          action={
            <Link
              to="/assessments"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Studio <ArrowUpRight className="size-3" />
            </Link>
          }
        >
          {m.assessments.length === 0 ? (
            <EmptyState
              title="No assessments in view"
              body="Try widening filters or switching identity."
            />
          ) : (
            <ul className="divide-y">
              {m.assessments.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.subjectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.title} · {userName(a.ownerId)} · {CHANNELS[a.channel]}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <StatusPill tone={a.type === "partner" ? "gold" : "neutral"}>
                      {a.type}
                    </StatusPill>
                    <StatusPill tone={STATUS_TONE[a.status]}>
                      {a.status.replace("_", " ")}
                    </StatusPill>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel title="Conversion funnel">
            {m.funnel.map((r) => (
              <div key={r.type} className="mb-4 last:mb-0">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {r.type}
                </p>
                {(
                  [
                    ["Assessed", r.assessments],
                    ["Proposed", r.proposals],
                    ["Accepted", r.accepted],
                  ] as const
                ).map(([l, v]) => (
                  <div key={l} className="mb-1.5 flex items-center gap-2 text-xs">
                    <span className="w-16 text-muted-foreground">{l}</span>
                    <div className="h-2 flex-1 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-accent"
                        style={{ width: `${r.assessments ? (v / r.assessments) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-4 text-right">{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </Panel>
          <Panel title="My assigned work">
            {mine.length === 0 ? (
              <EmptyState title="Nothing assigned to you" />
            ) : (
              mine.map((a) => (
                <p key={a.id} className="py-1 text-sm">
                  {a.subjectName}
                </p>
              ))
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Recent activity" className="mt-6">
        {activity.length === 0 ? (
          <EmptyState title="No recent activity" />
        ) : (
          <ul className="space-y-3">
            {activity.map((e) => (
              <li key={e.id} className="flex items-start gap-3 text-sm">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${e.outcome === "denied" ? "bg-destructive" : "bg-accent"}`}
                />
                <div className="flex-1">
                  <p>{e.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {userName(e.actorId)} · {new Date(e.at).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
