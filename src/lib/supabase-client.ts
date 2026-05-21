import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

declare global {
  interface Window {
    __LOVABLE_SUPABASE__?: {
      publishableKey?: string;
      url?: string;
    };
  }
}

type ResolvedSupabaseConfig = {
  publishableKey?: string;
  source: "vite" | "window" | "meta" | "process" | "static" | "missing";
  url?: string;
};

const STATIC_SUPABASE_FALLBACK = {
  url: "https://rjvlscwkwzjuksnwwujo.supabase.co",
  publishableKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqdmxzY3drd3pqdWtzbnd3dWpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNjAzMzEsImV4cCI6MjA5NDkzNjMzMX0.HFnEkzwacpDVSDUhchJSDZzs96UWZNNNPonSu89HrFE",
};

let loggedFallbackSource: ResolvedSupabaseConfig["source"] | undefined;
let clientSingleton: SupabaseClient<Database> | undefined;

function readProcessEnv(name: string): string | undefined {
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

function readMetaValue(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ?? undefined;
}

function resolvePublicSupabaseEnv() {
  return {
    url:
      readProcessEnv("SUPABASE_URL") ??
      readProcessEnv("VITE_SUPABASE_URL") ??
      import.meta.env.VITE_SUPABASE_URL ??
      STATIC_SUPABASE_FALLBACK.url,
    publishableKey:
      readProcessEnv("SUPABASE_PUBLISHABLE_KEY") ??
      readProcessEnv("VITE_SUPABASE_PUBLISHABLE_KEY") ??
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      STATIC_SUPABASE_FALLBACK.publishableKey,
  };
}

function resolveSupabaseConfig(): ResolvedSupabaseConfig {
  const runtimeConfig = typeof window !== "undefined" ? window.__LOVABLE_SUPABASE__ : undefined;

  const candidates: ResolvedSupabaseConfig[] = [
    {
      url: import.meta.env.VITE_SUPABASE_URL,
      publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      source: "vite",
    },
    {
      url: runtimeConfig?.url,
      publishableKey: runtimeConfig?.publishableKey,
      source: "window",
    },
    {
      url: readMetaValue("lovable:supabase-url"),
      publishableKey: readMetaValue("lovable:supabase-publishable-key"),
      source: "meta",
    },
    {
      url: readProcessEnv("SUPABASE_URL") ?? readProcessEnv("VITE_SUPABASE_URL"),
      publishableKey:
        readProcessEnv("SUPABASE_PUBLISHABLE_KEY") ?? readProcessEnv("VITE_SUPABASE_PUBLISHABLE_KEY"),
      source: "process",
    },
    {
      ...STATIC_SUPABASE_FALLBACK,
      source: "static",
    },
  ];

  return candidates.find((candidate) => candidate.url && candidate.publishableKey) ?? { source: "missing" };
}

function logFallbackSource(source: ResolvedSupabaseConfig["source"]) {
  if (typeof window === "undefined" || source === "vite" || loggedFallbackSource === source) return;
  loggedFallbackSource = source;
  console.warn(`[Supabase] Using ${source} fallback config in the browser.`);
}

function createSupabaseBrowserClient() {
  const config = resolveSupabaseConfig();

  if (!config.url || !config.publishableKey) {
    throw new Error("Missing backend client configuration.");
  }

  logFallbackSource(config.source);

  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

function getSupabaseClient() {
  if (!clientSingleton) {
    clientSingleton = createSupabaseBrowserClient();
  }

  return clientSingleton;
}

export function getSupabasePublicEnv() {
  return resolvePublicSupabaseEnv();
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop, receiver) {
    return Reflect.get(getSupabaseClient(), prop, receiver);
  },
});