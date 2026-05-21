import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/features/Dashboard";

export const Route = createFileRoute("/")({
  component: () => (
    <AppShell>
      <Dashboard />
    </AppShell>
  ),
});
