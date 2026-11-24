import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useBusinessFitSession } from "@/lib/business-fit-session";
import { businessFitPublic } from "@/data/business-fit-public";
import { FitQuestions } from "@/components/business-fit/questionnaire";
import { FitError, ResponseSummary } from "@/components/business-fit/shared";
import { FIT_SCENARIOS } from "@/data/business-fit-seed";
const title = "Check Your Business Fit — Aurumi";
const description =
  "Describe your business, systems and improvement priorities in a short, anonymous Business Fit questionnaire.";
export const Route = createFileRoute("/business-fit/start")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Start,
});
function Start() {
  const s = useBusinessFitSession(),
    navigate = useNavigate();
  const run = (fn: () => void) => {
    try {
      fn();
      s.setError("");
      s.refresh();
    } catch (e) {
      s.setError(e instanceof Error ? e.message : "Unable to save");
    }
  };
  if (!s.ready) return <p className="p-8">Opening your Business Fit check…</p>;
  if (!s.session || !s.handle)
    return (
      <main className="mx-auto max-w-3xl px-5 py-14">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          A fresh perspective
        </p>
        <h1 className="mt-3 text-4xl">Your Business Fit check</h1>
        <p className="mt-4 text-muted-foreground">
          No contact details are needed for your report. Use fictional information in this
          demonstration.
        </p>
        <FitError error={s.error} />
        <Button
          className="mt-6"
          onClick={() =>
            run(() => {
              s.begin();
            })
          }
        >
          Begin check
        </Button>
        <div className="mt-10 border-t pt-5">
          <p className="mb-3 text-sm font-medium">Fictional demonstration scenarios</p>
          <div className="flex flex-wrap gap-2">
            {FIT_SCENARIOS.map((scenario) => (
              <Button
                key={scenario.name}
                variant="outline"
                size="sm"
                onClick={() =>
                  run(() => {
                    const h = s.begin();
                    businessFitPublic.save(h, scenario.responses, 0);
                  })
                }
              >
                {scenario.name}
              </Button>
            ))}
          </div>
        </div>
      </main>
    );
  const session = s.session,
    handle = s.handle;
  if (session.report)
    return (
      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="text-4xl">Your report is ready</h1>
        <div className="mt-6 flex gap-3">
          <Button asChild>
            <Link to="/business-fit/report">View your report</Link>
          </Button>
          <Button variant="outline" onClick={() => run(() => s.clear())}>
            Start a new check
          </Button>
        </div>
      </main>
    );
  return (
    <main className="mx-auto max-w-3xl px-5 py-10 md:py-14">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Step {session.step + 1} of 5
        </p>
        <Button variant="ghost" size="sm" onClick={() => run(() => s.clear())}>
          Clear this check
        </Button>
      </div>
      <div className="mt-3 flex gap-2" aria-label={`Step ${session.step + 1} of 5`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-sm ${i <= session.step ? "bg-accent" : "bg-muted"}`}
          />
        ))}
      </div>
      <h1 className="mt-7 text-4xl">
        {session.step === 4
          ? "Review your Business Fit"
          : session.questionnaire.sections[session.step]}
      </h1>
      <p className="mb-8 mt-3 text-sm text-muted-foreground">
        {session.step === 4
          ? "Your guidance will be based on these self-reported responses. Nothing has been independently verified."
          : "Answer what you know. Optional questions may be skipped, and “Not sure” is a valid answer."}
      </p>
      <FitError error={s.error} />
      {session.step === 4 ? (
        <>
          <ResponseSummary responses={session.responses} questionnaire={session.questionnaire} />
          <div className="mt-6 flex flex-wrap gap-2">
            {session.questionnaire.sections.map((label, i) => (
              <Button
                key={label}
                variant="outline"
                size="sm"
                onClick={() => run(() => businessFitPublic.save(handle, session.responses, i))}
              >
                Edit {label.toLowerCase()}
              </Button>
            ))}
          </div>
          <p className="mt-6 border-t pt-5 text-sm text-muted-foreground">
            Generate your report without providing contact information. Your anonymous check is not
            sent to the C.I.A. team.
          </p>
        </>
      ) : (
        <FitQuestions
          questionnaire={session.questionnaire}
          responses={session.responses}
          step={session.step}
          onChange={(key, value) =>
            run(() =>
              businessFitPublic.save(handle, { ...session.responses, [key]: value }, session.step),
            )
          }
        />
      )}
      <div className="mt-10 flex justify-between border-t pt-5">
        <Button
          variant="outline"
          disabled={session.step === 0}
          onClick={() =>
            run(() => {
              businessFitPublic.move(handle, "previous");
            })
          }
        >
          Previous
        </Button>
        <Button
          onClick={() =>
            run(() => {
              if (session.step === 4) {
                businessFitPublic.generate(handle);
                void navigate({ to: "/business-fit/report" });
              } else businessFitPublic.move(handle, "next");
            })
          }
        >
          {session.step === 4 ? "Generate my report" : "Next"}
        </Button>
      </div>
    </main>
  );
}
