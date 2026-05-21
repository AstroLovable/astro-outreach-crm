import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/billing")({
  component: () => (
    <AppShell>
      <PageHeader title="Quotes & Invoices" subtitle="Line items, VAT, auto-numbering, branded PDFs" />
      <Card className="card-surface p-8 text-sm text-muted-foreground">
        Billing scaffolded. Ask to build out quotes, invoices, VAT, convert-to-invoice, and PDF export.
      </Card>
    </AppShell>
  ),
});
