import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusPill, EmptyState } from "@/components/app/ui-bits";
import { ArrowUpRight } from "@/components/app/icons";
import { networkService as N } from "@/data/network";
import { can } from "@/domain/permissions";
import {
  SERVICES,
  currentAffiliation,
  validQualification,
  type ProfessionalProfile,
  type Qualification,
} from "@/domain/delivery";
import { useSession } from "@/lib/session";
import {
  useDeliveryQuery,
  useProfessionals,
  useProfessional,
  useWorkload,
} from "@/lib/delivery-queries";
import {
  Facts,
  Section,
  RecordForm,
  Disclosure,
  ErrorState,
  inputClass,
  words,
  field,
  selectField,
  options,
  decisionFields,
  val,
  refs,
} from "@/components/delivery/forms";
export function NetworkIndex() {
  const { user } = useSession(),
    q = useProfessionals(),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [affiliation, setAffiliation] = useState("all"),
    [availability, setAvailability] = useState("all");
  const ctx = { user };
  const people = useDeliveryQuery("profile-users", "", (c) => N.users(c));
  const list = q.data?.filter(
    (p) =>
      `${p.displayName} ${p.title} ${p.country} ${p.languages.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (status === "all" || p.status === status) &&
      (affiliation === "all" || currentAffiliation(p)?.relationship === affiliation) &&
      (availability === "all" || p.availability === availability),
  );
  return (
    <div key={user.id}>
      <PageHeader eyebrow="C.I.A. Network" title="Professional network" />
      <div className="mb-6 flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          aria-label="Search professionals"
          placeholder="Search name, region or language"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {[
          [
            "Professional status",
            status,
            setStatus,
            ["draft", "pending_review", "active", "suspended", "inactive"],
          ],
          ["Affiliation", affiliation, setAffiliation, ["employed", "independent", "reseller"]],
          [
            "Availability",
            availability,
            setAvailability,
            ["available", "limited", "unavailable", "absence"],
          ],
        ].map(([label, value, set, choices]) => (
          <select
            key={String(label)}
            aria-label={String(label)}
            className={`${inputClass} sm:w-auto`}
            value={String(value)}
            onChange={(e) => {
              if (typeof set === "function") set(e.target.value);
            }}
          >
            <option value="all">All {String(label).toLowerCase()}</option>
            {Array.isArray(choices) &&
              choices.map((c) => (
                <option key={c} value={c}>
                  {words(c)}
                </option>
              ))}
          </select>
        ))}
      </div>
      {q.isPending || q.error ? (
        <ErrorState loading={q.isPending} error={q.error} />
      ) : !list?.length ? (
        <EmptyState title="No professionals in view" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <article key={p.id} className="min-w-0 rounded-lg border bg-card p-5">
              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex size-11 items-center justify-center rounded-full bg-gold-soft font-display text-xl">
                  {p.displayName
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")}
                </div>
                <StatusPill
                  tone={
                    p.status === "active"
                      ? "success"
                      : p.status === "suspended"
                        ? "danger"
                        : "neutral"
                  }
                >
                  {words(p.status)}
                </StatusPill>
              </div>
              <h2 className="mt-4 break-words text-2xl">{p.displayName}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{p.title}</p>
              <p className="mt-4 text-xs">
                {words(currentAffiliation(p)?.relationship ?? "pending affiliation")} · {p.country}{" "}
                · {words(p.availability)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {
                  p.qualifications.filter((q) => validQualification(q, q.services[0] ?? "custom"))
                    .length
                }{" "}
                simulated verified authorizations
              </p>
              <Button variant="link" className="mt-4 px-0" asChild>
                <Link to="/network/$professionalId" params={{ professionalId: p.id }}>
                  Profile <ArrowUpRight />
                </Link>
              </Button>
            </article>
          ))}
        </div>
      )}
      {can(user, "network.manage") && (
        <Disclosure title="Create professional profile">
          <RecordForm
            title="Create professional profile"
            fields={[
              selectField(
                "userId",
                "Existing workspace identity",
                people.data?.map((u) => ({ value: u.id, label: u.name })) ?? [],
              ),
              field("title", "Professional title"),
              field("country", "Country"),
              field("timezone", "Time zone"),
            ]}
            run={(v) =>
              N.create(ctx, {
                userId: val(v, "userId"),
                title: val(v, "title"),
                country: val(v, "country"),
                timezone: val(v, "timezone"),
              })
            }
          />
        </Disclosure>
      )}
      {can(user, "network.expertise") && (
        <Disclosure title="Add expertise category">
          <RecordForm
            title="Expertise category"
            fields={[field("label", "Category name")]}
            run={(v) => N.addExpertise(ctx, val(v, "label"))}
          />
        </Disclosure>
      )}
    </div>
  );
}
export function NetworkDetail({ id }: { id: string }) {
  const { user } = useSession(),
    q = useProfessional(id),
    work = useWorkload(id),
    tags = useDeliveryQuery("expertise", id, N.expertise);
  if (!q.data) return <ErrorState loading={q.isPending} error={q.error} />;
  return (
    <ProfessionalBody
      key={`${user.id}:${id}`}
      p={q.data}
      workload={work.data}
      expertise={tags.data ?? []}
    />
  );
}
function ProfessionalBody({
  p,
  workload,
  expertise,
}: {
  p: ProfessionalProfile;
  workload: Awaited<ReturnType<typeof N.workload>> | undefined;
  expertise: Awaited<ReturnType<typeof N.expertise>>;
}) {
  const { user } = useSession(),
    ctx = { user },
    scope = {
      organizationId: p.organizationId,
      ownerId: p.userId,
      teamId: p.teamId,
      assignedUserIds: [],
    };
  const allowed = (a: string) => can(user, `network.${a}` as Parameters<typeof can>[1], scope);
  const [tab, setTab] = useState("Profile");
  return (
    <>
      <Button variant="link" className="px-0" asChild>
        <Link to="/network">← Professional network</Link>
      </Button>
      <PageHeader
        eyebrow={words(currentAffiliation(p)?.relationship ?? "pending affiliation")}
        title={p.displayName}
        actions={
          <StatusPill tone={p.status === "active" ? "success" : "warning"}>
            {words(p.status)}
          </StatusPill>
        }
      />
      <div className="mb-4 flex flex-wrap gap-1 border-b pb-3">
        {["Profile", "Affiliations", "Qualifications", "Assignments & capacity", "Governance"].map(
          (t) => (
            <Button key={t} variant={tab === t ? "secondary" : "ghost"} onClick={() => setTab(t)}>
              {t}
            </Button>
          ),
        )}
      </div>
      {tab === "Profile" && (
        <Section title={p.title}>
          <Facts
            items={[
              ["Summary", p.summary],
              ["Location", `${p.region} · ${p.country}`],
              ["Time zone", p.timezone],
              ["Languages", p.languages.join(", ")],
              [
                "Expertise — self-declared",
                p.expertise.map((id) => expertise.find((t) => t.id === id)?.label ?? id).join(", "),
              ],
              ["Authorized service categories", p.services.map(words).join(", ")],
            ]}
          />
          {allowed("manage") && (
            <Disclosure title="Edit profile & availability">
              <RecordForm
                title="Professional profile"
                fields={[
                  field("title", "Title", p.title),
                  field("summary", "Summary", p.summary, "area", false),
                  field("country", "Country", p.country),
                  field("region", "Region", p.region, "text", false),
                  field("timezone", "Time zone", p.timezone),
                  field("languages", "Languages (comma-separated)", p.languages.join(", ")),
                  {
                    key: "expertise",
                    label: "Expertise — self-declared",
                    kind: "multi",
                    options: expertise
                      .filter((t) => t.active)
                      .map((t) => ({ value: t.id, label: t.label })),
                    value: p.expertise.join(","),
                    required: false,
                  },
                  selectField(
                    "availability",
                    "Availability",
                    options(["available", "limited", "unavailable", "absence"]),
                    p.availability,
                  ),
                  field(
                    "weeklyCapacity",
                    "Estimated weekly capacity (hours)",
                    p.weeklyCapacity?.toString() ?? "",
                    "number",
                    false,
                  ),
                  field("absenceStart", "Absence start", p.absenceStart ?? "", "date", false),
                  field("absenceEnd", "Absence end", p.absenceEnd ?? "", "date", false),
                ]}
                run={(v) =>
                  N.update(ctx, p.id, {
                    title: val(v, "title"),
                    summary: val(v, "summary"),
                    country: val(v, "country"),
                    region: val(v, "region"),
                    timezone: val(v, "timezone"),
                    languages: refs(val(v, "languages")),
                    expertise: refs(val(v, "expertise")),
                    availability: val(v, "availability") as ProfessionalProfile["availability"],
                    weeklyCapacity: val(v, "weeklyCapacity")
                      ? Number(val(v, "weeklyCapacity"))
                      : null,
                    absenceStart: val(v, "absenceStart") || null,
                    absenceEnd: val(v, "absenceEnd") || null,
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Affiliations" && (
        <Section title="Affiliation history">
          {p.affiliations.map((a) => (
            <div key={a.id} className="border-b py-4">
              <Facts
                items={[
                  ["Organization reference", a.organization],
                  ["Relationship", words(a.relationship)],
                  ["Effective period", `${a.start} — ${a.end ?? "ongoing"}`],
                  [
                    "Approval",
                    a.approval ? `${a.approval.comment} · ${a.approval.evidence}` : "Pending",
                  ],
                ]}
              />
              <StatusPill>{a.status}</StatusPill>
              {allowed("affiliation") && a.status === "pending" && (
                <Disclosure title="Approve affiliation">
                  <RecordForm
                    title="Affiliation approval"
                    fields={decisionFields}
                    run={(v) =>
                      N.approveAffiliation(ctx, p.id, a.id, val(v, "evidence"), val(v, "comment"))
                    }
                  />
                </Disclosure>
              )}
              {allowed("affiliation") && a.status === "approved" && (
                <Disclosure title="End affiliation">
                  <RecordForm
                    title="Affiliation end"
                    fields={[field("end", "Effective end", "", "date"), ...decisionFields]}
                    run={(v) =>
                      N.endAffiliation(
                        ctx,
                        p.id,
                        a.id,
                        val(v, "end"),
                        val(v, "evidence"),
                        val(v, "comment"),
                      )
                    }
                  />
                </Disclosure>
              )}
            </div>
          ))}
          {allowed("affiliation") && (
            <Disclosure title="Add affiliation">
              <RecordForm
                title="Professional affiliation"
                fields={[
                  selectField("organization", "Organization", [
                    { value: "aff_aurumi", label: "Aurumi" },
                    { value: "aff_northledger", label: "NorthLedger partner" },
                  ]),
                  selectField(
                    "relationship",
                    "Relationship",
                    options(["employed", "independent", "reseller"]),
                  ),
                  field("start", "Effective start", "", "date"),
                  field("end", "Effective end", "", "date", false),
                ]}
                run={(v) =>
                  N.addAffiliation(ctx, p.id, {
                    organization: val(v, "organization"),
                    relationship: val(v, "relationship") as "employed" | "independent" | "reseller",
                    start: val(v, "start"),
                    end: val(v, "end") || null,
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Qualifications" && (
        <Section title="Qualifications & service authorizations">
          {p.qualifications.map((q) => (
            <div key={q.id} className="border-b py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{q.name}</h3>
                <StatusPill tone={q.status === "verified" ? "success" : "neutral"}>
                  {words(q.status)} · simulated
                </StatusPill>
              </div>
              <Facts
                items={[
                  ["Issuer", q.issuer],
                  ["Category", words(q.category)],
                  ["Validity", `${q.issueDate} — ${q.expiryDate ?? "no expiry"}`],
                  ["Evidence", q.evidenceReference],
                  ["Services", q.services.map(words).join(", ")],
                  ["Verification rationale", q.verification?.comment ?? "Not verified"],
                ]}
              />
              {allowed("verify") && q.category !== "self_declared" && (
                <Disclosure title="Qualification decision">
                  <RecordForm
                    title="Qualification decision"
                    fields={[
                      selectField(
                        "decision",
                        "Decision",
                        options(["verified", "rejected", "revoked"]),
                      ),
                      ...decisionFields,
                    ]}
                    run={(v) =>
                      N.verifyQualification(
                        ctx,
                        p.id,
                        q.id,
                        val(v, "decision") as "verified" | "rejected" | "revoked",
                        val(v, "evidence"),
                        val(v, "comment"),
                      )
                    }
                  />
                </Disclosure>
              )}
            </div>
          ))}
          {allowed("qualification") && (
            <Disclosure title="Add qualification">
              <RecordForm
                title="Qualification"
                fields={[
                  field("name", "Qualification name"),
                  field("issuer", "Issuer"),
                  selectField(
                    "category",
                    "Category",
                    options(
                      allowed("verify")
                        ? ["external", "aurumi_authorization", "self_declared"]
                        : ["external", "self_declared"],
                    ),
                  ),
                  field("issueDate", "Issue date", "", "date"),
                  field("expiryDate", "Expiry date", "", "date", false),
                  field("evidenceReference", "Evidence reference", "", "text", false),
                  {
                    key: "services",
                    label: "Applicable services",
                    kind: "multi",
                    options: options(SERVICES),
                    required: false,
                  },
                  field("notes", "Notes", "", "area", false),
                ]}
                run={(v) =>
                  N.addQualification(ctx, p.id, {
                    name: val(v, "name"),
                    issuer: val(v, "issuer"),
                    category: val(v, "category") as Qualification["category"],
                    issueDate: val(v, "issueDate"),
                    expiryDate: val(v, "expiryDate") || null,
                    evidenceReference: val(v, "evidenceReference"),
                    services: refs(val(v, "services")) as Qualification["services"],
                    notes: val(v, "notes"),
                  })
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
      {tab === "Assignments & capacity" && (
        <Section title="Estimated workload">
          <Facts
            items={[
              ["Availability", words(p.availability)],
              ["Estimated capacity", `${p.weeklyCapacity ?? "Not specified"} hours / week`],
              ["Allocated effort estimate", `${workload?.estimatedHours ?? 0} hours / week`],
              [
                "Absence",
                p.absenceStart ? `${p.absenceStart} — ${p.absenceEnd ?? "open"}` : "None recorded",
              ],
            ]}
          />
          {workload?.qualificationWarnings.map((w) => (
            <p key={w} className="mt-3 text-sm text-destructive">
              Qualification expiry: {w}
            </p>
          ))}
          {!workload?.assignments.length ? (
            <EmptyState title="No active assignments in view" />
          ) : (
            workload.assignments.map((a) => (
              <div
                key={a.id}
                className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t py-3"
              >
                <div>
                  <p className="text-sm">
                    {words(a.responsibility)} · {a.start} — {a.end ?? "ongoing"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.allocationHours} estimated hours · {a.workstreamId || "Engagement-wide"}
                  </p>
                </div>
                <Button variant="link" asChild>
                  <Link to="/engagements/$engagementId" params={{ engagementId: a.engagementId }}>
                    Engagement <ArrowUpRight />
                  </Link>
                </Button>
              </div>
            ))
          )}
        </Section>
      )}
      {tab === "Governance" && (
        <Section title="Professional status">
          <Facts
            items={[
              ["Current status", words(p.status)],
              ["Decision evidence", p.statusDecision?.evidence],
              ["Rationale", p.statusDecision?.comment],
              ["Last changed", p.updatedAt],
            ]}
          />
          {(allowed("activate") || allowed("suspend") || allowed("manage")) && (
            <Disclosure title="Change professional status">
              <RecordForm
                title="Professional status decision"
                fields={[
                  selectField(
                    "status",
                    "Status",
                    options([
                      ...(allowed("manage") && ["draft", "pending_review"].includes(p.status)
                        ? ["draft", "pending_review"]
                        : []),
                      ...(allowed("activate") ? ["active"] : []),
                      ...(allowed("suspend") ? ["suspended", "inactive"] : []),
                    ]),
                  ),
                  ...(allowed("activate")
                    ? [
                        {
                          key: "services",
                          label: "Authorized services",
                          kind: "multi" as const,
                          options: options(SERVICES),
                          value: p.services.join(","),
                          required: false,
                        },
                      ]
                    : []),
                  ...decisionFields,
                ]}
                run={(v) =>
                  N.status(
                    ctx,
                    p.id,
                    val(v, "status") as ProfessionalProfile["status"],
                    val(v, "evidence"),
                    val(v, "comment"),
                    allowed("activate")
                      ? (refs(val(v, "services")) as ProfessionalProfile["services"])
                      : undefined,
                  )
                }
              />
            </Disclosure>
          )}
        </Section>
      )}
    </>
  );
}
