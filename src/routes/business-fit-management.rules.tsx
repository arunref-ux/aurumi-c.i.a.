import { createFileRoute } from "@tanstack/react-router";
import { Configuration } from "@/components/business-fit/configuration";
import { fitHead } from "@/components/business-fit/management";
export const Route = createFileRoute("/business-fit-management/rules")({
  head: () =>
    fitHead(
      "Business Fit Recommendation Rules",
      "Manage explainable declarative recommendation rules with immutable publication and evidence references.",
    ),
  component: () => <Configuration kind="rules" />,
});
