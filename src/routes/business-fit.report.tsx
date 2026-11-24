import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FitError,
  FitReport,
  OfficialLink,
  fitInput,
  ResponseSummary,
} from "@/components/business-fit/shared";
import { useBusinessFitSession } from "@/lib/business-fit-session";
import { businessFitPublic } from "@/data/business-fit-public";
const title = "Your Business Fit Report — Aurumi";
const description =
  "Your preliminary business maturity profile, explained improvement opportunities and practical next steps.";
export const Route = createFileRoute("/business-fit/report")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Report,
});
function Report() {
  const s = useBusinessFitSession(),
    [request, setRequest] = useState(false),
    [pending, setPending] = useState(false),
    [confirmation, setConfirmation] = useState("");
  const [contact, setContact] = useState({
    name: "",
    businessName: "",
    email: "",
    phone: "",
    country: "",
    preferredContact: "email",
    comments: "",
    contactConsent: false,
    marketingConsent: false,
  });
  if (!s.ready) return <p className="p-8">Opening your report…</p>;
  if (!s.session?.report || !s.handle)
    return (
      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="text-4xl">Your Business Fit report</h1>
        <p className="my-5">
          Complete your own check to view a report. Reports cannot be opened using another person’s
          reference.
        </p>
        <Button asChild>
          <Link to="/business-fit/start">Start your check</Link>
        </Button>
        <FitError error={s.error} />
      </main>
    );
  const session = s.session,
    handle = s.handle,
    report = session.report;
  if (!report) return null;
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:px-8">
      <div className="fit-no-print mb-8 flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
        <OfficialLink />
        <Button onClick={() => setRequest(true)}>Request a C.I.A. consultation</Button>
        <Button variant="ghost" asChild>
          <Link
            to="/business-fit/start"
            onClick={() => {
              s.clear();
            }}
          >
            Start a new check
          </Link>
        </Button>
      </div>
      <FitReport report={report} questionnaire={session.questionnaire} />
      {request && (
        <section className="fit-no-print mt-10 border-t pt-8">
          <h2 className="text-3xl">Request a C.I.A. consultation</h2>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Only if you submit, your contact details, responses and this report will be shared with
            the C.I.A. team. The ShopTalk lead is simulated; no email, message or booking will be
            sent. Use fictional details in this prototype.
          </p>
          <details className="my-5">
            <summary className="cursor-pointer text-sm font-medium">
              Review the Business Fit information to be shared
            </summary>
            <div className="mt-4">
              <ResponseSummary
                responses={session.responses}
                questionnaire={session.questionnaire}
              />
            </div>
          </details>
          {confirmation || session.consultationId ? (
            <div role="status" className="mt-5 border border-success/30 bg-success-soft p-5">
              <h3 className="font-semibold">Consultation request saved</h3>
              <p className="mt-2 text-sm">
                {confirmation ||
                  "Your earlier request is recorded; submitting again will not create another lead."}
              </p>
              <p className="mt-2 text-xs">
                Simulated ShopTalk integration · No outbound communication
              </p>
            </div>
          ) : (
            <form
              className="mt-5 max-w-3xl"
              onSubmit={async (e) => {
                e.preventDefault();
                setPending(true);
                s.setError("");
                try {
                  const result = await businessFitPublic.consult(handle, contact);
                  setConfirmation(`${result.reference} · Lead ${result.leadReference}`);
                  s.refresh();
                } catch (error) {
                  s.setError(error instanceof Error ? error.message : "Unable to submit");
                } finally {
                  setPending(false);
                }
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {(["name", "businessName", "email", "phone", "country"] as const).map((key) => (
                  <label key={key} className="text-sm">
                    {
                      {
                        name: "Name",
                        businessName: "Business name",
                        email: "Business email",
                        phone: "Phone (optional)",
                        country: "Country",
                      }[key]
                    }
                    <input
                      className={`${fitInput} mt-1`}
                      required={key === "name" || key === "email" || key === "country"}
                      type={key === "email" ? "email" : key === "phone" ? "tel" : "text"}
                      value={contact[key]}
                      onChange={(e) => setContact({ ...contact, [key]: e.target.value })}
                    />
                  </label>
                ))}
                <label className="text-sm">
                  Preferred contact method
                  <select
                    className={`${fitInput} mt-1`}
                    value={contact.preferredContact}
                    onChange={(e) => setContact({ ...contact, preferredContact: e.target.value })}
                  >
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                  </select>
                </label>
                <label className="text-sm sm:col-span-2">
                  Comments (optional)
                  <textarea
                    className={`${fitInput} mt-1`}
                    value={contact.comments}
                    onChange={(e) => setContact({ ...contact, comments: e.target.value })}
                  />
                </label>
              </div>
              <label className="mt-5 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  required
                  checked={contact.contactConsent}
                  onChange={(e) => setContact({ ...contact, contactConsent: e.target.checked })}
                />
                I consent to be contacted about this request and to share my contact information and
                Business Fit report with the C.I.A. team.
              </label>
              <label className="mt-3 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={contact.marketingConsent}
                  onChange={(e) => setContact({ ...contact, marketingConsent: e.target.checked })}
                />
                Optional: I would like marketing updates.
              </label>
              <FitError error={s.error} />
              <Button className="mt-5" type="submit" disabled={pending}>
                {pending
                  ? "Processing and saving…"
                  : s.error
                    ? "Retry consultation request"
                    : "Submit consultation request"}
              </Button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
