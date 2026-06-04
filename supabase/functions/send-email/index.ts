// Generic email sender via Brevo. Accepts { to, from, subject, body }.
// Requires service-role bearer to prevent abuse as an open email relay.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Content-Type": "application/json",
};

const FROM_NAMES: Record<string, string> = {
  "invoices@astrolabs.uk": "AstroLabs Billing",
  "hello@astrolabs.uk": "AstroLabs & Co.",
};
const ALLOWED_FROM = new Set(Object.keys(FROM_NAMES));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const auth = req.headers.get("Authorization");
    if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: CORS });
    }

    const { to, from, subject, body } = await req.json();
    if (!to || !from || !subject || !body) {
      return new Response(JSON.stringify({ error: "to, from, subject, body required" }), {
        status: 400, headers: CORS,
      });
    }
    if (!ALLOWED_FROM.has(String(from))) {
      return new Response(JSON.stringify({ error: "from address not allowed" }), { status: 400, headers: CORS });
    }
    const key = Deno.env.get("BREVO_API_KEY");
    if (!key) throw new Error("BREVO_API_KEY not configured");

    const recipients = (Array.isArray(to) ? to : [to])
      .slice(0, 10)
      .map((e: string) => ({ email: String(e).slice(0, 254) }));
    const subj = String(subject).slice(0, 250);
    const bodyStr = String(body).slice(0, 100000);
    const isHtml = /<[a-z][\s\S]*>/i.test(bodyStr);

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": key, accept: "application/json" },
      body: JSON.stringify({
        sender: { email: from, name: FROM_NAMES[from] ?? "AstroLabs" },
        to: recipients,
        subject: subj,
        htmlContent: isHtml ? bodyStr : `<pre style="font-family:system-ui;white-space:pre-wrap">${bodyStr.replace(/</g, "&lt;")}</pre>`,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[send-email] brevo error", res.status, text);
      return new Response(JSON.stringify({ error: `Brevo ${res.status}` }), { status: 502, headers: CORS });
    }
    return new Response(JSON.stringify({ ok: true }), { headers: CORS });
  } catch (err) {
    console.error("[send-email]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: CORS },
    );
  }
});
