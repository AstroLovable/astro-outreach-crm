// Public chat edge function — proxies to Groq AI, logs conversation, extracts client data,
// and handles AI-initiated handover via the HANDOVER_REQUESTED token.
//
// Accepts:
//   { sessionId?, pageUrl?, message, systemPrompt? }   (widget chat)
//   { action: 'poll', sessionId, since }               (widget polling)
//   { messages, systemPrompt }                         (raw passthrough)
// Returns: { sessionId, reply, handover? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const HANDOVER_TOKEN = "HANDOVER_REQUESTED";

async function callGroq(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  opts: { max_tokens?: number; json?: boolean } = {},
) {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not configured");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.max_tokens ?? 300,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      messages: [{ role: "system", content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

async function extractClientData(
  db: ReturnType<typeof createClient>,
  sessionId: string,
  transcript: string,
) {
  try {
    const prompt = `Extract customer details from the chat below. Return strict JSON with keys: name (full name or null), business (company name or null), business_type (industry/type or null), email (or null), phone (or null). Only include values explicitly stated by the VISITOR. Use null when unknown.\n\nCHAT:\n${transcript}`;
    const raw = await callGroq(
      "You extract customer contact info from chat transcripts. Output only valid JSON.",
      [{ role: "user", content: prompt }],
      { max_tokens: 200, json: true },
    );
    let parsed: Record<string, string | null> = {};
    try { parsed = JSON.parse(raw); } catch { return null; }

    const { name, business, business_type, email, phone } = parsed;
    if (!name && !email && !phone && !business) return null;

    // Find session owner
    const { data: sess } = await db
      .from("chat_sessions")
      .select("owner_id, visitor_email, visitor_name, business")
      .eq("id", sessionId)
      .maybeSingle();
    if (!sess?.owner_id) return null;

    // Update visitor info on session
    await db
      .from("chat_sessions")
      .update({
        visitor_name: name ?? sess.visitor_name,
        visitor_email: email ?? sess.visitor_email,
        business: business ?? sess.business,
      })
      .eq("id", sessionId);

    // Match existing client by email (preferred) or name
    let existing: { id: string; name: string } | null = null;
    if (email) {
      const { data } = await db
        .from("clients")
        .select("id, name")
        .eq("owner_id", sess.owner_id)
        .ilike("email", email)
        .maybeSingle();
      existing = (data as { id: string; name: string } | null) ?? null;
    }
    if (!existing && name) {
      const { data } = await db
        .from("clients")
        .select("id, name")
        .eq("owner_id", sess.owner_id)
        .ilike("name", name)
        .maybeSingle();
      existing = (data as { id: string; name: string } | null) ?? null;
    }

    const patch: Record<string, unknown> = {};
    if (name) patch.name = name;
    if (business) patch.business = business;
    if (business_type) patch.service_type = business_type;
    if (email) patch.email = email;
    if (phone) patch.phone = phone;

    if (existing) {
      await db.from("clients").update(patch).eq("id", existing.id);
      return { id: existing.id, name: existing.name, created: false };
    } else {
      const insertRow = {
        owner_id: sess.owner_id,
        name: name ?? business ?? email ?? "Unnamed lead",
        business: business ?? null,
        service_type: business_type ?? null,
        email: email ?? null,
        phone: phone ?? null,
        stage: "Lead",
        notes: `Auto-created from chat session ${sessionId}`,
      };
      const { data: created } = await db.from("clients").insert(insertRow).select("id, name").single();
      if (created) {
        await db.from("activity").insert({
          owner_id: sess.owner_id,
          type: "chat",
          description: `New lead from chat: ${created.name}`,
          ref_id: created.id,
        });
      }
      return created ? { id: created.id, name: created.name, created: true } : null;
    }
  } catch (e) {
    console.error("[extractClientData]", e);
    return null;
  }
}

async function triggerHandover(
  url: string,
  serviceKey: string,
  sessionId: string,
  pageUrl: string | null,
) {
  try {
    await fetch(`${url}/functions/v1/handoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({ sessionId, pageUrl, reason: "AI requested handover" }),
    });
  } catch (e) {
    console.error("[triggerHandover]", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const body = await req.json();
    const systemPrompt =
      body.systemPrompt ||
      `You are a helpful customer support assistant for AstroLabs & Co. Answer briefly and warmly. If you cannot help or the visitor explicitly asks to speak to a human, include the exact token ${HANDOVER_TOKEN} anywhere in your response and a human teammate will take over.`;

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, serviceKey);

    // ── Poll mode ─────────────────────────────────────────────
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

    // ── Raw passthrough ───────────────────────────────────────
    if (Array.isArray(body.messages) && !body.message) {
      const reply = await callGroq(systemPrompt, body.messages);
      return new Response(JSON.stringify({ reply }), { headers: CORS });
    }

    // ── Widget mode ───────────────────────────────────────────
    let sessionId: string | null = body.sessionId ?? null;
    if (!sessionId) {
      // Default to single-owner setup: attach to the first settings owner.
      const { data: ownerRow } = await db
        .from("settings")
        .select("owner_id")
        .limit(1)
        .maybeSingle();
      const { data, error } = await db
        .from("chat_sessions")
        .insert({
          page_url: body.pageUrl ?? null,
          status: "ai_handling",
          owner_id: ownerRow?.owner_id ?? null,
        })
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

    const { data: session } = await db
      .from("chat_sessions")
      .select("status")
      .eq("id", sessionId!)
      .maybeSingle();

    let reply = "";
    let handover = false;
    if (session?.status === "ai_handling") {
      const { data: history } = await db
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: true })
        .limit(20);

      const aiMessages = (history ?? []).map((m: { role: string; content: string }) => ({
        role: m.role === "visitor" ? "user" : "assistant",
        content: m.content,
      }));

      let rawReply = await callGroq(systemPrompt, aiMessages);

      if (rawReply.includes(HANDOVER_TOKEN)) {
        handover = true;
        rawReply = rawReply.replace(new RegExp(HANDOVER_TOKEN, "g"), "").trim();
        if (!rawReply) {
          rawReply = "Let me connect you with a human teammate — one moment.";
        }
      }
      reply = rawReply;

      await db.from("chat_messages").insert({
        session_id: sessionId!,
        role: "assistant",
        content: reply,
      });

      if (handover) {
        await triggerHandover(url, serviceKey, sessionId!, body.pageUrl ?? null);
      }
    }

    // Fire-and-forget client extraction (non-blocking-ish)
    if (typeof body.message === "string" && body.message.trim()) {
      const { data: history2 } = await db
        .from("chat_messages")
        .select("role, content")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: true })
        .limit(40);
      const transcript = (history2 ?? [])
        .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");
      // Don't await — keep response snappy; errors are logged inside.
      extractClientData(db, sessionId!, transcript).catch((e) => console.error(e));
    }

    await db
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId!);

    return new Response(JSON.stringify({ sessionId, reply, handover }), { headers: CORS });
  } catch (err) {
    console.error("[chat]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: CORS },
    );
  }
});
