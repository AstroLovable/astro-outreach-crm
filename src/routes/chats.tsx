import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/hooks/useAuth";
import { useSettings } from "@/hooks/useSettings";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { Send, Sparkles, X, UserPlus, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { draftReply } from "@/lib/ai.functions";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/chats")({
  component: () => (
    <AppShell>
      <PageHeader title="Live Chats" subtitle="AI-handled sessions with human takeover" />
      <ChatsView />
    </AppShell>
  ),
});

const STATUS_LABEL: Record<string, string> = {
  ai_handling: "AI", awaiting_human: "Needs Human", human_active: "Human", closed: "Closed",
};

function statusBadgeClass(status: string) {
  if (status === "awaiting_human") return "bg-destructive/20 text-destructive";
  if (status === "human_active") return "bg-green-500/20 text-green-700";
  if (status === "closed") return "bg-muted text-muted-foreground";
  return "bg-accent/20 text-accent-foreground";
}

const AI_RESUME_MSG = "You're now chatting with the AstroLabs AI service bot, how can I help?";
const HUMAN_TAKEOVER_MSG = "You're now chatting with the AstroLabs team — we'll take it from here!";

// Single audio element reused
let notifyAudio: HTMLAudioElement | null = null;
function playNotify() {
  if (typeof window === "undefined") return;
  if (!notifyAudio) {
    // Embedded subtle beep (data URI). Short sine pulse.
    notifyAudio = new Audio(
      "data:audio/wav;base64,UklGRiQEAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAEAACAgICAg4WHiYuNj5KUlpianJ6gop+dm5mXlZOQjouIhYJ/fHl2c3BtamdkYV5bWFVST0xJRkM/PDk2MzAtKigmJCIfHRsZGBYUExEQDw4NCwoIBwYFBAMCAQEAAAEBAgMEBQYHCAoLDQ4PEBESExUWGBkbHR8iJCYoKiwuMDIzNjk8P0NGSUxPUlVYW15hZGdqbXBzdnl8f4KFiIuOk5aZnJ+ipKaoqaurq6mop6Wjop+dm5mXlZOQjouIhYJ/fHl2c3BtamdkYV5bWFVST0xJRkM/PDk2MzAtKigmJCIfHRsZGBYUExEQDw4NCwoIBwYFBAMCAQEAAAEBAgMEBQYHCAoLDQ4PEBESExUWGBkbHR8iJCY=",
    );
    notifyAudio.volume = 0.3;
  }
  notifyAudio.currentTime = 0;
  notifyAudio.play().catch(() => {});
}

function ChatsView() {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const lastSeenIdsRef = useRef<Set<string>>(new Set());

  const sessions = useQuery({
    queryKey: ["chat_sessions"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("chat_sessions").select("*")
        .order("updated_at", { ascending: false });
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("chat_sessions_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_sessions" },
        () => qc.invalidateQueries({ queryKey: ["chat_sessions"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Realtime visitor messages → play sound (only if sound enabled and tab visible)
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("chat_messages_sound")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload: { new: { id: string; role: string; session_id: string } }) => {
          const row = payload.new;
          if (row.role !== "visitor") return;
          if (lastSeenIdsRef.current.has(row.id)) return;
          lastSeenIdsRef.current.add(row.id);
          if (settings?.notification_sound && !document.hidden) playNotify();
          qc.invalidateQueries({ queryKey: ["chat_messages", row.session_id] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, settings, qc]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("clients_new_from_chat")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "clients", filter: `owner_id=eq.${user.id}` },
        (payload: { new: { name?: string; notes?: string | null } }) => {
          const row = payload.new;
          if (row?.notes?.startsWith("Auto-created from chat") || row?.notes?.includes("contact form")) {
            toast.success(`New lead: ${row.name}`, { icon: <UserPlus className="h-4 w-4" /> });
            qc.invalidateQueries({ queryKey: ["clients"] });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  // Clear unread when selecting
  useEffect(() => {
    if (!selected) return;
    supabase.from("chat_sessions").update({ unread_count: 0 }).eq("id", selected);
  }, [selected]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
      <Card className="card-surface p-2 max-h-[70vh] overflow-y-auto">
        {(sessions.data || []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No chats yet.</p>
        ) : (
          (sessions.data || []).map((s: any) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              className={`w-full text-left p-3 rounded-md ${selected === s.id ? "bg-accent/10" : "hover:bg-muted/30"}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm truncate">
                  {s.visitor_name || s.visitor_email || "Anonymous"}
                </div>
                <div className="flex items-center gap-1">
                  {(s.unread_count || 0) > 0 && s.status !== "closed" && (
                    <span className="text-[10px] px-1.5 rounded-full bg-destructive text-destructive-foreground">{s.unread_count}</span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusBadgeClass(s.status)}`}>
                    {STATUS_LABEL[s.status] || s.status}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{s.page_url || "—"}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{fmtDate(s.updated_at)}</div>
            </button>
          ))
        )}
      </Card>
      {selected ? (
        <ChatPanel sessionId={selected} onDeleted={() => setSelected(null)} />
      ) : (
        <Card className="card-surface p-8 text-center text-sm text-muted-foreground">
          Select a chat to view the conversation.
        </Card>
      )}
    </div>
  );
}

function ChatPanel({ sessionId, onDeleted }: { sessionId: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const draft = useServerFn(draftReply);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const session = useQuery({
    queryKey: ["chat_session", sessionId],
    queryFn: async () => {
      const { data } = await supabase.from("chat_sessions").select("*").eq("id", sessionId).maybeSingle();
      return data;
    },
  });

  const msgs = useQuery({
    queryKey: ["chat_messages", sessionId],
    queryFn: async () => {
      const { data } = await supabase.from("chat_messages").select("*")
        .eq("session_id", sessionId).order("created_at", { ascending: true });
      return data || [];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`chat_${sessionId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `session_id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["chat_messages", sessionId] }))
      .on("postgres_changes",
        { event: "*", schema: "public", table: "chat_sessions", filter: `id=eq.${sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["chat_session", sessionId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sessionId, qc]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.data]);

  const status = session.data?.status as string | undefined;
  const aiActive = status === "ai_handling";
  const isClosed = status === "closed";

  // Typing indicator: show when last message is visitor AND AI handling AND no assistant reply yet
  const last = (msgs.data || [])[(msgs.data || []).length - 1];
  const showAiTyping = aiActive && last?.role === "visitor";

  const setStatus = async (next: string) => {
    const { error } = await supabase.from("chat_sessions")
      .update({ status: next, updated_at: new Date().toISOString() }).eq("id", sessionId);
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
        toast.success("AI re-enabled");
      } else {
        await setStatus("human_active");
        await insertMessage("human", HUMAN_TAKEOVER_MSG);
        toast.success("You've taken over");
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const close = useMutation({
    mutationFn: () => setStatus("closed"),
    onSuccess: () => toast.success("Chat closed"),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("chat_sessions").delete().eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chat deleted");
      qc.invalidateQueries({ queryKey: ["chat_sessions"] });
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const send = async () => {
    if (!reply.trim() || isClosed) return;
    if (status === "ai_handling" || status === "awaiting_human") {
      try { await setStatus("human_active"); } catch { /* ignore */ }
    }
    const { error } = await supabase.from("chat_messages")
      .insert({ session_id: sessionId, role: "human", content: reply });
    if (error) return toast.error(error.message);
    await supabase.from("chat_sessions").update({ updated_at: new Date().toISOString() }).eq("id", sessionId);
    setReply("");
  };

  const aiDraft = async () => {
    const ctx = (msgs.data || []).slice(-6)
      .map((m: any) => `${m.role}: ${m.content}`).join("\n");
    setBusy(true);
    try {
      const r = await draft({ data: { context: ctx, instructions: "Continue the live chat conversation helpfully and briefly. No email sign-off." } });
      setReply(r.reply);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
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
          <div className="text-xs text-muted-foreground truncate">{session.data?.page_url || "—"}</div>
        </div>
        <div className="flex items-center gap-3">
          <AiActiveToggle on={aiActive} disabled={isClosed} onChange={toggleAi} />
          {!isClosed && (
            <Button size="sm" variant="ghost" onClick={() => close.mutate()}>
              <X className="h-4 w-4 mr-1" />Close
            </Button>
          )}
          {isClosed && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDel(true)}>
              <Trash2 className="h-4 w-4 mr-1" />Delete
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(msgs.data || []).map((m: any) => (
          <div key={m.id} className={`flex ${m.role === "visitor" ? "justify-start" : "justify-end"}`}>
            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.role === "visitor" ? "bg-muted" : "bg-accent text-accent-foreground"}`}>
              {m.role === "human" && <div className="text-[10px] font-semibold opacity-60 mb-1">You</div>}
              {m.role === "assistant" && <div className="text-[10px] font-semibold opacity-60 mb-1">AI</div>}
              {m.content}
              <div className="text-[10px] opacity-60 mt-1">{fmtDate(m.created_at)}</div>
            </div>
          </div>
        ))}
        {showAiTyping && <TypingBubble />}
        <div ref={endRef} />
      </div>
      <div className="border-t p-3 space-y-2">
        {isClosed ? (
          <div className="text-center text-sm text-muted-foreground py-3 bg-muted/40 rounded-md">
            This chat has ended.
          </div>
        ) : (
          <>
            <Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Type a reply…" />
            <div className="flex justify-between">
              <Button size="sm" variant="outline" disabled={busy} onClick={aiDraft}>
                <Sparkles className="h-4 w-4 mr-1" />{busy ? "…" : "AI draft"}
              </Button>
              <Button size="sm" onClick={send}><Send className="h-4 w-4 mr-1" />Send</Button>
            </div>
          </>
        )}
      </div>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => del.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-end">
      <div className="rounded-lg px-4 py-3 flex gap-1" style={{ background: "#2E3A59" }}>
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: "200ms" }} />
        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" style={{ animationDelay: "400ms" }} />
      </div>
    </div>
  );
}

export function AiActiveToggle({
  on, disabled, onChange, size = "md",
}: { on: boolean; disabled?: boolean; onChange: (next: boolean) => void; size?: "sm" | "md" }) {
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
