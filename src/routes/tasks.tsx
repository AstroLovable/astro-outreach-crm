import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/tasks")({
  component: () => (
    <AppShell>
      <PageHeader title="Tasks" subtitle="Per-client and global tasks with AI suggestions" />
      <Card className="card-surface p-8 text-sm text-muted-foreground">
        Tasks scaffolded. AI task-suggestion server function is ready — ask to build out the UI.
      </Card>
    </AppShell>
  ),
});
