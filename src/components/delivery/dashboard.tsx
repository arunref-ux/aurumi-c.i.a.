import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/app/ui-bits";
import { useEngagements, useProfessionals } from "@/lib/delivery-queries";
import { computeDeliveryMetrics } from "@/domain/metrics";
import { useSession } from "@/lib/session";
import { can } from "@/domain/permissions";
export function DeliveryDashboard() {
  const { user } = useSession(),
    engagements = useEngagements(),
    profiles = useProfessionals();
  if (engagements.isPending)
    return (
      <p role="status" className="mt-6 text-sm">
        Loading delivery commitments…
      </p>
    );
  if (engagements.error)
    return (
      <p role="alert" className="mt-6 text-sm text-destructive">
        Delivery commitments are unavailable.
      </p>
    );
  const rows = engagements.data ?? [],
    m = computeDeliveryMetrics(rows, profiles.data ?? []);
  return (
    <section className="mt-8 border-y py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl">Delivery commitments</h2>
        <Button variant="link" asChild>
          <Link to="/engagements">Engagements →</Link>
        </Button>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-5 md:grid-cols-4">
        {[
          ["Active engagements", m.active],
          ["On hold", m.onHold],
          ["Overdue milestones", m.overdueMilestones.length],
          ["Awaiting acceptance", m.awaitingDeliverables.length],
        ].map(([l, n]) => (
          <div key={l}>
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="mt-1 font-display text-3xl">{n}</p>
          </div>
        ))}
      </div>
      {rows
        .filter((v) => v.engagement.status !== "completed" && v.engagement.status !== "cancelled")
        .map((v) => (
          <div
            key={v.engagement.id}
            className="flex flex-wrap items-center justify-between gap-3 border-t py-3"
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{v.engagement.title}</p>
              <p className="text-xs text-muted-foreground">{v.overview.cadence}</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/engagements/$engagementId" params={{ engagementId: v.engagement.id }}>
                Open
              </Link>
            </Button>
          </div>
        ))}
      {can(user, "network.activate") && (
        <div className="mt-5 flex flex-wrap gap-3 border-t pt-4">
          <StatusPill>{m.pendingProfessionals} professional reviews</StatusPill>
          <StatusPill>{m.qualificationQueue.length} qualifications pending</StatusPill>
          <StatusPill>{m.expiringQualifications.length} expiring qualifications</StatusPill>
          <StatusPill>{m.unassigned} unassigned engagements</StatusPill>
          <StatusPill>{m.estimatedHours} allocated hours — estimate</StatusPill>
        </div>
      )}
    </section>
  );
}
