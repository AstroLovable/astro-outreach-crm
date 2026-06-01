import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { gbp, fmtDate, PIPELINE_STAGES } from "@/lib/format";
import { Users, Receipt, CheckSquare, Plus, MessageSquare } from "lucide-react";
import { AiActiveToggle } from "@/routes/chats";
import { useEffect } from "react";
import { toast } from "sonner";

function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <Card className="p-5 card-surface">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="kpi-value mt-2">{value}</div>
        </div>
        <div className="h-9 w-9 rounded-md brand-gradient flex items-center justify-center text-white">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

export function Dashboard() {
  const { user } = useAuth();

  const invoices = useQuery({
    queryKey: ["dash-invoices", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("invoices").select("total, status").eq("owner_id", user!.id);
      return data || [];
    },
  });
  const clients = useQuery({
    queryKey: ["dash-clients", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, stage").eq("owner_id", user!.id);
      return data || [];
    },
  });
  const tasks = useQuery({
    queryKey: ["dash-tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("id, status").eq("owner_id", user!.id).neq("status", "Done");
      return data || [];
    },
  });
  const activity = useQuery({
    queryKey: ["dash-activity", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("activity")
        .select("*")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const paid = (invoices.data || []).filter((i: any) => i.status === "Paid").reduce((s, i: any) => s + Number(i.total), 0);
  const outstanding = (invoices.data || [])
    .filter((i: any) => i.status === "Sent" || i.status === "Overdue")
    .reduce((s, i: any) => s + Number(i.total), 0);

  const stageCounts: Record<string, number> = {};
  PIPELINE_STAGES.forEach((s) => (stageCounts[s] = 0));
  (clients.data || []).forEach((c: any) => {
    if (stageCounts[c.stage] !== undefined) stageCounts[c.stage]++;
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your studio at a glance"
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link to="/clients"><Plus className="h-4 w-4 mr-1" />Client</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/billing"><Plus className="h-4 w-4 mr-1" />Invoice</Link></Button>
            <Button asChild size="sm"><Link to="/proposals"><Plus className="h-4 w-4 mr-1" />Proposal</Link></Button>
          </>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Total revenue" value={gbp(paid)} icon={Receipt} />
        <Kpi label="Outstanding" value={gbp(outstanding)} icon={Receipt} />
        <Kpi label="Active clients" value={String((clients.data || []).length)} icon={Users} />
        <Kpi label="Open tasks" value={String((tasks.data || []).length)} icon={CheckSquare} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="card-surface p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Pipeline summary</h2>
            <Link to="/pipeline" className="text-xs text-accent hover:underline">Open pipeline →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {PIPELINE_STAGES.map((s) => (
              <div key={s} className="rounded-lg bg-muted/40 p-3">
                <div className="text-[11px] text-muted-foreground">{s}</div>
                <div className="text-xl font-semibold mt-1">{stageCounts[s]}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="card-surface p-5">
          <h2 className="font-semibold mb-4">Recent activity</h2>
          {(activity.data || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-3">
              {(activity.data || []).map((a: any) => (
                <li key={a.id} className="text-sm">
                  <div>{a.description}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtDate(a.created_at)} · {a.type}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <FollowUpsCard />

      <LiveChatsCard />

      <Card className="card-surface p-5 mt-6 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Quick start</h3>
          <p className="text-sm text-muted-foreground">Add your first client, then build a proposal in seconds.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/settings">Settings</Link></Button>
          <Button asChild><Link to="/clients">Add client</Link></Button>
        </div>
      </Card>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  ai_handling: "AI",
  awaiting_human: "Needs Human",
  human_active: "Human",
  closed: "Closed",
};

function LiveChatsCard() {
  const qc = useQueryClient();
  const sessions = useQuery({
    queryKey: ["dash-chat-sessions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_sessions")
        .select("id, visitor_name, visitor_email, status, page_url, updated_at")
        .neq("status", "closed")
        .order("updated_at", { ascending: false })
        .limit(6);
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("dash_chat_sessions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_sessions" },
        () => qc.invalidateQueries({ queryKey: ["dash-chat-sessions"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const toggle = async (
    s: { id: string; status: string },
    nextOn: boolean,
  ) => {
    try {
      const nextStatus = nextOn ? "ai_handling" : "human_active";
      await supabase
        .from("chat_sessions")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", s.id);
      await supabase.from("chat_messages").insert({
        session_id: s.id,
        role: nextOn ? "assistant" : "human",
        content: nextOn
          ? "You're now chatting with the AstroLabs AI service bot, how can I help?"
          : "You're now chatting with the AstroLabs team — we'll take it from here!",
      });
      toast.success(nextOn ? "AI re-enabled" : "Taken over by you");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const rows = sessions.data || [];

  return (
    <Card className="card-surface p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Live chats</h2>
        </div>
        <Link to="/chats" className="text-xs text-accent hover:underline">Open chats →</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active chats.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((s) => (
            <li key={s.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {s.visitor_name || s.visitor_email || "Anonymous"}
                  <span className="ml-2 text-[10px] text-muted-foreground">{STATUS_LABEL[s.status] || s.status}</span>
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{s.page_url || "—"} · {fmtDate(s.updated_at)}</div>
              </div>
              <AiActiveToggle
                on={s.status === "ai_handling"}
                onChange={(next) => toggle(s, next)}
                size="sm"
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FollowUpsCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const followUps = useQuery({
    queryKey: ["dash-followups", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name, business, follow_up_date, follow_up_done")
        .eq("owner_id", user!.id)
        .lte("follow_up_date", today)
        .eq("follow_up_done", false)
        .order("follow_up_date", { ascending: true });
      return data || [];
    },
  });
  const markDone = async (id: string) => {
    await supabase.from("clients").update({ follow_up_date: null, follow_up_done: true }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["dash-followups"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    toast.success("Follow-up cleared");
  };
  const rows = followUps.data || [];
  return (
    <Card className="card-surface p-5 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Follow-up reminders</h2>
        <Link to="/clients" className="text-xs text-accent hover:underline">Open clients →</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No follow-ups due today.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((c: any) => (
            <li key={c.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{c.name}{c.business ? ` · ${c.business}` : ""}</div>
                <div className="text-[11px] text-muted-foreground">Due {c.follow_up_date}</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => markDone(c.id)}>Mark done</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
