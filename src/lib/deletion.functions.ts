import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RATE_LIMIT_SECONDS = 30;
const CODE_TTL_MINUTES = 10;
const BRAND = {
  bg: "#EEF0F5",
  card: "#FFFFFF",
  primary: "#2E3A59",
  accent: "#4A6FA5",
  muted: "#6B7280",
  border: "#E5E7EB",
};

function buildEmail(code: string, appName = "AstroLabs & Co.") {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${BRAND.bg};font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:${BRAND.primary}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden">
        <tr><td style="padding:28px 32px 8px 32px">
          <div style="display:inline-block;width:36px;height:36px;border-radius:10px;background:${BRAND.accent};color:#fff;font-weight:700;text-align:center;line-height:36px;font-size:16px">A</div>
          <span style="margin-left:10px;font-weight:600;font-size:16px;color:${BRAND.primary};vertical-align:middle">${appName}</span>
        </td></tr>
        <tr><td style="padding:8px 32px 4px 32px">
          <h1 style="margin:0;font-size:20px;font-weight:600;color:${BRAND.primary}">Confirm data deletion</h1>
        </td></tr>
        <tr><td style="padding:8px 32px 0 32px">
          <p style="margin:0;font-size:14px;line-height:1.6;color:${BRAND.muted}">Use the code below to confirm permanently deleting your client data. This code expires in ${CODE_TTL_MINUTES} minutes.</p>
        </td></tr>
        <tr><td style="padding:20px 32px">
          <div style="background:${BRAND.bg};border:1px solid ${BRAND.border};border-radius:12px;padding:20px;text-align:center">
            <div style="font-size:32px;letter-spacing:10px;font-weight:700;color:${BRAND.primary};font-family:ui-monospace,Menlo,Consolas,monospace">${code}</div>
          </div>
        </td></tr>
        <tr><td style="padding:0 32px 28px 32px">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted}">If you didn't request this, you can safely ignore this email — no changes will be made.</p>
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

async function sendBrevoEmail(to: string, code: string) {
  const key = process.env.BREVO_API_KEY;
  if (!key) throw new Error("Email service not configured");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": key, accept: "application/json" },
    body: JSON.stringify({
      sender: { email: "hello@astrolabs.uk", name: "AstroLabs & Co." },
      to: [{ email: to }],
      subject: "Your data deletion confirmation code",
      htmlContent: buildEmail(code),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error("[brevo]", res.status, t);
    throw new Error("Failed to send verification email");
  }
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const requestDeletionCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context as any;
    const email = claims?.email as string | undefined;
    if (!email) throw new Error("No email on file for your account");

    const admin = await getAdmin();

    // Rate limit: max 1 code per 30s
    const { data: recent } = await admin
      .from("deletion_verification_codes")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent) {
      const elapsed = (Date.now() - new Date(recent.created_at as string).getTime()) / 1000;
      if (elapsed < RATE_LIMIT_SECONDS) {
        throw new Error(`Please wait ${Math.ceil(RATE_LIMIT_SECONDS - elapsed)}s before requesting a new code`);
      }
    }

    // Invalidate previous unused codes
    await admin
      .from("deletion_verification_codes")
      .update({ used: true })
      .eq("user_id", userId)
      .eq("used", false);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires_at = new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString();

    const { error: insErr } = await admin
      .from("deletion_verification_codes")
      .insert({ user_id: userId, code, expires_at });
    if (insErr) throw new Error(insErr.message);

    await sendBrevoEmail(email, code);
    return { ok: true, sentTo: email };
  });

export const verifyAndClearDatabase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => {
    const code = String(d?.code ?? "").trim();
    if (!/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit code");
    return { code };
  })
  .handler(async ({ data, context }) => {
    const { userId } = context as any;
    const admin = await getAdmin();

    const { data: row, error } = await admin
      .from("deletion_verification_codes")
      .select("id, code, expires_at, used")
      .eq("user_id", userId)
      .eq("code", data.code)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Invalid code");
    if (row.used) throw new Error("This code has already been used");
    if (new Date(row.expires_at as string).getTime() < Date.now()) {
      throw new Error("This code has expired — request a new one");
    }

    const { error: markErr } = await admin
      .from("deletion_verification_codes")
      .update({ used: true })
      .eq("id", row.id);
    if (markErr) throw new Error(markErr.message);

    const tables = ["activity", "notes", "tasks", "invoices", "quotes", "proposals", "clients"] as const;
    for (const t of tables) {
      const { error: delErr } = await admin.from(t).delete().eq("owner_id", userId);
      if (delErr) throw new Error(`Failed clearing ${t}: ${delErr.message}`);
    }
    return { ok: true };
  });
