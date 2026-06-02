import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/close-idle-chats")({
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
        const { data: settings } = await supabaseAdmin
          .from("settings").select("idle_close_hours").limit(1).maybeSingle();

        const hours = (settings?.idle_close_hours as number) || 24;
        const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        const { data: sessions } = await supabaseAdmin
          .from("chat_sessions").select("id").neq("status", "closed").lt("updated_at", cutoff);
        let closed = 0;
        for (const s of sessions || []) {
          await supabaseAdmin.from("chat_messages").insert({
            session_id: s.id as string, role: "assistant", content: "__SHOW_CONTACT_FORM__",
          });
          await supabaseAdmin.from("chat_sessions")
            .update({ status: "closed", updated_at: new Date().toISOString() })
            .eq("id", s.id as string);
          closed++;
        }
        return new Response(JSON.stringify({ ok: true, closed }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
