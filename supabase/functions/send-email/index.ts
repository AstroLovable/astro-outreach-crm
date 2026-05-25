// Generic email sender via Brevo. Accepts { to, from, subject, body }.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const { to, from, subject, body } = await req.json();
    if (!to || !from || !subject || !body) {
      return new Response(JSON.stringify({ error: "to, from, subject, body required" }), {
        status: 400,
        headers: CORS,
      });
    }
    const key = Deno.env.get("BREVO_API_KEY");
    if (!key) throw new Error("BREVO_API_KEY not configured");

    const recipients = (Array.isArray(to) ? to : [to]).map((e: string) => ({ email: e }));
    const isHtml = /<[a-z][\s\S]*>/i.test(body);

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": key,
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: from, name: FROM_NAMES[from] ?? "AstroLabs" },
        to: recipients,
        subject,
        htmlContent: isHtml ? body : `<pre style="font-family:system-ui;white-space:pre-wrap">${body}</pre>`,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("[send-email] brevo error", res.status, text);
      return new Response(JSON.stringify({ error: `Brevo ${res.status}: ${text}` }), {
        status: 502,
        headers: CORS,
      });
    }
    return new Response(JSON.stringify({ ok: true, brevo: JSON.parse(text || "{}") }), { headers: CORS });
  } catch (err) {
    console.error("[send-email]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: CORS },
    );
  }
});
