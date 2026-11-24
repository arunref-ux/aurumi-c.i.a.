import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/engagements")({
  head: () => ({
    meta: [
      { title: "Engagements — C.I.A. Workspace" },
      { name: "description", content: "Post-acceptance advisory and implementation coordination." },
      { property: "og:title", content: "Engagements — C.I.A. Workspace" },
      {
        property: "og:description",
        content: "Post-acceptance advisory and implementation coordination.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  return <Outlet />;
}
