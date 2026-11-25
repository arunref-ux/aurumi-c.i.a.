/** Print-friendly rendering of a proposal document (working draft or frozen version). */
import {
  DELIVERABLE_CLASSES,
  fmtMoney,
  INCLUSION,
  LINE_CATEGORIES,
  LINE_CLASSES,
  OPTION_KINDS,
  PARTIES,
  RECURRENCE,
  RISK_CATEGORIES,
  RISK_RESOLUTION,
  TERM_KINDS,
  type ProposalDocument,
} from "@/domain/proposal";
import { btnGhost } from "@/components/assessment/fields";
import { Button } from "@/components/ui/button";

const BASIS: Record<string, string> = {
  published: "Price-book list price",
  quoted: "Third-party quote",
  proposed_override: "Proposed override (not approved)",
  approved_override: "Approved customer price",
  price_exception: "Published price used under a commercial exception",
  estimate: "Estimate",
  discount: "Discount",
  none: "—",
};

export function printProposal() {
  document.body.classList.add("printing-proposal");
  const done = () => {
    document.body.classList.remove("printing-proposal");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

export function ProposalPreview({
  doc,
  label,
  issuedAt,
  expiresAt,
}: {
  doc: ProposalDocument;
  label: string;
  issuedAt?: string | undefined;
  expiresAt?: string | undefined;
}) {
  const c = doc.commercials;
  const hasCommercials = c.lines.length > 0 || c.partnerTerms.length > 0;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Button variant="outline" className={btnGhost} onClick={printProposal}>
          Print / save as PDF
        </Button>
      </div>
      <article
        id="proposal-print"
        className="rounded-lg border bg-card p-8 text-sm leading-relaxed shadow-card"
      >
        <header className="mb-6 border-b pb-4">
          <p className="text-xs font-semibold tracking-widest text-accent-foreground uppercase">
            Aurumi · C.I.A.
          </p>
          <h1 className="mt-1 font-serif text-3xl">{doc.proposal.title}</h1>
          <p className="mt-2 break-words text-xs text-muted-foreground">
            Proposal {doc.proposal.id} · {label}
          </p>
          <p className="mt-1 text-muted-foreground">
            Prepared for {doc.recipient.name}
            {doc.recipient.organization && doc.recipient.organization !== doc.recipient.name
              ? `, ${doc.recipient.organization}`
              : ""}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {doc.trackLabel} · {issuedAt ? `Issued ${issuedAt.slice(0, 10)}` : "Not issued"}
            {expiresAt
              ? ` · Valid until ${expiresAt.slice(0, 10)}`
              : ` · Valid ${doc.validityDays} days from issue`}
            {" · "}Based on approved solution v{doc.source.solutionSnapshotVersion}
          </p>
        </header>
        {doc.sections
          .filter(
            (s) =>
              s.key !== "cover" && (s.body.trim() || s.key === "scope" || s.key === "commercials"),
          )
          .map((s) => (
            <section key={s.key} className="mb-5 break-inside-avoid">
              <h2 className="mb-1 font-serif text-lg">{s.title}</h2>
              {s.origin === "ai_draft" && !s.reviewed && (
                <p className="mb-1 text-xs text-warning">AI draft — not yet reviewed</p>
              )}
              {s.body.trim() && <p className="whitespace-pre-line">{s.body}</p>}
              {s.key === "scope" && (
                <table className="mt-2 w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">Deliverable</th>
                      <th className="pr-3">Status</th>
                      <th className="pr-3">Responsible</th>
                      <th>Acceptance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.deliverables.map((d) => (
                      <tr key={d.id} className="border-t align-top">
                        <td className="py-1 pr-2">
                          {d.description}
                          {d.qualification && (
                            <p className="text-muted-foreground">
                              Qualification: {d.qualification}
                            </p>
                          )}
                        </td>
                        <td className="pr-2">
                          {INCLUSION[d.inclusion]} · {DELIVERABLE_CLASSES[d.info.classification]}
                        </td>
                        <td className="pr-2">{PARTIES[d.responsibleParty]}</td>
                        <td>{d.acceptanceCriterion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {s.key === "commercials" && hasCommercials && <Commercials doc={doc} />}
            </section>
          ))}
        {doc.options.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-1 font-serif text-lg">Options</h2>
            {doc.options.map((o) => (
              <p key={o.id}>
                <strong>
                  {OPTION_KINDS[o.kind]}: {o.label}.
                </strong>{" "}
                {o.summary}
              </p>
            ))}
          </section>
        )}
        <section className="mb-5">
          <h2 className="mb-1 font-serif text-lg">Indicative timeline</h2>
          <p className="mb-1 text-xs text-muted-foreground">
            Durations are indicative planning assumptions, not contractual dates.
          </p>
          <ul className="list-disc pl-5">
            {doc.milestones.map((m) => (
              <li key={m.id}>
                {m.title}
                {m.indicativeDuration ? ` — ${m.indicativeDuration}` : ""} (
                {PARTIES[m.responsibleParty]})
                {m.paymentTrigger ? ` · Payment trigger: ${m.paymentTrigger}` : ""}
              </li>
            ))}
          </ul>
        </section>
        <section className="mb-5">
          <h2 className="mb-1 font-serif text-lg">Qualifications and risks</h2>
          <ul className="list-disc pl-5">
            {doc.risks
              .filter((r) => r.resolution !== "resolved")
              .map((r) => (
                <li key={r.id}>
                  {RISK_CATEGORIES[r.category]}: {r.description} — {RISK_RESOLUTION[r.resolution]}
                  {r.qualification ? ` (${r.qualification})` : ""}
                </li>
              ))}
          </ul>
        </section>
        <footer className="border-t pt-3 text-xs text-muted-foreground">
          {doc.disclosure} Recording a recipient's acceptance is not a signed contract. Prices are
          illustrative ({c.priceBookVersion}).
        </footer>
      </article>
    </div>
  );
}

function Commercials({ doc }: { doc: ProposalDocument }) {
  const c = doc.commercials;
  return (
    <div className="mt-2 flex flex-col gap-3">
      {c.lines.length > 0 && (
        <table className="proposal-lines w-full text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 pr-3">Item</th>
              <th className="pr-3">Qty</th>
              <th className="pr-3">Billing</th>
              <th className="pr-3">Basis</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="py-1 pr-2">
                  {l.description || LINE_CATEGORIES[l.category]}
                  {l.priceRef && (
                    <span className="block text-muted-foreground">
                      {l.priceRef.priceBookItemId} · list{" "}
                      {fmtMoney(l.priceRef.publishedAmount, l.priceRef.currency)}/{l.priceRef.unit}
                    </span>
                  )}
                </td>
                <td>{l.quantity}</td>
                <td>{RECURRENCE[l.recurrence]}</td>
                <td>
                  {l.classification === "priced"
                    ? BASIS[l.computed.basis]
                    : LINE_CLASSES[l.classification]}
                </td>
                <td className="text-right">
                  {l.computed.counted ? fmtMoney(l.computed.amount, l.currency) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {c.summary.totals.map((t) => (
        <dl
          key={t.currency}
          className="grid grid-cols-2 gap-x-4 rounded-md bg-muted px-3 py-2 text-xs sm:grid-cols-4"
        >
          <dt>One-time, before tax ({t.currency})</dt>
          <dd>{fmtMoney(t.oneTime, t.currency)}</dd>
          <dt>Monthly run rate, before tax</dt>
          <dd>{fmtMoney(t.monthly, t.currency)}</dd>
          <dt>Annual run rate, before tax</dt>
          <dd>{fmtMoney(t.annual, t.currency)}</dd>
          <dt>One-time tax</dt>
          <dd>{fmtMoney(t.tax.one_time, t.currency)}</dd>
          <dt>Monthly tax</dt>
          <dd>{fmtMoney(t.tax.monthly, t.currency)}</dd>
          <dt>Annual tax</dt>
          <dd>{fmtMoney(t.tax.annual, t.currency)}</dd>
          <dt className="font-semibold">Estimated initial cost</dt>
          <dd className="font-semibold">
            {fmtMoney(t.initialCost, t.currency)}
            {t.includesEstimates ? " (includes estimates)" : ""}
          </dd>
        </dl>
      ))}
      {c.taxes.length > 0 ? (
        <ul className="list-disc pl-5 text-xs">
          {c.taxes.map((tax) => (
            <li key={tax.id}>
              {tax.label}: {tax.ratePercent}% · {tax.currency} · applies to{" "}
              {tax.appliesTo.replace("_", " ")} · source: {tax.source}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No tax configured; this is not a tax determination.
        </p>
      )}
      {c.summary.warnings.map((w) => (
        <p key={w} className="text-xs text-muted-foreground">
          {w}
        </p>
      ))}
      {c.partnerTerms.length > 0 && (
        <ul className="list-disc pl-5 text-xs">
          {c.partnerTerms.map((t) => (
            <li key={t.id}>
              {TERM_KINDS[t.kind]}: {t.description} —{" "}
              {t.status === "approved" ? "approved term" : "proposed term (not binding)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
