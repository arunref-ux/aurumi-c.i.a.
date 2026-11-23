/** Proposal Studio workspace sections A–J. Source facts are read-only; classifications are derived. */
import { useState } from "react";
import { Panel, StatusPill, type Tone } from "@/components/app/ui-bits";
import { CollectionEditor } from "@/components/assessment/collection-editor";
import { btnGhost, btnPrimary, ErrorNote, TextField } from "@/components/assessment/fields";
import type { ProposalView } from "@/data/proposal-studio";
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
  TRACKS,
  type CommercialLine,
  type ContentKey,
  type Deliverable,
  type DeliverableClass,
  type Milestone,
  type PartnerTerm,
  type ProposalOption,
  type RiskItem,
  type TaxConfig,
} from "@/domain/proposal";
import { useProposalMutation } from "@/lib/proposal-queries";

export const CLASS_TONE: Record<DeliverableClass, Tone> = {
  available_verified: "success",
  conditional: "warning",
  planned_custom: "info",
  third_party: "neutral",
  process_change: "neutral",
  not_included: "neutral",
};
const SEVERITY = { high: "High", medium: "Medium", low: "Low" };
const num = (v: unknown) => (v === "" || v === undefined || v === null ? undefined : Number(v));
const opt = <T,>(cond: boolean, v: T) => (cond ? v : undefined);

function useChild() {
  return {
    up: useProposalMutation((s) => s.upsertChild),
    rm: useProposalMutation((s) => s.removeChild),
  };
}

// ---------- A. Overview ----------
export function OverviewSection({ view }: { view: ProposalView }) {
  const { proposal: p, workspace: ws, source: h } = view;
  const save = useProposalMutation((s) => s.saveMeta);
  const [v, setV] = useState({
    title: p.title,
    name: ws.recipient.name,
    organization: ws.recipient.organization,
    contact: ws.recipient.contact,
    validityDays: String(ws.validityDays),
  });
  const can = view.permissions.canEdit;
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Proposal and recipient">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            label="Proposal title"
            value={v.title}
            disabled={!can}
            onChange={(x) => setV({ ...v, title: x })}
          />
          <TextField
            label="Validity (days from issue)"
            value={v.validityDays}
            disabled={!can}
            onChange={(x) => setV({ ...v, validityDays: x })}
          />
          <TextField
            label="Recipient name"
            value={v.name}
            disabled={!can}
            onChange={(x) => setV({ ...v, name: x })}
          />
          <TextField
            label="Recipient organization"
            value={v.organization}
            disabled={!can}
            onChange={(x) => setV({ ...v, organization: x })}
          />
          <TextField
            label="Recipient contact (fictional)"
            value={v.contact}
            disabled={!can}
            onChange={(x) => setV({ ...v, contact: x })}
          />
        </div>
        {can && (
          <div className="mt-3 flex items-center gap-3">
            <button
              className={btnPrimary}
              disabled={save.isPending}
              onClick={() =>
                save.mutate([
                  p.id,
                  {
                    title: v.title,
                    validityDays: Number(v.validityDays) || 30,
                    recipient: { name: v.name, organization: v.organization, contact: v.contact },
                  },
                ])
              }
            >
              Save
            </button>
            <ErrorNote error={save.error} />
          </div>
        )}
      </Panel>
      <Panel title="Authoritative source (read-only)">
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <dt className="text-muted-foreground">Track</dt>
          <dd>{TRACKS[p.track].label}</dd>
          <dt className="text-muted-foreground">Approved solution</dt>
          <dd>
            {h?.solution.title ?? p.source.solutionId} · snapshot v
            {p.source.solutionSnapshotVersion} ({p.source.solutionSnapshotId})
          </dd>
          <dt className="text-muted-foreground">Assessment snapshot</dt>
          <dd>
            {p.source.assessmentSnapshotId} · v{p.source.assessmentSnapshotVersion}
          </dd>
          <dt className="text-muted-foreground">Working revision</dt>
          <dd>{p.revision}</dd>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">{TRACKS[p.track].disclosure}</p>
      </Panel>
      <ReadinessList view={view} />
    </div>
  );
}
export function ReadinessList({ view }: { view: ProposalView }) {
  return (
    <Panel title={`Readiness — ${view.readinessPercent}%`}>
      <ul className="flex flex-col gap-2 text-sm">
        {view.readiness.map((i) => (
          <li key={i.key}>
            <span className={i.ok ? "text-success" : "text-warning"}>{i.ok ? "●" : "○"}</span>{" "}
            {i.label}
            {i.detail.map((d) => (
              <p key={d} className="pl-4 text-xs text-muted-foreground">
                {d}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------- B. Content ----------
export function ContentSection({ view }: { view: ProposalView }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        “Imported” text comes from the approved solution. AI drafts are simulated and stay marked as
        drafts until you review them. Avoid guarantees, certifications, testimonials or case studies
        without approved source material.
      </p>
      {view.workspace.sections.map((s) => (
        <SectionEditor key={`${s.key}-${s.updatedAt}`} view={view} k={s.key} />
      ))}
    </div>
  );
}
function SectionEditor({ view, k }: { view: ProposalView; k: ContentKey }) {
  const s = view.workspace.sections.find((x) => x.key === k)!;
  const [body, setBody] = useState(s.body);
  const save = useProposalMutation((x) => x.saveSection);
  const draft = useProposalMutation((x) => x.draftSection);
  const can = view.permissions.canEdit;
  const required = TRACKS[view.proposal.track].required.includes(k);
  return (
    <Panel
      title={`${s.title}${required ? " *" : ""}`}
      action={
        <StatusPill
          tone={
            s.origin === "ai_draft"
              ? s.reviewed
                ? "info"
                : "warning"
              : s.origin === "imported"
                ? "gold"
                : "neutral"
          }
        >
          {s.origin === "ai_draft"
            ? s.reviewed
              ? "AI draft — reviewed"
              : "AI draft — needs review"
            : s.origin === "imported"
              ? "Imported from solution"
              : "Authored"}
        </StatusPill>
      }
    >
      <TextField label="Text" multiline value={body} disabled={!can} onChange={setBody} />
      {can && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className={btnPrimary}
            disabled={save.isPending}
            onClick={() => save.mutate([view.proposal.id, k, { body }])}
          >
            Save
          </button>
          {s.origin === "ai_draft" && !s.reviewed && (
            <button
              className={btnGhost}
              onClick={() => save.mutate([view.proposal.id, k, { body, reviewed: true }])}
            >
              Mark reviewed
            </button>
          )}
          <button
            className={btnGhost}
            disabled={draft.isPending}
            onClick={() => draft.mutate([view.proposal.id, k])}
          >
            Simulated AI draft
          </button>
          <ErrorNote error={save.error ?? draft.error} />
        </div>
      )}
    </Panel>
  );
}

// ---------- C. Scope & deliverables ----------
export function DeliverablesSection({ view }: { view: ProposalView }) {
  const { up, rm } = useChild();
  const id = view.proposal.id;
  const recs = Object.fromEntries(
    (view.source?.recommendations ?? []).map((r) => [r.id, `${r.title} (${r.availability})`]),
  );
  return (
    <CollectionEditor<Deliverable>
      items={view.workspace.deliverables}
      canEdit={view.permissions.canEdit}
      emptyTitle="No deliverables"
      addLabel="Add deliverable"
      itemLabel={(d) => d.description}
      fields={[
        {
          key: "recommendationId",
          label: "Source recommendation",
          kind: "select",
          options: recs,
          required: true,
        },
        { key: "description", label: "Description", kind: "text" },
        { key: "inclusion", label: "Inclusion", kind: "select", options: INCLUSION },
        { key: "responsibleParty", label: "Responsible party", kind: "select", options: PARTIES },
        { key: "acceptanceCriterion", label: "Acceptance criterion", kind: "textarea" },
        { key: "customerDependencies", label: "Customer dependencies", kind: "textarea" },
        { key: "deliveryAssumptions", label: "Delivery assumptions", kind: "textarea" },
        {
          key: "qualification",
          label: "Visible qualification",
          kind: "textarea",
          help: "Required for conditional, planned, third-party or unverified items.",
          wide: true,
        },
      ]}
      blank={() => ({
        recommendationId: Object.keys(recs)[0] ?? "",
        inclusion: "included",
        responsibleParty: "aurumi",
      })}
      onSave={(d) => up.mutateAsync([id, "deliverables", d as never])}
      onRemove={(x) => rm.mutateAsync([id, "deliverables", x])}
      summary={(d) => {
        const info = view.deliverables[d.id]!;
        return (
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{d.description}</span>
              <StatusPill tone={CLASS_TONE[info.classification]}>
                {DELIVERABLE_CLASSES[info.classification]}
              </StatusPill>
              <StatusPill>{INCLUSION[d.inclusion]}</StatusPill>
              <span className="text-xs text-muted-foreground">Evidence: {info.evidence}</span>
            </div>
            <p className="text-xs text-muted-foreground">From: {info.recommendationTitle}</p>
            {info.reasons.map((r) => (
              <p key={r} className="text-xs text-warning">
                {r}
              </p>
            ))}
            {d.qualification && <p className="text-xs">Qualification: {d.qualification}</p>}
          </div>
        );
      }}
    />
  );
}

// ---------- D. Commercials ----------
export function CommercialsSection({ view }: { view: ProposalView }) {
  const { up, rm } = useChild();
  const id = view.proposal.id;
  const refresh = useProposalMutation((s) => s.refreshPrices);
  const auth = useProposalMutation((s) => s.authorizeCommercial);
  const book = Object.fromEntries([
    ["", "— none —"],
    ...view.priceBook.items.map((i) => [
      i.id,
      `${i.name} · ${fmtMoney(i.amount, i.currency)}/${i.unit} · ${RECURRENCE[i.recurrence]}`,
    ]),
  ]);
  const canAuth = view.permissions.canAuthorizeCommercials;
  const capabilities = Object.fromEntries([
    ["", "— general —"],
    ...(view.source?.catalog.items ?? []).map((c) => [c.id, `${c.product} — ${c.capability}`]),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        Pricing Studio is the authority for published prices. Book {view.priceBook.priceBookVersion}{" "}
        — illustrative amounts only. Overrides and discounts are proposals until approved; nothing
        here changes the price book.
      </p>
      <Panel
        title="Commercial lines"
        action={
          view.permissions.canEdit && (
            <button className={btnGhost} onClick={() => refresh.mutate([id])}>
              Refresh prices
            </button>
          )
        }
      >
        <CollectionEditor<CommercialLine>
          items={view.workspace.lines}
          canEdit={view.permissions.canEdit}
          emptyTitle="No commercial lines"
          emptyBody={
            TRACKS[view.proposal.track].pricing === "required"
              ? "A commercial proposal needs at least one priced line."
              : "Pricing is optional for this track."
          }
          addLabel="Add line"
          itemLabel={(l) => l.description || LINE_CATEGORIES[l.category]}
          fields={[
            { key: "category", label: "Category", kind: "select", options: LINE_CATEGORIES },
            {
              key: "classification",
              label: "Classification",
              kind: "select",
              options: LINE_CLASSES,
            },
            { key: "description", label: "Description", kind: "text" },
            {
              key: "catalogItemId",
              label: "Product / capability (blank = general)",
              kind: "select",
              options: capabilities,
            },
            { key: "priceBookItemId", label: "Price-book item", kind: "select", options: book },
            { key: "quantity", label: "Quantity", kind: "text" },
            { key: "currency", label: "Currency (if not from price book)", kind: "text" },
            {
              key: "recurrence",
              label: "Billing (if not from price book)",
              kind: "select",
              options: { "": "—", ...RECURRENCE },
            },
            { key: "estimateAmount", label: "Estimated unit amount", kind: "text" },
            { key: "estimateBasis", label: "Estimate basis", kind: "text" },
            {
              key: "quotedAmount",
              label: "Quoted unit amount (third-party / custom)",
              kind: "text",
            },
            { key: "quoteReference", label: "Quote reference", kind: "text" },
            { key: "overrideAmount", label: "Proposed override unit amount", kind: "text" },
            { key: "overrideRationale", label: "Override rationale", kind: "text" },
            { key: "discountAmount", label: "Discount amount (discount lines)", kind: "text" },
            { key: "discountRationale", label: "Discount rationale", kind: "text" },
            {
              key: "exceptionRationale",
              label: "Price exception rationale (wrong capability or expired price)",
              kind: "text",
            },
          ]}
          blank={() => ({
            category: "aurumi_subscription",
            classification: "priced",
            quantity: "1",
            priceBookItemId: "",
            recurrence: "",
          })}
          fromItem={(l) => ({
            category: l.category,
            classification: l.classification,
            description: l.description,
            priceBookItemId: l.priceRef?.priceBookItemId ?? "",
            catalogItemId: l.catalogItemId ?? "",
            exceptionRationale: l.priceException?.rationale ?? "",
            quantity: String(l.quantity),
            currency: l.priceRef ? "" : l.currency,
            recurrence: l.priceRef ? "" : l.recurrence,
            estimateAmount: l.estimate ? String(l.estimate.unitAmount) : "",
            estimateBasis: l.estimate?.basis ?? "",
            quotedAmount: l.quoted ? String(l.quoted.unitAmount) : "",
            quoteReference: l.quoteReference,
            overrideAmount: l.override ? String(l.override.unitAmount) : "",
            overrideRationale: l.override?.rationale ?? "",
            discountAmount: l.discount ? String(l.discount.amount) : "",
            discountRationale: l.discount?.rationale ?? "",
          })}
          toInput={(v) => {
            const s = (k: string) => String(v[k] ?? "").trim();
            const out: Record<string, unknown> = {
              category: v["category"],
              classification: v["classification"],
              description: s("description"),
              quantity: num(s("quantity")) ?? 1,
              quoteReference: s("quoteReference"),
            };
            if (s("catalogItemId")) out["catalogItemId"] = s("catalogItemId");
            if (s("priceBookItemId")) out["priceBookItemId"] = s("priceBookItemId");
            if (s("priceBookItemId") && s("exceptionRationale"))
              out["priceException"] = {
                rationale: s("exceptionRationale"),
                permits: ["applicability", "expired"],
              };
            else {
              if (s("currency")) out["currency"] = s("currency").toUpperCase();
              if (s("recurrence")) out["recurrence"] = s("recurrence");
            }
            const e = opt(!!s("estimateAmount"), {
              unitAmount: num(s("estimateAmount")),
              basis: s("estimateBasis"),
            });
            const q = opt(!!s("quotedAmount"), { unitAmount: num(s("quotedAmount")) });
            const o = opt(!!s("overrideAmount"), {
              unitAmount: num(s("overrideAmount")),
              rationale: s("overrideRationale"),
            });
            const d = opt(!!s("discountAmount"), {
              amount: num(s("discountAmount")),
              rationale: s("discountRationale"),
            });
            if (e) out["estimate"] = e;
            if (q) out["quoted"] = q;
            if (o) out["override"] = o;
            if (d) out["discount"] = d;
            return out;
          }}
          onSave={(d) => up.mutateAsync([id, "lines", d as never])}
          onRemove={(x) => rm.mutateAsync([id, "lines", x])}
          summary={(l) => {
            const a = view.commercials.lines[l.id];
            return (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{l.description || LINE_CATEGORIES[l.category]}</span>
                <StatusPill>{LINE_CLASSES[l.classification]}</StatusPill>
                <span className="text-xs">
                  {l.quantity} × {RECURRENCE[l.recurrence]} ·{" "}
                  {a?.counted ? fmtMoney(a.amount, l.currency) : "—"}
                </span>
                {l.priceRef && (
                  <span className="text-xs text-muted-foreground">
                    {l.priceRef.priceBookItemId} @ {l.priceRef.priceBookVersion} (list{" "}
                    {fmtMoney(l.priceRef.publishedAmount, l.currency)})
                  </span>
                )}
                {l.override && (
                  <StatusPill tone={l.override.authorization ? "success" : "warning"}>
                    Override {fmtMoney(l.override.unitAmount, l.currency)} —{" "}
                    {l.override.authorization ? "approved" : "awaiting approval"}
                  </StatusPill>
                )}
                {l.discount && (
                  <StatusPill tone={l.discount.authorization ? "success" : "warning"}>
                    Discount — {l.discount.authorization ? "approved" : "awaiting approval"}
                  </StatusPill>
                )}
                {canAuth && l.override && !l.override.authorization && (
                  <button
                    className={btnGhost}
                    onClick={() => auth.mutate([id, { kind: "override", itemId: l.id }])}
                  >
                    Approve override
                  </button>
                )}
                {l.priceException && (
                  <StatusPill tone={l.priceException.authorization ? "success" : "warning"}>
                    Price exception —{" "}
                    {l.priceException.authorization ? "authorized" : "awaiting authorization"}
                  </StatusPill>
                )}
                {canAuth && l.priceException && !l.priceException.authorization && (
                  <button
                    className={btnGhost}
                    onClick={() => auth.mutate([id, { kind: "exception", itemId: l.id }])}
                  >
                    Authorize price exception
                  </button>
                )}
                {canAuth && l.discount && !l.discount.authorization && (
                  <button
                    className={btnGhost}
                    onClick={() => auth.mutate([id, { kind: "discount", itemId: l.id }])}
                  >
                    Approve discount
                  </button>
                )}
              </div>
            );
          }}
        />
        <ErrorNote error={refresh.error ?? auth.error} />
      </Panel>
      <Panel title="Calculation">
        {view.commercials.totals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No priced or estimated lines yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1">Currency</th>
                <th>One-time</th>
                <th>Monthly</th>
                <th>Annual</th>
                <th>Discounts</th>
                <th>Tax</th>
                <th>Initial cost</th>
              </tr>
            </thead>
            <tbody>
              {view.commercials.totals.map((t) => (
                <tr key={t.currency} className="border-t">
                  <td className="py-1">{t.currency}</td>
                  <td>{fmtMoney(t.oneTime, t.currency)}</td>
                  <td>{fmtMoney(t.monthly, t.currency)}</td>
                  <td>{fmtMoney(t.annual, t.currency)}</td>
                  <td>
                    {fmtMoney(
                      t.discounts.one_time + t.discounts.monthly + t.discounts.annual,
                      t.currency,
                    )}
                  </td>
                  <td>{fmtMoney(t.tax.one_time + t.tax.monthly + t.tax.annual, t.currency)}</td>
                  <td className="font-medium">
                    {fmtMoney(t.initialCost, t.currency)}
                    {t.includesEstimates ? " *" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {view.commercials.warnings.map((w) => (
          <p key={w} className="mt-1 text-xs text-muted-foreground">
            {w}
          </p>
        ))}
        {view.commercials.tbdCount > 0 && (
          <p className="mt-1 text-xs text-warning">
            {view.commercials.tbdCount} line(s) to be determined are not counted.
          </p>
        )}
      </Panel>
      <Panel title="Taxes (only when explicitly configured)">
        <CollectionEditor<TaxConfig>
          items={view.workspace.taxes}
          canEdit={view.permissions.canEdit}
          emptyTitle="No taxes configured"
          emptyBody="Taxes are never assumed. Add one only with a stated source."
          addLabel="Add tax"
          itemLabel={(t) => t.label}
          fields={[
            { key: "label", label: "Label", kind: "text", required: true },
            { key: "ratePercent", label: "Rate %", kind: "text" },
            {
              key: "appliesTo",
              label: "Applies to",
              kind: "select",
              options: { all: "All charges", one_time: "One-time", recurring: "Recurring" },
            },
            { key: "currency", label: "Currency", kind: "text" },
            { key: "source", label: "Source of the rate", kind: "text", required: true },
          ]}
          blank={() => ({ appliesTo: "all", currency: "INR" })}
          fromItem={(t) => ({ ...t, ratePercent: String(t.ratePercent) })}
          toInput={(v) => ({
            ...v,
            ratePercent: num(v["ratePercent"]) ?? 0,
            currency: String(v["currency"] ?? "").toUpperCase(),
          })}
          onSave={(d) => up.mutateAsync([id, "taxes", d as never])}
          onRemove={(x) => rm.mutateAsync([id, "taxes", x])}
          summary={(t) => (
            <span className="text-sm">
              {t.label}: {t.ratePercent}% on {t.appliesTo} ({t.currency}) — source: {t.source}
            </span>
          )}
        />
      </Panel>
      {TRACKS[view.proposal.track].partnerTerms && (
        <Panel title="Proposed partner terms">
          <CollectionEditor<PartnerTerm>
            items={view.workspace.partnerTerms}
            canEdit={view.permissions.canEdit}
            emptyTitle="No partner terms"
            emptyBody="Commissions, revenue shares, exclusivity and territories stay proposed until an authorized reviewer approves them."
            addLabel="Add term"
            itemLabel={(t) => TERM_KINDS[t.kind]}
            fields={[
              { key: "kind", label: "Kind", kind: "select", options: TERM_KINDS },
              { key: "description", label: "Description", kind: "textarea", required: true },
            ]}
            blank={() => ({ kind: "commission" })}
            fromItem={(t) => ({ kind: t.kind, description: t.description })}
            onSave={(d) => up.mutateAsync([id, "partnerTerms", d as never])}
            onRemove={(x) => rm.mutateAsync([id, "partnerTerms", x])}
            summary={(t) => (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {TERM_KINDS[t.kind]}: {t.description}
                <StatusPill tone={t.status === "approved" ? "success" : "warning"}>
                  {t.status === "approved" ? "Approved term" : "Proposed — not binding"}
                </StatusPill>
                {canAuth && t.status !== "approved" && (
                  <button
                    className={btnGhost}
                    onClick={() => auth.mutate([id, { kind: "term", itemId: t.id }])}
                  >
                    Approve term
                  </button>
                )}
              </div>
            )}
          />
        </Panel>
      )}
    </div>
  );
}

// ---------- E. Risks ----------
export function RisksSection({ view }: { view: ProposalView }) {
  const { up, rm } = useChild();
  const id = view.proposal.id;
  return (
    <CollectionEditor<RiskItem>
      items={view.workspace.risks}
      canEdit={view.permissions.canEdit}
      emptyTitle="No assumptions or risks"
      addLabel="Add assumption / risk"
      itemLabel={(r) => r.description.slice(0, 40)}
      fields={[
        { key: "category", label: "Category", kind: "select", options: RISK_CATEGORIES },
        {
          key: "description",
          label: "Description",
          kind: "textarea",
          required: true,
          help: "Imported risks keep their description.",
        },
        { key: "severity", label: "Severity", kind: "select", options: SEVERITY },
        { key: "resolution", label: "Resolution", kind: "select", options: RISK_RESOLUTION },
        { key: "qualification", label: "Qualification (for accepted risks)", kind: "textarea" },
      ]}
      blank={() => ({ category: "customer_prerequisites", severity: "medium", resolution: "open" })}
      fromItem={(r) => ({
        category: r.category,
        description: r.description,
        severity: r.severity,
        resolution: r.resolution,
        qualification: r.qualification,
      })}
      onSave={(d) => up.mutateAsync([id, "risks", d as never])}
      onRemove={(x) => rm.mutateAsync([id, "risks", x])}
      summary={(r) => (
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              tone={
                r.severity === "high" ? "danger" : r.severity === "medium" ? "warning" : "neutral"
              }
            >
              {SEVERITY[r.severity]}
            </StatusPill>
            <StatusPill tone={r.resolution === "open" ? "warning" : "success"}>
              {RISK_RESOLUTION[r.resolution]}
            </StatusPill>
            <span className="text-xs text-muted-foreground">{RISK_CATEGORIES[r.category]}</span>
            {r.source && <StatusPill tone="gold">From approved solution</StatusPill>}
          </div>
          <p>{r.description}</p>
          {r.qualification && <p className="text-xs">Qualification: {r.qualification}</p>}
        </div>
      )}
    />
  );
}

// ---------- F. Timeline ----------
export function TimelineSection({ view }: { view: ProposalView }) {
  const { up, rm } = useChild();
  const id = view.proposal.id;
  const dl = Object.fromEntries(view.workspace.deliverables.map((d) => [d.id, d.description]));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Milestones are indicative and never contractual dates. Engagement Studio will manage actual
        delivery. Payment triggers are allowed only on commercial proposals.
      </p>
      <CollectionEditor<Milestone>
        items={view.workspace.milestones}
        canEdit={view.permissions.canEdit}
        emptyTitle="No milestones"
        addLabel="Add milestone"
        itemLabel={(m) => m.title}
        fields={[
          { key: "title", label: "Milestone", kind: "text", required: true },
          { key: "deliverableIds", label: "Deliverables", kind: "multi", options: dl },
          { key: "responsibleParty", label: "Responsible party", kind: "select", options: PARTIES },
          { key: "indicativeDuration", label: "Indicative duration", kind: "text" },
          { key: "dependencies", label: "Dependencies", kind: "textarea" },
          { key: "customerObligations", label: "Customer obligations", kind: "textarea" },
          { key: "acceptanceCriteria", label: "Acceptance criteria", kind: "textarea" },
          { key: "paymentTrigger", label: "Payment trigger (commercial only)", kind: "text" },
        ]}
        blank={() => ({ responsibleParty: "shared", deliverableIds: [] })}
        fromItem={(m) => {
          const {
            id: _i,
            organizationId: _o,
            createdAt: _a,
            createdBy: _b,
            updatedAt: _c,
            updatedBy: _d,
            commitment: _e,
            ...rest
          } = m;
          return rest;
        }}
        onSave={(d) => up.mutateAsync([id, "milestones", d as never])}
        onRemove={(x) => rm.mutateAsync([id, "milestones", x])}
        summary={(m) => (
          <div className="text-sm">
            <span className="font-medium">{m.title}</span> · {PARTIES[m.responsibleParty]} ·{" "}
            {m.indicativeDuration || "duration TBD"} <StatusPill>Indicative</StatusPill>
            {m.paymentTrigger && <p className="text-xs">Payment trigger: {m.paymentTrigger}</p>}
          </div>
        )}
      />
    </div>
  );
}

// ---------- G. Options ----------
export function OptionsSection({ view }: { view: ProposalView }) {
  const { up, rm } = useChild();
  const id = view.proposal.id;
  const dl = Object.fromEntries(
    view.workspace.deliverables
      .filter((d) => d.inclusion !== "excluded")
      .map((d) => [d.id, d.description]),
  );
  const lines = Object.fromEntries(
    view.workspace.lines.map((l) => [l.id, l.description || LINE_CATEGORIES[l.category]]),
  );
  return (
    <CollectionEditor<ProposalOption>
      items={view.workspace.options}
      canEdit={view.permissions.canEdit}
      emptyTitle="No options"
      emptyBody="Optional. Package the approved deliverables differently instead of duplicating the solution."
      addLabel="Add option"
      itemLabel={(o) => o.label}
      fields={[
        { key: "kind", label: "Kind", kind: "select", options: OPTION_KINDS },
        { key: "label", label: "Label", kind: "text", required: true },
        { key: "summary", label: "Scope summary", kind: "textarea" },
        { key: "deliverableIds", label: "Deliverables", kind: "multi", options: dl },
        { key: "lineIds", label: "Commercial lines", kind: "multi", options: lines },
        { key: "assumptions", label: "Assumptions", kind: "textarea" },
        { key: "dependencies", label: "Dependencies", kind: "textarea" },
      ]}
      blank={() => ({ kind: "lower_scope", deliverableIds: [], lineIds: [] })}
      fromItem={(o) => ({
        kind: o.kind,
        label: o.label,
        summary: o.summary,
        deliverableIds: o.deliverableIds,
        lineIds: o.lineIds,
        assumptions: o.assumptions,
        dependencies: o.dependencies,
      })}
      onSave={(d) => up.mutateAsync([id, "options", d as never])}
      onRemove={(x) => rm.mutateAsync([id, "options", x])}
      summary={(o) => (
        <div className="text-sm">
          <StatusPill tone={o.kind === "recommended" ? "success" : "neutral"}>
            {OPTION_KINDS[o.kind]}
          </StatusPill>{" "}
          <span className="font-medium">{o.label}</span>
          <p className="text-xs text-muted-foreground">
            {o.deliverableIds.length} deliverable(s) · {o.lineIds.length} line(s)
          </p>
        </div>
      )}
    />
  );
}
