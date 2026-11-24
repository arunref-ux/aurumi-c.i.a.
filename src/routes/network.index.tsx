import { createFileRoute } from "@tanstack/react-router";
import { NetworkIndex } from "@/components/network/pages";
export const Route = createFileRoute("/network/")({
  head: () => ({
    meta: [
      { title: "Professional Network — Aurumi C.I.A." },
      {
        name: "description",
        content: "Scoped professional profiles, affiliations, qualifications and availability.",
      },
      { property: "og:title", content: "Professional Network — Aurumi C.I.A." },
      {
        property: "og:description",
        content: "Governed Aurumi, independent and reseller professional profiles.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NetworkIndex,
});
