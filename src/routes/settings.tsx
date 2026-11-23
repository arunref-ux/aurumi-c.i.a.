import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "@/components/app/icons";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, Panel, StatusPill } from "@/components/app/ui-bits";
import { repos } from "@/data/repositories";
import { seedUsers } from "@/data/seed";
import { store } from "@/data/store";
import { AccessDeniedError, can, ROLE_GRANTS, ROLE_LABELS, type Permission } from "@/domain/permissions";
import type { RoleKey } from "@/domain/types";
import { adapterRegistry, mockControls } from "@/integrations/adapters/mock";
import type { AdapterDescriptor, AdapterResult } from "@/integrations/adapters/types";
import { useSession, useStoreVersion } from "@/lib/session";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — C.I.A. Workspace" },
      { name: "description", content: "Integration health, roles and permissions, and audit log for C.I.A. Workspace." },
      { property: "og:title", content: "Settings — C.I.A. Workspace" },
      { property: "og:description", content: "Integration health, roles and permissions, and audit log for C.I.A. Workspace." },
    ],
  }),
  component: Settings,
});

function Settings() {
  return (
    <>
      <PageHeader eyebrow="Settings" title="Workspace settings" description="Integration health, access model and audit trail. Templates and branding arrive with Proposal Studio." />
      <Tabs defaultValue="integrations">
        <TabsList className="mb-6">
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="access">Roles & access</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="integrations"><Integrations /></TabsContent>
        <TabsContent value="access"><Access /></TabsContent>
        <TabsContent value="audit"><Audit /></TabsContent>
      </Tabs>
    </>
  );
}

type RunState = { kind: "idle" } | { kind: "loading" } | { kind: "done"; result: AdapterResult<unknown> };

function AdapterCard({ a }: { a: AdapterDescriptor }) {
  const [mode, setMode] = useState<"normal" | "empty" | "failing">("normal");
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const apply = (m: typeof mode) => {
    setMode(m);
    mockControls.failing.delete(a.key); mockControls.empty.delete(a.key);
    if (m === "failing") mockControls.failing.add(a.key);
    if (m === "empty") mockControls.empty.add(a.key);
  };
  return (
    <Panel title={a.name} action={<StatusPill tone="warning">Mock — not connected</StatusPill>}>
      <p className="text-sm">{a.responsibility}</p>
      <p className="mt-1 text-xs text-muted-foreground">Authoritative source: {a.sourceApp}</p>
      <div className="mt-4 flex gap-1 text-xs" role="radiogroup" aria-label="Simulation mode">
        {(["normal", "empty", "failing"] as const).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} onClick={() => apply(m)}
            className={`rounded-md border px-2 py-1 ${mode === m ? "bg-primary text-primary-foreground" : "bg-card"}`}>{m}</button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {a.operations.map((op) => {
          const s = runs[op.name] ?? { kind: "idle" };
          return (
            <div key={op.name} className="rounded-md border bg-background p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="font-mono text-xs">{op.name}({JSON.stringify(op.exampleRequest)})</code>
                <button className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-60" disabled={s.kind === "loading"}
                  onClick={async () => { setRuns((r) => ({ ...r, [op.name]: { kind: "loading" } })); const result = await op.run(); setRuns((r) => ({ ...r, [op.name]: { kind: "done", result } })); }}>
                  Run
                </button>
              </div>
              {s.kind === "loading" && <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Calling mock…</p>}
              {s.kind === "done" && !s.result.ok && <p className="mt-2 text-xs text-destructive">{s.result.error}</p>}
              {s.kind === "done" && s.result.ok && (Array.isArray(s.result.data) && s.result.data.length === 0
                ? <p className="mt-2 text-xs text-muted-foreground">Empty response — no records returned.</p>
                : <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">{JSON.stringify(s.result.data, null, 2)}</pre>)}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function Integrations() {
  return <div className="grid gap-4 md:grid-cols-2">{adapterRegistry.map((a) => <AdapterCard key={a.key} a={a} />)}</div>;
}

const MATRIX: Permission[] = ["assessment.read", "assessment.create", "proposal.read", "proposal.approve", "proposal.share", "engagement.assign", "settings.manage"];

function Access() {
  const { user } = useSession();
  const [result, setResult] = useState<string | null>(null);
  const roles = Object.keys(ROLE_GRANTS) as RoleKey[];
  const proposals = store.table("proposals");
  return (
    <div className="space-y-6">
      <Panel title="Role permissions (illustrative — DevHarmony is authoritative)">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="text-xs text-muted-foreground"><th className="py-2 pr-4 font-medium">Role</th>{MATRIX.map((p) => <th key={p} className="px-2 py-2 font-mono text-[11px] font-normal">{p}</th>)}</tr></thead>
            <tbody className="divide-y">
              {roles.map((r) => (
                <tr key={r}><td className="py-2 pr-4">{ROLE_LABELS[r]}</td>{MATRIX.map((p) => <td key={p} className="px-2 py-2 text-xs">{ROLE_GRANTS[r][p] ?? <span className="text-muted-foreground">—</span>}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Partner-affiliated users are capped at Self scope regardless of role.</p>
      </Panel>
      <Panel title="Access check (enforced in the data layer)">
        <p className="mb-3 text-sm text-muted-foreground">Open a proposal as <strong className="text-foreground">{user.name}</strong>. Switch identity at the top to compare.</p>
        <div className="flex flex-wrap gap-2">
          {proposals.map((p) => (
            <button key={p.id} className="rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted" onClick={() => {
              try { const r = repos.proposals.get({ user }, p.id); setResult(`Allowed: "${r.title}"`); }
              catch (e) { setResult(e instanceof AccessDeniedError ? `Denied: you are not assigned to "${p.title}". This attempt was logged.` : String(e)); }
            }}>{p.title}{can(user, "proposal.read", p) ? "" : " 🔒"}</button>
          ))}
        </div>
        {result && <p className={`mt-3 text-sm ${result.startsWith("Denied") ? "text-destructive" : "text-success"}`}>{result}</p>}
      </Panel>
    </div>
  );
}

function Audit() {
  useStoreVersion();
  const { user } = useSession();
  if (!can(user, "audit.read")) return <EmptyState title="Audit log restricted" body="Your role does not include audit access." />;
  const name = (id: string) => seedUsers.find((u) => u.id === id)?.name ?? id;
  return (
    <Panel>
      <ul className="divide-y text-sm">
        {store.audit().map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <StatusPill tone={e.outcome === "denied" ? "danger" : "success"}>{e.outcome}</StatusPill>
            <code className="font-mono text-xs">{e.action}</code>
            <span className="flex-1">{e.summary}</span>
            <span className="text-xs text-muted-foreground">{name(e.actorId)} · {new Date(e.at).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
