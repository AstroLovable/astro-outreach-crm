import { Link, useRouterState, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  KanbanSquare,
  FileText,
  Receipt,
  CheckSquare,
  MessageSquare,
  Settings as SettingsIcon,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { SaturnLogo } from "@/components/SaturnLogo";
import { useAuth } from "@/hooks/useAuth";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { to: "/proposals", label: "Proposals", icon: FileText },
  { to: "/billing", label: "Quotes & Invoices", icon: Receipt },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/chats", label: "Live Chats", icon: MessageSquare },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function NavList({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="px-3 flex-1 space-y-0.5 overflow-y-auto">
      {items.map((it) => {
        const active = it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
        const Icon = it.icon;
        return (
          <Link
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-colors ${
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
            }`}
          >
            <Icon className="h-4 w-4" />
            {it.label}
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

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Lock scroll when drawer open
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

  const Brand = (
    <a href="https://www.astrolabs.uk" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
      <SaturnLogo size={28} />
      <div className="leading-tight">
        <div className="text-sm font-semibold text-sidebar-foreground">AstroLabs</div>
        <div className="text-[11px] text-muted-foreground">& Co. CRM</div>
      </div>
    </a>
  );

  return (
    <div className="min-h-screen flex w-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
        <div className="p-5">{Brand}</div>
        <NavList pathname={pathname} />
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

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-sidebar border-b border-sidebar-border flex items-center justify-between px-4">
        {Brand}
        <button
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          className="p-2 -mr-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer + backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-50 transition-opacity ${mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      >
        <div
          className="absolute inset-0 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={`absolute top-0 left-0 bottom-0 w-72 max-w-[85vw] bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="p-4 flex items-center justify-between border-b border-sidebar-border">
            {Brand}
            <button
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="p-2 -mr-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <NavList pathname={pathname} onNavigate={() => setMobileOpen(false)} />
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
