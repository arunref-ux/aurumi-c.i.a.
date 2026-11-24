import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "@/components/app/icons";
import { businessFitDestinations } from "@/integrations/adapters/business-fit";
import {
  answerText,
  type BusinessFitReport,
  type BusinessFitQuestionnaireVersion,
} from "@/domain/business-fit";
export const fitInput =
  "w-full rounded-md border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
export function FitShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="fit-no-print border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5 md:px-8">
          <Link to="/business-fit" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-primary font-display text-xl text-primary-foreground">
              A
            </span>
            <span className="text-lg font-semibold">
              Aurumi <span className="font-normal text-muted-foreground">/ Business Fit</span>
            </span>
          </Link>
          <a
            href={businessFitDestinations.cia}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm"
          >
            About C.I.A. <ArrowUpRight className="size-4" />
          </a>
        </div>
      </header>
      {children}
      <footer className="fit-no-print mx-auto mt-10 flex max-w-6xl flex-wrap justify-between gap-3 border-t px-5 py-6 text-xs text-muted-foreground md:px-8">
        <span>Aurumi · Chief Information Assistant</span>
        <span>Demonstration · simulated storage and integrations · fictional data only</span>
      </footer>
    </div>
  );
}
export function FitError({ error }: { error: unknown }) {
  return error ? (
    <p
      role="alert"
      className="my-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}
export function OfficialLink({ label = "Explore Aurumi" }: { label?: string }) {
  return (
    <Button variant="outline" asChild>
      <a href={businessFitDestinations.aurumi} target="_blank" rel="noreferrer">
        {label}
        <ArrowUpRight />
      </a>
    </Button>
  );
}
export function ResponseSummary({
  responses,
  questionnaire,
}: {
  responses: BusinessFitReport["responses"];
  questionnaire: BusinessFitQuestionnaireVersion;
}) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {Object.entries(responses)
        .filter(([, v]) => v !== "" && (!Array.isArray(v) || v.length))
        .map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs text-muted-foreground">
              {questionnaire.questions.find((q) => q.id === key)?.prompt ?? key}
            </dt>
            <dd className="mt-1 break-words text-sm">{answerText(value)}</dd>
          </div>
        ))}
    </dl>
  );
}
export function FitReport({
  report,
  questionnaire,
}: {
  report: BusinessFitReport;
  questionnaire: BusinessFitQuestionnaireVersion;
}) {
  const systems = report.responses["systems"];
  return (
    <article id="business-fit-print" className="space-y-10">
      <section className="border-b pb-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Preliminary business guidance
        </p>
        <h1 className="text-4xl md:text-5xl">Your Business Fit report</h1>
        <p className="mt-3 text-lg">
          {answerText(report.responses["businessName"]) === "Not supplied"
            ? "Your business"
            : answerText(report.responses["businessName"])}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ["Industry", "industry"],
            ["Employees", "employeeBand"],
            ["Locations", "locations"],
            ["Country", "country"],
          ].map(([label, key]) => (
            <div key={key}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-medium">{answerText(report.responses[key ?? ""])}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm">
          <span className="font-medium">Primary priorities:</span>{" "}
          {answerText(report.responses["priorities"])}
        </p>
      </section>
      <section>
        <h2 className="mb-5 text-3xl">How your business works today</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {report.dimensions.map((d) => (
            <div key={d.dimension} className="rounded-md border bg-card p-5">
              <h3 className="text-sm font-semibold">{d.dimension}</h3>
              <p
                className={`mt-3 text-lg font-medium ${d.level === "Insufficient information" ? "text-muted-foreground" : "text-foreground"}`}
              >
                {d.level}
              </p>
              <div className="my-3 flex gap-1" aria-hidden="true">
                {["Foundational", "Developing", "Established", "Advanced"].map((level, i) => {
                  const rank = ["Foundational", "Developing", "Established", "Advanced"].indexOf(
                    d.level,
                  );
                  return (
                    <span
                      key={level}
                      className={`h-1.5 flex-1 rounded-sm ${rank >= i ? "bg-accent" : "bg-muted"}`}
                    />
                  );
                })}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{d.explanation}</p>
              <p className="mt-3 text-xs">Information sufficiency: {d.sufficiency}</p>
              {d.gaps.length > 0 && (
                <details className="mt-3 text-xs">
                  <summary>Information gaps ({d.gaps.length})</summary>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    {d.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Business maturity is not an Aurumi suitability score. Accessible, established systems may
          be worth retaining.
        </p>
      </section>
      <section>
        <h2 className="mb-5 text-3xl">Your improvement opportunities</h2>
        {report.opportunities.length === 0 ? (
          <p className="text-muted-foreground">
            More information is needed before recommending specific improvements. Start by
            documenting one recurring task and the systems it uses.
          </p>
        ) : (
          <div className="divide-y border-y">
            {report.opportunities.map((o, i) => (
              <div key={o.id} className="grid gap-3 py-6 sm:grid-cols-[40px_1fr]">
                <span className="font-mono text-sm text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-xs text-muted-foreground">{o.category}</p>
                  <h3 className="mt-1 text-lg font-semibold">{o.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed">{o.why}</p>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">Next step:</span> {o.nextStep}
                  </p>
                  {o.validationRequired && (
                    <p className="mt-2 text-xs text-warning">Further validation required</p>
                  )}
                  <details className="mt-3 text-xs text-muted-foreground">
                    <summary>Why this recommendation?</summary>
                    <ul className="mt-2 space-y-1">
                      {o.responseRefs.map((ref) => (
                        <li key={ref}>
                          {questionnaire.questions.find((q) => q.id === ref)?.prompt ?? ref}:{" "}
                          {answerText(report.responses[ref])}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 font-mono">
                      Rules: {o.ruleRefs.join(", ")} · {report.ruleSetVersionId}
                    </p>
                  </details>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-4 text-3xl">Your existing software</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Retain suitable systems. First review the features, reporting and automation you already
          have.
        </p>
        {Array.isArray(systems) && systems.length ? (
          <ul className="divide-y border-y">
            {systems.map((s, i) =>
              typeof s === "string" ? null : (
                <li key={i} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                  <span className="font-medium">{s.name || s.kind}</span>
                  <span className="text-muted-foreground">
                    {s.function} · {s.kind}
                  </span>
                </li>
              ),
            )}
          </ul>
        ) : (
          <p className="text-sm">
            No systems supplied; this is an information gap, not a finding that your business lacks
            software.
          </p>
        )}
      </section>
      <section>
        <h2 className="mb-4 text-3xl">Where Aurumi may help</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Demonstration catalog only. A listed software product is not evidence of a connector or
          partnership.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {report.opportunities
            .filter((o) => o.capability)
            .map(
              (o) =>
                o.capability && (
                  <div key={o.id} className="rounded-md border bg-card p-5">
                    <p className="text-xs text-muted-foreground">
                      {o.capability.kind.replaceAll("_", " ")} ·{" "}
                      {o.capability.claim === "available"
                        ? "Available in illustrative catalog"
                        : o.capability.claim === "unsupported"
                          ? "Unsupported"
                          : "Potential — validation required"}
                    </p>
                    <h3 className="mt-2 font-semibold">{o.capability.name}</h3>
                    <p className="mt-2 text-sm">{o.capability.description}</p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {o.capability.qualification}
                    </p>
                  </div>
                ),
            )}
        </div>
        {!report.opportunities.some((o) => o.capability) && (
          <p className="text-sm">
            No specific capability can be responsibly suggested from these responses. Validate your
            priorities and requirements first.
          </p>
        )}
      </section>
      <section>
        <h2 className="mb-4 text-3xl">A practical place to start</h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {[
            "Start with one process improvement and better use of existing software.",
            "Validate important information, interfaces and access requirements.",
            "Explore suitable capabilities and, if useful, a professional assessment.",
          ].map((s, i) => (
            <li key={s} className="border-t pt-4">
              <p className="font-mono text-xs text-muted-foreground">0{i + 1}</p>
              <p className="mt-2 text-sm leading-relaxed">{s}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="border-t pt-6">
        <h2 className="text-xl">Report limitations</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{report.limitation}</p>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Questionnaire: {report.questionnaireVersionId} · Rules: {report.ruleSetVersionId}
        </p>
      </section>
    </article>
  );
}
