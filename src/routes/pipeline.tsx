import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/pipeline")({
  component: () => (
    <AppShell>
      <PageHeader title="Pipeline" subtitle="Drag clients across Lead → Quoted → In Progress → Review → Completed → Retained" />
      <Card className="card-surface p-8 text-sm text-muted-foreground">
        Kanban board scaffolded. Ask to build out the drag-and-drop pipeline next.
      </Card>
    </AppShell>
  ),
});
