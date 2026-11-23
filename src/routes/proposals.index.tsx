import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { EmptyState, PageHeader, Panel, StatusPill, type Tone } from "@/components/app/ui-bits";
import {
  btnPrimary,
  ErrorNote,
  inputCls,
  Progress,
  SelectField,
  TextField,
} from "@/components/assessment/fields";
import { PersistenceNote } from "@/components/assessment/shared";
import { can } from "@/domain/permissions";
import { PROPOSAL_STATUS_LABEL, TRACKS } from "@/domain/proposal";
import type { ProposalStatus, ProposalTrack } from "@/domain/types";
import {
  useProposalCandidates,
  useProposalList,
  useProposalMutation,
} from "@/lib/proposal-queries";
import { useSession } from "@/lib/session";

const TITLE = "Proposal Studio — C.I.A. Workspace";
const DESC = "Turn approved solutions into reviewed, versioned tenant and partner proposals.";
export const Route = createFileRoute("/proposals/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProposalList,
});

export const STATUS_TONE: Record<ProposalStatus, Tone> = {
  draft: "neutral",
  in_review: "warning",
  changes_requested: "danger",
  approved: "success",
  shared: "gold",
  accepted: "success",
  declined: "danger",
  expired: "neutral",
};

function ProposalList() {
  const { user } = useSession();
  const q = useProposalList();
  const [search, setSearch] = useState("");
  const [track, setTrack] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return (q.data ?? [])
      .filter(
        (r) => !s || [r.proposal.title, r.sourceLabel].some((x) => x.toLowerCase().includes(s)),
      )
      .filter((r) => !track || r.proposal.track === track)
      .filter((r) => !status || r.proposal.status === status)
      .sort((a, b) => b.proposal.updatedAt.localeCompare(a.proposal.updatedAt));
  }, [q.data, search, track, status]);
  return (
    <>
      <PageHeader
        eyebrow="Proposal Studio"
        title="Proposals"
        description="Built only from approved solution snapshots. Internal approval is separate from a recipient's response."
        actions={
          can(user, "proposal.create") && (
            <button className={btnPrimary} onClick={() => setCreating((c) => !c)}>
              {creating ? "Close" : "New proposal"}
            </button>
          )
        }
      />
      <PersistenceNote />
      {creating && <CreatePanel />}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <input
          aria-label="Search proposals"
          className={inputCls}
          placeholder="Search by title or solution"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Track"
          className={inputCls}
          value={track}
          onChange={(e) => setTrack(e.target.value)}
        >
          <option value="">All tracks</option>
          {Object.entries(TRACKS).map(([k, t]) => (
            <option key={k} value={k}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Status"
          className={inputCls}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(PROPOSAL_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Loading proposals…</p>
      ) : q.isError ? (
        <ErrorNote error={q.error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No proposals match"
          body="Approve a solution first, then create a proposal from its hand-off snapshot."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Proposal</th>
                <th className="px-3 py-2 font-medium">Track</th>
                <th className="px-3 py-2 font-medium">Source solution</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Version</th>
                <th className="px-3 py-2 font-medium">Value</th>
                <th className="px-3 py-2 font-medium">Readiness</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.proposal.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    {r.legacy ? (
                      <span className="font-medium">{r.proposal.title}</span>
                    ) : (
                      <Link
                        to="/proposals/$proposalId"
                        params={{ proposalId: r.proposal.id }}
                        search={{}}
                        className="font-medium hover:underline"
                      >
                        {r.proposal.title}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {TRACKS[r.proposal.track as ProposalTrack].label}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.sourceLabel}</td>
                  <td className="px-3 py-2">{r.ownerName}</td>
                  <td className="px-3 py-2">
                    <StatusPill tone={STATUS_TONE[r.proposal.status]}>
                      {PROPOSAL_STATUS_LABEL[r.proposal.status]}
                    </StatusPill>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.versionNumber ? `v${r.versionNumber}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.valueLabel}</td>
                  <td className="w-32 px-3 py-2">
                    {r.legacy ? (
                      <span className="text-xs text-muted-foreground">Sample</span>
                    ) : (
                      <Progress value={r.readiness} label="Readiness" />
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.proposal.updatedAt.slice(0, 10)}
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

function CreatePanel() {
  const c = useProposalCandidates();
  const create = useProposalMutation((s) => s.create);
  const navigate = useNavigate();
  const [pick, setPick] = useState("");
  const [track, setTrack] = useState<ProposalTrack | "">("");
  const [title, setTitle] = useState("");
  const snaps = (c.data ?? []).flatMap((s) => s.snapshots.map((x) => ({ ...x, sol: s })));
  const snap = snaps.find((x) => x.id === pick);
  const tracks = Object.fromEntries(
    Object.entries(TRACKS)
      .filter(([, t]) => !snap || t.kind === snap.sol.kind)
      .map(([k, t]) => [k, t.label]),
  );
  return (
    <Panel title="New proposal" className="mb-4">
      {c.data && snaps.length === 0 ? (
        <p className="text-sm text-muted-foreground">No approved solutions you can access yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <SelectField
            label="Approved solution snapshot"
            value={pick}
            options={{
              "": "Choose…",
              ...Object.fromEntries(
                snaps.map((x) => [
                  x.id,
                  `${x.sol.solutionTitle} · ${x.sol.subjectName} · v${x.version}${x.compatible ? "" : " (incompatible)"}${x.existingProposals.length ? ` · ${x.existingProposals.length} proposal(s)` : ""}`,
                ]),
              ),
            }}
            onChange={(v) => {
              setPick(v);
              setTrack("");
            }}
          />
          <SelectField
            label="Track"
            value={track}
            options={{ "": "Choose…", ...tracks }}
            onChange={(v) => setTrack(v as ProposalTrack)}
          />
          <TextField label="Proposal title" value={title} onChange={setTitle} required />
          {snap && !snap.compatible && (
            <p className="text-xs text-destructive md:col-span-3">{snap.reason}</p>
          )}
          <div className="md:col-span-3">
            <button
              className={btnPrimary}
              disabled={!snap?.compatible || !track || !title.trim() || create.isPending}
              onClick={async () => {
                const p = await create.mutateAsync([
                  { solutionSnapshotId: pick, track: track as ProposalTrack, title },
                ]);
                void navigate({
                  to: "/proposals/$proposalId",
                  params: { proposalId: p.id },
                  search: {},
                });
              }}
            >
              Create proposal
            </button>
            <ErrorNote error={create.error} />
          </div>
        </div>
      )}
    </Panel>
  );
}
