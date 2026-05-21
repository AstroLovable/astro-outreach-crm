import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/chats")({
  component: () => (
    <AppShell>
      <PageHeader title="Live Chats" subtitle="AI-handled sessions with human takeover and email handoff" />
      <Card className="card-surface p-8 text-sm text-muted-foreground">
        Live Chats view scaffolded. The public chatbot endpoint (/api/public/chat) and Resend handoff
        are already wired — ask to build out the operator view, takeover, and reply UI.
      </Card>
    </AppShell>
  ),
});
