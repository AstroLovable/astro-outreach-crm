import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useSettings } from "@/hooks/useSettings";
import { useServerFn } from "@tanstack/react-start";
import { generateProposal } from "@/lib/ai.functions";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Sparkles, Download, Trash2 } from "lucide-react";
import { fmtDate, PACKAGES } from "@/lib/format";
import { downloadProposalPDF } from "@/lib/pdf";

export const Route = createFileRoute("/proposals")({
  component: () => (
    <AppShell>
      <PageHeader title="Proposals" subtitle="AI-generated proposals with PDF export" />
      <ProposalsView />
    </AppShell>
  ),
});

function ProposalsView() {
  const { user } = useAuth();
  const { data: clients = [] } = useClients();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const list = useQuery({
    queryKey: ["proposals", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("proposals").select("*").eq("owner_id", user!.id).order("created_at", { ascending: false });
      return data || [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from("proposals").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["proposals"] }),
  });

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New proposal</Button>
      </div>
      <Card className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-3 font-medium">Title</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Package</th>
              <th className="p-3 font-medium">Created</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(list.data || []).length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No proposals yet.</td></tr>
            ) : (list.data || []).map((p: any) => {
              const client = clients.find((c) => c.id === p.client_id);
              return (
                <tr key={p.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => { setEditing(p); setOpen(true); }}>
                  <td className="p-3 font-medium">{p.title}</td>
                  <td className="p-3">{client?.name || "—"}</td>
                  <td className="p-3">{p.package || "—"}</td>
                  <td className="p-3 text-muted-foreground">{fmtDate(p.created_at)}</td>
                  <td className="p-3 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={(e) => {
                      e.stopPropagation();
                      downloadProposalPDF({
                        title: p.title, content: p.content || "", clientName: client?.name,
                        company: settings || ({ company_name: "AstroLabs & Co.", company_email: "" } as any),
                      });
                    }}><Download className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); if (confirm("Delete?")) remove.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <ProposalEditor open={open} onOpenChange={setOpen} editing={editing} clients={clients} onSaved={() => qc.invalidateQueries({ queryKey: ["proposals"] })} />
    </>
  );
}

function ProposalEditor({ open, onOpenChange, editing, clients, onSaved }: any) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const gen = useServerFn(generateProposal);
  const [f, setF] = useState<any>(() => editing || { title: "New proposal", client_id: "", package: "", services: "", notes: "", content: "" });
  const [busy, setBusy] = useState(false);

  // reset on open
  useStateOnOpen(open, () => setF(editing || { title: "New proposal", client_id: "", package: "", services: "", notes: "", content: "" }));

  const runAI = async () => {
    const client = clients.find((c: any) => c.id === f.client_id);
    if (!client) { toast.error("Pick a client first"); return; }
    setBusy(true);
    try {
      const r = await gen({ data: { clientName: client.name, business: client.business || undefined, services: f.services, package: f.package, notes: f.notes } });
      setF({ ...f, content: r.content });
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const save = async () => {
    const payload = {
      owner_id: user!.id, title: f.title, client_id: f.client_id || null,
      package: f.package || null, services: f.services || null, notes: f.notes || null, content: f.content || null,
    };
    if (editing) {
      const { error } = await supabase.from("proposals").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("proposals").insert(payload);
      if (error) return toast.error(error.message);
    }
    toast.success("Saved");
    onSaved(); onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader><SheetTitle>{editing ? "Edit proposal" : "New proposal"}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div>
              <Label>Client</Label>
              <Select value={f.client_id || ""} onValueChange={(v) => setF({ ...f, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Package</Label>
              <Select value={f.package || ""} onValueChange={(v) => setF({ ...f, package: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{PACKAGES.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Services</Label><Input value={f.services || ""} onChange={(e) => setF({ ...f, services: e.target.value })} placeholder="e.g. Brand, web design, build" /></div>
          </div>
          <div><Label>Notes for AI</Label><Textarea rows={3} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
          <div className="flex justify-between items-center">
            <Button variant="outline" size="sm" onClick={runAI} disabled={busy}><Sparkles className="h-4 w-4 mr-1" />{busy ? "Generating…" : "Generate with AI"}</Button>
            <Button variant="outline" size="sm" disabled={!f.content} onClick={() => {
              const client = clients.find((c: any) => c.id === f.client_id);
              downloadProposalPDF({ title: f.title, content: f.content, clientName: client?.name, company: settings || ({ company_name: "AstroLabs & Co.", company_email: "" } as any) });
            }}><Download className="h-4 w-4 mr-1" />PDF</Button>
          </div>
          <div><Label>Proposal content</Label><Textarea rows={16} className="font-mono text-sm" value={f.content || ""} onChange={(e) => setF({ ...f, content: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// helper to reset form when sheet opens
import { useEffect, useRef } from "react";
function useStateOnOpen(open: boolean, cb: () => void) {
  const wasOpen = useRef(false);
  useEffect(() => { if (open && !wasOpen.current) cb(); wasOpen.current = open; }, [open]);
}
