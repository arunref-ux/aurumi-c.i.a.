import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusPill, EmptyState } from "@/components/app/ui-bits";
import { ArrowUpRight } from "@/components/app/icons";
import {
  engagementService as E,
  type EngagementCreation,
  type DeliveryView,
} from "@/data/delivery";
import { auditLog } from "@/data/repositories";
import { can, type DeliveryAction } from "@/domain/permissions";
import { computeDeliveryMetrics } from "@/domain/metrics";
import { DeliveryRecovery } from "./recovery-actions";
import {
  SERVICES,
  RESPONSIBILITIES,
  LIFE,
  improvement,
  today,
  type ServiceTerms,
  type DeliveryConcern,
  type DeliveryOutcome,
  type Interaction,
  type Continuation,
  type DeliverableReview,
  type DeliveryReview,
} from "@/domain/delivery";
import { useSession } from "@/lib/session";
import { useEngagements, useEngagement, useDeliveryQuery } from "@/lib/delivery-queries";
import {
  RecordForm,
  Disclosure,
  Section,
  Facts,
  ErrorState,
  inputClass,
  words,
  field,
  selectField,
  options,
  decisionFields,
  termsFields,
  termsFrom,
  val,
  refs,
  type Field,
} from "./forms";
export function EngagementIndex() {
  const { user } = useSession(),
    q = useEngagements(),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [service, setService] = useState("all"),
    [newOpen, setNewOpen] = useState(false);
  const list = q.data?.filter(
    (v) =>
      (status === "all" || v.engagement.status === status) &&
      (service === "all" || v.overview.services.includes(service)) &&
      `${v.engagement.title} ${v.overview.customerName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const metrics = computeDeliveryMetrics(list ?? []);
  return (
    <div key={user.id}>
      <PageHeader
        eyebrow="Client delivery"
        title="Engagements"
        actions={
          can(user, "delivery.create") ? (
            <Button onClick={() => setNewOpen(!newOpen)}>
              {newOpen ? "Close creation" : "New engagement"}
            </Button>
          ) : undefined
        }
      />
      <DeliveryRecovery />
      {newOpen && (
        <section className="mb-8 border-y py-6">
          <EngagementCreate />
        </section>
      )}
      <div className="mb-6 flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          aria-label="Search engagements"
          placeholder="Search customer or engagement"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={`${inputClass} sm:w-auto`}
          aria-label="Lifecycle status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All lifecycle states</option>
          {LIFE.map((s) => (
            <option key={s} value={s}>
              {words(s)}
            </option>
          ))}
        </select>
        <select
          className={`${inputClass} sm:w-auto`}
          aria-label="Service category"
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="all">All services</option>
          {SERVICES.map((s) => (
            <option key={s} value={s}>
              {words(s)}
            </option>
          ))}
        </select>
      </div>
      {q.isPending || q.error ? (
        <ErrorState loading={q.isPending} error={q.error} />
      ) : !list?.length ? (
        <EmptyState title="No engagements in view" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 border-y py-5 md:grid-cols-4">
            {[
              ["Active", metrics.active],
              ["Milestones overdue", metrics.overdueMilestones.length],
              ["Deliverables awaiting review", metrics.awaitingDeliverables.length],
              ["Open material issues", metrics.materialIssues.length],
            ].map(([l, n]) => (
              <div key={l}>
                <p className="text-xs text-muted-foreground">{l}</p>
                <p className="mt-1 font-display text-3xl">{n}</p>
              </div>
            ))}
          </div>
          <div className="divide-y border-y">
            {list.map((v) => (
              <div
                key={v.engagement.id}
                className="flex min-w-0 flex-col gap-3 py-5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="break-words text-2xl">{v.engagement.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {v.overview.customerName} · {v.overview.services.map(words).join(", ")}
                  </p>
                  <p className="mt-2 text-xs">
                    {v.overview.cadence} ·{" "}
                    {v.workspace.milestones.filter((m) => m.status === "completed").length}/
                    {v.workspace.milestones.length} milestones completed
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill
                    tone={
                      v.engagement.status === "completed"
                        ? "success"
                        : v.engagement.status === "on_hold"
                          ? "warning"
                          : "info"
                    }
                  >
                    {words(v.engagement.status)}
                  </StatusPill>
                  <Button variant="outline" asChild>
                    <Link
                      to="/engagements/$engagementId"
                      params={{ engagementId: v.engagement.id }}
                    >
                      Open <ArrowUpRight />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
function EngagementCreate() {
  const { user } = useSession(),
    ctx = { user },
    nav = useNavigate(),
    [origin, setOrigin] = useState<EngagementCreation["origin"]>("direct"),
    [key] = useState(() => crypto.randomUUID());
  const candidates = useDeliveryQuery("creation-candidates", "", (c) => E.candidates(c)),
    proposals = useDeliveryQuery("issued-proposals", "", E.proposals),
    previous = useEngagements();
  return (
    <>
      <h2 className="mb-4 text-2xl">Create engagement</h2>
      <div className="mb-5 flex flex-wrap gap-2">
        {(["direct", "proposal", "follow_on"] as const).map((s) => (
          <Button
            key={s}
            variant={origin === s ? "secondary" : "ghost"}
            onClick={() => setOrigin(s)}
          >
            {words(s)}
          </Button>
        ))}
      </div>
      <RecordForm
        key={origin}
        title="Create engagement"
        submit="Create draft"
        fields={[
          field("title", "Engagement title"),
          field("customerName", "Customer / partner name"),
          field("customerReference", "Simulated ShopTalk reference"),
          selectField(
            "customerKind",
            "Customer type",
            options(["customer", "partner"]),
            "customer",
          ),
          field("partnerAffiliationId", "Partner affiliation reference", "", "text", false),
          selectField("service", "Service category", options(SERVICES)),
          selectField(
            "leadProfessionalId",
            "Accountable lead",
            candidates.data?.map((p) => ({
              value: p.id,
              label: `${p.displayName} — ${words(p.status)}`,
            })) ?? [],
          ),
          ...(origin === "proposal"
            ? [
                selectField(
                  "proposalVersionId",
                  "Exact issued proposal version",
                  proposals.data?.map((p) => ({
                    value: p.id,
                    label: `${p.title} · v${p.number} · ${p.customerName}`,
                  })) ?? [],
                ),
                field("allocationId", "Separately authorized service allocation identity"),
              ]
            : []),
          ...(origin === "follow_on"
            ? [
                selectField(
                  "previousEngagementId",
                  "Prior authorized engagement",
                  previous.data?.map((v) => ({
                    value: v.engagement.id,
                    label: v.engagement.title,
                  })) ?? [],
                ),
              ]
            : []),
          ...termsFields(),
          field("authorizationEvidence", "Separate service authorization evidence"),
        ]}
        run={async (v) => {
          const result = await E.create(ctx, {
            operationKey: key,
            title: val(v, "title"),
            origin,
            customerReference: val(v, "customerReference"),
            customerName: val(v, "customerName"),
            customerKind: val(v, "customerKind") as "customer" | "partner",
            partnerAffiliationId: val(v, "partnerAffiliationId"),
            services: [val(v, "service") as (typeof SERVICES)[number]],
            leadProfessionalId: val(v, "leadProfessionalId"),
            terms: termsFrom(v),
            authorizationEvidence: val(v, "authorizationEvidence"),
            proposalVersionId: val(v, "proposalVersionId"),
            allocationId: val(v, "allocationId"),
            previousEngagementId: val(v, "previousEngagementId"),
          });
          await nav({
            to: "/engagements/$engagementId",
            params: { engagementId: result.engagement.id },
          });
        }}
      />
    </>
  );
}
export function EngagementDetail({ id }: { id: string }) {
  const { user } = useSession(),
    q = useEngagement(id);
  if (!q.data) return <ErrorState loading={q.isPending} error={q.error} />;
  return <EngagementBody key={`${id}:${user.id}`} v={q.data} />;
}
function EngagementBody({ v }: { v: DeliveryView }) {
  const { user } = useSession(),
    ctx = { user },
    id = v.engagement.id,
    w = v.workspace,
    [tab, setTab] = useState("Overview"),
    [taskKey] = useState(() => crypto.randomUUID()),
    [handoffKey] = useState(() => crypto.randomUUID());
  const permitted = (a: DeliveryAction) => can(user, `delivery.${a}`, v.engagement);
  const alive = !["completed", "cancelled"].includes(v.engagement.status);
  const candidates = useDeliveryQuery("assignment-candidates", id, (c) => E.candidates(c, id)),
    signals = useDeliveryQuery("tenant-signals", id, (c) => E.signals(c, id));
  const people =
    candidates.data?.map((p) => ({ value: p.id, label: p.displayName })) ??
    w.assignments.map((a) => ({ value: a.professionalId, label: a.professionalId }));
  const streams = w.workstreams.map((s) => ({ value: s.id, label: s.name }));
  const milestones = w.milestones.map((m) => ({ value: m.id, label: m.title }));
  const tabs = [
    "Overview",
    "Team",
    "Delivery plan",
    "Deliverables",
    "Interactions",
    ...(!v.restricted ? ["Scope & changes"] : []),
    "Risks & issues",
    "Outcomes",
    "Reviews",
    "Continuation",
    "Audit",
  ];
  const defaultTerms: ServiceTerms = {
    included: v.overview.included,
    excluded: v.overview.excluded,
    assumptions: v.overview.assumptions,
    customerResponsibilities: v.overview.customerResponsibilities,
    professionalResponsibilities: v.overview.professionalResponsibilities,
    commercialBasis: "",
    currency: "INR",
    amount: null,
    period: "one_time",
    pricingReference: "",
    start: v.overview.start,
    end: v.overview.end,
    cadence: v.overview.cadence,
  };
  const currentTerms = v.scopes.at(-1)?.terms ?? defaultTerms;
  const paths: Record<string, string[]> = {
    draft: ["pending_authorization", "cancelled"],
    pending_authorization: ["authorized", "draft", "cancelled"],
    authorized: ["mobilizing", "cancelled"],
    mobilizing: ["active", "on_hold", "cancelled"],
    active: ["on_hold", "completion_review", "cancelled"],
    on_hold: ["active", "cancelled"],
    completion_review: ["active", "cancelled"],
  };
  return (
    <>
      <Button variant="link" className="px-0" asChild>
        <Link to="/engagements">← Engagements</Link>
      </Button>
      <PageHeader
        eyebrow={v.overview.customerName}
        title={v.engagement.title}
        actions={
          <>
            <StatusPill tone={v.engagement.status === "completed" ? "success" : "info"}>
              {words(v.engagement.status)}
            </StatusPill>
            {v.completion && (
              <Button variant="outline" asChild>
                <Link to="/engagements/$engagementId/report" params={{ engagementId: id }}>
                  Completion report <ArrowUpRight />
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap gap-1 border-b pb-3">
        {tabs.map((t) => (
          <Button
            key={t}
            size="sm"
            variant={tab === t ? "secondary" : "ghost"}
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      <DeliveryRecovery id={id} />
      {tab === "Overview" && (
        <>
          <Section title="Authorized service">
            <Facts
              items={[
                ["Customer", v.overview.customerName],
                ["Source", words(v.overview.origin)],
                ["Services", v.overview.services.map(words).join(", ")],
                ["Service period", `${v.overview.start} — ${v.overview.end}`],
                ["Included", v.overview.included],
                ["Excluded", v.overview.excluded],
                ["Assumptions", v.overview.assumptions],
                ["Customer responsibilities", v.overview.customerResponsibilities],
                ["Professional responsibilities", v.overview.professionalResponsibilities],
                ["Cadence", v.overview.cadence],
              ]}
            />
            {v.commercialVisible && (
              <Disclosure title="Commercial & source references">
                <Facts
                  items={[
                    ["Commercial basis", currentTerms.commercialBasis],
                    [
                      "Service amount",
                      currentTerms.amount === null
                        ? "Not specified"
                        : `${currentTerms.currency} ${currentTerms.amount} / ${words(currentTerms.period)}`,
                    ],
                    ["Pricing reference", currentTerms.pricingReference],
                    ["Customer reference", v.overview.customerReference],
                    ["Initiation integrity", v.initiation?.integrityValue],
                    [
                      "Source version",
                      v.initiation?.source.kind === "proposal"
                        ? `${v.initiation.source.proposalId} · v${v.initiation.source.versionNumber}`
                        : "Direct / prior engagement authorization",
                    ],
                  ]}
                />
              </Disclosure>
            )}
            {v.engagement.status === "on_hold" && (
              <p className="mt-4 text-sm text-destructive">On hold: {w.holdReason}</p>
            )}
            {alive && (permitted("authorize") || permitted("cancel")) && (
              <Disclosure title="Lifecycle decision">
                <RecordForm
                  title="Engagement lifecycle decision"
                  fields={[
                    selectField(
                      "next",
                      "Next lifecycle state",
                      options(
                        (paths[v.engagement.status] ?? []).filter((s) =>
                          s === "cancelled" ? permitted("cancel") : permitted("authorize"),
                        ),
                      ),
                    ),
                    ...decisionFields,
                  ]}
                  run={(values) =>
                    E.transition(
                      ctx,
                      id,
                      val(values, "next"),
                      val(values, "evidence"),
                      val(values, "comment"),
                    )
                  }
                />
              </Disclosure>
            )}
          </Section>
          <Section title="Tenant observations">
            {signals.data ? (
              <>
                <StatusPill>Simulated · unverified</StatusPill>
                <Facts
                  items={[
                    ["Adoption", signals.data.adoptionTrend],
                    ["Health", signals.data.connectorHealth],
                    ["Meaning", signals.data.source],
                  ]}
                />
              </>
            ) : (
              <ErrorState loading={signals.isPending} error={signals.error} />
            )}
          </Section>
        </>
      )}
      {tab === "Team" && (
        <Section title="Assignments">
          {w.assignments.map((a) => (
            <div key={a.id} className="border-b py-4">
              <Facts
                items={[
                  [
                    "Professional",
                    candidates.data?.find((p) => p.id === a.professionalId)?.displayName ??
                      a.professionalId,
                  ],
                  ["Responsibility", words(a.responsibility)],
                  [
                    "Workstream",
                    w.workstreams.find((s) => s.id === a.workstreamId)?.name ?? "Engagement-wide",
                  ],
                  ["Period", `${a.start} — ${a.end ?? "ongoing"}`],
                  ["Affiliation at assignment", words(a.affiliation.relationship)],
                  ["Acknowledgement", a.acknowledgedAt ?? "Awaiting professional acknowledgement"],
                ]}
              />
              <StatusPill>{a.status}</StatusPill>
              {alive && a.userId === user.id && a.status === "active" && !a.acknowledgedAt && (
                <Disclosure title="Acknowledge assignment">
                  <RecordForm
                    title="Assignment acknowledgement"
                    fields={[]}
                    run={() => E.acknowledge(ctx, id, a.id)}
                  />
                </Disclosure>
              )}
              {alive && permitted("assign") && a.status === "active" && (
                <Disclosure title="End assignment">
                  <RecordForm
                    title="End assignment"
                    fields={decisionFields}
                    run={(values) =>
                      E.removeAssignment(
                        ctx,
                        id,
                        a.id,
                        val(values, "evidence"),
                        val(values, "comment"),
                      )
                    }
                  />
                </Disclosure>
              )}
            </div>
          ))}
          {alive && permitted("assign") && (
            <Disclosure title="Assign or reassign professional">
              <RecordForm
                title="Professional assignment"
                fields={[
                  selectField("professionalId", "Professional", people),
                  selectField("responsibility", "Responsibility", options(RESPONSIBILITIES)),
                  selectField(
                    "workstreamId",
                    "Workstream (blank = engagement-wide)",
                    streams,
                    "",
                    false,
                  ),
                  selectField("service", "Authorized service", options(SERVICES)),
                  field(
                    "qualificationIds",
                    "Required qualification identities (comma-separated)",
                    "",
                    "text",
                    false,
                  ),
                  field("start", "Assignment start", today(), "date"),
                  field("end", "Assignment end", "", "date", false),
                  field("allocationHours", "Estimated weekly allocation", "0", "number"),
                ]}
                run={(values) =>
                  E.assign(ctx, id, {
                    professionalId: val(values, "professionalId"),
                    responsibility: val(
                      values,
                      "responsibility",
                    ) as (typeof RESPONSIBILITIES)[number],
                    workstreamId: val(values, "workstreamId"),
                    service: val(values, "service") as (typeof SERVICES)[number],
                    qualificationIds: refs(val(values, "qualificationIds")),
                    start: val(values, "start"),
                    end: val(values, "end") || null,
                    allocationHours: Number(val(values, "allocationHours")),
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Delivery plan" && (
        <>
          <Section title="Workstreams">
            {w.workstreams.map((s) => (
              <div key={s.id} className="border-b py-3">
                <h3 className="font-medium">{s.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                <p className="mt-2 text-xs">
                  {s.start} — {s.end} · {words(s.status)}
                </p>
                {alive && permitted("plan") && !["completed", "cancelled"].includes(s.status) && (
                  <Disclosure title={`Update workstream: ${s.name}`}>
                    <RecordForm
                      title="Workstream status"
                      fields={[
                        selectField(
                          "status",
                          "Workstream state",
                          options(
                            permitted("authorize")
                              ? ["active", "blocked", "completed", "cancelled"]
                              : ["active", "blocked", "completed"],
                          ),
                        ),
                      ]}
                      run={(values) =>
                        E.workstreamStatus(
                          ctx,
                          id,
                          s.id,
                          val(values, "status") as "active" | "blocked" | "completed" | "cancelled",
                        )
                      }
                    />
                  </Disclosure>
                )}
              </div>
            ))}
            {alive && permitted("plan") && !v.restricted && (
              <Disclosure title="Add workstream">
                <RecordForm
                  title="Workstream"
                  fields={[
                    field("name", "Workstream name"),
                    field("description", "Description", "", "area", false),
                    selectField("ownerProfessionalId", "Responsible professional", people),
                    field("start", "Start", today(), "date"),
                    field("end", "End", v.overview.end, "date"),
                    field(
                      "dependencies",
                      "Dependency identities (comma-separated)",
                      "",
                      "text",
                      false,
                    ),
                  ]}
                  run={(values) =>
                    E.workstream(ctx, id, {
                      name: val(values, "name"),
                      description: val(values, "description"),
                      ownerProfessionalId: val(values, "ownerProfessionalId"),
                      start: val(values, "start"),
                      end: val(values, "end"),
                      dependencies: refs(val(values, "dependencies")),
                    })
                  }
                />
              </Disclosure>
            )}
          </Section>
          <Section title="Milestones">
            {w.milestones.map((m) => (
              <div key={m.id} className="border-b py-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-medium">{m.title}</h3>
                  <StatusPill
                    tone={
                      m.status === "completed" ? "success" : m.due < today() ? "warning" : "neutral"
                    }
                  >
                    {words(m.status)} · {m.due}
                  </StatusPill>
                </div>
                <p className="mt-2 text-sm">{m.criteria}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.required ? "Required" : "Optional"} · {m.deliverableIds.length} linked
                  deliverables
                </p>
                {alive && permitted("plan") && !["completed", "cancelled"].includes(m.status) && (
                  <Disclosure title={`Update milestone: ${m.title}`}>
                    <RecordForm
                      title="Milestone status"
                      fields={[
                        selectField(
                          "status",
                          "Status",
                          options(["in_progress", "blocked", "ready", "completed", "cancelled"]),
                        ),
                        field("evidence", "Completion evidence references", "", "text", false),
                        ...(permitted("authorize")
                          ? [
                              field(
                                "exceptionEvidence",
                                "Exception authorization evidence",
                                "",
                                "text",
                                false,
                              ),
                              field("exceptionComment", "Exception rationale", "", "area", false),
                            ]
                          : []),
                      ]}
                      run={(values) =>
                        E.milestoneStatus(
                          ctx,
                          id,
                          m.id,
                          val(values, "status") as
                            "in_progress" | "blocked" | "ready" | "completed" | "cancelled",
                          refs(val(values, "evidence")),
                          val(values, "exceptionEvidence")
                            ? {
                                evidence: val(values, "exceptionEvidence"),
                                comment: val(values, "exceptionComment"),
                              }
                            : undefined,
                        )
                      }
                    />
                  </Disclosure>
                )}
              </div>
            ))}
            {alive && permitted("plan") && (
              <Disclosure title="Add milestone">
                <RecordForm
                  title="Milestone"
                  fields={[
                    selectField("workstreamId", "Workstream", streams),
                    field("title", "Milestone title"),
                    field("description", "Description", "", "area", false),
                    selectField("ownerProfessionalId", "Responsible professional", people),
                    field("due", "Due date", "", "date"),
                    field("criteria", "Completion criteria", "", "area"),
                    field(
                      "deliverableIds",
                      "Required deliverable identities (comma-separated)",
                      "",
                      "text",
                      false,
                    ),
                    field(
                      "dependencies",
                      "Dependency milestone identities (comma-separated)",
                      "",
                      "text",
                      false,
                    ),
                    selectField(
                      "required",
                      "Required for completion",
                      options(["yes", "no"]),
                      "yes",
                    ),
                  ]}
                  run={(values) =>
                    E.milestone(ctx, id, {
                      workstreamId: val(values, "workstreamId"),
                      title: val(values, "title"),
                      description: val(values, "description"),
                      ownerProfessionalId: val(values, "ownerProfessionalId"),
                      due: val(values, "due"),
                      criteria: val(values, "criteria"),
                      deliverableIds: refs(val(values, "deliverableIds")),
                      dependencies: refs(val(values, "dependencies")),
                      required: val(values, "required") === "yes",
                    })
                  }
                />
              </Disclosure>
            )}
          </Section>
          <Section title="Linked tasks & calendar">
            {!w.tasks.length && <EmptyState title="No linked tasks" />}
            {w.tasks.map((t) => (
              <div key={t.id} className="border-b py-3">
                <h3 className="text-sm font-medium">{t.title}</h3>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {t.reference} · simulated · {t.status}
                </p>
                {alive && permitted("plan") && t.status !== "completed" && (
                  <Disclosure title="Record task completion evidence">
                    <RecordForm
                      title="Task evidence"
                      fields={[field("evidence", "Evidence references (comma-separated)")]}
                      run={(values) => E.taskEvidence(ctx, id, t.id, refs(val(values, "evidence")))}
                    />
                  </Disclosure>
                )}
              </div>
            ))}
            {alive && permitted("plan") && (
              <Disclosure title="Create linked task">
                <RecordForm
                  title="Linked task"
                  fields={[
                    selectField("workstreamId", "Workstream", streams),
                    selectField("milestoneId", "Milestone", milestones, "", false),
                    field("title", "Task title"),
                  ]}
                  run={(values) =>
                    E.task(ctx, id, {
                      key: taskKey,
                      workstreamId: val(values, "workstreamId"),
                      milestoneId: val(values, "milestoneId"),
                      title: val(values, "title"),
                    })
                  }
                />
              </Disclosure>
            )}
          </Section>
        </>
      )}
      {tab === "Deliverables" && (
        <Section title="Deliverable register">
          {w.deliverables.map((d) => (
            <div key={d.id} className="border-b py-5">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="text-lg font-medium">{d.title}</h3>
                <StatusPill tone={d.status === "accepted" ? "success" : "neutral"}>
                  {words(d.status)}
                </StatusPill>
              </div>
              <p className="mt-2 text-sm">{d.description}</p>
              <Facts
                items={[
                  ["Acceptance criteria", d.criteria],
                  ["Artifact reference", d.artifactReference],
                  ["Due", d.due],
                  [
                    "Acceptance",
                    `${words(d.acceptanceKind)} · ${d.independentReview ? "independent review required" : "standard review"}`,
                  ],
                ]}
              />
              {d.versions.map((version) => (
                <div key={version.id} className="mt-3 border-l-2 border-accent pl-3">
                  <p className="text-xs font-medium">
                    Version {version.number} · {version.submittedAt}
                  </p>
                  <p className="break-all text-xs text-muted-foreground">
                    {version.artifactReference} · {version.integrityValue}
                  </p>
                  {d.reviews
                    .filter((r) => r.versionId === version.id)
                    .map((r) => (
                      <p key={r.id} className="mt-1 text-xs">
                        {words(r.kind)} · {words(r.decision)} · {r.approval.evidence}
                      </p>
                    ))}
                </div>
              ))}
              {alive && permitted("submit") && (
                <>
                  <Disclosure title={`Edit artifact: ${d.title}`}>
                    <RecordForm
                      title="Deliverable artifact"
                      fields={[
                        field("description", "Content description", d.description, "area"),
                        field(
                          "artifactReference",
                          "File Hub artifact reference",
                          d.artifactReference,
                        ),
                      ]}
                      run={(values) =>
                        E.editDeliverable(ctx, id, d.id, {
                          description: val(values, "description"),
                          artifactReference: val(values, "artifactReference"),
                        })
                      }
                    />
                  </Disclosure>
                  {["draft", "changes_requested"].includes(d.status) && (
                    <Disclosure title={`Submit version: ${d.title}`}>
                      <RecordForm
                        title="Deliverable submission"
                        fields={[]}
                        run={() => E.submitDeliverable(ctx, id, d.id)}
                      />
                    </Disclosure>
                  )}
                </>
              )}
              {alive &&
                ["submitted", "under_review"].includes(d.status) &&
                (permitted("review") || permitted("accept")) && (
                  <Disclosure title={`Review current version: ${d.title}`}>
                    <RecordForm
                      title="Deliverable review"
                      fields={[
                        selectField(
                          "kind",
                          "Review kind",
                          options([
                            ...(permitted("review") ? ["internal_review"] : []),
                            ...(permitted("accept")
                              ? [
                                  "internal_approval",
                                  "customer_acknowledgement",
                                  "customer_acceptance",
                                ]
                              : []),
                          ]),
                        ),
                        selectField(
                          "decision",
                          "Decision",
                          options(["accepted", "changes_requested"]),
                        ),
                        ...decisionFields,
                      ]}
                      run={(values) =>
                        E.reviewDeliverable(
                          ctx,
                          id,
                          d.id,
                          d.versions.at(-1)?.id ?? "",
                          val(values, "kind") as DeliverableReview["kind"],
                          val(values, "decision") as DeliverableReview["decision"],
                          val(values, "evidence"),
                          val(values, "comment"),
                        )
                      }
                    />
                  </Disclosure>
                )}
            </div>
          ))}
          {alive && permitted("plan") && (
            <Disclosure title="Add deliverable">
              <RecordForm
                title="Deliverable"
                fields={[
                  selectField("workstreamId", "Workstream", streams),
                  selectField("ownerProfessionalId", "Responsible professional", people),
                  field("title", "Deliverable title"),
                  field("description", "Description", "", "area"),
                  field("criteria", "Acceptance criteria", "", "area"),
                  field("due", "Due date", "", "date"),
                  selectField("required", "Required for completion", options(["yes", "no"]), "yes"),
                  selectField(
                    "independentReview",
                    "Independent review",
                    options(["yes", "no"]),
                    "yes",
                  ),
                  selectField(
                    "acceptanceKind",
                    "Acceptance authority",
                    options(["internal_approval", "customer_acceptance"]),
                    "customer_acceptance",
                  ),
                  field("artifactReference", "Artifact reference", "", "text", false),
                ]}
                run={(values) =>
                  E.deliverable(ctx, id, {
                    workstreamId: val(values, "workstreamId"),
                    ownerProfessionalId: val(values, "ownerProfessionalId"),
                    title: val(values, "title"),
                    description: val(values, "description"),
                    criteria: val(values, "criteria"),
                    due: val(values, "due"),
                    required: val(values, "required") === "yes",
                    independentReview: val(values, "independentReview") === "yes",
                    acceptanceKind: val(values, "acceptanceKind") as
                      "internal_approval" | "customer_acceptance",
                    artifactReference: val(values, "artifactReference"),
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Interactions" && (
        <Section title="Customer interactions">
          {!w.interactions.length && <EmptyState title="No interactions recorded" />}
          {w.interactions.map((i) => (
            <div key={i.id} className="border-b py-4">
              <StatusPill>{i.type}</StatusPill>
              <p className="mt-2 text-sm">{i.summary}</p>
              <Facts
                items={[
                  ["Date", i.at],
                  ["Decisions", i.decisions],
                  ["Follow-ups", i.followUps],
                  ["Evidence", i.evidence.join(", ")],
                  ["Messenger", i.messengerReference],
                  ["Calendar", i.calendarReference],
                ]}
              />
            </div>
          ))}
          {alive && permitted("interact") && (
            <Disclosure title="Record interaction">
              <RecordForm
                title="Customer interaction"
                fields={[
                  selectField("workstreamId", "Workstream", streams, "", false),
                  selectField(
                    "type",
                    "Interaction type",
                    options([
                      "discovery",
                      "implementation",
                      "training",
                      "advisory",
                      "feedback",
                      "review",
                      "escalation",
                    ]),
                  ),
                  field("at", "Interaction date and time", "", "datetime-local"),
                  field("participants", "Participants (comma-separated)"),
                  field("summary", "Summary", "", "area"),
                  field("decisions", "Decisions", "", "area", false),
                  field("followUps", "Follow-ups", "", "area", false),
                  field("evidence", "Evidence references", "", "text", false),
                  field("messengerReference", "Simulated Messenger thread", "", "text", false),
                  field("calendarReference", "Simulated calendar reference", "", "text", false),
                ]}
                run={(values) =>
                  E.interaction(ctx, id, {
                    workstreamId: val(values, "workstreamId"),
                    type: val(values, "type") as Interaction["type"],
                    at: new Date(val(values, "at")).toISOString(),
                    participants: refs(val(values, "participants")),
                    summary: val(values, "summary"),
                    decisions: val(values, "decisions"),
                    followUps: val(values, "followUps"),
                    evidence: refs(val(values, "evidence")),
                    messengerReference: val(values, "messengerReference"),
                    calendarReference: val(values, "calendarReference"),
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Scope & changes" && (
        <Section title="Scope baseline & authorized amendments">
          {v.scopes.map((s) => (
            <div key={s.id} className="border-b py-4">
              <h3 className="font-medium">
                Scope version {s.number}
                {s.number === 1 ? " — original" : ""}
              </h3>
              <p className="mt-2 text-sm">{s.terms.included}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.approval.comment} · {s.integrityValue}
              </p>
            </div>
          ))}
          {w.changes.map((change) => (
            <div key={change.id} className="border-b py-4">
              <h3 className="font-medium">{change.requested}</h3>
              <StatusPill>{change.status}</StatusPill>
              <Facts
                items={[
                  ["Reason", change.reason],
                  ["Delivery impact", change.impact],
                  ["Schedule impact", change.scheduleImpact],
                  ["Commercial impact", change.commercialImpact],
                ]}
              />
              {alive && permitted("approve_change") && change.status === "submitted" && (
                <Disclosure title="Authorize scope change">
                  <RecordForm
                    title="Scope change authorization"
                    fields={[
                      selectField("decision", "Decision", options(["approved", "rejected"])),
                      ...decisionFields,
                    ]}
                    run={(values) =>
                      E.approveChange(
                        ctx,
                        id,
                        change.id,
                        val(values, "decision") as "approved" | "rejected",
                        val(values, "evidence"),
                        val(values, "comment"),
                      )
                    }
                  />
                </Disclosure>
              )}
              {alive && permitted("approve_change") && change.status === "approved" && (
                <Disclosure title="Apply authorized amendment">
                  <RecordForm
                    title="Scope amendment"
                    fields={[]}
                    run={() => E.applyChange(ctx, id, change.id)}
                  />
                </Disclosure>
              )}
            </div>
          ))}
          {alive && permitted("change") && (
            <Disclosure title="Request scope change">
              <RecordForm
                title="Scope change request"
                fields={[
                  field("requested", "Requested change", "", "area"),
                  field("reason", "Reason", "", "area"),
                  field("impact", "Delivery impact", "", "area"),
                  field("scheduleImpact", "Schedule impact", "", "area", false),
                  field("commercialImpact", "Commercial impact", "", "area", false),
                  ...termsFields(currentTerms),
                  field(
                    "revisedProposalVersionId",
                    "Revised issued proposal version (commercial changes)",
                    "",
                    "text",
                    false,
                  ),
                ]}
                run={(values) =>
                  E.change(ctx, id, {
                    requested: val(values, "requested"),
                    reason: val(values, "reason"),
                    impact: val(values, "impact"),
                    scheduleImpact: val(values, "scheduleImpact"),
                    commercialImpact: val(values, "commercialImpact"),
                    terms: termsFrom(values),
                    revisedProposalVersionId: val(values, "revisedProposalVersionId"),
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Risks & issues" && (
        <Section title="Risks, issues, decisions & gaps">
          {!w.concerns.length && <EmptyState title="No concerns recorded" />}
          {w.concerns.map((r) => (
            <div key={r.id} className="border-b py-4">
              <div className="flex flex-wrap gap-2">
                <StatusPill>{r.kind}</StatusPill>
                <StatusPill tone={r.impact === "high" ? "warning" : "neutral"}>
                  {r.impact} impact · {r.status}
                </StatusPill>
                <StatusPill>{words(r.verification)}</StatusPill>
              </div>
              <p className="mt-2 font-medium">{r.description}</p>
              <Facts
                items={[
                  ["Response", r.response],
                  ["Alternatives", r.alternatives],
                  ["Evidence", r.evidence.join(", ")],
                  ["Next review", r.reviewDate],
                ]}
              />
              {alive && permitted("risk") && r.kind !== "decision" && r.status === "open" && (
                <Disclosure title="Resolve or acknowledge concern">
                  <RecordForm
                    title="Concern decision"
                    fields={[
                      selectField(
                        "status",
                        "Status",
                        options(
                          permitted("authorize") ? ["resolved", "acknowledged"] : ["resolved"],
                        ),
                      ),
                      ...decisionFields,
                    ]}
                    run={(values) =>
                      E.resolveConcern(
                        ctx,
                        id,
                        r.id,
                        val(values, "status") as "resolved" | "acknowledged",
                        val(values, "evidence"),
                        val(values, "comment"),
                      )
                    }
                  />
                </Disclosure>
              )}
              {alive && permitted("risk") && v.commercialVisible && r.kind === "gap" && (
                <Disclosure title="Send de-identified capability gap">
                  <RecordForm
                    title="Demand Studio handoff"
                    fields={[field("theme", "De-identified capability theme")]}
                    run={(values) =>
                      E.demand(ctx, id, r.id, `${handoffKey}:${r.id}`, val(values, "theme"))
                    }
                  />
                </Disclosure>
              )}
            </div>
          ))}
          {alive && permitted("risk") && (
            <Disclosure title="Record concern">
              <RecordForm
                title="Risk / issue / decision / gap"
                fields={[
                  selectField("workstreamId", "Workstream", streams, "", false),
                  selectField("kind", "Record kind", options(["risk", "issue", "decision", "gap"])),
                  field("description", "Description", "", "area"),
                  field("category", "Category", "", "text", false),
                  selectField(
                    "likelihood",
                    "Likelihood",
                    options(["low", "medium", "high", "unknown"]),
                  ),
                  selectField("impact", "Impact", options(["low", "medium", "high"])),
                  selectField("ownerProfessionalId", "Responsible professional", people),
                  field("response", "Response or rationale", "", "area", false),
                  field("alternatives", "Alternatives", "", "area", false),
                  field("reviewDate", "Review date", "", "date"),
                  field("evidence", "Evidence references", "", "text", false),
                  selectField(
                    "verification",
                    "Evidence status",
                    options(["assumption", "professional_observation"]),
                    "professional_observation",
                  ),
                ]}
                run={(values) =>
                  E.concern(ctx, id, {
                    workstreamId: val(values, "workstreamId"),
                    kind: val(values, "kind") as DeliveryConcern["kind"],
                    description: val(values, "description"),
                    category: val(values, "category"),
                    likelihood: val(values, "likelihood") as DeliveryConcern["likelihood"],
                    impact: val(values, "impact") as DeliveryConcern["impact"],
                    ownerProfessionalId: val(values, "ownerProfessionalId"),
                    response: val(values, "response"),
                    alternatives: val(values, "alternatives"),
                    reviewDate: val(values, "reviewDate"),
                    evidence: refs(val(values, "evidence")),
                    verification: val(values, "verification") as DeliveryConcern["verification"],
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Outcomes" && (
        <Section title="Outcome measurements">
          {w.outcomes.map((o) => (
            <div key={o.id} className="border-b py-5">
              <h3 className="font-medium">{o.objective}</h3>
              <StatusPill
                tone={
                  o.status === "achieved"
                    ? "success"
                    : o.status === "partially_achieved"
                      ? "warning"
                      : "neutral"
                }
              >
                {words(o.status)}
              </StatusPill>
              <p className="mt-2 text-sm text-muted-foreground">{o.definition}</p>
              <Facts
                items={[
                  [
                    "Baseline",
                    o.baseline === null
                      ? o.baselineDescription || "Baseline pending"
                      : `${o.baseline} ${o.unit}`,
                  ],
                  [
                    "Target — not a guarantee",
                    o.target === null ? o.targetDescription : `${o.target} ${o.unit}`,
                  ],
                  ["Frequency", o.frequency],
                  ["Customer feedback / limitations", o.feedback],
                ]}
              />
              {o.measurements.map((m) => (
                <div key={m.id} className="mt-4 border-l-2 border-accent pl-3">
                  <p className="text-sm">
                    {m.value === null ? m.qualitative : `${m.value} ${o.unit}`} ·{" "}
                    {words(m.provenance)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {m.observedAt} · {m.source} ·{" "}
                    {m.verification ? "Independently verified (simulated)" : "Unverified"}
                  </p>
                  {improvement(o, m.value) !== null && (
                    <p className="mt-1 text-xs">
                      {improvement(o, m.value)?.toFixed(1)}% observed improvement
                    </p>
                  )}
                  {alive && permitted("verify") && !m.verification && (
                    <Disclosure title="Verify observed measurement">
                      <RecordForm
                        title="Measurement verification"
                        fields={decisionFields}
                        run={(values) =>
                          E.verifyMeasurement(
                            ctx,
                            id,
                            o.id,
                            m.id,
                            val(values, "evidence"),
                            val(values, "comment"),
                          )
                        }
                      />
                    </Disclosure>
                  )}
                </div>
              ))}
              {alive && permitted("measure") && (
                <Disclosure title={`Record result: ${o.objective}`}>
                  <RecordForm
                    title="Outcome measurement"
                    fields={[
                      field("observedAt", "Observed date and time", "", "datetime-local"),
                      field("value", "Observed value", "", "number", false),
                      field("qualitative", "Qualitative observation", "", "area", false),
                      field("source", "Source description"),
                      selectField(
                        "provenance",
                        "Provenance",
                        options([
                          "customer_reported",
                          "professional_observation",
                          "system_derived",
                          "estimate",
                        ]),
                      ),
                      field("evidence", "Evidence references", "", "text", false),
                      selectField(
                        "status",
                        "Actual outcome state",
                        options([
                          "in_progress",
                          "achieved",
                          "partially_achieved",
                          "not_achieved",
                          "not_measurable",
                          "discontinued",
                        ]),
                      ),
                      field("feedback", "Customer feedback & limitations", "", "area", false),
                    ]}
                    run={(values) =>
                      E.measure(
                        ctx,
                        id,
                        o.id,
                        {
                          observedAt: new Date(val(values, "observedAt")).toISOString(),
                          value: val(values, "value") ? Number(val(values, "value")) : null,
                          qualitative: val(values, "qualitative"),
                          source: val(values, "source"),
                          provenance: val(values, "provenance") as
                            | "customer_reported"
                            | "professional_observation"
                            | "system_derived"
                            | "estimate",
                          evidence: refs(val(values, "evidence")),
                        },
                        val(values, "status") as DeliveryOutcome["status"],
                        val(values, "feedback"),
                      )
                    }
                  />
                </Disclosure>
              )}
            </div>
          ))}
          {alive && permitted("measure") && (
            <Disclosure title="Define outcome">
              <RecordForm
                title="Outcome definition"
                fields={outcomeFields(people)}
                run={(values) =>
                  E.outcome(ctx, id, {
                    objective: val(values, "objective"),
                    definition: val(values, "definition"),
                    unit: val(values, "unit"),
                    type: val(values, "type") as "quantitative" | "qualitative",
                    baseline: val(values, "baseline") ? Number(val(values, "baseline")) : null,
                    baselineDescription: val(values, "baselineDescription"),
                    baselineEvidence: refs(val(values, "baselineEvidence")),
                    target: val(values, "target") ? Number(val(values, "target")) : null,
                    targetDescription: val(values, "targetDescription"),
                    direction: val(values, "direction") as DeliveryOutcome["direction"],
                    frequency: val(values, "frequency"),
                    ownerProfessionalId: val(values, "ownerProfessionalId"),
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Reviews" && (
        <Section title="Review records">
          {w.reviews.map((r) => (
            <div key={r.id} className="border-b py-4">
              <h3 className="font-medium">
                {words(r.kind)} review · {r.scheduledAt}
              </h3>
              <p className="mt-2 text-sm">{r.summary}</p>
              <Facts
                items={[
                  ["Customer feedback", r.customerFeedback],
                  ["Next actions", r.nextActions],
                  ["Calendar", r.calendarReference],
                  ["Frozen integrity", r.integrityValue],
                ]}
              />
            </div>
          ))}
          {alive && permitted("conduct_review") && (
            <Disclosure title="Record review">
              <RecordForm
                title="Engagement review"
                fields={[
                  selectField(
                    "kind",
                    "Review kind",
                    options([
                      "mobilization",
                      "weekly",
                      "monthly",
                      "quarterly",
                      "completion",
                      "custom",
                    ]),
                  ),
                  field("scheduledAt", "Review date and time", "", "datetime-local"),
                  field("calendarReference", "Simulated calendar reference", "", "text", false),
                  field("summary", "Review summary", "", "area"),
                  field("customerFeedback", "Customer feedback", "", "area", false),
                  field("nextActions", "Next actions", "", "area", false),
                  field("participants", "Participants (comma-separated)"),
                  ...decisionFields,
                ]}
                run={(values) =>
                  E.review(ctx, id, {
                    kind: val(values, "kind") as DeliveryReview["kind"],
                    scheduledAt: new Date(val(values, "scheduledAt")).toISOString(),
                    calendarReference: val(values, "calendarReference"),
                    summary: val(values, "summary"),
                    customerFeedback: val(values, "customerFeedback"),
                    nextActions: val(values, "nextActions"),
                    participants: refs(val(values, "participants")),
                    evidence: val(values, "evidence"),
                    comment: val(values, "comment"),
                  })
                }
              />
            </Disclosure>
          )}
          {v.engagement.status === "completion_review" && permitted("complete") && (
            <Disclosure title="Authorize engagement completion">
              <RecordForm
                title="Engagement completion"
                fields={[
                  field("summary", "Executive completion summary", "", "area"),
                  field("customerFeedback", "Customer feedback", "", "area", false),
                  field(
                    "outstandingResponsibilities",
                    "Outstanding responsibilities, or explicit none",
                    "",
                    "area",
                  ),
                  ...decisionFields,
                ]}
                run={(values) =>
                  E.complete(ctx, id, {
                    summary: val(values, "summary"),
                    customerFeedback: val(values, "customerFeedback"),
                    outstandingResponsibilities: val(values, "outstandingResponsibilities"),
                    evidence: val(values, "evidence"),
                    comment: val(values, "comment"),
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Continuation" && (
        <Section title="Renewal & continuation recommendations">
          {!w.continuations.length && <EmptyState title="No continuation recommended" />}
          {w.continuations.map((r) => (
            <div key={r.id} className="border-b py-4">
              <h3 className="font-medium">{r.recommendation}</h3>
              <p className="mt-2 text-sm">{r.customerNeed}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Recommendation only · no automatic obligation
              </p>
              {r.opportunityReference && (
                <p className="mt-1 break-all text-xs">{r.opportunityReference} · simulated</p>
              )}
              {alive && permitted("continue") && v.commercialVisible && !r.opportunityReference && (
                <Disclosure title="Create simulated opportunity">
                  <RecordForm
                    title="Continuation handoff"
                    fields={[]}
                    run={() => E.handoffContinuation(ctx, id, r.id, `${handoffKey}:${r.id}`)}
                  />
                </Disclosure>
              )}
            </div>
          ))}
          {alive && permitted("continue") && (
            <Disclosure title="Recommend continuation">
              <RecordForm
                title="Continuation recommendation"
                fields={[
                  selectField(
                    "kind",
                    "Recommendation kind",
                    options(["renewal", "expansion", "training", "advisory", "integration"]),
                  ),
                  field("recommendation", "Recommendation", "", "area"),
                  field("customerNeed", "Customer need", "", "area"),
                  field("evidence", "Supporting evidence references"),
                ]}
                run={(values) =>
                  E.continuation(ctx, id, {
                    kind: val(values, "kind") as Continuation["kind"],
                    recommendation: val(values, "recommendation"),
                    customerNeed: val(values, "customerNeed"),
                    evidence: refs(val(values, "evidence")),
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Audit" && (
        <Section title="Engagement audit">
          {auditLog
            .list(ctx)
            .filter((a) => a.resourceId === id)
            .map((a) => (
              <div key={a.id} className="border-b py-3">
                <p className="text-sm">{a.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {a.at} · {a.action} · {a.actorId}
                </p>
              </div>
            ))}
        </Section>
      )}
    </>
  );
}
function outcomeFields(people: { value: string; label: string }[]): Field[] {
  return [
    field("objective", "Business objective"),
    field("definition", "Measurement definition", "", "area"),
    selectField(
      "type",
      "Measurement type",
      options(["quantitative", "qualitative"]),
      "quantitative",
    ),
    field("unit", "Unit", "", "text", false),
    field("baseline", "Baseline value", "", "number", false),
    field("baselineDescription", "Baseline description", "", "area", false),
    field("baselineEvidence", "Baseline evidence", "", "text", false),
    field("target", "Target value", "", "number", false),
    field("targetDescription", "Target description", "", "area", false),
    selectField(
      "direction",
      "Improvement direction",
      options(["increase", "decrease", "qualitative"]),
    ),
    field("frequency", "Review frequency"),
    selectField("ownerProfessionalId", "Accountable professional", people),
  ];
}
export function CompletionReport({ id }: { id: string }) {
  const q = useEngagement(id),
    { user } = useSession();
  if (!q.data) return <ErrorState loading={q.isPending} error={q.error} />;
  const c = q.data.completion;
  if (!c)
    return (
      <ErrorState
        loading={false}
        error={new Error("Completion report is unavailable or outside your commercial scope")}
      />
    );
  return (
    <div key={user.id}>
      <div className="mb-6 flex flex-wrap gap-3 print:hidden">
        <Button variant="outline" asChild>
          <Link to="/engagements/$engagementId" params={{ engagementId: id }}>
            ← Engagement
          </Link>
        </Button>
        <Button
          onClick={() => {
            document.body.classList.add("printing-delivery");
            window.print();
            document.body.classList.remove("printing-delivery");
          }}
        >
          Print report
        </Button>
      </div>
      <article id="delivery-print" className="mx-auto max-w-4xl">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Aurumi C.I.A. · completion record · simulated
        </p>
        <h1 className="mt-3 text-4xl">{q.data.engagement.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {c.initiation.customer.name} · {c.decision.at}
        </p>
        <Section title="Executive summary">
          <p className="whitespace-pre-wrap text-sm">{c.executiveSummary}</p>
        </Section>
        <Section title="Authorized scope">
          <p className="text-sm">{c.initiation.terms.included}</p>
          <p className="mt-3 text-sm">
            Customer responsibilities: {c.initiation.terms.customerResponsibilities}
          </p>
        </Section>
        <Section title="Delivered & accepted">
          {c.deliverables.map((d) => (
            <div key={d.id} className="border-b py-3">
              <h3 className="font-medium">{d.title}</h3>
              <p className="mt-1 text-sm">
                {words(d.status)} · version {d.versions.at(-1)?.number ?? "—"} · {d.criteria}
              </p>
            </div>
          ))}
        </Section>
        <Section title="Outcomes & limitations">
          {c.outcomes.map((o) => (
            <div key={o.id} className="border-b py-3">
              <h3 className="font-medium">{o.objective}</h3>
              <p className="mt-1 text-sm">
                {words(o.status)} · baseline {o.baseline ?? "pending"} · target{" "}
                {o.target ?? o.targetDescription} · actual{" "}
                {o.measurements.at(-1)?.value ??
                  o.measurements.at(-1)?.qualitative ??
                  "Not measurable"}{" "}
                {o.unit}
              </p>
              <p className="mt-2 text-sm">{o.feedback}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {o.measurements.at(-1)?.provenance} ·{" "}
                {o.measurements.at(-1)?.verification
                  ? "Simulated independent verification"
                  : "Unverified"}
              </p>
            </div>
          ))}
        </Section>
        <Section title="Customer feedback & outstanding responsibilities">
          <p className="text-sm">{c.customerFeedback}</p>
          <p className="mt-3 text-sm">{c.outstandingResponsibilities}</p>
        </Section>
        <Section title="Recommended continuation">
          {c.continuations.map((r) => (
            <p key={r.id} className="text-sm">
              {r.recommendation} — recommendation, not an automatic obligation.
            </p>
          ))}
        </Section>
        <Section title="Historical references">
          <Facts
            items={[
              ["Completion integrity contract", c.integrityContract],
              ["Completion content value", c.integrityValue],
              ["Initiation content value", c.initiation.integrityValue],
              ["Approval evidence", c.decision.evidence],
            ]}
          />
        </Section>
      </article>
    </div>
  );
}
