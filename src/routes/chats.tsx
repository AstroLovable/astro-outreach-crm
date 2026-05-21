import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { Send, Sparkles, UserCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { draftReply } from "@/lib/ai.functions";

export const Route = createFileRoute("/chats")({
  component: () => (
    <AppShell>
      <PageHeader title="Live Chats" subtitle="AI-handled sessions with human takeover" />
      <ChatsView />
    </AppShell>
  ),
});

function ChatsView() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: ["chat_sessions", user?.id], enabled: !!user, refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from("chat_sessions").select("*").eq("owner_id", user!.id).order("updated_at", { ascending: false });
      return data || [];
    },
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
      <Card className="card-surface p-2 max-h-[70vh] overflow-y-auto">
        {(sessions.data || []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No chats yet.</p>
        ) : (sessions.data || []).map((s: any) => (
          <button key={s.id} onClick={() => setSelected(s.id)}
            className={`w-full text-left p-3 rounded-md ${selected === s.id ? "bg-accent/10" : "hover:bg-muted/30"}`}>
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm truncate">{s.visitor_name || s.visitor_email || "Anonymous"}</div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.status === "human" ? "bg-destructive/20 text-destructive" : "bg-muted text-muted-foreground"}`}>{s.status}</span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{s.page_url || "—"}</div>
            <div className="text-[11px] text-muted-foreground mt-1">{fmtDate(s.updated_at)}</div>
          </button>
        ))}
      </Card>
      {selected ? <ChatPanel sessionId={selected} onChange={() => qc.invalidateQueries({ queryKey: ["chat_sessions"] })} />
        : <Card className="card-surface p-8 text-center text-sm text-muted-foreground">Select a chat to view the conversation.</Card>}
    </div>
  );
}

function ChatPanel({ sessionId, onChange }: { sessionId: string; onChange: () => void }) {
  const qc = useQueryClient();
  const draft = useServerFn(draftReply);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const session = useQuery({
    queryKey: ["chat_session", sessionId], refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.from("chat_sessions").select("*").eq("id", sessionId).maybeSingle();
      return data;
    },
  });

  const msgs = useQuery({
    queryKey: ["chat_messages", sessionId], refetchInterval: 3000,
    queryFn: async () => {
      const { data } = await supabase.from("chat_messages").select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
      return data || [];
    },
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.data]);

  const takeover = useMutation({
    mutationFn: async () => { await supabase.from("chat_sessions").update({ status: "human" }).eq("id", sessionId); },
    onSuccess: () => { session.refetch(); onChange(); toast.success("You've taken over this chat"); },
  });

  const send = async () => {
    if (!reply.trim()) return;
    const { error } = await supabase.from("chat_messages").insert({ session_id: sessionId, role: "assistant", content: reply });
    if (error) return toast.error(error.message);
    await supabase.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
    setReply("");
    msgs.refetch();
  };

  const aiDraft = async () => {
    const ctx = (msgs.data || []).slice(-6).map((m: any) => `${m.role}: ${m.content}`).join("\n");
    setBusy(true);
    try {
      const r = await draft({ data: { context: ctx, instructions: "Continue the conversation helpfully." } });
      setReply(r.reply);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <Card className="card-surface flex flex-col h-[70vh]">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <div className="font-medium">{session.data?.visitor_name || session.data?.visitor_email || "Anonymous"}</div>
          <div className="text-xs text-muted-foreground">{session.data?.business || "—"} · {session.data?.page_url || "—"}</div>
        </div>
        {session.data?.status !== "human" && (
          <Button size="sm" variant="outline" onClick={() => takeover.mutate()}><UserCheck className="h-4 w-4 mr-1" />Take over</Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(msgs.data || []).map((m: any) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-muted" : "bg-accent text-accent-foreground"}`}>
              {m.content}
              <div className="text-[10px] opacity-60 mt-1">{fmtDate(m.created_at)}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t p-3 space-y-2">
        <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type a reply…" />
        <div className="flex justify-between">
          <Button size="sm" variant="outline" disabled={busy} onClick={aiDraft}><Sparkles className="h-4 w-4 mr-1" />{busy ? "…" : "AI draft"}</Button>
          <Button size="sm" onClick={send}><Send className="h-4 w-4 mr-1" />Send</Button>
        </div>
      </div>
    </Card>
  );
}
