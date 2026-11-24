import { createFileRoute, Outlet } from "@tanstack/react-router";
import { FitShell } from "@/components/business-fit/shared";
export const Route = createFileRoute("/business-fit")({
  component: () => (
    <FitShell>
      <Outlet />
    </FitShell>
  ),
});
