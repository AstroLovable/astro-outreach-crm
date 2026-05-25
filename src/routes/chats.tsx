import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { Send, Sparkles, X, UserPlus } from "lucide-react";
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

const STATUS_LABEL: Record<string, string> = {
  ai_handling: "AI",
  awaiting_human: "Needs Human",
  human_active: "Human",
  closed: "Closed",
};

function statusBadgeClass(status: string) {
  if (status === "awaiting_human") return "bg-destructive/20 text-destructive";
  if (status === "human_active") return "bg-green-500/20 text-green-700";
  if (status === "closed") return "bg-muted text-muted-foreground";
  return "bg-accent/20 text-accent-foreground";
}

const AI_RESUME_MSG =
  "You're now chatting with the AstroLabs AI service bot, how can I help?";
const HUMAN_TAKEOVER_MSG =
  "You're now chatting with the AstroLabs team — we'll take it from here!";

function ChatsView() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const sessions = useQuery({
    queryKey: ["chat_sessions"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_sessions")
        .select("*")
        .order("updated_at", { ascending: false });
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("chat_sessions_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_sessions" },
        () => qc.invalidateQueries({ queryKey: ["chat_sessions"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Notify when a new client is auto-created from chat
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("clients_new_from_chat")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "clients", filter: `owner_id=eq.${user.id}` },
        (payload: { new: { name?: string; notes?: string | null } }) => {
          const row = payload.new;
          if (row?.notes && row.notes.startsWith("Auto-created from chat")) {
            toast.success(`New lead from chat: ${row.name}`, {
              icon: <UserPlus className="h-4 w-4" />,
            });
            qc.invalidateQueries({ queryKey: ["clients"] });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
      <Card className="card-surface p-2 max-h-[70vh] overflow-y-auto">
        {(sessions.data || []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No chats yet.</p>
        ) : (
          (sessions.data || []).map((s: { id: string; visitor_name: string | null; visitor_email: string | null; status: string; page_url: string | null; updated_at: string }) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={`w-full text-left p-3 rounded-md ${
                selected === s.id ? "bg-accent/10" : "hover:bg-muted/30"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm truncate">
                  {s.visitor_name || s.visitor_email || "Anonymous"}
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadgeClass(s.status)}`}>
                  {STATUS_LABEL[s.status] || s.status}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{s.page_url || "—"}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{fmtDate(s.updated_at)}</div>
            </button>
          ))
        )}
      </Card>
      {selected ? (
        <ChatPanel sessionId={selected} />
      ) : (
        <Card className="card-surface p-8 text-center text-sm text-muted-foreground">
          Select a chat to view the conversation.
        </Card>
      )}
    </div>
  );
}

function ChatPanel({ sessionId }: { sessionId: string }) {
  const qc = useQueryClient();
  const draft = useServerFn(draftReply);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const session = useQuery({
    queryKey: ["chat_session", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      return data;
    },
  });

  const msgs = useQuery({
    queryKey: ["chat_messages", sessionId],
    queryFn: async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`chat_${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `session_id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["chat_messages", sessionId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_sessions", filter: `id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["chat_session", sessionId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, qc]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.data]);

  const status = session.data?.status as string | undefined;
  const aiActive = status === "ai_handling";

  const setStatus = async (next: string) => {
    const { error } = await supabase
      .from("chat_sessions")
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    if (error) throw error;
  };

  const insertMessage = async (role: "human" | "assistant", content: string) => {
    await supabase.from("chat_messages").insert({ session_id: sessionId, role, content });
  };

  const toggleAi = async (nextOn: boolean) => {
    try {
      if (nextOn) {
        await setStatus("ai_handling");
        await insertMessage("assistant", AI_RESUME_MSG);
        toast.success("AI re-enabled for this session");
      } else {
        await setStatus("human_active");
        await insertMessage("human", HUMAN_TAKEOVER_MSG);
        toast.success("You've taken over this chat");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const close = useMutation({
    mutationFn: () => setStatus("closed"),
    onSuccess: () => toast.success("Chat closed"),
    onError: (e: Error) => toast.error(e.message),
  });

  const send = async () => {
    if (!reply.trim()) return;
    // Auto-disable AI when CRM agent sends a message
    if (status === "ai_handling" || status === "awaiting_human") {
      try { await setStatus("human_active"); } catch { /* ignore */ }
    }
    const { error } = await supabase
      .from("chat_messages")
      .insert({ session_id: sessionId, role: "human", content: reply });
    if (error) return toast.error(error.message);
    await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);
    setReply("");
  };

  const aiDraft = async () => {
    const ctx = (msgs.data || [])
      .slice(-6)
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n");
    setBusy(true);
    try {
      const r = await draft({
        data: {
          context: ctx,
          instructions: "Continue the live chat conversation helpfully and briefly. No email sign-off.",
        },
      });
      setReply(r.reply);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="card-surface flex flex-col h-[70vh]">
      <div className="p-4 border-b flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium truncate">
            {session.data?.visitor_name || session.data?.visitor_email || "Anonymous"}
            <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${statusBadgeClass(status || "")}`}>
              {STATUS_LABEL[status || ""] || status}
            </span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {session.data?.page_url || "—"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AiActiveToggle on={aiActive} disabled={status === "closed"} onChange={toggleAi} />
          {status !== "closed" && (
            <Button size="sm" variant="ghost" onClick={() => close.mutate()}>
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(msgs.data || []).map((m: { id: string; role: string; content: string; created_at: string }) => (
          <div key={m.id} className={`flex ${m.role === "visitor" ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                m.role === "visitor" ? "bg-muted" : "bg-accent text-accent-foreground"
              }`}
            >
              {m.role === "human" && (
                <div className="text-[10px] font-semibold opacity-60 mb-1">You</div>
              )}
              {m.role === "assistant" && (
                <div className="text-[10px] font-semibold opacity-60 mb-1">AI</div>
              )}
              {m.content}
              <div className="text-[10px] opacity-60 mt-1">{fmtDate(m.created_at)}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t p-3 space-y-2">
        <Textarea
          rows={3}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type a reply…"
        />
        <div className="flex justify-between">
          <Button size="sm" variant="outline" disabled={busy} onClick={aiDraft}>
            <Sparkles className="h-4 w-4 mr-1" />
            {busy ? "…" : "AI draft"}
          </Button>
          <Button size="sm" onClick={send}>
            <Send className="h-4 w-4 mr-1" />
            Send
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function AiActiveToggle({
  on,
  disabled,
  onChange,
  size = "md",
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  size?: "sm" | "md";
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className={`text-xs font-medium ${on ? "text-green-600" : "text-destructive"}`}>
        AI {on ? "Active" : "Off"}
      </span>
      <Switch
        checked={on}
        disabled={disabled}
        onCheckedChange={onChange}
        className={`${on ? "data-[state=checked]:bg-green-500" : "data-[state=unchecked]:bg-destructive"} ${size === "sm" ? "scale-90" : ""}`}
      />
    </label>
  );
}
