import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useClients, type Client } from "@/hooks/useClients";
import { useSettings } from "@/hooks/useSettings";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useState, useRef } from "react";
import { PIPELINE_STAGES, PACKAGES, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Upload, Download, Trash2, Sparkles } from "lucide-react";
import Papa from "papaparse";
import { useServerFn } from "@tanstack/react-start";
import { summarizeNotes } from "@/lib/ai.functions";

export const Route = createFileRoute("/clients")({
  component: () => (
    <AppShell>
      <ClientsView />
    </AppShell>
  ),
});

function ClientsView() {
  const { data: clients = [], create, update, remove } = useClients();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [detail, setDetail] = useState<Client | null>(null);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = clients.filter((c) =>
    [c.name, c.business, c.email].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase()),
  );

  const exportCSV = () => {
    const csv = Papa.unparse(
      clients.map((c) => ({
        name: c.name, business: c.business, email: c.email, phone: c.phone,
        website: c.website, service_type: c.service_type, package: c.package,
        stage: c.stage, notes: c.notes,
      })),
    );
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "clients.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const importCSV = (file: File) => {
    Papa.parse<any>(file, {
      header: true, skipEmptyLines: true,
      complete: async (res: any) => {
        let n = 0;
        for (const row of res.data as any[]) {
          if (!row.name) continue;
          await create.mutateAsync({
            name: row.name, business: row.business || null, email: row.email || null,
            phone: row.phone || null, website: row.website || null,
            service_type: row.service_type || null, package: row.package || null,
            stage: PIPELINE_STAGES.includes(row.stage) ? row.stage : "Lead",
            notes: row.notes || null,
          });
          n++;
        }
        toast.success(`Imported ${n} clients`);
      },
    });
  };

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle="Manage your client list, packages and CSV import/export"
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && importCSV(e.target.files[0])} />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-1" />Import</Button>
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-1" />Export</Button>
            <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New client</Button>
          </>
        }
      />
      <Card className="card-surface p-4 mb-4">
        <Input placeholder="Search clients…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </Card>
      <Card className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Business</th>
              <th className="p-3 font-medium">Package</th>
              <th className="p-3 font-medium">Stage</th>
              <th className="p-3 font-medium">Created</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No clients yet.</td></tr>
            ) : filtered.map((c) => (
              <tr key={c.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setDetail(c)}>
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3">{c.business || "—"}</td>
                <td className="p-3">{c.package || "—"}</td>
                <td className="p-3"><span className="rounded-md bg-accent/10 text-accent px-2 py-1 text-xs">{c.stage}</span></td>
                <td className="p-3 text-muted-foreground">{fmtDate(c.created_at)}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setEditing(c); setOpen(true); }}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); if (confirm("Delete client?")) remove.mutate(c.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ClientFormDialog
        open={open} onOpenChange={setOpen} editing={editing}
        onSave={async (vals: any) => {
          if (editing) await update.mutateAsync({ id: editing.id, patch: vals });
          else await create.mutateAsync(vals);
          setOpen(false);
          toast.success(editing ? "Client updated" : "Client created");
        }}
      />
      <ClientDetail client={detail} onClose={() => setDetail(null)} />
    </>
  );
}

function ClientFormDialog({ open, onOpenChange, editing, onSave }: any) {
  const [f, setF] = useState<any>(editing || { name: "", stage: "Lead" });
  const reset = () => setF(editing || { name: "", stage: "Lead" });
  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Edit client" : "New client"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name *</Label><Input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Business</Label><Input value={f.business || ""} onChange={(e) => setF({ ...f, business: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            <div><Label>Website</Label><Input value={f.website || ""} onChange={(e) => setF({ ...f, website: e.target.value })} /></div>
            <div><Label>Service</Label><Input value={f.service_type || ""} onChange={(e) => setF({ ...f, service_type: e.target.value })} /></div>
            <div>
              <Label>Package</Label>
              <Select value={f.package || ""} onValueChange={(v) => setF({ ...f, package: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{PACKAGES.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Stage</Label>
              <Select value={f.stage} onValueChange={(v) => setF({ ...f, stage: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PIPELINE_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Notes</Label><Textarea rows={4} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => f.name && onSave(f)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientDetail({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const summarize = useServerFn(summarizeNotes);
  const [summary, setSummary] = useState<string>("");
  const [busy, setBusy] = useState(false);
  if (!client) return null;
  const runSummary = async () => {
    if (!client.notes) { toast.info("No notes to summarise"); return; }
    setBusy(true);
    try { const r = await summarize({ data: { text: client.notes } }); setSummary(r.summary); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet open={!!client} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>{client.name}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Info label="Business" value={client.business} />
            <Info label="Email" value={client.email} />
            <Info label="Phone" value={client.phone} />
            <Info label="Website" value={client.website} />
            <Info label="Package" value={client.package} />
            <Info label="Stage" value={client.stage} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Notes</Label>
              <Button size="sm" variant="outline" disabled={busy} onClick={runSummary}>
                <Sparkles className="h-4 w-4 mr-1" />{busy ? "..." : "AI summary"}
              </Button>
            </div>
            <div className="rounded-md border p-3 mt-2 whitespace-pre-wrap min-h-[120px]">{client.notes || "—"}</div>
            {summary && (
              <div className="rounded-md bg-accent/10 border border-accent/30 p-3 mt-3 text-sm">
                <div className="font-medium mb-1 text-accent">Summary</div>{summary}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return <div><div className="text-[11px] uppercase text-muted-foreground">{label}</div><div>{value || "—"}</div></div>;
}
