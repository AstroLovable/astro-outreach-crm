import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { suggestTasks } from "@/lib/ai.functions";

export const Route = createFileRoute("/tasks")({
  component: () => (
    <AppShell>
      <PageHeader title="Tasks" subtitle="Per-client and global tasks with AI suggestions" />
      <TasksView />
    </AppShell>
  ),
});

function TasksView() {
  const { user } = useAuth();
  const { data: clients = [] } = useClients();
  const qc = useQueryClient();
  const suggest = useServerFn(suggestTasks);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState<string>("");
  const [priority, setPriority] = useState("Medium");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  const list = useQuery({
    queryKey: ["tasks", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("*").eq("owner_id", user!.id).order("created_at", { ascending: false });
      return data || [];
    },
  });

  const create = useMutation({
    mutationFn: async (vals: any) => {
      const { error } = await supabase.from("tasks").insert({ ...vals, owner_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: any) => { await supabase.from("tasks").update(patch).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from("tasks").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const add = async () => {
    if (!title.trim()) return;
    await create.mutateAsync({ title, client_id: clientId && clientId !== "none" ? clientId : null, priority, due_date: dueDate || null, status: "Todo" });
    setTitle(""); setDueDate("");
  };

  const runSuggest = async () => {
    const client = clients.find((c) => c.id === clientId);
    setBusy(true);
    try {
      const r = await suggest({ data: { service: client?.service_type || undefined, pkg: client?.package || undefined, stage: client?.stage } });
      for (const t of r.tasks) {
        await create.mutateAsync({ title: t, client_id: clientId && clientId !== "none" ? clientId : null, priority: "Medium", status: "Todo" });
      }
      toast.success(`Added ${r.tasks.length} tasks`);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <Card className="card-surface p-4 mb-4">
        <div className="grid md:grid-cols-[1fr_180px_140px_160px_auto] gap-2">
          <Input placeholder="New task title…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Client (optional)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No client</SelectItem>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{["Low", "Medium", "High"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" disabled={busy} onClick={runSuggest}>
            <Sparkles className="h-4 w-4 mr-1" />{busy ? "…" : "Suggest tasks with AI"}
          </Button>
        </div>
      </Card>
      <Card className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-3"></th>
              <th className="p-3 font-medium">Task</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Priority</th>
              <th className="p-3 font-medium">Due</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(list.data || []).length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No tasks yet.</td></tr>
            ) : (list.data || []).map((t: any) => {
              const c = clients.find((x) => x.id === t.client_id);
              const done = t.status === "Done";
              return (
                <tr key={t.id} className="border-t">
                  <td className="p-3"><Checkbox checked={done} onCheckedChange={(v) => update.mutate({ id: t.id, patch: { status: v ? "Done" : "Todo" } })} /></td>
                  <td className={`p-3 ${done ? "line-through text-muted-foreground" : ""}`}>{t.title}</td>
                  <td className="p-3">{c?.name || "—"}</td>
                  <td className="p-3">{t.priority}</td>
                  <td className="p-3">{t.due_date ? fmtDate(t.due_date) : "—"}</td>
                  <td className="p-3 text-right"><Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
