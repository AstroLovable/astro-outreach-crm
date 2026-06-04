import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/hooks/useAuth";
import { useClients } from "@/hooks/useClients";
import { useSettings } from "@/hooks/useSettings";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Download, Trash2, ArrowRight, Check } from "lucide-react";
import { gbp, fmtDate } from "@/lib/format";
import { downloadDocPDF } from "@/lib/pdf";

type Kind = "quote" | "invoice";
type LineItem = { description: string; qty: number; unit_price: number };

const PACKAGE_PRESETS: Record<string, { items: LineItem[] }> = {
  Launch: { items: [
    { description: "Launch package — 1-page site, branded design, mobile-optimised", qty: 1, unit_price: 299 },
  ]},
  Standard: { items: [
    { description: "Standard package — up to 5 pages, CMS-ready, contact form", qty: 1, unit_price: 399 },
  ]},
  Pro: { items: [
    { description: "Pro package — up to 10 pages, bespoke design, SEO setup", qty: 1, unit_price: 699 },
  ]},
  Custom: { items: [] },
};

export const Route = createFileRoute("/billing")({
  component: () => (
    <AppShell>
      <PageHeader title="Quotes & Invoices" subtitle="Line items, VAT, auto-numbering, branded PDFs" />
      <BillingView />
    </AppShell>
  ),
});

function BillingView() {
  return (
    <Tabs defaultValue="invoices">
      <TabsList>
        <TabsTrigger value="invoices">Invoices</TabsTrigger>
        <TabsTrigger value="quotes">Quotes</TabsTrigger>
      </TabsList>
      <TabsContent value="invoices"><DocsList kind="invoice" /></TabsContent>
      <TabsContent value="quotes"><DocsList kind="quote" /></TabsContent>
    </Tabs>
  );
}

function DocsList({ kind }: { kind: Kind }) {
  const { user } = useAuth();
  const { data: clients = [] } = useClients();
  const { data: settings } = useSettings();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const list = useQuery({
    queryKey: [kind + "s", user?.id], enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from(kind === "invoice" ? "invoices" : "quotes")
        .select("*").eq("owner_id", user!.id).order("created_at", { ascending: false });
      return data || [];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => { await supabase.from(kind === "invoice" ? "invoices" : "quotes").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: [kind + "s"] }),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("invoices").update({ status: "Paid", paid_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const convertToInvoice = useMutation({
    mutationFn: async (q: any) => {
      if (!settings) throw new Error("Settings loading");
      const number = `${settings.invoice_prefix}-${String(settings.next_invoice_number).padStart(4, "0")}`;
      const { data, error } = await supabase.from("invoices").insert({
        owner_id: user!.id, client_id: q.client_id, number, issue_date: new Date().toISOString().slice(0, 10),
        line_items: q.line_items, subtotal: q.subtotal, vat: q.vat, vat_amount: q.vat_amount, total: q.total,
        notes: q.notes, status: "Sent",
      }).select().single();
      if (error) throw error;
      await supabase.from("settings").update({ next_invoice_number: settings.next_invoice_number + 1 }).eq("owner_id", user!.id);
      await supabase.from("quotes").update({ status: "Converted" }).eq("id", q.id);
      await supabase.from("activity").insert({ owner_id: user!.id, type: "invoice", description: `Created invoice ${number}`, ref_id: data.id });
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quotes"] }); qc.invalidateQueries({ queryKey: ["invoices"] }); qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Converted to invoice"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <div className="flex justify-end mb-4 mt-4">
        <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New {kind}</Button>
      </div>
      <Card className="card-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="p-3 font-medium">Number</th>
              <th className="p-3 font-medium">Client</th>
              <th className="p-3 font-medium">Issued</th>
              <th className="p-3 font-medium">Total</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {(list.data || []).length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No {kind}s yet.</td></tr>
            ) : (list.data || []).map((d: any) => {
              const client = clients.find((c) => c.id === d.client_id);
              return (
                <tr key={d.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => { setEditing(d); setOpen(true); }}>
                  <td className="p-3 font-medium">{d.number || "—"}</td>
                  <td className="p-3">{client?.name || "—"}</td>
                  <td className="p-3 text-muted-foreground">{fmtDate(d.issue_date)}</td>
                  <td className="p-3">{gbp(d.total)}</td>
                  <td className="p-3"><span className="rounded-md bg-accent/10 text-accent px-2 py-1 text-xs">{d.status}</span></td>
                  <td className="p-3 text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                    {kind === "quote" && d.status !== "Converted" && (
                      <Button size="sm" variant="ghost" title="Convert to invoice" onClick={() => convertToInvoice.mutate(d)}><ArrowRight className="h-4 w-4" /></Button>
                    )}
                    {kind === "invoice" && d.status !== "Paid" && (
                      <Button size="sm" variant="ghost" title="Mark paid" onClick={() => markPaid.mutate(d.id)}><Check className="h-4 w-4" /></Button>
                    )}
                    <Button size="sm" variant="ghost" title="PDF" onClick={() => {
                      downloadDocPDF({
                        kind: kind === "invoice" ? "Invoice" : "Quote",
                        doc: d, client: client || null,
                        company: settings || ({ company_name: "AstroLabs & Co.", company_email: "" } as any),
                      });
                    }}><Download className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete?")) remove.mutate(d.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <DocEditor kind={kind} open={open} onOpenChange={setOpen} editing={editing} clients={clients}
        onSaved={() => qc.invalidateQueries({ queryKey: [kind + "s"] })} />
    </>
  );
}

function DocEditor({ kind, open, onOpenChange, editing, clients, onSaved }: any) {
  const { user } = useAuth();
  const { data: settings } = useSettings();
  const [f, setF] = useState<any>(initial);
  const wasOpen = useRef(false);

  function initial() {
    return editing || {
      client_id: "", issue_date: new Date().toISOString().slice(0, 10),
      due_date: "", line_items: [{ description: "", qty: 1, unit_price: 0 }] as LineItem[],
      vat: settings?.vat_enabled ?? true, notes: "", status: kind === "invoice" ? "Draft" : "Draft", number: editing?.number || "",
      package: "", job_reference: "", deposit_split: false,
    };
  }
  useEffect(() => { if (open && !wasOpen.current) setF(initial()); wasOpen.current = open; }, [open, editing, settings]);

  const applyPackage = (pkg: string) => {
    const preset = PACKAGE_PRESETS[pkg];
    if (!preset) { setF({ ...f, package: pkg }); return; }
    const presetDescriptions = new Set(
      Object.values(PACKAGE_PRESETS).flatMap((p) => p.items.map((i) => i.description)),
    );
    const customLines = (f.line_items || []).filter(
      (li: LineItem) => !presetDescriptions.has(li.description),
    );
    setF({ ...f, package: pkg, line_items: [...preset.items, ...customLines] });
  };

  const subtotal = (f.line_items || []).reduce((s: number, li: LineItem) => s + (Number(li.qty) || 0) * (Number(li.unit_price) || 0), 0);
  const vat_amount = f.vat ? subtotal * 0.2 : 0;
  const total = subtotal + vat_amount;

  const save = async () => {
    let number = f.number;
    const table = kind === "invoice" ? "invoices" : "quotes";
    if (kind === "invoice" && !number && settings) {
      number = `${settings.invoice_prefix}-${String(settings.next_invoice_number).padStart(4, "0")}`;
    }
    const payload: any = {
      owner_id: user!.id, client_id: f.client_id || null,
      issue_date: f.issue_date, due_date: f.due_date || null,
      line_items: f.line_items, subtotal, vat: f.vat, vat_amount, total,
      notes: f.notes || null, status: f.status, number: number || null,
    };
    if (kind === "invoice") {
      payload.job_reference = f.job_reference || null;
      payload.deposit_part = f.deposit_split ? total / 2 : null;
    }
    if (editing) {
      const { error } = await supabase.from(table).update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error, data } = await supabase.from(table).insert(payload).select().single();
      if (error) return toast.error(error.message);
      if (kind === "invoice" && settings && !editing) {
        await supabase.from("settings").update({ next_invoice_number: settings.next_invoice_number + 1 }).eq("owner_id", user!.id);
      }
      await supabase.from("activity").insert({ owner_id: user!.id, type: kind, description: `Created ${kind} ${data.number || ""}`, ref_id: data.id });
    }
    toast.success("Saved");
    onSaved(); onOpenChange(false);
  };

  const setLi = (i: number, patch: Partial<LineItem>) => {
    const x = [...f.line_items]; x[i] = { ...x[i], ...patch }; setF({ ...f, line_items: x });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader><SheetTitle>{editing ? `Edit ${kind}` : `New ${kind}`}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          <div>
            <Label>Package</Label>
            <Select value={f.package || ""} onValueChange={applyPackage}>
              <SelectTrigger><SelectValue placeholder="Choose a package (auto-fills line items)" /></SelectTrigger>
              <SelectContent>
                {Object.keys(PACKAGE_PRESETS).map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Client</Label>
              <Select value={f.client_id || ""} onValueChange={(v) => setF({ ...f, client_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {kind === "invoice"
                    ? ["Draft", "Sent", "Paid", "Overdue"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)
                    : ["Draft", "Sent", "Accepted", "Declined", "Converted"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Issue date</Label><Input type="date" value={f.issue_date} onChange={(e) => setF({ ...f, issue_date: e.target.value })} /></div>
            <div><Label>Due date</Label><Input type="date" value={f.due_date || ""} onChange={(e) => setF({ ...f, due_date: e.target.value })} /></div>
            {kind === "invoice" && (
              <div className="col-span-2"><Label>Job reference</Label><Input value={f.job_reference || ""} onChange={(e) => setF({ ...f, job_reference: e.target.value })} placeholder="Optional project / job ref" /></div>
            )}
          </div>


          <div>
            <Label>Line items</Label>
            <div className="space-y-2 mt-1">
              {(f.line_items || []).map((li: LineItem, i: number) => (
                <div key={i} className="grid grid-cols-[1fr_80px_120px_120px_auto] gap-2 items-center">
                  <Input placeholder="Description" value={li.description} onChange={(e) => setLi(i, { description: e.target.value })} />
                  <Input type="number" value={li.qty} onChange={(e) => setLi(i, { qty: Number(e.target.value) })} />
                  <Input type="number" step="0.01" value={li.unit_price} onChange={(e) => setLi(i, { unit_price: Number(e.target.value) })} />
                  <div className="text-sm text-right">{gbp((li.qty || 0) * (li.unit_price || 0))}</div>
                  <Button size="sm" variant="ghost" onClick={() => setF({ ...f, line_items: f.line_items.filter((_: any, j: number) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setF({ ...f, line_items: [...f.line_items, { description: "", qty: 1, unit_price: 0 }] })}><Plus className="h-4 w-4 mr-1" />Add line</Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2"><Switch checked={f.vat} onCheckedChange={(v) => setF({ ...f, vat: v })} /><Label>Apply 20% VAT</Label></div>
            {kind === "invoice" && (
              <div className="flex items-center gap-2"><Switch checked={!!f.deposit_split} onCheckedChange={(v) => setF({ ...f, deposit_split: v })} /><Label>50% deposit invoice</Label></div>
            )}
          </div>

          <div className="ml-auto w-64 text-sm space-y-1">
            <div className="flex justify-between"><span>Subtotal</span><span>{gbp(subtotal)}</span></div>
            {f.vat && <div className="flex justify-between"><span>VAT (20%)</span><span>{gbp(vat_amount)}</span></div>}
            <div className="flex justify-between font-semibold text-base border-t pt-1"><span>Total</span><span>{gbp(total)}</span></div>
            {kind === "invoice" && f.deposit_split && (
              <div className="flex justify-between text-accent"><span>Deposit due now (50%)</span><span>{gbp(total / 2)}</span></div>
            )}
          </div>

          <div><Label>Notes</Label><Textarea rows={3} value={f.notes || ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
