/**
 * Proposal Studio domain (Phase 4). A proposal is built only from an approved,
 * immutable solution hand-off (schema /2). Classifications, readiness and
 * commercial totals are derived here — never typed in — so proposal text or a
 * label can't upgrade an unsupported capability or price.
 */
import type { PriceBook, PriceBookItem } from "@/integrations/adapters/pricing-studio";
import { canonical } from "./assessment";
import {
  FEASIBILITY,
  ROADMAP_STAGES,
  SOLUTION_HANDOFF_SCHEMA,
  SPECULATIVE,
  unresolvedHandoffRefs,
  type Availability,
  type SolutionHandoffSnapshot,
} from "./solution";
import type { BaseRecord, ID, ISODate, Proposal, ProposalStatus, ProposalTrack } from "./types";

// ---------- Tracks ----------
export type ContentKey =
  | "cover"
  | "executive_summary"
  | "customer_context"
  | "challenges"
  | "proposed_solution"
  | "collaboration_model"
  | "benefits"
  | "scope"
  | "integration_ai"
  | "implementation"
  | "responsibilities"
  | "commercials"
  | "assumptions"
  | "acceptance"
  | "next_steps";
export const CONTENT_TITLES: Record<ContentKey, string> = {
  cover: "Cover",
  executive_summary: "Executive summary",
  customer_context: "Customer context",
  challenges: "Business challenges",
  proposed_solution: "Proposed solution",
  collaboration_model: "Collaboration model",
  benefits: "Expected benefits",
  scope: "Scope and deliverables",
  integration_ai: "Integration and AI considerations",
  implementation: "Implementation approach",
  responsibilities: "Responsibilities",
  commercials: "Commercials",
  assumptions: "Assumptions and exclusions",
  acceptance: "Acceptance criteria",
  next_steps: "Next steps",
};
export type PricingRule = "optional" | "required" | "proposed_terms" | "negotiated";
export interface TrackRule {
  label: string;
  kind: "tenant" | "partner";
  pricing: PricingRule;
  partnerTerms: boolean;
  sections: ContentKey[];
  required: ContentKey[];
  disclosure: string;
}
const BASE: ContentKey[] = [
  "cover",
  "executive_summary",
  "customer_context",
  "challenges",
  "proposed_solution",
  "benefits",
  "scope",
  "integration_ai",
  "implementation",
  "responsibilities",
  "assumptions",
  "acceptance",
  "next_steps",
];
const withAfter = (keys: ContentKey[], after: ContentKey, add: ContentKey) =>
  keys.flatMap((k) => (k === after ? [k, add] : [k]));
export const TRACKS: Record<ProposalTrack, TrackRule> = {
  tenant_solution: {
    label: "Tenant — solution proposal",
    kind: "tenant",
    pricing: "optional",
    partnerTerms: false,
    sections: withAfter(BASE, "responsibilities", "commercials"),
    required: ["executive_summary", "challenges", "proposed_solution", "next_steps"],
    disclosure:
      "Advisory proposal. Any prices shown are indicative and not an offer unless separately approved.",
  },
  tenant_commercial: {
    label: "Tenant — commercial proposal",
    kind: "tenant",
    pricing: "required",
    partnerTerms: false,
    sections: withAfter(BASE, "responsibilities", "commercials"),
    required: [
      "executive_summary",
      "challenges",
      "proposed_solution",
      "commercials",
      "assumptions",
      "next_steps",
    ],
    disclosure:
      "Prices reference the illustrative Pricing Studio price book at the version shown. Taxes appear only where configured. Not a signed contract.",
  },
  reseller_partner: {
    label: "Partner — reseller / channel",
    kind: "partner",
    pricing: "proposed_terms",
    partnerTerms: true,
    sections: withAfter(
      withAfter(BASE, "proposed_solution", "collaboration_model"),
      "responsibilities",
      "commercials",
    ),
    required: ["executive_summary", "collaboration_model", "next_steps"],
    disclosure:
      "Commissions, revenue shares, exclusivity and territories are proposed terms only and are not binding until separately agreed.",
  },
  strategic_partner: {
    label: "Partner — strategic / integration",
    kind: "partner",
    pricing: "negotiated",
    partnerTerms: true,
    sections: withAfter(
      withAfter(BASE, "proposed_solution", "collaboration_model"),
      "responsibilities",
      "commercials",
    ),
    required: ["executive_summary", "collaboration_model", "integration_ai", "next_steps"],
    disclosure:
      "Exploratory collaboration proposal. Economics are open for negotiation; nothing here is an agreed partnership.",
  },
};
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  shared: "Issued",
  accepted: "Accepted (recorded)",
  declined: "Declined",
  expired: "Expired",
};

// ---------- Source ----------
export interface ProposalSource {
  solutionId: ID;
  solutionSnapshotId: ID;
  solutionSnapshotVersion: number;
  solutionSchema: string;
  assessmentId: ID;
  assessmentSnapshotId: ID;
  assessmentSnapshotVersion: number;
  approvedAt: ISODate;
}
export function handoffCompatibility(
  h: SolutionHandoffSnapshot | undefined,
): { ok: true } | { ok: false; reason: string } {
  if (!h) return { ok: false, reason: "The approved solution snapshot is not available." };
  if (h.schema !== SOLUTION_HANDOFF_SCHEMA)
    return {
      ok: false,
      reason: `Solution snapshot schema "${String(h.schema)}" is not supported (needs ${SOLUTION_HANDOFF_SCHEMA}). Re-approve the solution to produce a compatible snapshot.`,
    };
  if (!h.sourceAssessment) return { ok: false, reason: "Snapshot has no embedded assessment." };
  const u = unresolvedHandoffRefs(h);
  if (u.length) return { ok: false, reason: `Snapshot has unresolved references: ${u.join(", ")}` };
  return { ok: true };
}
export const sourceOf = (h: SolutionHandoffSnapshot): ProposalSource => ({
  solutionId: h.solutionId,
  solutionSnapshotId: h.id,
  solutionSnapshotVersion: h.version,
  solutionSchema: h.schema,
  assessmentId: h.solution.assessmentId,
  assessmentSnapshotId: h.sourceAssessment.id,
  assessmentSnapshotVersion: h.sourceAssessment.version,
  approvedAt: h.approval.approvedAt,
});

export const ROADMAP_LABEL: Record<string, string> = ROADMAP_STAGES;

// ---------- Content ----------
export interface ContentSection {
  key: ContentKey;
  title: string;
  body: string;
  /** imported = copied from the approved source; authored = written here; ai_draft = simulated AI copy. */
  origin: "imported" | "authored" | "ai_draft";
  /** AI drafts stay drafts until a professional marks them reviewed. */
  reviewed: boolean;
  updatedAt: ISODate;
  updatedBy: ID;
}
/** Language that would assert unsupported guarantees, credentials or endorsements. */
const CLAIM_RE =
  /\b(guarantee[sd]?|guaranteeing|certified|certification|testimonials?|case stud(?:y|ies)|award[- ]winning|risk[- ]free|100% (?:uptime|accurate|success)|official partners?|partnership (?:is )?agreed)\b/i;
export const claimProblem = (text: string) => {
  const m = CLAIM_RE.exec(text);
  return m ? m[0] : null;
};
const recLive = (h: SolutionHandoffSnapshot) =>
  h.recommendations.filter((r) => r.status !== "not_recommended");
/** Initial draft sections from the approved hand-off; facts are marked imported. */
export function draftSections(
  h: SolutionHandoffSnapshot,
  track: ProposalTrack,
  title: string,
  by: ID,
  at: ISODate,
): ContentSection[] {
  const a = h.sourceAssessment;
  const bullets = (xs: string[]) =>
    xs
      .filter(Boolean)
      .map((x) => `• ${x}`)
      .join("\n");
  const imported: Partial<Record<ContentKey, string>> = {
    cover: `${title}\nPrepared for ${h.solution.subjectName}`,
    executive_summary: h.overview.executiveSummary,
    customer_context: bullets(
      [
        a.profile.industry && `Industry: ${a.profile.industry}`,
        a.profile.geography && `Location: ${a.profile.geography}`,
        a.profile.employees && `People: ${a.profile.employees}`,
        a.profile.businessModel && `Business model: ${a.profile.businessModel}`,
      ].filter((x): x is string => !!x),
    ),
    challenges: bullets(h.needs.map((n) => n.source.label)),
    proposed_solution: bullets(recLive(h).map((r) => `${r.title} — ${r.rationale}`)),
    benefits: bullets(
      h.values.map((v) =>
        v.estimate ? `${v.description} (estimate, ${v.estimate.source})` : v.description,
      ),
    ),
    integration_ai: bullets([
      ...h.integrations.map((i) => `${i.systemName}: ${FEASIBILITY[i.feasibility]}`),
      ...h.aiDesigns.map((d) => `AI: ${d.intent || "conversational design"} (${d.mode})`),
    ]),
    implementation: bullets(
      h.roadmap.map(
        (r) =>
          `${r.stage}: ${r.deliverables} (indicative${r.indicativeDuration ? `, ${r.indicativeDuration}` : ""})`,
      ),
    ),
    assumptions: bullets([h.overview.assumptions, h.overview.constraints]),
  };
  return TRACKS[track].sections.map((key) => {
    const body = imported[key] ?? "";
    return {
      key,
      title:
        key === "customer_context" && TRACKS[track].kind === "partner"
          ? "Partner context"
          : CONTENT_TITLES[key],
      body,
      origin: body ? "imported" : "authored",
      reviewed: true,
      updatedAt: at,
      updatedBy: by,
    };
  });
}
/** Simulated AI drafting: deterministic, uses only hand-off facts, invents nothing. */
export function simulatedDraft(h: SolutionHandoffSnapshot, key: ContentKey): string {
  const recs = recLive(h);
  switch (key) {
    case "executive_summary":
      return `DRAFT — review before use. ${h.solution.subjectName} asked for help with ${h.needs.length} priority need(s). This proposal recommends ${recs.map((r) => r.title).join(", ") || "the approaches below"}, based on the approved solution design (v${h.version}).`;
    case "next_steps":
      return "DRAFT — review before use.\n• Confirm scope and open questions\n• Agree responsibilities and indicative timeline\n• Approve the proposal internally before it is issued";
    case "acceptance":
      return `DRAFT — review before use.\n${recs.map((r) => `• ${r.title}: ${r.expectedOutcome || "acceptance criterion to be agreed"}`).join("\n")}`;
    case "responsibilities":
      return `DRAFT — review before use.\n${recs
        .map(
          (r) =>
            `• ${r.title}: Aurumi — ${r.responsibilities.aurumi || "TBD"}; customer — ${r.responsibilities.customer || "TBD"}`,
        )
        .join("\n")}`;
    default:
      return `DRAFT — review before use. Summarise ${CONTENT_TITLES[key].toLowerCase()} from the approved solution.`;
  }
}

// ---------- Deliverables ----------
export const DELIVERABLE_CLASSES = {
  available_verified: "Available verified functionality",
  conditional: "Conditional availability",
  planned_custom: "Planned or custom development",
  third_party: "Third-party dependency",
  process_change: "Process / advisory change (no Aurumi product)",
  not_included: "Not included",
} as const;
export type DeliverableClass = keyof typeof DELIVERABLE_CLASSES;
export const INCLUSION = {
  included: "Included",
  optional: "Optional",
  excluded: "Excluded",
} as const;
export const PARTIES = {
  aurumi: "Aurumi",
  customer: "Customer",
  partner: "Partner",
  third_party: "Third party",
  shared: "Shared",
} as const;
export interface Deliverable extends BaseRecord {
  recommendationId: ID;
  description: string;
  inclusion: keyof typeof INCLUSION;
  acceptanceCriterion: string;
  responsibleParty: keyof typeof PARTIES;
  customerDependencies: string;
  deliveryAssumptions: string;
  /** Visible qualification shown in the proposal for conditional items. */
  qualification: string;
  /** Set by a rebase when the source recommendation is gone. */
  sourceStatus: "current" | "missing";
}
export interface DeliverableInfo {
  recommendationTitle: string;
  classification: DeliverableClass;
  availability: Availability | "missing";
  evidence: "verified" | "unverified" | "none";
  needsQualification: boolean;
  reasons: string[];
}
export function classifyDeliverable(
  d: Pick<Deliverable, "recommendationId" | "inclusion">,
  h: SolutionHandoffSnapshot | undefined,
): DeliverableInfo {
  const r = h?.recommendations.find((x) => x.id === d.recommendationId);
  if (!h || !r)
    return {
      recommendationTitle: d.recommendationId,
      classification: "not_included",
      availability: "missing",
      evidence: "none",
      needsQualification: d.inclusion !== "excluded",
      reasons: ["Source recommendation is not in the approved solution snapshot"],
    };
  const reasons: string[] = [];
  const ev = r.evidenceRefs.map((e) =>
    h.sourceAssessment.evidence.find((x) => x.id === e.evidenceId),
  );
  const evidence = !ev.length
    ? "none"
    : ev.some((e) => e?.verification.state === "verified")
      ? "verified"
      : "unverified";
  let classification: DeliverableClass;
  if (d.inclusion === "excluded") classification = "not_included";
  else if (r.category === "third_party") classification = "third_party";
  else if (r.availability === "not_applicable") classification = "process_change";
  else if (r.availability === "available") classification = "available_verified";
  else if (r.availability === "conditional") classification = "conditional";
  else classification = "planned_custom";
  if (r.availability === "conditional")
    reasons.push("Catalog readiness is conditional (beta / not fully validated)");
  if (r.availability === "unsupported") reasons.push("Catalog does not support this capability");
  if (r.availability === "proposed")
    reasons.push("Proposed / future development — not available today");
  const items = new Set(r.catalogRefs.map((c) => c.itemId));
  for (const i of h.integrations) {
    const c = i.proposal.catalogRef?.itemId;
    if (
      c &&
      items.has(c) &&
      (SPECULATIVE.includes(i.feasibility) || i.feasibility === "not_supported")
    ) {
      reasons.push(
        `Integration with ${i.systemName} is ${FEASIBILITY[i.feasibility].toLowerCase()}`,
      );
      if (classification === "available_verified") classification = "conditional";
    }
  }
  if (r.justificationStale) reasons.push("Source justification was flagged for review");
  if (r.status === "not_recommended") reasons.push("Not recommended in the approved solution");
  if (evidence === "unverified") reasons.push("Supporting evidence is unverified");
  const needsQualification =
    d.inclusion !== "excluded" &&
    (["conditional", "planned_custom", "third_party"].includes(classification) ||
      reasons.length > 0);
  return {
    recommendationTitle: r.title,
    classification,
    availability: r.availability,
    evidence,
    needsQualification,
    reasons,
  };
}

// ---------- Risks ----------
export const RISK_CATEGORIES = {
  customer_prerequisites: "Customer prerequisites",
  technical_feasibility: "Technical feasibility",
  unverified_integrations: "Unverified integrations",
  data_access: "Data access",
  security_privacy: "Security and privacy",
  third_party_licensing: "Third-party licensing",
  implementation_dependencies: "Implementation dependencies",
  training_adoption: "Training and adoption",
  delivery_risks: "Delivery risks",
  scope_exclusions: "Scope exclusions",
  change_control: "Change-control assumptions",
} as const;
export const RISK_RESOLUTION = {
  open: "Open — blocking",
  resolved: "Resolved",
  accepted: "Accepted with qualification",
} as const;
export type Severity = "high" | "medium" | "low";
export interface RiskItem extends BaseRecord {
  category: keyof typeof RISK_CATEGORIES;
  description: string;
  severity: Severity;
  resolution: keyof typeof RISK_RESOLUTION;
  qualification: string;
  /** Present when imported from the approved solution; such risks can't be deleted or downgraded. */
  source?: {
    kind: "integration" | "dependency" | "outstanding_question" | "unverified_evidence";
    id: string;
    label: string;
  };
}
export const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };
export function sourcedRisks(
  h: SolutionHandoffSnapshot,
): Pick<RiskItem, "category" | "description" | "severity" | "source">[] {
  const out: Pick<RiskItem, "category" | "description" | "severity" | "source">[] = [];
  h.integrations
    .filter((i) => SPECULATIVE.includes(i.feasibility) || i.feasibility === "not_supported")
    .forEach((i) =>
      out.push({
        category: "unverified_integrations",
        severity: "high",
        description: `Integration with ${i.systemName} is ${FEASIBILITY[i.feasibility].toLowerCase()}${i.validationOwner ? `; validation owner: ${i.validationOwner}` : ""}`,
        source: { kind: "integration", id: i.id, label: i.systemName },
      }),
    );
  [...h.dependencies.catalogGaps, ...(h.dependencies.unsupported ?? [])].forEach((g, n) =>
    out.push({
      category: "implementation_dependencies",
      severity: "high",
      description: `${g.itemId} requires ${g.needs}`,
      source: { kind: "dependency", id: `${g.itemId}>${g.needs}#${n}`, label: g.needs },
    }),
  );
  h.overview.outstandingQuestions
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((q, n) =>
      out.push({
        category: "technical_feasibility",
        severity: "medium",
        description: `Outstanding question: ${q}`,
        source: { kind: "outstanding_question", id: `oq${n}:${q.slice(0, 40)}`, label: q },
      }),
    );
  h.sourceAssessment.evidence
    .filter(
      (e) =>
        e.verification.state !== "verified" &&
        e.links.some((l) => l.kind === "system" || l.kind === "requirement"),
    )
    .forEach((e) =>
      out.push({
        category: "technical_feasibility",
        severity: "medium",
        description: `Unverified: ${e.statement}`,
        source: { kind: "unverified_evidence", id: e.id, label: e.statement },
      }),
    );
  return out;
}

// ---------- Timeline ----------
export interface Milestone extends BaseRecord {
  title: string;
  roadmapId?: ID;
  deliverableIds: ID[];
  dependencies: string;
  responsibleParty: keyof typeof PARTIES;
  customerObligations: string;
  indicativeDuration: string;
  acceptanceCriteria: string;
  /** Only allowed where commercials are authorized. */
  paymentTrigger: string;
  /** Always indicative — Proposal Studio never commits delivery dates. */
  commitment: "indicative";
}

// ---------- Options ----------
export const OPTION_KINDS = {
  recommended: "Recommended option",
  lower_scope: "Lower-scope alternative",
  expanded: "Expanded option",
  optional_module: "Optional module / service",
  phased: "Phased adoption",
} as const;
export interface ProposalOption extends BaseRecord {
  kind: keyof typeof OPTION_KINDS;
  label: string;
  summary: string;
  deliverableIds: ID[];
  lineIds: ID[];
  assumptions: string;
  dependencies: string;
}

// ---------- Commercials ----------
export const LINE_CATEGORIES = {
  aurumi_subscription: "Aurumi subscription",
  connector_addon: "Connector subscription / add-on",
  implementation: "Implementation services",
  training: "Training and onboarding",
  third_party: "Third-party cost",
  custom_development: "Custom integration / development",
  advisory: "Advisory / C.I.A. services",
  discount: "Discount / adjustment",
} as const;
export type LineCategory = keyof typeof LINE_CATEGORIES;
/** Categories whose prices Pricing Studio publishes. */
export const PRICE_BOOK_CATEGORIES: LineCategory[] = [
  "aurumi_subscription",
  "connector_addon",
  "implementation",
  "training",
  "advisory",
];
export const LINE_CLASSES = {
  priced: "Priced",
  estimated: "Estimated",
  tbd: "To be determined",
  excluded: "Excluded",
} as const;
export const RECURRENCE = { one_time: "One-time", monthly: "Monthly", annual: "Annual" } as const;
export type Recurrence = keyof typeof RECURRENCE;
export interface PriceRef {
  priceBookItemId: ID;
  priceBookVersion: string;
  retrievedAt: ISODate;
  name: string;
  currency: string;
  unit: string;
  recurrence: Recurrence;
  publishedAmount: number;
  basis: string;
  validUntil: string;
  /** Pricing Studio's own capability binding for this price (absent = a general price). */
  catalogItemId?: string;
}
export interface Authorization {
  approvedBy: ID;
  approvedAt: ISODate;
}
/** Why a published price may be used outside its ordinary terms. */
export const PRICE_EXCEPTION_PERMITS = {
  applicability: "Used for a capability the price does not apply to",
  expired: "Used after the published price's validity ended",
} as const;
export type PriceExceptionPermit = keyof typeof PRICE_EXCEPTION_PERMITS;
/** An explicit, separately authorized commercial exception for one pinned price. */
export interface PriceException {
  rationale: string;
  permits: PriceExceptionPermit[];
  authorization?: Authorization;
}
/** Clock for validity/expiry checks (overridable in tests; always UTC ISO). */
export const proposalClock = { now: (): ISODate => new Date().toISOString() };
export interface CommercialLine extends BaseRecord {
  category: LineCategory;
  classification: keyof typeof LINE_CLASSES;
  description: string;
  quantity: number;
  recurrence: Recurrence;
  currency: string;
  /** Structured identity of the product/capability this line sells (absent = a general line). */
  catalogItemId?: string;
  priceRef?: PriceRef;
  /** Explicit exception allowing the pinned price outside its applicability or validity. */
  priceException?: PriceException;
  /** Estimated lines: an amount with its basis (never a published price). */
  estimate?: { unitAmount: number; basis: string };
  /** Priced third-party / custom items: the quoted unit amount (needs a quote reference). */
  quoted?: { unitAmount: number };
  /** A proposed manual price — never changes the price book. */
  override?: { unitAmount: number; rationale: string; authorization?: Authorization };
  /** Discount lines: the reduction amount (positive) and why. */
  discount?: { amount: number; rationale: string; authorization?: Authorization };
  quoteReference: string;
}
export interface TaxConfig extends BaseRecord {
  label: string;
  ratePercent: number;
  appliesTo: "one_time" | "recurring" | "all";
  currency: string;
  /** Where the rate came from — taxes are never invented. */
  source: string;
}
export const TERM_KINDS = {
  commission: "Reseller commission",
  revenue_share: "Revenue share",
  exclusivity: "Exclusivity",
  territory: "Territory",
  other: "Other partnership economics",
} as const;
export interface PartnerTerm extends BaseRecord {
  kind: keyof typeof TERM_KINDS;
  description: string;
  status: "proposed" | "approved";
  authorization?: Authorization;
}
export type PriceBasis =
  | "published"
  | "quoted"
  | "proposed_override"
  | "approved_override"
  | "estimate"
  | "discount"
  | "price_exception"
  | "none";
export interface LineAmount {
  unitAmount: number;
  amount: number;
  basis: PriceBasis;
  counted: boolean;
}
export interface CurrencyTotals {
  currency: string;
  oneTime: number;
  monthly: number;
  annual: number;
  discounts: Record<Recurrence, number>;
  tax: Record<Recurrence, number>;
  /** One-time charges after discounts plus their tax. Recurring charges are shown only as run rates. */
  initialCost: number;
  includesEstimates: boolean;
}
export interface CommercialSummary {
  lines: Record<ID, LineAmount>;
  totals: CurrencyTotals[];
  mixedCurrencies: boolean;
  tbdCount: number;
  warnings: string[];
}
const cents = (n: number) => Math.round(n * 100);
const fromCents = (n: number) => n / 100;
export function lineAmount(l: CommercialLine): LineAmount {
  if (l.classification === "excluded" || l.classification === "tbd")
    return { unitAmount: 0, amount: 0, basis: "none", counted: false };
  if (l.category === "discount") {
    const a = l.discount?.amount ?? 0;
    return { unitAmount: -a, amount: -fromCents(cents(a)), basis: "discount", counted: true };
  }
  const [unit, basis]: [number, PriceBasis] = l.override
    ? [l.override.unitAmount, l.override.authorization ? "approved_override" : "proposed_override"]
    : l.priceRef
      ? [l.priceRef.publishedAmount, l.priceException ? "price_exception" : "published"]
      : l.quoted
        ? [l.quoted.unitAmount, "quoted"]
        : l.estimate
          ? [l.estimate.unitAmount, "estimate"]
          : [0, "none"];
  return {
    unitAmount: unit,
    amount: fromCents(cents(unit) * l.quantity),
    basis: l.classification === "estimated" && basis === "published" ? "estimate" : basis,
    counted: basis !== "none",
  };
}
export function calculateCommercials(
  lines: CommercialLine[],
  taxes: TaxConfig[],
): CommercialSummary {
  const out: Record<ID, LineAmount> = {};
  const by = new Map<string, CurrencyTotals & { c: Record<Recurrence, number> }>();
  const warnings: string[] = [];
  const zero = (): Record<Recurrence, number> => ({ one_time: 0, monthly: 0, annual: 0 });
  for (const l of lines) {
    const a = lineAmount(l);
    out[l.id] = a;
    if (!a.counted) continue;
    const t =
      by.get(l.currency) ??
      ({
        currency: l.currency,
        oneTime: 0,
        monthly: 0,
        annual: 0,
        discounts: zero(),
        tax: zero(),
        initialCost: 0,
        includesEstimates: false,
        c: zero(),
      } as CurrencyTotals & { c: Record<Recurrence, number> });
    t.c[l.recurrence] += cents(a.amount);
    if (l.category === "discount") t.discounts[l.recurrence] += -cents(a.amount);
    if (a.basis === "estimate" || l.classification === "estimated") t.includesEstimates = true;
    by.set(l.currency, t);
  }
  const totals = [...by.values()].map(({ c, ...t }) => {
    for (const tax of taxes.filter((x) => x.currency === t.currency)) {
      for (const r of ["one_time", "monthly", "annual"] as Recurrence[]) {
        const applies =
          tax.appliesTo === "all" || (tax.appliesTo === "one_time") === (r === "one_time");
        if (applies) t.tax[r] += Math.round((Math.max(0, c[r]) * tax.ratePercent) / 100);
      }
    }
    const res: CurrencyTotals = {
      ...t,
      oneTime: fromCents(c.one_time),
      monthly: fromCents(c.monthly),
      annual: fromCents(c.annual),
      discounts: {
        one_time: fromCents(t.discounts.one_time),
        monthly: fromCents(t.discounts.monthly),
        annual: fromCents(t.discounts.annual),
      },
      tax: {
        one_time: fromCents(t.tax.one_time),
        monthly: fromCents(t.tax.monthly),
        annual: fromCents(t.tax.annual),
      },
      initialCost: fromCents(c.one_time + t.tax.one_time),
    };
    return res;
  });
  const mixedCurrencies = totals.length > 1;
  if (mixedCurrencies)
    warnings.push(
      `Amounts are in ${totals.map((t) => t.currency).join(" and ")}; totals are shown per currency and never converted.`,
    );
  totals.forEach((t) => {
    if (t.monthly && t.annual)
      warnings.push(
        `${t.currency}: monthly and annual charges are shown separately, not combined.`,
      );
  });
  taxes
    .filter((x) => !totals.some((t) => t.currency === x.currency))
    .forEach((x) => warnings.push(`Tax "${x.label}" is in ${x.currency}, which has no lines.`));
  return {
    lines: out,
    totals,
    mixedCurrencies,
    tbdCount: lines.filter((l) => l.classification === "tbd").length,
    warnings,
  };
}
export const fmtMoney = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
export function priceRefOf(item: PriceBookItem, book: PriceBook): PriceRef {
  return {
    priceBookItemId: item.id,
    priceBookVersion: book.priceBookVersion,
    retrievedAt: book.retrievedAt,
    name: item.name,
    currency: item.currency,
    unit: item.unit,
    recurrence: item.recurrence,
    publishedAmount: item.amount,
    basis: item.basis,
    validUntil: item.validUntil,
    ...(item.catalogItemId ? { catalogItemId: item.catalogItemId } : {}),
  };
}
/**
 * End of a price's validity in epoch ms, or null when the value is not a real
 * date. A date-only value is valid through the end of that UTC day.
 */
export function validityEnd(v: unknown): number | null {
  if (typeof v !== "string") return null;
  // Parsed component by component; Date.parse alone silently rolls 2027-02-30 into March.
  const m =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|([+-])(\d{2}):(\d{2})))?$/.exec(
      v,
    );
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return null;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1]!;
  if (d > dim) return null;
  if (m[4] === undefined) return Date.UTC(y, mo - 1, d, 23, 59, 59, 999);
  const [hh, mi, ss] = [Number(m[4]), Number(m[5]), Number(m[6] ?? 0)];
  if (hh > 23 || mi > 59 || ss > 59) return null;
  const ms = m[7] ? Math.floor(Number(`0${m[7]}`) * 1000) : 0;
  let offset = 0;
  if (m[8] !== "Z") {
    const [oh, om] = [Number(m[10]), Number(m[11])];
    if (oh > 14 || om > 59 || (oh === 14 && om > 0)) return null;
    offset = (m[9] === "-" ? -1 : 1) * (oh * 60 + om);
  }
  return Date.UTC(y, mo - 1, d, hh, mi, ss, ms) - offset * 60_000;
}
/** Exception permits a priced line needs at `at` (empty = the published price applies as-is). */
export function requiredPermits(
  l: Pick<CommercialLine, "catalogItemId" | "priceRef">,
  at: ISODate = proposalClock.now(),
): PriceExceptionPermit[] {
  if (!l.priceRef) return [];
  const out: PriceExceptionPermit[] = [];
  if (l.catalogItemId && l.catalogItemId !== l.priceRef.catalogItemId) out.push("applicability");
  const end = validityEnd(l.priceRef.validUntil);
  if (end !== null && end < Date.parse(at)) out.push("expired");
  return out;
}
/**
 * Problems with using a line's pinned published price at `at`: wrong capability,
 * expired or unreadable validity, and exceptions that are missing or unauthorized.
 */
export function priceUseProblems(
  l: Pick<CommercialLine, "catalogItemId" | "priceRef" | "priceException" | "description">,
  at: ISODate = proposalClock.now(),
): string[] {
  const ref = l.priceRef;
  if (!ref)
    return l.priceException
      ? [`${l.description || "line"}: a price exception needs a published price`]
      : [];
  const name = l.description || ref.name;
  const out: string[] = [];
  if (validityEnd(ref.validUntil) === null)
    out.push(`${name}: published price has an invalid validity date ("${String(ref.validUntil)}")`);
  const ex = l.priceException;
  for (const need of requiredPermits(l, at)) {
    if (!ex?.permits.includes(need))
      out.push(
        need === "applicability"
          ? `${name}: price ${ref.priceBookItemId} applies to ${ref.catalogItemId ?? "general subscriptions"}, not ${l.catalogItemId}; use the applicable price or an authorized exception`
          : `${name}: published price ${ref.priceBookItemId} expired on ${ref.validUntil}; refresh prices or use an authorized exception`,
      );
    else if (!ex.authorization) out.push(`${name}: price exception awaits authorization`);
  }
  return out;
}
/** A pinned price reference is current only if the book still publishes the same amount and terms. */
export function priceRefProblem(ref: PriceRef, book: PriceBook): string | null {
  const item = book.items.find((i) => i.id === ref.priceBookItemId);
  if (!item) return `${ref.name}: no longer in the price book`;
  if (
    item.amount !== ref.publishedAmount ||
    item.currency !== ref.currency ||
    item.recurrence !== ref.recurrence ||
    item.validUntil !== ref.validUntil ||
    (item.catalogItemId ?? null) !== (ref.catalogItemId ?? null) ||
    book.priceBookVersion !== ref.priceBookVersion
  )
    return `${ref.name}: price book changed (${ref.priceBookVersion} → ${book.priceBookVersion}); refresh prices`;
  return null;
}

// ---------- Workspace ----------
export interface ProposalComment extends BaseRecord {
  kind:
    | "comment"
    | "submitted"
    | "changes_requested"
    | "approved"
    | "issued"
    | "revised"
    | "rebased"
    | "invalidated";
  body: string;
}
export interface ProposalRecipient {
  name: string;
  organization: string;
  contact: string;
}
export interface ProposalWorkspace extends BaseRecord {
  proposalId: ID;
  recipient: ProposalRecipient;
  validityDays: number;
  commercialNotes: string;
  sections: ContentSection[];
  deliverables: Deliverable[];
  lines: CommercialLine[];
  taxes: TaxConfig[];
  partnerTerms: PartnerTerm[];
  risks: RiskItem[];
  milestones: Milestone[];
  options: ProposalOption[];
  comments: ProposalComment[];
  revisions: {
    revision: number;
    source: ProposalSource;
    archivedAt: ISODate;
    archivedBy: ID;
    reason: string;
    workspace: Omit<ProposalWorkspace, "revisions" | "comments">;
  }[];
  reviewerId?: ID;
}
export type StudioProposal = Proposal & { source: ProposalSource; revision: number };
export const isStudio = (p: Proposal): p is StudioProposal =>
  !!(p as Partial<StudioProposal>).source;

/** Content that a review vouches for; any change invalidates an approval. */
export function materialHash(
  p: Pick<Proposal, "title" | "track">,
  source: ProposalSource,
  ws: ProposalWorkspace,
  /** The embedded solution hand-off; included for approval-bound version hashes. */
  solution?: unknown,
): string {
  const strip = <T extends object>(xs: T[]) =>
    xs.map((x) => {
      const { updatedAt: _a, updatedBy: _b, ...rest } = x as Record<string, unknown>;
      return rest;
    });
  const s = canonical({
    title: p.title,
    track: p.track,
    source,
    recipient: ws.recipient,
    validityDays: ws.validityDays,
    commercialNotes: ws.commercialNotes,
    sections: strip(ws.sections),
    deliverables: strip(ws.deliverables),
    lines: strip(ws.lines),
    taxes: strip(ws.taxes),
    partnerTerms: strip(ws.partnerTerms),
    risks: strip(ws.risks),
    milestones: strip(ws.milestones),
    options: strip(ws.options),
    ...(solution === undefined ? {} : { solution }),
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv1a-${(h >>> 0).toString(16)}-${s.length}`;
}

// ---------- Readiness ----------
export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  detail: string[];
}
export function proposalReadiness(
  p: StudioProposal,
  ws: ProposalWorkspace,
  h: SolutionHandoffSnapshot | undefined,
  book: PriceBook,
): ReadinessItem[] {
  const rule = TRACKS[p.track];
  const items: ReadinessItem[] = [];
  const add = (key: string, label: string, detail: string[]) =>
    items.push({ key, label, ok: detail.length === 0, detail });
  const compat = handoffCompatibility(h);
  add("source", "Approved solution snapshot valid", compat.ok ? [] : [compat.reason]);
  add("recipient", "Recipient identified", ws.recipient.name.trim() ? [] : ["Name the recipient"]);
  add("content", "Required content written and reviewed", [
    ...rule.required
      .filter((k) => !ws.sections.find((s) => s.key === k)?.body.trim())
      .map((k) => `Write the ${CONTENT_TITLES[k].toLowerCase()} section`),
    ...ws.sections
      .filter((s) => s.origin === "ai_draft" && !s.reviewed)
      .map((s) => `${s.title}: AI draft not yet reviewed`),
  ]);
  const claimTexts: [string, string][] = [
    ...ws.sections.map((s) => [s.title, s.body] as [string, string]),
    ...ws.deliverables.map(
      (d) =>
        [`Deliverable ${d.description.slice(0, 30)}`, `${d.description} ${d.qualification}`] as [
          string,
          string,
        ],
    ),
    ...ws.options.map((o) => [`Option ${o.label}`, o.summary] as [string, string]),
  ];
  add(
    "claims",
    "No unsupported guarantees, credentials or endorsements",
    claimTexts.flatMap(([where, t]) => {
      const m = claimProblem(t);
      return m ? [`${where}: “${m}” needs approved source material — remove or rephrase`] : [];
    }),
  );
  const included = ws.deliverables.filter((d) => d.inclusion !== "excluded");
  add("deliverables", "Deliverables traceable and qualified", [
    ...(included.length ? [] : ["Include at least one deliverable"]),
    ...ws.deliverables.flatMap((d) => {
      const info = classifyDeliverable(d, h);
      const out: string[] = [];
      if (d.inclusion !== "excluded" && info.availability === "missing")
        out.push(
          `${d.description || d.recommendationId}: source recommendation missing — exclude or remove it`,
        );
      if (
        d.inclusion !== "excluded" &&
        h?.recommendations.find((r) => r.id === d.recommendationId)?.status === "not_recommended"
      )
        out.push(`${d.description}: not recommended in the approved solution`);
      if (info.needsQualification && !d.qualification.trim())
        out.push(
          `${d.description || info.recommendationTitle}: add a visible qualification (${info.reasons[0] ?? DELIVERABLE_CLASSES[info.classification]})`,
        );
      if (d.inclusion !== "excluded" && !d.acceptanceCriterion.trim())
        out.push(`${d.description || info.recommendationTitle}: add an acceptance criterion`);
      return out;
    }),
  ]);
  const live = ws.lines.filter((l) => l.classification !== "excluded");
  const comm: string[] = [];
  if (rule.pricing === "required") {
    if (!live.some((l) => l.classification === "priced" && l.category !== "discount"))
      comm.push("A commercial proposal needs at least one priced line");
    if (live.some((l) => l.classification === "tbd"))
      comm.push("Resolve “to be determined” lines before issuing a commercial proposal");
  }
  for (const l of live) {
    const name = l.description || LINE_CATEGORIES[l.category];
    if (l.classification === "priced" && PRICE_BOOK_CATEGORIES.includes(l.category) && !l.priceRef)
      comm.push(`${name}: priced Aurumi items need a Pricing Studio price-book reference`);
    if (
      l.classification === "priced" &&
      ["third_party", "custom_development"].includes(l.category) &&
      (!l.quoted || !l.quoteReference.trim())
    )
      comm.push(
        `${name}: priced third-party/custom items need a quoted amount and quote reference`,
      );
    if (l.classification === "estimated" && !l.priceRef && !l.estimate)
      comm.push(`${name}: estimated lines need an amount and its basis`);
    if (l.priceRef) {
      const prob = priceRefProblem(l.priceRef, book);
      if (prob) comm.push(prob);
    }
    comm.push(...priceUseProblems(l));
    if (l.override && !l.override.authorization)
      comm.push(`${name}: manual price override awaits approval`);
    if (l.category === "discount" && !l.discount?.authorization)
      comm.push(`${name}: discount awaits approval`);
  }
  ws.taxes
    .filter((t) => !t.source.trim())
    .forEach((t) => comm.push(`Tax ${t.label}: state its source`));
  add("commercials", "Commercials consistent and authorized", comm);
  add("risks", "Material risks resolved or accepted with qualification", [
    ...ws.risks
      .filter((r) => r.resolution === "open" && r.severity === "high")
      .map((r) => `Blocking: ${r.description.slice(0, 80)}`),
    ...ws.risks
      .filter((r) => r.resolution === "accepted" && !r.qualification.trim())
      .map((r) => `${r.description.slice(0, 60)}: accepted risks need a qualification`),
    ...(h
      ? sourcedRisks(h)
          .filter(
            (s) =>
              !ws.risks.some(
                (r) => r.source?.kind === s.source?.kind && r.source?.id === s.source?.id,
              ),
          )
          .map((s) => `Source risk missing from proposal: ${s.description.slice(0, 60)}`)
      : []),
  ]);
  const pricedOk = live.some((l) => l.classification === "priced");
  add("timeline", "Indicative timeline and responsibilities", [
    ...(ws.milestones.length ? [] : ["Add at least one milestone"]),
    ...ws.milestones
      .filter((m) => m.paymentTrigger.trim() && !(rule.pricing === "required" && pricedOk))
      .map((m) => `${m.title}: payment triggers need an authorized commercial proposal`),
    ...ws.milestones
      .filter((m) => m.deliverableIds.some((d) => !ws.deliverables.some((x) => x.id === d)))
      .map((m) => `${m.title}: references a removed deliverable`),
  ]);
  const opt: string[] = [];
  if (ws.options.length) {
    if (ws.options.filter((o) => o.kind === "recommended").length !== 1)
      opt.push("Mark exactly one recommended option");
    for (const o of ws.options) {
      if (
        o.deliverableIds.some(
          (d) => !ws.deliverables.some((x) => x.id === d && x.inclusion !== "excluded"),
        )
      )
        opt.push(`${o.label}: references a deliverable that is missing or excluded`);
      if (o.lineIds.some((l) => !ws.lines.some((x) => x.id === l)))
        opt.push(`${o.label}: references a removed commercial line`);
      if (
        o.deliverableIds.some(
          (d) =>
            classifyDeliverable(
              ws.deliverables.find((x) => x.id === d) ?? {
                recommendationId: "",
                inclusion: "excluded",
              },
              h,
            ).availability === "missing",
        )
      )
        opt.push(`${o.label}: references functionality not in the approved solution`);
    }
  }
  add("options", "Options reference approved functionality", opt);
  return items;
}
export const readinessPercent = (items: ReadinessItem[]) =>
  items.length ? Math.round((items.filter((i) => i.ok).length / items.length) * 100) : 0;

// ---------- Versions ----------
export const PROPOSAL_VERSION_SCHEMA = "aurumi.cia.proposal-version/1" as const;
export const PROPOSAL_TEMPLATE_VERSION = "cia-proposal-template/1" as const;
export interface ProposalDocument {
  readonly templateVersion: typeof PROPOSAL_TEMPLATE_VERSION;
  readonly proposal: Readonly<
    Pick<Proposal, "id" | "title" | "track" | "ownerId" | "assignedUserIds" | "organizationId">
  >;
  readonly trackLabel: string;
  readonly disclosure: string;
  readonly recipient: Readonly<ProposalRecipient>;
  readonly validityDays: number;
  readonly commercialNotes: string;
  readonly source: Readonly<ProposalSource>;
  /** Complete approved solution hand-off, including its embedded assessment snapshot. */
  readonly solution: SolutionHandoffSnapshot;
  readonly sections: readonly ContentSection[];
  readonly deliverables: readonly (Deliverable & { info: DeliverableInfo })[];
  readonly commercials: {
    readonly priceBookVersion: string;
    readonly priceBookRetrievedAt: string;
    readonly illustrative: true;
    readonly lines: readonly (CommercialLine & { computed: LineAmount })[];
    readonly taxes: readonly TaxConfig[];
    readonly summary: CommercialSummary;
    readonly partnerTerms: readonly PartnerTerm[];
  };
  readonly risks: readonly RiskItem[];
  readonly milestones: readonly Milestone[];
  readonly options: readonly ProposalOption[];
}
export interface ProposalVersionRecord {
  readonly schema: typeof PROPOSAL_VERSION_SCHEMA;
  readonly id: ID;
  readonly organizationId: ID;
  readonly proposalId: ID;
  readonly versionNumber: number;
  readonly revision: number;
  readonly createdAt: ISODate;
  readonly createdBy: ID;
  readonly contentHash: string;
  readonly document: ProposalDocument;
  /** Write-once review decision for this exact version. */
  review?: {
    decision: "approved" | "changes_requested";
    by: ID;
    at: ISODate;
    comment: string;
    acknowledged: ID[];
  };
  /** Write-once issue record. */
  issue?: { issuedAt: ISODate; issuedBy: ID; effectiveAt: ISODate; expiresAt: ISODate };
  /** Set when a later change makes this version no longer current. */
  supersededAt?: ISODate;
}
export type VersionState = "submitted" | "approved" | "changes_requested" | "issued" | "superseded";
export const versionState = (v: ProposalVersionRecord): VersionState =>
  v.issue ? "issued" : v.supersededAt ? "superseded" : (v.review?.decision ?? "submitted");

// ---------- Shares ----------
export const RESPONSES = {
  pending: "Awaiting response",
  viewed: "Viewed (simulated)",
  acknowledged: "Acknowledged receipt",
  accepted: "Accepted (recorded — not a signed contract)",
  declined: "Declined",
  expired: "Expired",
} as const;
export type ShareResponse = keyof typeof RESPONSES;
export interface ProposalShareRecord {
  id: ID;
  organizationId: ID;
  proposalId: ID;
  versionId: ID;
  versionNumber: number;
  recipient: { name: string; email: string; organization: string };
  sharedAt: ISODate;
  sharedBy: ID;
  expiresAt: ISODate;
  access: "active" | "revoked";
  response: Exclude<ShareResponse, "expired"> | "expired";
  respondedAt?: ISODate;
  responseNote: string;
  recordedBy?: ID;
  channelReference: string;
  simulated: true;
}
const parseInstant = (v: unknown) => (typeof v === "string" ? Date.parse(v) : Number.NaN);
/** The moment a share stops being answerable: the earlier of its own and its issued version's expiry. */
export function shareExpiry(s: Pick<ProposalShareRecord, "expiresAt">, versionExpiresAt?: string) {
  const a = parseInstant(s.expiresAt);
  const b =
    versionExpiresAt === undefined ? Number.POSITIVE_INFINITY : parseInstant(versionExpiresAt);
  // An unreadable expiry fails closed (already expired).
  if (!Number.isFinite(a) || Number.isNaN(b)) return Number.NEGATIVE_INFINITY;
  return Math.min(a, b);
}
/** Expiry applies to every non-final response (pending, viewed, acknowledged). */
export const effectiveResponse = (
  s: ProposalShareRecord,
  now: string = proposalClock.now(),
  versionExpiresAt?: string,
): ShareResponse =>
  (s.response === "pending" || s.response === "viewed" || s.response === "acknowledged") &&
  shareExpiry(s, versionExpiresAt) <= Date.parse(now)
    ? "expired"
    : s.response;

export function buildProposalDocument(
  p: StudioProposal,
  ws: ProposalWorkspace,
  h: SolutionHandoffSnapshot,
  book: PriceBook,
): ProposalDocument {
  const summary = calculateCommercials(ws.lines, ws.taxes);
  return {
    templateVersion: PROPOSAL_TEMPLATE_VERSION,
    proposal: {
      id: p.id,
      title: p.title,
      track: p.track,
      ownerId: p.ownerId,
      assignedUserIds: p.assignedUserIds,
      organizationId: p.organizationId,
    },
    trackLabel: TRACKS[p.track].label,
    disclosure: TRACKS[p.track].disclosure,
    recipient: structuredClone(ws.recipient),
    validityDays: ws.validityDays,
    commercialNotes: ws.commercialNotes,
    source: structuredClone(p.source),
    solution: structuredClone(h),
    sections: structuredClone(ws.sections),
    deliverables: ws.deliverables.map((d) => ({
      ...structuredClone(d),
      info: classifyDeliverable(d, h),
    })),
    commercials: {
      priceBookVersion: book.priceBookVersion,
      priceBookRetrievedAt: book.retrievedAt,
      illustrative: true,
      lines: ws.lines.map((l) => ({ ...structuredClone(l), computed: summary.lines[l.id]! })),
      taxes: structuredClone(ws.taxes),
      summary,
      partnerTerms: structuredClone(ws.partnerTerms),
    },
    risks: structuredClone(ws.risks),
    milestones: structuredClone(ws.milestones),
    options: structuredClone(ws.options),
  };
}

/** Recomputes the approval-bound content hash from an immutable version document. */
export function documentHash(doc: ProposalDocument): string {
  const ws = {
    recipient: doc.recipient,
    validityDays: doc.validityDays,
    commercialNotes: doc.commercialNotes,
    sections: doc.sections,
    deliverables: doc.deliverables.map(({ info: _i, ...d }) => d),
    lines: doc.commercials.lines.map(({ computed: _c, ...l }) => l),
    taxes: doc.commercials.taxes,
    partnerTerms: doc.commercials.partnerTerms,
    risks: doc.risks,
    milestones: doc.milestones,
    options: doc.options,
  } as unknown as ProposalWorkspace;
  return materialHash(doc.proposal, doc.source as ProposalSource, ws, doc.solution);
}
/** Embedded hand-off identity must match the version's pinned source exactly. */
function embeddedSourceProblems(d: ProposalDocument, orgId: ID): string[] {
  const out: string[] = [];
  const s = d.source as ProposalSource;
  const h = d.solution;
  const a = h.sourceAssessment;
  const eq = (what: string, x: unknown, y: unknown) => {
    if (x !== y) out.push(`embedded ${what} does not match the pinned source`);
  };
  eq("solution snapshot id", h.id, s.solutionSnapshotId);
  eq("solution id", h.solutionId, s.solutionId);
  eq("solution record id", h.solution.id, s.solutionId);
  eq("solution snapshot version", h.version, s.solutionSnapshotVersion);
  eq("solution schema", h.schema, s.solutionSchema);
  eq("solution organization", h.organizationId, orgId);
  eq("assessment snapshot id", a.id, s.assessmentSnapshotId);
  eq("assessment id", a.assessmentId, s.assessmentId);
  eq("assessment id on solution", h.solution.assessmentId, s.assessmentId);
  eq("assessment snapshot version", a.version, s.assessmentSnapshotVersion);
  eq("assessment baseline", h.baseline.snapshotId, s.assessmentSnapshotId);
  eq("approval time", h.approval.approvedAt, s.approvedAt);
  for (const r of unresolvedHandoffRefs(h))
    out.push(`embedded hand-off reference unresolved: ${r}`);
  return out;
}
/**
 * Independent integrity check of a stored proposal version: identities, every
 * line amount and total recomputed from authoritative values, and the content
 * hash recomputed from the document. Browser storage is never trusted.
 */
export function versionIntegrityProblems(v: ProposalVersionRecord): string[] {
  const out: string[] = [];
  try {
    const d = v.document;
    if (d.proposal.id !== v.proposalId) out.push("document belongs to a different proposal");
    if (d.proposal.organizationId !== v.organizationId)
      out.push("document belongs to a different organization");
    out.push(...embeddedSourceProblems(d, v.organizationId));
    const lines: CommercialLine[] = [];
    for (const l of d.commercials.lines) {
      const { computed, ...raw } = l;
      lines.push(raw as CommercialLine);
      if (typeof l.quantity !== "number" || !Number.isFinite(l.quantity) || l.quantity <= 0)
        out.push(`line ${l.id}: invalid quantity`);
      if (l.priceRef && !Number.isFinite(l.priceRef.publishedAmount))
        out.push(`line ${l.id}: invalid published amount`);
      if (canonical(computed) !== canonical(lineAmount(raw as CommercialLine)))
        out.push(`line ${l.id}: stored amount does not match its recomputed amount`);
    }
    const summary = calculateCommercials(lines, [...d.commercials.taxes]);
    if (canonical(summary) !== canonical(d.commercials.summary))
      out.push("stored totals do not match recomputed totals");
    if (documentHash(d) !== v.contentHash)
      out.push("content hash does not match the stored document");
  } catch {
    out.push("version document is malformed");
  }
  return out;
}
