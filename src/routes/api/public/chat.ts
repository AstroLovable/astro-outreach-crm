// Public chat endpoint — human-only live chat.
// A session is only created when the visitor sends their first message;
// until then the widget runs entirely client-side with no network calls.
// Visitor-scoped actions are gated by a per-session visitor_secret.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
};

const CAP = (v: unknown, n: number) => (v == null ? null : String(v).slice(0, n));

function jres(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: CORS });
}

async function verifyVisitor(sessionId: string, visitorSecret: unknown) {
  if (!sessionId || typeof visitorSecret !== "string" || !visitorSecret) {
    return { ok: false as const };
  }
  const { data } = await supabaseAdmin
    .from("chat_sessions")
    .select("status, owner_id, visitor_secret")
    .eq("id", sessionId)
    .maybeSingle();
  if (!data || data.visitor_secret !== visitorSecret) return { ok: false as const };
  return { ok: true as const, row: data };
}

async function handle(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}) as any);

    // ── Poll ─────────────────────────────────────────────
    if (body.action === "poll" && body.sessionId) {
      const v = await verifyVisitor(body.sessionId, body.visitorSecret);
      if (!v.ok) return jres({ error: "Forbidden" }, 403);
      const since = typeof body.since === "string" ? body.since.slice(0, 64) : "1970-01-01T00:00:00Z";
      const { data: messages } = await supabaseAdmin
        .from("chat_messages")
        .select("id, role, content, created_at")
        .eq("session_id", body.sessionId)
        .eq("role", "human")
        .gt("created_at", since)
        .order("created_at", { ascending: true });
      return jres({ messages: messages ?? [], status: v.row?.status ?? null });
    }

    // ── Close ────────────────────────────────────────────
    if (body.action === "close" && body.sessionId) {
      const v = await verifyVisitor(body.sessionId, body.visitorSecret);
      if (!v.ok) return jres({ error: "Forbidden" }, 403);
      await supabaseAdmin
        .from("chat_sessions")
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

      const { data: sess } = await supabaseAdmin
        .from("chat_sessions")
        .select("owner_id, visitor_name, visitor_email, business")
        .eq("id", body.sessionId)
        .maybeSingle();
      if (sess?.owner_id) {
        await supabaseAdmin
          .from("chat_sessions")
          .update({
            visitor_name: name || sess.visitor_name,
            visitor_email: email || sess.visitor_email,
            business: business || sess.business,
          })
          .eq("id", body.sessionId);

        let existing: { id: string } | null = null;
        if (email) {
          const { data } = await supabaseAdmin
            .from("clients")
            .select("id")
            .eq("owner_id", sess.owner_id)
            .ilike("email", email)
            .maybeSingle();
          existing = data as { id: string } | null;
        }
        const patch: Record<string, any> = {
          name: name || email || "New lead",
          business: business || null,
          service_type: business_type || null,
          email: email || null,
          phone: phone || null,
        };
        if (existing) {
          await supabaseAdmin.from("clients").update(patch as any).eq("id", existing.id);
        } else {
          await supabaseAdmin.from("clients").insert({
            owner_id: sess.owner_id,
            ...patch,
            stage: "Lead",
            notes: `Submitted via chat widget contact form (session ${body.sessionId})`,
          } as any);
        }
        await supabaseAdmin.from("activity").insert({
          owner_id: sess.owner_id,
          type: "chat",
          description: `Contact form submitted: ${name || email || "anonymous"}`,
        });
      }
      return jres({ ok: true });
    }

    // ── Widget message (default) ─────────────────────────
    const pageUrl = CAP(body.pageUrl, 2048);
    const message = typeof body.message === "string" ? body.message.slice(0, 2000) : "";
    if (!message.trim()) return jres({ error: "Empty message" }, 400);

    let sessionId: string | null = body.sessionId ?? null;
    let sessionRow: any = null;
    let visitorSecret: string | null = null;
    let isNewSession = false;

    if (!sessionId) {
      isNewSession = true;
      const { data: ownerRow } = await supabaseAdmin
        .from("settings")
        .select("owner_id")
        .limit(1)
        .maybeSingle();
      visitorSecret = crypto.randomUUID();
      const { data, error } = await supabaseAdmin
        .from("chat_sessions")
        .insert({
          page_url: pageUrl,
          status: "waiting",
          owner_id: (ownerRow as any)?.owner_id ?? null,
          visitor_secret: visitorSecret,
        } as any)
        .select("id, status, owner_id")
        .single();
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

    await supabaseAdmin.from("chat_messages").insert({
      session_id: sessionId!,
      role: "visitor",
      content: message,
    } as any);

    const { data: cur } = await supabaseAdmin
      .from("chat_sessions")
      .select("unread_count")
      .eq("id", sessionId!)
      .maybeSingle();
    await supabaseAdmin
      .from("chat_sessions")
      .update({
        unread_count: (((cur as any)?.unread_count as number) ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId!);

    return jres({
      sessionId,
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
