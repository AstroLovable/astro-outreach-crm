import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function callGroq(system: string, history: { role: string; content: string }[]) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY missing");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: "system", content: system }, ...history.slice(-4)],
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function sendHandoffEmail(opts: {
  sessionId: string;
  business: string;
  pageUrl: string;
  transcript: { role: string; content: string }[];
  baseUrl: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const transcriptHtml = opts.transcript
    .map(
      (m) =>
        `<p><strong>${m.role === "assistant" ? "AI" : m.role === "human" ? "Owner" : "Visitor"}:</strong> ${m.content.replace(/</g, "&lt;")}</p>`,
    )
    .join("");
  const crmLink = `${opts.baseUrl}/chats/${opts.sessionId}`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: "AstroLabs & Co. CRM <onboarding@resend.dev>",
      to: ["hello@astrolabs.uk"],
      subject: `Human requested — ${opts.business || "chat"}`,
      html: `<h2>A visitor wants to talk to a human</h2>
      <p><strong>Business:</strong> ${opts.business || "—"}</p>
      <p><strong>Page:</strong> ${opts.pageUrl || "—"}</p>
      <p><a href="${crmLink}">Open in CRM</a></p>
      <hr/>${transcriptHtml}`,
    }),
  }).catch(() => {});
}

export const Route = createFileRoute("/api/public/chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const {
            action,
            sessionId,
            message,
            business,
            pageUrl,
            systemPrompt,
            sinceId,
          } = body as any;
          const sb = admin();

          // Create session
          if (action === "start") {
            const { data, error } = await sb
              .from("chat_sessions")
              .insert({
                business: business || null,
                page_url: pageUrl || null,
                status: "AI Handling",
              })
              .select()
              .single();
            if (error) throw error;
            return Response.json({ sessionId: data.id }, { headers: cors });
          }

          if (!sessionId) throw new Error("sessionId required");

          // Poll for new messages
          if (action === "poll") {
            const { data: msgs } = await sb
              .from("chat_messages")
              .select("*")
              .eq("session_id", sessionId)
              .order("created_at")
              .gt("created_at", sinceId || "1970-01-01");
            const { data: session } = await sb
              .from("chat_sessions")
              .select("status")
              .eq("id", sessionId)
              .single();
            return Response.json(
              { messages: msgs || [], status: session?.status || "Closed" },
              { headers: cors },
            );
          }

          // Request human handoff
          if (action === "request_human") {
            await sb.from("chat_sessions").update({ status: "Awaiting Human" }).eq("id", sessionId);
            const { data: msgs } = await sb
              .from("chat_messages")
              .select("role, content")
              .eq("session_id", sessionId)
              .order("created_at");
            const { data: session } = await sb
              .from("chat_sessions")
              .select("business, page_url")
              .eq("id", sessionId)
              .single();
            const base = new URL(request.url).origin;
            await sendHandoffEmail({
              sessionId,
              business: session?.business || "",
              pageUrl: session?.page_url || "",
              transcript: msgs || [],
              baseUrl: base,
            });
            await sb.from("chat_messages").insert({
              session_id: sessionId,
              role: "assistant",
              content: "I've notified a human — they'll join shortly.",
            });
            return Response.json({ ok: true }, { headers: cors });
          }

          // Send a visitor message
          if (action === "send") {
            if (!message || typeof message !== "string") throw new Error("message required");
            await sb.from("chat_messages").insert({
              session_id: sessionId,
              role: "user",
              content: message.slice(0, 2000),
            });
            const { data: session } = await sb
              .from("chat_sessions")
              .select("status, business")
              .eq("id", sessionId)
              .single();
            // If AI is handling, generate a reply
            if (session?.status === "AI Handling") {
              const { data: history } = await sb
                .from("chat_messages")
                .select("role, content")
                .eq("session_id", sessionId)
                .order("created_at", { ascending: false })
                .limit(4);
              const hist = (history || []).reverse().map((m) => ({
                role: m.role === "human" ? "assistant" : m.role,
                content: m.content,
              }));
              const sys =
                systemPrompt ||
                `You are a helpful assistant for ${session.business || "this business"}. Answer briefly. Offer human if stuck.`;
              const reply = await callGroq(sys, hist);
              await sb.from("chat_messages").insert({
                session_id: sessionId,
                role: "assistant",
                content: reply,
              });
            }
            return Response.json({ ok: true }, { headers: cors });
          }

          return new Response("bad action", { status: 400, headers: cors });
        } catch (e: any) {
          console.error("chat error", e);
          return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
