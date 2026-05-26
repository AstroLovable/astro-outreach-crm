import { Link, useRouterState, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, KanbanSquare, FileText, Receipt, CheckSquare,
  MessageSquare, Settings as SettingsIcon, LogOut, Menu, X,
} from "lucide-react";
import { SaturnLogo } from "@/components/SaturnLogo";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase-client";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, key: "dash" as const },
  { to: "/clients", label: "Clients", icon: Users, key: "clients" as const },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare, key: "pipeline" as const },
  { to: "/proposals", label: "Proposals", icon: FileText, key: "proposals" as const },
  { to: "/billing", label: "Quotes & Invoices", icon: Receipt, key: "billing" as const },
  { to: "/tasks", label: "Tasks", icon: CheckSquare, key: "tasks" as const },
  { to: "/chats", label: "Live Chats", icon: MessageSquare, key: "chats" as const },
  { to: "/settings", label: "Settings", icon: SettingsIcon, key: "settings" as const },
];

function Badge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavList({
  pathname, onNavigate, chatBadge, clientBadge,
}: { pathname: string; onNavigate?: () => void; chatBadge: number; clientBadge: number }) {
  return (
    <nav className="px-3 flex-1 space-y-0.5 overflow-y-auto">
      {items.map((it) => {
        const active = it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
        const Icon = it.icon;
        const badge = it.key === "chats" ? chatBadge : it.key === "clients" ? clientBadge : 0;
        return (
          <Link
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-colors ${
              active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                     : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span>{it.label}</span>
            <Badge count={badge} />
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [chatBadge, setChatBadge] = useState(0);
  const [clientBadge, setClientBadge] = useState(0);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Unread chat badge: sum of unread_count across non-closed sessions
  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      const { data } = await supabase
        .from("chat_sessions")
        .select("unread_count, status")
        .neq("status", "closed");
      const total = (data || []).reduce(
        (s: number, r: { unread_count: number | null }) => s + (r.unread_count || 0), 0,
      );
      setChatBadge(total);
    };
    refresh();
    const ch = supabase
      .channel("appshell_chat_unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_sessions" }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Clear chat badge when viewing /chats
  useEffect(() => {
    if (pathname.startsWith("/chats") && user) {
      supabase.from("chat_sessions").update({ unread_count: 0 })
        .neq("unread_count", 0).then(() => setChatBadge(0));
    }
  }, [pathname, user]);

  // Client follow-up badge: clients with follow_up_date <= today and not done
  useEffect(() => {
    if (!user) return;
    const refresh = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await supabase
        .from("clients").select("id", { count: "exact", head: true })
        .eq("owner_id", user.id).eq("follow_up_done", false)
        .lte("follow_up_date", today);
      setClientBadge(count || 0);
    };
    refresh();
    const ch = supabase.channel("appshell_clients_followup")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients", filter: `owner_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  const handleLogoClick = (e: React.MouseEvent) => {
    // Mobile: tap logo → dashboard, or open astrolabs.uk if already there
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      e.preventDefault();
      if (pathname === "/") {
        window.open("https://www.astrolabs.uk", "_blank", "noopener");
      } else {
        navigate({ to: "/" });
      }
    }
  };

  const Brand = (
    <a
      href="https://www.astrolabs.uk"
      onClick={handleLogoClick}
      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <SaturnLogo size={28} />
      <div className="leading-tight">
        <div className="text-sm font-semibold text-sidebar-foreground">AstroLabs</div>
        <div className="text-[11px] text-muted-foreground">& Co. CRM</div>
      </div>
    </a>
  );

  return (
    <div className="min-h-screen flex w-full">
      <aside className="hidden md:flex w-60 shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
        <div className="p-5">{Brand}</div>
        <NavList pathname={pathname} chatBadge={chatBadge} clientBadge={clientBadge} />
        <div className="p-3 border-t border-sidebar-border">
          <div className="text-[11px] text-muted-foreground px-2 truncate">{user.email}</div>
          <button
            onClick={() => signOut()}
            className="mt-2 w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent rounded-md"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4">
        {Brand}
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="p-2 -mr-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent relative"
        >
          <Menu className="h-5 w-5" />
          {(chatBadge + clientBadge) > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
          )}
        </button>
      </div>

      <div
        className={`md:hidden fixed inset-0 z-50 transition-opacity ${mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      >
        <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
        <aside
          className={`absolute top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
            {Brand}
            <button aria-label="Close menu" onClick={() => setMobileOpen(false)}
              className="p-2 -mr-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent">
              <X className="h-5 w-5" />
            </button>
          </div>
          <NavList pathname={pathname} chatBadge={chatBadge} clientBadge={clientBadge}
            onNavigate={() => setMobileOpen(false)} />
          <div className="p-3 border-t border-sidebar-border">
            <div className="text-[11px] text-muted-foreground px-2 truncate">{user.email}</div>
            <button
              onClick={() => { setMobileOpen(false); signOut(); }}
              className="mt-2 w-full flex items-center gap-2 px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent rounded-md"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </aside>
      </div>

      <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 pt-[72px] md:pt-8 overflow-x-hidden">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5 md:mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
