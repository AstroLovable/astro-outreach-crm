// Public chat edge function — Groq AI, polling, client data extraction,
// AI-initiated handover, contact form intake, office hours, request-contact,
// idle auto-close, and per-session system prompt snapshot.
//
// Security:
// - Visitor actions (send / poll / close / contact) require visitor_secret
//   returned from session creation, preventing IDOR by knowledge of UUID.
// - request-contact (CRM-initiated) requires a valid owner JWT.
// - Best-effort in-memory per-IP rate limiting on session-creating and
//   message-sending actions to slow abuse / Groq cost amplification.
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
const CONTACT_TOKEN = "SHOW_CONTACT_FORM";
const SHOW_CONTACT_CTRL = "__SHOW_CONTACT_FORM__";

const DEFAULT_PROMPT =
  `You are a helpful customer support assistant for AstroLabs & Co. Answer briefly and warmly. ` +
  `If the visitor asks for a quote, leaves contact details, or seems ready to commit, include the exact token ${CONTACT_TOKEN} in your response. ` +
  `If you cannot help or the visitor explicitly asks for a human, include the exact token ${HANDOVER_TOKEN} — a human teammate will be notified by email and take over.`;

// ── Rate limiting (best-effort, per-isolate in-memory) ────────
const RL_WINDOW_MS = 60_000;
const RL_MAX_PER_MIN = 15;
const RL_MAX_NEW_SESSIONS_PER_HOUR = 10;
const rlMap = new Map<string, number[]>();
const sessionMap = new Map<string, number[]>();

function getIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}
function rateLimit(map: Map<string, number[]>, key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const arr = (map.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { map.set(key, arr); return false; }
  arr.push(now); map.set(key, arr); return true;
}

function randomSecret(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

function isWithinOfficeHours(settings: {
  office_hours_start: string;
  office_hours_end: string;
  office_days: number[];
  office_timezone: string;
} | null) {
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
    const [sh, sm] = settings.office_hours_start.split(":").map(Number);
    const [eh, em] = settings.office_hours_end.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    return (settings.office_days ?? [1,2,3,4,5]).includes(wk) && cur >= start && cur < end;
  } catch { return true; }
}

async function upsertLeadFromContact(
  db: ReturnType<typeof createClient>,
  ownerId: string,
  sessionId: string,
  c: { name?: string|null; business?: string|null; business_type?: string|null; email?: string|null; phone?: string|null },
) {
  let existing: { id: string } | null = null;
  if (c.email) {
    const { data } = await db.from("clients").select("id")
      .eq("owner_id", ownerId).ilike("email", c.email).maybeSingle();
    existing = data as { id: string } | null;
  }
  const patch: Record<string, unknown> = {
    name: c.name || c.email || "New lead",
    business: c.business || null, service_type: c.business_type || null,
    email: c.email || null, phone: c.phone || null,
    source: "chat",
  };
  if (existing) {
    await db.from("clients").update(patch).eq("id", existing.id);
  } else {
    await db.from("clients").insert({
      owner_id: ownerId, ...patch, stage: "Lead",
      notes: `Submitted via chat widget (session ${sessionId})`,
    });
  }
  await db.from("activity").insert({
    owner_id: ownerId, type: "chat",
    description: `Contact form submitted: ${c.name || c.email || "anonymous"}`,
  });
}

async function extractClientData(
  db: ReturnType<typeof createClient>,
  sessionId: string,
  transcript: string,
) {
  try {
    const prompt = `Extract customer details from the chat below. Return strict JSON with keys: name, business, business_type, email, phone. Only values explicitly stated by VISITOR. Use null when unknown.\n\nCHAT:\n${transcript}`;
    const raw = await callGroq(
      "You extract customer contact info from chat transcripts. Output only valid JSON.",
      [{ role: "user", content: prompt }],
      { max_tokens: 200, json: true },
    );
    let parsed: Record<string, string | null> = {};
    try { parsed = JSON.parse(raw); } catch { return null; }
    const { name, business, business_type, email, phone } = parsed;
    if (!name && !email && !phone && !business) return null;

    const { data: sess } = await db
      .from("chat_sessions").select("owner_id, visitor_email, visitor_name, business")
      .eq("id", sessionId).maybeSingle();
    if (!sess?.owner_id) return null;

    await db.from("chat_sessions").update({
      visitor_name: name ?? sess.visitor_name,
      visitor_email: email ?? sess.visitor_email,
      business: business ?? sess.business,
    }).eq("id", sessionId);

    await upsertLeadFromContact(db, sess.owner_id as string, sessionId, { name, business, business_type, email, phone });
  } catch (e) { console.error("[extractClientData]", e); }
}

async function triggerHandover(url: string, serviceKey: string, sessionId: string, pageUrl: string | null) {
  try {
    await fetch(`${url}/functions/v1/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
      body: JSON.stringify({ sessionId, pageUrl, reason: "AI requested handover" }),
    });
  } catch (e) { console.error("[triggerHandover]", e); }
}

// Verify caller has a valid visitor_secret for the given session.
async function verifyVisitor(
  db: ReturnType<typeof createClient>,
  sessionId: string,
  secret: string | undefined | null,
): Promise<boolean> {
  if (!secret || typeof secret !== "string") return false;
  const { data } = await db.from("chat_sessions")
    .select("visitor_secret").eq("id", sessionId).maybeSingle();
  const stored = (data as { visitor_secret?: string } | null)?.visitor_secret;
  return !!stored && stored === secret;
}

// Verify caller is an authenticated owner of the given session.
async function verifyOwner(
  req: Request,
  url: string,
  anonKey: string,
  sessionId: string,
): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  try {
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: u } = await userClient.auth.getUser(token);
    const uid = u?.user?.id;
    if (!uid) return false;
    const { data: sess } = await userClient.from("chat_sessions")
      .select("owner_id").eq("id", sessionId).maybeSingle();
    return !!sess && (sess as { owner_id?: string }).owner_id === uid;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const ip = getIp(req);
    const body = await req.json();
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    const db = createClient(url, serviceKey);

    const visitorSecret: string | undefined = body.visitorSecret;

    // ── Poll ─────────────────────────────────────────────
    if (body.action === "poll" && body.sessionId) {
      if (!(await verifyVisitor(db, body.sessionId, visitorSecret))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: CORS });
      }
      const since = typeof body.since === "string" ? body.since : "1970-01-01T00:00:00Z";
      const { data: messages } = await db.from("chat_messages")
        .select("id, role, content, created_at").eq("session_id", body.sessionId)
        .in("role", ["assistant", "human"]).gt("created_at", since)
        .order("created_at", { ascending: true });
      const { data: sess } = await db.from("chat_sessions")
        .select("status").eq("id", body.sessionId).maybeSingle();
      return new Response(JSON.stringify({ messages: messages ?? [], status: sess?.status ?? null }), { headers: CORS });
    }

    // ── Close ────────────────────────────────────────────
    if (body.action === "close" && body.sessionId) {
      if (!(await verifyVisitor(db, body.sessionId, visitorSecret))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: CORS });
      }
      await db.from("chat_sessions")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("id", body.sessionId);
      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }

    // ── CRM requests contact form push ───────────────────
    if (body.action === "request-contact" && body.sessionId) {
      if (!(await verifyOwner(req, url, anonKey, body.sessionId))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: CORS });
      }
      await db.from("chat_messages").insert({
        session_id: body.sessionId, role: "assistant", content: SHOW_CONTACT_CTRL,
      });
      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }

    // ── Contact form submit ──────────────────────────────
    if (body.action === "contact" && body.sessionId) {
      if (!(await verifyVisitor(db, body.sessionId, visitorSecret))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: CORS });
      }
      const { name, business, business_type, email, phone } = body.contact || {};
      const { data: sess } = await db.from("chat_sessions")
        .select("owner_id, visitor_name, visitor_email, business").eq("id", body.sessionId).maybeSingle();
      if (sess?.owner_id) {
        await db.from("chat_sessions").update({
          visitor_name: name || sess.visitor_name,
          visitor_email: email || sess.visitor_email,
          business: business || sess.business,
        }).eq("id", body.sessionId);
        await upsertLeadFromContact(db, sess.owner_id as string, body.sessionId, { name, business, business_type, email, phone });
      }
      return new Response(JSON.stringify({ ok: true }), { headers: CORS });
    }

    // ── Widget chat ──────────────────────────────────────
    // Per-IP rate limit for message/send and session creation
    if (!rateLimit(rlMap, ip, RL_MAX_PER_MIN, RL_WINDOW_MS)) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: CORS });
    }

    let sessionId: string | null = body.sessionId ?? null;
    let issuedSecret: string | null = null;
    let sessionRow: { status: string; system_prompt: string | null; owner_id: string | null } | null = null;

    if (!sessionId) {
      if (!rateLimit(sessionMap, ip, RL_MAX_NEW_SESSIONS_PER_HOUR, 60 * 60 * 1000)) {
        return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: CORS });
      }
      const { data: ownerRow } = await db.from("settings")
        .select("owner_id, chatbot_system_prompt, office_hours_start, office_hours_end, office_days, office_timezone")
        .limit(1).maybeSingle();
      const snapshot = (ownerRow?.chatbot_system_prompt as string | undefined)?.trim() || DEFAULT_PROMPT;
      const finalPrompt = ownerRow
        ? `${snapshot}\n\nIMPORTANT: Office hours are currently ${
            isWithinOfficeHours(ownerRow as any) ? "OPEN" : "CLOSED"
          }. If CLOSED, tell the visitor the team is offline and include ${CONTACT_TOKEN} in your reply.`
        : snapshot;

      issuedSecret = randomSecret();
      const { data, error } = await db.from("chat_sessions").insert({
        page_url: body.pageUrl ?? null, status: "ai_handling",
        owner_id: (ownerRow as any)?.owner_id ?? null,
        system_prompt: finalPrompt,
        visitor_secret: issuedSecret,
      }).select("id, status, system_prompt, owner_id").single();
      if (error) throw error;
      sessionId = data.id;
      sessionRow = data as any;
    } else {
      if (!(await verifyVisitor(db, sessionId, visitorSecret))) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: CORS });
      }
      const { data } = await db.from("chat_sessions")
        .select("status, system_prompt, owner_id").eq("id", sessionId).maybeSingle();
      sessionRow = data as any;
    }

    if (sessionRow?.status === "closed") {
      return new Response(JSON.stringify({ sessionId, error: "closed", status: "closed" }), { headers: CORS });
    }

    if (typeof body.message === "string" && body.message.trim()) {
      await db.from("chat_messages").insert({
        session_id: sessionId, role: "visitor", content: body.message.slice(0, 2000),
      });
      const { data: cur } = await db.from("chat_sessions").select("unread_count").eq("id", sessionId).maybeSingle();
      await db.from("chat_sessions").update({
        unread_count: ((cur?.unread_count as number) ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);
    }

    let reply = "";
    let handover = false;
    let showContact = false;
    let replyId: string | null = null;

    if (sessionRow?.status === "ai_handling") {
      const { data: history } = await db.from("chat_messages")
        .select("role, content").eq("session_id", sessionId!)
        .order("created_at", { ascending: true }).limit(20);
      const aiMessages = (history ?? [])
        .filter((m: { content: string }) => m.content !== SHOW_CONTACT_CTRL)
        .map((m: { role: string; content: string }) => ({
          role: m.role === "visitor" ? "user" : "assistant", content: m.content,
        }));
      let rawReply = await callGroq(sessionRow.system_prompt || DEFAULT_PROMPT, aiMessages);

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

      const { data: inserted } = await db.from("chat_messages").insert({
        session_id: sessionId!, role: "assistant", content: reply,
      }).select("id").single();
      replyId = inserted?.id ?? null;

      if (handover) await triggerHandover(url, serviceKey, sessionId!, body.pageUrl ?? null);
    }

    if (typeof body.message === "string" && body.message.trim()) {
      const { data: history2 } = await db.from("chat_messages")
        .select("role, content").eq("session_id", sessionId!)
        .order("created_at", { ascending: true }).limit(40);
      const transcript = (history2 ?? [])
        .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
      extractClientData(db, sessionId!, transcript).catch((e) => console.error(e));
    }

    return new Response(JSON.stringify({ sessionId, visitorSecret: issuedSecret, reply, replyId, handover, showContact }), { headers: CORS });
  } catch (err) {
    console.error("[chat]", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: CORS });
  }
});
