import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase-client";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

// 8 hours of inactivity → auto sign-out (OWASP recommended for internal tools)
const INACTIVITY_MS = 8 * 60 * 60 * 1000;
const LAST_ACTIVE_KEY = "astrolabs:last_active";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof localStorage !== "undefined") localStorage.removeItem(LAST_ACTIVE_KEY);
  };

  // Track inactivity
  useEffect(() => {
    if (typeof window === "undefined" || !session) return;

    const markActive = () => {
      try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch { /* ignore */ }
      schedule();
    };

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { void signOut(); }, INACTIVITY_MS);
    };

    // On mount: if last activity is too old, sign out immediately
    try {
      const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) || "0");
      if (last && Date.now() - last > INACTIVITY_MS) { void signOut(); return; }
    } catch { /* ignore */ }

    markActive();
    const events = ["mousedown", "keydown", "touchstart", "scroll", "focus"];
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [session]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user: session?.user ?? null, session, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
