import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// Service-role Supabase client — bypasses RLS for public widget inserts
function getServiceClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured");
  return createClient(url, key);
}

async function groqChat(systemPrompt: string, messages: { role: string; content: string }[]) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

async function sendNotificationEmail(opts: {
  ownerEmail: string;
  companyName: string;
  visitorName: string | null;
  visitorEmail: string | null;
  pageUrl: string | null;
  sessionId: string;
}) {
  // Uses Resend if configured, otherwise logs — swap for your email provider
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[chat notify] RESEND_API_KEY not set — skipping email notification");
    return;
  }
  const visitor = opts.visitorName || opts.visitorEmail || "A visitor";
  const appUrl = process.env.VITE_APP_URL ?? "https://your-app.com";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({
      from: `${opts.companyName} CRM <notifications@your-domain.com>`,
      to: opts.ownerEmail,
      subject: `💬 ${visitor} is requesting a human`,
      html: `
        <p><strong>${visitor}</strong> has requested to speak with a human on <a href="${opts.pageUrl ?? "#"}">${opts.pageUrl ?? "your site"}</a>.</p>
        <p><a href="${appUrl}/chats?session=${opts.sessionId}" style="background:#2E3A59;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:12px">View Chat →</a></p>
      `,
    }),
  });
}

export const ServerRoute = createServerFileRoute("/api/public/chat").methods({
  OPTIONS: async () =>
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    }),

  POST: async ({ request }) => {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    };

    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: cors });
    }

    const { action, sessionId, business, pageUrl, message, sinceId } = body ?? {};
    const db = getServiceClient();

    try {
      // ── START ──────────────────────────────────────────────────────────────
      if (action === "start") {
        // Look up owner by business slug / name
        const { data: settings } = await db
          .from("settings")
          .select("owner_id, company_name")
          .ilike("company_name", business ? `%${business}%` : "%")
          .maybeSingle();

        const { data: session, error } = await db
          .from("chat_sessions")
          .insert({
            owner_id: settings?.owner_id ?? null,
            business: business ?? null,
            page_url: pageUrl ?? null,
            status: "AI Handling",
          })
          .select("id")
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ sessionId: session.id }), { headers: cors });
      }

      // ── SEND ───────────────────────────────────────────────────────────────
      if (action === "send") {
        if (!sessionId || !message) {
          return new Response(JSON.stringify({ error: "sessionId and message required" }), { status: 400, headers: cors });
        }

        // Save visitor message
        await db.from("chat_messages").insert({ session_id: sessionId, role: "user", content: message });

        // Fetch session to get owner + status
        const { data: session } = await db
          .from("chat_sessions")
          .select("owner_id, status")
          .eq("id", sessionId)
          .maybeSingle();

        // Only AI-reply when status is "AI Handling"
        if (session?.status === "AI Handling") {
          // Get system prompt from owner's settings
          const { data: settings } = await db
            .from("settings")
            .select("chatbot_system_prompt")
            .eq("owner_id", session.owner_id)
            .maybeSingle();

          const systemPrompt =
            settings?.chatbot_system_prompt ??
            "You are a helpful assistant. Answer briefly. Offer to connect to a human if you can't help.";

          // Fetch recent conversation history
          const { data: history } = await db
            .from("chat_messages")
            .select("role, content")
            .eq("session_id", sessionId)
            .order("created_at", { ascending: true })
            .limit(20);

          const groqMessages = (history ?? []).map((m: any) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          }));

          const aiReply = await groqChat(systemPrompt, groqMessages);

          await db.from("chat_messages").insert({
            session_id: sessionId,
            role: "assistant",
            content: aiReply,
          });
        }

        // Touch updated_at
        await db
          .from("chat_sessions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", sessionId);

        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      }

      // ── POLL ───────────────────────────────────────────────────────────────
      if (action === "poll") {
        if (!sessionId) {
          return new Response(JSON.stringify({ error: "sessionId required" }), { status: 400, headers: cors });
        }

        const since = sinceId ?? "1970-01-01";
        const { data: messages } = await db
          .from("chat_messages")
          .select("id, role, content, created_at")
          .eq("session_id", sessionId)
          .gt("created_at", since)
          .order("created_at", { ascending: true });

        return new Response(JSON.stringify({ messages: messages ?? [] }), { headers: cors });
      }

      // ── REQUEST HUMAN ──────────────────────────────────────────────────────
      if (action === "request_human") {
        if (!sessionId) {
          return new Response(JSON.stringify({ error: "sessionId required" }), { status: 400, headers: cors });
        }

        await db
          .from("chat_sessions")
          .update({ status: "Awaiting Human", updated_at: new Date().toISOString() })
          .eq("id", sessionId);

        // Notify owner if notify_new_chat is enabled
        const { data: session } = await db
          .from("chat_sessions")
          .select("owner_id, visitor_name, visitor_email, page_url")
          .eq("id", sessionId)
          .maybeSingle();

        if (session?.owner_id) {
          const { data: settings } = await db
            .from("settings")
            .select("company_name, company_email, notify_new_chat")
            .eq("owner_id", session.owner_id)
            .maybeSingle();

          if (settings?.notify_new_chat && settings?.company_email) {
            await sendNotificationEmail({
              ownerEmail: settings.company_email,
              companyName: settings.company_name,
              visitorName: session.visitor_name,
              visitorEmail: session.visitor_email,
              pageUrl: session.page_url,
              sessionId,
            }).catch((e) => console.error("[chat notify] email failed:", e));
          }
        }

        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      }

      return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });
    } catch (err: any) {
      console.error("[chat api]", err);
      return new Response(JSON.stringify({ error: err.message ?? "Internal error" }), { status: 500, headers: cors });
    }
  },
});

// Required by TanStack Start file-based routing
export const Route = createFileRoute("/api/public/chat")({});
