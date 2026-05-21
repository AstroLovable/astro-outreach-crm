import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";

function Stub({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <AppShell>
      <PageHeader title={title} subtitle={subtitle} />
      <Card className="card-surface p-8 text-sm text-muted-foreground">
        This area is scaffolded. Ask Lovable to build out{" "}
        <span className="text-foreground font-medium">{title}</span> next and we'll wire it up
        with full CRUD, AI, and PDF export as specified.
      </Card>
    </AppShell>
  );
}

export const Route = createFileRoute("/clients")({
  component: () => <Stub title="Clients" subtitle="Manage your client list, packages and CSV import/export" />,
});
