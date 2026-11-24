import { createFileRoute } from "@tanstack/react-router";
import { Configuration } from "@/components/business-fit/configuration";
import { fitHead } from "@/components/business-fit/management";
export const Route = createFileRoute("/business-fit-management/questionnaire")({
  head: () =>
    fitHead(
      "Business Fit Questionnaire",
      "Manage versioned public questionnaire drafts, validation, preview and publication.",
    ),
  component: () => <Configuration kind="questionnaire" />,
});
