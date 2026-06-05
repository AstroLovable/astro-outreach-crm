// Public chat endpoint — replaces the Supabase chat edge function.
// Calls Groq directly for AI replies. Visitor-scoped actions are gated
// by a per-session visitor_secret minted at session creation.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const HANDOVER_TOKEN = "HANDOVER_REQUESTED";
const CONTACT_TOKEN = "SHOW_CONTACT_FORM";

const DEFAULT_PROMPT =
  `You are a helpful customer support assistant for AstroLabs & Co. Answer briefly and warmly. ` +
  `If the visitor asks for a quote or wants to speak to a human, include the exact token ${CONTACT_TOKEN} in your response. ` +
  `If you cannot help, include the exact token ${HANDOVER_TOKEN} and a human teammate will take over.`;

const CAP = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));

function jres(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

async function callGemini(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  opts: { max_tokens?: number; json?: boolean },
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
  const res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: {
        maxOutputTokens: opts.max_tokens ?? 300,
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p: any) => p?.text ?? "").join("").trim();
}

async function callAI(
  systemPrompt: string,
  messages: { role: string; content: string }[],
  opts: { max_tokens?: number; json?: boolean } = {},
): Promise<string> {
  // Prefer Groq; fall back to Gemini (direct Google API).
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: opts.max_tokens ?? 300,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return (data.choices?.[0]?.message?.content ?? "").trim();
    }
    console.error(`[chat] Groq ${res.status}: ${await res.text()}`);
  }
  return callGemini(systemPrompt, messages, opts);
}


async function verifyVisitor(sessionId: string, visitorSecret: unknown) {
  if (!sessionId || typeof visitorSecret !== "string" || !visitorSecret) {
    return { ok: false as const };
  }
  const { data } = await supabaseAdmin
    .from("chat_sessions")
    .select("status, system_prompt, owner_id, visitor_secret")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data || data.visitor_secret !== visitorSecret) return { ok: false as const };
  return { ok: true as const, row: data };
}

function isWithinOfficeHours(settings: any | null) {
  if (!settings) return true;
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: settings.office_timezone || "Europe/London",
      weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
    const wkMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    const wk = wkMap[fmt.find(p => p.type === "weekday")?.value ?? "Mon"] ?? 1;
    const hh = Number(fmt.find(p => p.type === "hour")?.value ?? "0");
    const mm = Number(fmt.find(p => p.type === "minute")?.value ?? "0");
    const cur = hh * 60 + mm;
    const [sh, sm] = String(settings.office_hours_start || "09:00").split(":").map(Number);
    const [eh, em] = String(settings.office_hours_end || "18:00").split(":").map(Number);
    return (settings.office_days ?? [1,2,3,4,5]).includes(wk) && cur >= sh*60+sm && cur < eh*60+em;
  } catch { return true; }
}

async function extractClientData(sessionId: string, transcript: string) {
  try {
    const prompt = `Extract customer details from the chat below. Return strict JSON with keys: name, business, business_type, email, phone. Only values explicitly stated by VISITOR. Use null when unknown.\n\nCHAT:\n${transcript}`;
    const raw = await callAI(
      "You extract customer contact info from chat transcripts. Output only valid JSON.",
      [{ role: "user", content: prompt }],
      { max_tokens: 200, json: true },
    );
    let parsed: Record<string, string | null> = {};
    try { parsed = JSON.parse(raw); } catch { return; }
    const name = CAP(parsed.name, 200);
    const business = CAP(parsed.business, 200);
    const business_type = CAP(parsed.business_type, 100);
    const email = CAP(parsed.email, 254);
    const phone = CAP(parsed.phone, 30);
    if (!name && !email && !phone && !business) return;

    const { data: sess } = await supabaseAdmin
      .from("chat_sessions").select("owner_id, visitor_email, visitor_name, business")
      .eq("id", sessionId).maybeSingle();
    if (!sess?.owner_id) return;

    await supabaseAdmin.from("chat_sessions").update({
      visitor_name: name ?? sess.visitor_name,
      visitor_email: email ?? sess.visitor_email,
      business: business ?? sess.business,
    }).eq("id", sessionId);

    let existing: { id: string } | null = null;
    if (email) {
      const { data } = await supabaseAdmin.from("clients").select("id")
        .eq("owner_id", sess.owner_id).ilike("email", email).maybeSingle();
      existing = data as { id: string } | null;
    }
    if (!existing && name) {
      const { data } = await supabaseAdmin.from("clients").select("id")
        .eq("owner_id", sess.owner_id).ilike("name", name).maybeSingle();
      existing = data as { id: string } | null;
    }
    const patch: Record<string, any> = {};
    if (name) patch.name = name;
    if (business) patch.business = business;
    if (business_type) patch.service_type = business_type;
    if (email) patch.email = email;
    if (phone) patch.phone = phone;

    if (existing) {
      await supabaseAdmin.from("clients").update(patch as any).eq("id", existing.id);
    } else {
      await supabaseAdmin.from("clients").insert({
        owner_id: sess.owner_id,
        name: name ?? business ?? email ?? "Unnamed lead",
        business: business ?? null, service_type: business_type ?? null,
        email: email ?? null, phone: phone ?? null,
        stage: "Lead", notes: `Auto-created from chat session ${sessionId}`,
      });
    }
  } catch (e) { console.error("[extractClientData]", e); }
}

async function triggerHandover(sessionId: string, pageUrl: string | null) {
  try {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return;
    await fetch(`${url}/functions/v1/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({ sessionId, pageUrl, reason: "AI requested handover" }),
    });
  } catch (e) { console.error("[triggerHandover]", e); }
}

async function handle(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({} as any));

    // ── Poll ─────────────────────────────────────────────
    if (body.action === "poll" && body.sessionId) {
      const v = await verifyVisitor(body.sessionId, body.visitorSecret);
      if (!v.ok) return jres({ error: "Forbidden" }, 403);
      const since = typeof body.since === "string" ? body.since.slice(0, 64) : "1970-01-01T00:00:00Z";
      const { data: messages } = await supabaseAdmin.from("chat_messages")
        .select("id, role, content, created_at").eq("session_id", body.sessionId)
        .in("role", ["assistant", "human"]).gt("created_at", since)
        .order("created_at", { ascending: true });
      return jres({ messages: messages ?? [], status: v.row?.status ?? null });
    }

    // ── Close ────────────────────────────────────────────
    if (body.action === "close" && body.sessionId) {
      const v = await verifyVisitor(body.sessionId, body.visitorSecret);
      if (!v.ok) return jres({ error: "Forbidden" }, 403);
      await supabaseAdmin.from("chat_sessions")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("id", body.sessionId);
      return jres({ ok: true });
    }

    // ── Contact form ─────────────────────────────────────
    if (body.action === "contact" && body.sessionId) {
      const v = await verifyVisitor(body.sessionId, body.visitorSecret);
      if (!v.ok) return jres({ error: "Forbidden" }, 403);
      const c = body.contact || {};
      const name = CAP(c.name, 200);
      const business = CAP(c.business, 200);
      const business_type = CAP(c.business_type, 100);
      const email = CAP(c.email, 254);
      const phone = CAP(c.phone, 30);

      const { data: sess } = await supabaseAdmin.from("chat_sessions")
        .select("owner_id, visitor_name, visitor_email, business").eq("id", body.sessionId).maybeSingle();
      if (sess?.owner_id) {
        await supabaseAdmin.from("chat_sessions").update({
          visitor_name: name || sess.visitor_name,
          visitor_email: email || sess.visitor_email,
          business: business || sess.business,
        }).eq("id", body.sessionId);

        let existing: { id: string } | null = null;
        if (email) {
          const { data } = await supabaseAdmin.from("clients").select("id")
            .eq("owner_id", sess.owner_id).ilike("email", email).maybeSingle();
          existing = data as { id: string } | null;
        }
        const patch: Record<string, any> = {
          name: name || email || "New lead",
          business: business || null, service_type: business_type || null,
          email: email || null, phone: phone || null,
        };
        if (existing) {
          await supabaseAdmin.from("clients").update(patch as any).eq("id", existing.id);
        } else {
          await supabaseAdmin.from("clients").insert({
            owner_id: sess.owner_id, ...patch, stage: "Lead",
            notes: `Submitted via chat widget contact form (session ${body.sessionId})`,
          } as any);
        }
        await supabaseAdmin.from("activity").insert({
          owner_id: sess.owner_id, type: "chat",
          description: `Contact form submitted: ${name || email || "anonymous"}`,
        });
      }
      return jres({ ok: true });
    }

    // ── Widget chat (default) ────────────────────────────
    const pageUrl = CAP(body.pageUrl, 2048);
    let sessionId: string | null = body.sessionId ?? null;
    let sessionRow: any = null;
    let visitorSecret: string | null = null;
    let isNewSession = false;

    if (!sessionId) {
      isNewSession = true;
      const { data: ownerRow } = await supabaseAdmin.from("settings")
        .select("owner_id, chatbot_system_prompt, office_hours_start, office_hours_end, office_days, office_timezone")
        .limit(1).maybeSingle();
      const snapshot = ((ownerRow as any)?.chatbot_system_prompt as string | undefined)?.trim() || DEFAULT_PROMPT;
      const finalPrompt = ownerRow
        ? `${snapshot}\n\nIMPORTANT: If outside office hours (currently ${
            isWithinOfficeHours(ownerRow) ? "OPEN" : "CLOSED"
          }), tell the visitor the team is unavailable and include ${CONTACT_TOKEN} in your reply.`
        : snapshot;

      visitorSecret = crypto.randomUUID();

      const { data, error } = await supabaseAdmin.from("chat_sessions").insert({
        page_url: pageUrl, status: "ai_handling",
        owner_id: (ownerRow as any)?.owner_id ?? null,
        system_prompt: finalPrompt,
        visitor_secret: visitorSecret,
      } as any).select("id, status, system_prompt, owner_id").single();
      if (error) throw error;
      sessionId = data.id;
      sessionRow = data;
    } else {
      const v = await verifyVisitor(sessionId, body.visitorSecret);
      if (!v.ok) return jres({ error: "Forbidden" }, 403);
      sessionRow = v.row;
    }

    if (sessionRow?.status === "closed") {
      return jres({ sessionId, error: "closed", status: "closed" });
    }

    const message = typeof body.message === "string" ? body.message.slice(0, 2000) : "";
    if (message.trim()) {
      await supabaseAdmin.from("chat_messages").insert({
        session_id: sessionId!, role: "visitor", content: message,
      } as any);
      const { data: cur } = await supabaseAdmin.from("chat_sessions")
        .select("unread_count").eq("id", sessionId!).maybeSingle();
      await supabaseAdmin.from("chat_sessions").update({
        unread_count: (((cur as any)?.unread_count as number) ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId!);
    }

    let reply = "";
    let handover = false;
    let showContact = false;
    let replyId: string | null = null;

    if (sessionRow?.status === "ai_handling") {
      const { data: history } = await supabaseAdmin.from("chat_messages")
        .select("role, content").eq("session_id", sessionId!)
        .order("created_at", { ascending: true }).limit(20);
      const aiMessages = (history ?? []).map((m: any) => ({
        role: m.role === "visitor" ? "user" : "assistant", content: m.content,
      }));
      let rawReply = await callAI(sessionRow.system_prompt || DEFAULT_PROMPT, aiMessages);

      if (rawReply.includes(HANDOVER_TOKEN)) {
        handover = true;
        rawReply = rawReply.replace(new RegExp(HANDOVER_TOKEN, "g"), "").trim();
      }
      if (rawReply.includes(CONTACT_TOKEN)) {
        showContact = true;
        rawReply = rawReply.replace(new RegExp(CONTACT_TOKEN, "g"), "").trim();
      }
      if (!rawReply) rawReply = "One moment — let me connect you.";
      reply = rawReply;

      const { data: inserted } = await supabaseAdmin.from("chat_messages").insert({
        session_id: sessionId!, role: "assistant", content: reply,
      } as any).select("id").single();
      replyId = inserted?.id ?? null;

      if (handover) await triggerHandover(sessionId!, pageUrl);
    }

    if (message.trim()) {
      const { data: history2 } = await supabaseAdmin.from("chat_messages")
        .select("role, content").eq("session_id", sessionId!)
        .order("created_at", { ascending: true }).limit(40);
      const transcript = (history2 ?? [])
        .map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
      extractClientData(sessionId!, transcript).catch((e) => console.error(e));
    }

    return jres({
      sessionId, reply, replyId, handover, showContact,
      ...(isNewSession ? { visitorSecret } : {}),
    });
  } catch (err) {
    console.error("[chat]", err);
    return jres({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
}

export const Route = createFileRoute("/api/public/chat")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => handle(request),
    },
  },
});
