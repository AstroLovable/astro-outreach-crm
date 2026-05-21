import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

async function groq(opts: {
  system: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  max_tokens: number;
}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY not configured");
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: opts.max_tokens,
      messages: [{ role: "system", content: opts.system }, ...opts.messages],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

export const generateProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientName: z.string().min(1).max(200),
        business: z.string().max(200).optional(),
        services: z.string().max(2000).optional(),
        package: z.string().max(100).optional(),
        notes: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const system =
      "You write short, professional web design proposals for AstroLabs & Co., a UK web design studio. Tone: clear, confident, friendly. Use £GBP. Sections: brief intro, scope, pricing, why AstroLabs, next steps. End with hello@astrolabs.uk. No filler.";
    const user = `Client: ${data.clientName}${data.business ? ` (${data.business})` : ""}
Services: ${data.services || "Web design & build"}
Package: ${data.package || "Custom"}
Notes: ${data.notes || "—"}`;
    const content = await groq({
      system,
      messages: [{ role: "user", content: user }],
      max_tokens: 1000,
    });
    return { content };
  });

export const suggestTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        service: z.string().max(200).optional(),
        pkg: z.string().max(100).optional(),
        stage: z.string().max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const system =
      'You return ONLY a JSON array of 4-6 concise task title strings for a web design studio. No prose, no keys, no markdown. Example: ["Send onboarding form","Draft homepage wireframe"].';
    const user = `Service: ${data.service || "Web"} | Package: ${data.pkg || "Custom"} | Stage: ${data.stage || "Lead"}`;
    const raw = await groq({
      system,
      messages: [{ role: "user", content: user }],
      max_tokens: 300,
    });
    let tasks: string[] = [];
    try {
      const m = raw.match(/\[[\s\S]*\]/);
      tasks = JSON.parse(m ? m[0] : raw);
    } catch {
      tasks = raw
        .split("\n")
        .map((s: string) => s.replace(/^[-*\d.\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 6);
    }
    return { tasks: tasks.filter((t) => typeof t === "string").slice(0, 6) };
  });

export const summarizeNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(1).max(20000) }).parse(d))
  .handler(async ({ data }) => {
    const content = await groq({
      system:
        "Summarise the following client notes in exactly 3 sentences. Plain, no filler.",
      messages: [{ role: "user", content: data.text }],
      max_tokens: 150,
    });
    return { summary: content.trim() };
  });

export const draftReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        context: z.string().min(1).max(20000),
        instructions: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const content = await groq({
      system:
        "You draft concise, professional email replies in AstroLabs & Co.'s warm UK studio tone. No filler. Sign off as the AstroLabs team.",
      messages: [
        {
          role: "user",
          content: `Context:\n${data.context}\n\nInstructions: ${data.instructions || "Draft a clear, helpful reply."}`,
        },
      ],
      max_tokens: 250,
    });
    return { reply: content.trim() };
  });
