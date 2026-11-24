import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/ui-bits";
import { can } from "@/domain/permissions";
import { businessFitInternal as service } from "@/data/business-fit-internal";
import { useFitDetail } from "@/lib/business-fit-queries";
import { useSession } from "@/lib/session";
import { FitReport, FitError, ResponseSummary, fitInput } from "@/components/business-fit/shared";
import { ManagementTabs, fitHead } from "@/components/business-fit/management";
export const Route = createFileRoute("/business-fit-management/$intakeId")({
  head: () =>
    fitHead(
      "Business Fit Submission Review",
      "Review immutable self-reported Business Fit information and manage professional intake.",
    ),
  component: SubmissionDetail,
});
function SubmissionDetail() {
  const { intakeId } = Route.useParams();
  const { user } = useSession();
  return <Detail key={`${user.id}:${intakeId}`} id={intakeId} />;
}
function Detail({ id }: { id: string }) {
  const { user } = useSession(),
    ctx = { user },
    q = useFitDetail(id),
    [error, setError] = useState<unknown>(null),
    [note, setNote] = useState(""),
    [assigned, setAssigned] = useState(""),
    [type, setType] = useState("tenant"),
    [confirm, setConfirm] = useState(false),
    [pending, setPending] = useState(false);
  const run = async (fn: () => unknown) => {
    setPending(true);
    try {
      await fn();
      setError(null);
      await q.refetch();
    } catch (e) {
      setError(e);
      await q.refetch();
    } finally {
      setPending(false);
    }
  };
  if (q.isPending) return <p>Loading submission…</p>;
  if (!q.data) return <FitError error={q.error} />;
  const { intake, snapshot, audit, assurance, conversion } = q.data;
  let contact: ReturnType<typeof service.contact> | null = null;
  let people: ReturnType<typeof service.people> = [];
  try {
    if (can(user, "business_fit.contact", intake)) contact = service.contact(ctx, id);
    if (can(user, "business_fit.assign", intake)) people = service.people(ctx, id);
  } catch (e) {
    return <FitError error={e} />;
  }
  return (
    <>
      <PageHeader
        eyebrow="Business Fit intake"
        title={intake.reference}
        description="Original customer responses and report are immutable. Internal notes are separate."
      />
      <ManagementTabs />
      <FitError error={error} />
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <section className="border-y py-5">
            <h2 className="mb-4 text-2xl">Original responses</h2>
            <details>
              <summary className="cursor-pointer text-sm">View self-reported information</summary>
              <div className="mt-4">
                <ResponseSummary
                  responses={snapshot.responses}
                  questionnaire={snapshot.questionnaire}
                />
              </div>
            </details>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {snapshot.id} · {snapshot.schema} · {snapshot.provenance}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {assurance === "historical-consistency"
                ? "Historical consistency only · Original report preserved"
                : "Immutable content consistency checked"}
            </p>
          </section>
          <div className="mt-8">
            <FitReport report={snapshot.report} questionnaire={snapshot.questionnaire} />
          </div>
        </div>
        <aside className="space-y-7">
          <section className="border-t pt-4">
            <h2 className="text-xl">Consultation request</h2>
            {contact ? (
              <div className="mt-3 space-y-2 break-words text-sm">
                <p>
                  {contact.contact.name} · {contact.contact.businessName}
                </p>
                <p>{contact.contact.email}</p>
                <p>{contact.contact.phone || "No phone supplied"}</p>
                <p>
                  {contact.contact.country} · Contact by {contact.contact.preferredContact}
                </p>
                <p>{contact.contact.comments}</p>
                <p className="text-xs text-muted-foreground">
                  Contact consent: {contact.consentAt}
                  <br />
                  Marketing consent: {contact.contact.marketingConsent ? "Yes" : "No"}
                </p>
                <p className="font-mono text-xs">{contact.leadReference}</p>
                <p className="text-xs text-muted-foreground">
                  Simulated ShopTalk · No scheduling or messages
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Contact information is restricted.
              </p>
            )}
          </section>
          <section className="border-t pt-4">
            <h2 className="mb-3 text-xl">Intake and assignment</h2>
            <label className="text-xs">
              Intake status
              <select
                aria-label="Intake status"
                className={`${fitInput} mt-1`}
                value={intake.status}
                disabled={
                  !can(user, "business_fit.manage", intake) || !!intake.assessmentId || pending
                }
                onChange={(e) => void run(() => service.status(ctx, id, e.target.value))}
              >
                {[
                  "new",
                  "under_review",
                  "qualified",
                  "assessment_created",
                  "closed",
                  "withdrawn",
                ].map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-xs">
              Assigned: {intake.ownerId === "queue_business_fit" ? "Unassigned" : intake.ownerId}
            </p>
            {can(user, "business_fit.assign", intake) && (
              <div className="mt-3">
                <label className="text-xs">
                  Professional
                  <select
                    aria-label="Professional"
                    className={`${fitInput} mt-1`}
                    value={assigned}
                    onChange={(e) => setAssigned(e.target.value)}
                  >
                    <option value="">Choose a professional</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  variant="outline"
                  className="mt-2"
                  disabled={!assigned || pending}
                  onClick={() => void run(() => service.assign(ctx, id, assigned))}
                >
                  Assign submission
                </Button>
              </div>
            )}
          </section>
          <section className="border-t pt-4">
            <h2 className="mb-3 text-xl">Internal intake notes</h2>
            {intake.notes.map((n) => (
              <div key={n.id} className="mb-3 border-b pb-3 text-sm">
                <p className="whitespace-pre-wrap break-words">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {n.by} · {n.at.slice(0, 10)}
                </p>
              </div>
            ))}
            {can(user, "business_fit.manage", intake) && (
              <>
                <textarea
                  aria-label="Internal intake note"
                  className={fitInput}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button
                  variant="outline"
                  className="mt-2"
                  disabled={!note.trim() || pending}
                  onClick={() =>
                    void run(async () => {
                      service.note(ctx, id, note);
                      setNote("");
                    })
                  }
                >
                  Add note
                </Button>
              </>
            )}
          </section>
          <section className="border-t pt-4">
            <h2 className="mb-3 text-xl">Assessment Studio</h2>
            {conversion && conversion.state !== "complete" && (
              <p role="status" className="mb-3 text-sm text-warning">
                Incomplete conversion · Retry available
              </p>
            )}
            {intake.assessmentId ? (
              <Button asChild variant="outline">
                <Link
                  to="/assessments/$assessmentId"
                  params={{ assessmentId: intake.assessmentId }}
                >
                  Open linked assessment
                </Link>
              </Button>
            ) : (
              can(user, "business_fit.convert", intake) && (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Organization: {user.organizationId}. Carry forward business context, systems,
                    priorities, information gaps and self-reported provenance. No findings will be
                    approved or validated.
                  </p>
                  <label className="text-xs">
                    Assessment type
                    <select
                      aria-label="Assessment type"
                      className={`${fitInput} mt-1`}
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="tenant">Tenant / Business</option>
                      <option value="partner">Partner / Opportunity</option>
                    </select>
                  </label>
                  {assurance === "historical-consistency" && !intake.historicalReview && (
                    <Button
                      variant="outline"
                      className="mt-3"
                      disabled={!confirm || pending}
                      onClick={() => void run(() => service.revalidateHistorical(ctx, id, true))}
                    >
                      Review and revalidate historical source
                    </Button>
                  )}
                  <label className="mt-3 flex gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                    />
                    I confirm the information to carry forward is self-reported and unverified.
                  </label>
                  <Button
                    className="mt-3"
                    disabled={
                      !confirm || pending || !["under_review", "qualified"].includes(intake.status)
                    }
                    onClick={() =>
                      void run(() =>
                        service.convert(ctx, id, {
                          type,
                          confirm,
                          organizationId: user.organizationId,
                        }),
                      )
                    }
                  >
                    {pending
                      ? "Processing and saving…"
                      : conversion
                        ? "Retry Assessment"
                        : "Create Assessment"}
                  </Button>
                </>
              )
            )}
          </section>
          <section className="border-t pt-4">
            <h2 className="mb-3 text-xl">Audit history</h2>
            {audit.map((a) => (
              <p key={a.id} className="mb-2 text-xs">
                {a.summary} · {a.actorId} · {a.at}
              </p>
            ))}
          </section>
        </aside>
      </div>
    </>
  );
}
