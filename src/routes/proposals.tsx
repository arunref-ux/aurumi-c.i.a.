import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/app/module-placeholder";
import { repos } from "@/data/repositories";
import { useSession, useStoreVersion } from "@/lib/session";

export const Route = createFileRoute("/proposals")({
  head: () => ({
    meta: [
      { title: "Proposals — C.I.A. Workspace" },
      { name: "description", content: "A common Proposal Studio for tenant and partner proposals." },
      { property: "og:title", content: "Proposals — C.I.A. Workspace" },
      { property: "og:description", content: "A common Proposal Studio for tenant and partner proposals." },
    ],
  }),
  component: Page,
});

function Page() {
  const { user } = useSession();
  useStoreVersion();
  const n = repos.proposals.list({ user }).length;
  return <ModulePlaceholder title="Proposals" phase={4} purpose="A common Proposal Studio for tenant and partner proposals." planned={["Solution-only proposals", "Indicative pricing added later", "Partner commercial scenarios", "Section editor with live preview", "Immutable versions", "PDF/DOCX export"]} recordsLabel="Proposals" records={n} />;
}
