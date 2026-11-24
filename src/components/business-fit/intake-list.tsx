import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useFitList } from "@/lib/business-fit-queries";
import { PageHeader } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { INTAKE_STATUSES } from "@/domain/business-fit";
import { ManagementTabs } from "./management";
import { FitError, fitInput } from "./shared";
export function IntakeList({ consultations = false }: { consultations?: boolean }) {
  const q = useFitList(),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all");
  const rows = (q.data ?? []).filter(
    (r) =>
      (status === "all" || r.intake.status === status) &&
      [r.businessName, r.industry, r.priorities, r.intake.reference]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="Business Fit"
        title={consultations ? "Consultation requests" : "Business Fit submissions"}
        description="Consented public submissions. Anonymous drafts are not shared with the workspace."
      />
      <ManagementTabs />
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_220px]">
        <input
          className={fitInput}
          aria-label="Search Business Fit submissions"
          placeholder="Search business, industry, priority or reference"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={fitInput}
          aria-label="Intake status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All intake statuses</option>
          {INTAKE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>
      <FitError error={q.error} />
      {q.isPending ? (
        <p>Loading submissions…</p>
      ) : rows.length === 0 ? (
        <div className="border-y py-12 text-center">
          <h2 className="text-2xl">No submissions to show</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Only consultation requests submitted with consent appear here, within your authorized
            scope.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                {[
                  "Business / reference",
                  "Industry / size",
                  "Priorities",
                  "Submitted",
                  "Intake",
                  "Professional",
                  "Assessment",
                  "",
                ].map((s, i) => (
                  <th key={i} className="px-2 py-3 font-medium">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.intake.id} className="border-b">
                  <td className="px-2 py-4">
                    <p className="font-medium">{r.businessName}</p>
                    <p className="font-mono text-xs text-muted-foreground">{r.intake.reference}</p>
                  </td>
                  <td className="px-2 py-4">
                    {r.industry}
                    <p className="text-xs text-muted-foreground">{r.employeeBand}</p>
                  </td>
                  <td className="max-w-56 px-2 py-4">{r.priorities}</td>
                  <td className="whitespace-nowrap px-2 py-4 text-xs">
                    {r.intake.createdAt.slice(0, 10)}
                  </td>
                  <td className="px-2 py-4">{r.intake.status.replaceAll("_", " ")}</td>
                  <td className="px-2 py-4 text-xs">
                    {r.intake.ownerId === "queue_business_fit" ? "Unassigned" : r.intake.ownerId}
                  </td>
                  <td className="px-2 py-4 text-xs">{r.intake.assessmentId ?? "Not converted"}</td>
                  <td className="px-2 py-4">
                    <Button asChild variant="outline" size="sm">
                      <Link
                        to="/business-fit-management/$intakeId"
                        params={{ intakeId: r.intake.id }}
                      >
                        Review
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
