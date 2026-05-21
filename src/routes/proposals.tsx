import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/proposals")({
  component: () => (
    <AppShell>
      <PageHeader title="Proposals" subtitle="AI-generated proposals with PDF export" />
      <Card className="card-surface p-8 text-sm text-muted-foreground">
        Proposal generator scaffolded. The Groq AI server function is wired and ready —
        ask to build out the form, editor, and PDF export.
      </Card>
    </AppShell>
  ),
});
