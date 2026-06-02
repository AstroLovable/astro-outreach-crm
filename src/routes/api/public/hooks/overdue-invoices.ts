import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/overdue-invoices")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        const auth = request.headers.get("authorization") || "";
        const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        if (!cronSecret || token !== cronSecret) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        const today = new Date().toISOString().slice(0, 10);

        const { data: overdue } = await supabaseAdmin
          .from("invoices")
          .select("id, number, total, due_date, client_id, owner_id, status")
          .lt("due_date", today)
          .not("status", "in", "(Paid,Draft)");
        let sent = 0;
        for (const inv of overdue || []) {
          const { data: client } = await supabaseAdmin
            .from("clients").select("name, email").eq("id", inv.client_id as string).maybeSingle();
          const body = `<h2>Overdue invoice</h2>
            <p><strong>${esc(client?.name) || "Client"}</strong></p>
            <p>Invoice: ${esc(inv.number)}<br/>Amount: £${esc(inv.total)}<br/>Due: ${esc(inv.due_date)}</p>`;
          await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
            },
            body: JSON.stringify({
              to: "hello@astrolabs.uk",
              from: "invoices@astrolabs.uk",
              subject: `Overdue: ${inv.number}`,
              body,
            }),
          });
          await supabaseAdmin.from("invoices").update({ status: "Overdue" }).eq("id", inv.id as string);
          sent++;
        }
        return new Response(JSON.stringify({ ok: true, sent }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
