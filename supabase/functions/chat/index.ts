// Public chat edge function — proxies to Groq AI and logs the conversation.
// Accepts:
//   { sessionId?, pageUrl?, message, systemPrompt? }  (preferred — widget flow)
//   { messages, systemPrompt }                         (raw passthrough)
// Returns: { sessionId, reply }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

async function callGroq(systemPrompt: string, messages: { role: string; content: string }[]) {
  const key = Deno.env.get("GROQ_API_KEY");
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
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await req.json();
    const systemPrompt =
      body.systemPrompt ||
      "You are a helpful customer support assistant. Answer briefly. If you cannot help, offer to connect the user to a human.";

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, serviceKey);

    // Poll mode — widget fetches new agent/AI messages since a timestamp
    if (body.action === "poll" && body.sessionId) {
      const since = typeof body.since === "string" ? body.since : "1970-01-01T00:00:00Z";
      const { data: messages } = await db
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("session_id", body.sessionId)
        .in("role", ["assistant", "human"])
        .gt("created_at", since)
        .order("created_at", { ascending: true });
      const { data: sess } = await db
        .from("chat_sessions")
        .select("status")
        .eq("id", body.sessionId)
        .maybeSingle();
      return new Response(
        JSON.stringify({ messages: messages ?? [], status: sess?.status ?? null }),
        { headers: CORS },
      );
    }

    // Raw passthrough mode
    if (Array.isArray(body.messages) && !body.message) {
      const reply = await callGroq(systemPrompt, body.messages);
      return new Response(JSON.stringify({ reply }), { headers: CORS });
    }

    // Widget mode — persist + reply
    let sessionId: string | null = body.sessionId ?? null;
    if (!sessionId) {
      const { data, error } = await db
        .from("chat_sessions")
        .insert({ page_url: body.pageUrl ?? null, status: "ai_handling" })
        .select("id")
        .single();
      if (error) throw error;
      sessionId = data.id;
    }

    if (typeof body.message === "string" && body.message.trim()) {
      await db.from("chat_messages").insert({
        session_id: sessionId,
        role: "visitor",
        content: body.message.slice(0, 2000),
      });
    }

    // Load session to check status — only AI-reply when ai_handling
    const { data: session } = await db
      .from("chat_sessions")
      .select("status")
      .eq("id", sessionId!)
      .maybeSingle();

    let reply = "";
    if (session?.status === "ai_handling") {
      const { data: history } = await db
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: true })
        .limit(20);

      const aiMessages = (history ?? []).map((m: { role: string; content: string }) => ({
        role: m.role === "visitor" ? "user" : m.role === "human" ? "assistant" : "assistant",
        content: m.content,
      }));

      reply = await callGroq(systemPrompt, aiMessages);
      await db.from("chat_messages").insert({
        session_id: sessionId!,
        role: "assistant",
        content: reply,
      });
    }

    await db
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId!);

    return new Response(JSON.stringify({ sessionId, reply }), { headers: CORS });
  } catch (err) {
    console.error("[chat]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: CORS },
    );
  }
});
