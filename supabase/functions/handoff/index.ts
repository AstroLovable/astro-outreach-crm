// Human handoff edge function — emails support via Brevo and marks session as awaiting_human.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  try {
    const { sessionId, pageUrl, transcript, reason } = await req.json();
    if (!sessionId) {
      return new Response(JSON.stringify({ error: "sessionId required" }), { status: 400, headers: CORS });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(url, serviceKey);

    await db
      .from("chat_sessions")
      .update({ status: "awaiting_human", updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    let transcriptText = "";
    if (typeof transcript === "string" && transcript.trim()) {
      transcriptText = transcript;
    } else {
      const { data: msgs } = await db
        .from("chat_messages")
        .select("role, content, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      transcriptText = (msgs ?? [])
        .map((m: { role: string; content: string }) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n");
    }

    const html = `
      <h2>Chat Handoff Requested</h2>
      ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ""}
      <p><strong>Page:</strong> ${pageUrl ?? "—"}</p>
      <p><strong>Session ID:</strong> ${sessionId}</p>
      <h3>Transcript</h3>
      <pre style="white-space:pre-wrap;font-family:system-ui;background:#f5f5f5;padding:12px;border-radius:6px">${transcriptText.replace(/</g, "&lt;")}</pre>
    `;

    // Call send-email function
    try {
      const r = await fetch(`${url}/functions/v1/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({
          to: "hello@astrolabs.uk",
          from: "hello@astrolabs.uk",
          subject: "Chat Handoff Requested",
          body: html,
        }),
      });
      if (!r.ok) console.error("[handoff] send-email error", await r.text());
    } catch (e) {
      console.error("[handoff] send-email exception", e);
    }

    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (err) {
    console.error("[handoff]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: CORS },
    );
  }
});
