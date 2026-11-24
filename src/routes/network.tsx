import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/network")({
  head: () => ({
    meta: [
      { title: "C.I.A. Network — C.I.A. Workspace" },
      {
        name: "description",
        content: "Professional profiles, certification, affiliations and assignments.",
      },
      { property: "og:title", content: "C.I.A. Network — C.I.A. Workspace" },
      {
        property: "og:description",
        content: "Professional profiles, certification, affiliations and assignments.",
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
