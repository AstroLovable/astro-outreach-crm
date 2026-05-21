import { Link, useRouterState, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
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

export function AppShell({ children }: { children?: ReactNode }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen flex w-full">
      <aside className="w-60 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
        <div className="p-5 flex items-center gap-2">
          <SaturnLogo size={28} />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-sidebar-foreground">AstroLabs</div>
            <div className="text-[11px] text-muted-foreground">& Co. CRM</div>
          </div>
        </div>
        <nav className="px-3 flex-1 space-y-0.5">
          {items.map((it) => {
            const active = it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
            const Icon = it.icon;
            return (
              <Link
                key={it.to}
                to={it.to}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
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
      <main className="flex-1 min-w-0 p-6 md:p-8 overflow-x-hidden">
        {children ?? <Outlet />}
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
