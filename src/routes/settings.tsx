import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSettings } from "@/hooks/useSettings";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { requestDeletionCode, verifyAndClearDatabase } from "@/lib/deletion.functions";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";


const WEEKDAYS = [
  { d: 1, l: "Mon" }, { d: 2, l: "Tue" }, { d: 3, l: "Wed" },
  { d: 4, l: "Thu" }, { d: 5, l: "Fri" }, { d: 6, l: "Sat" }, { d: 0, l: "Sun" },
];

function SettingsView() {
  const { data, update, isLoading } = useSettings();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const clearDatabase = async () => {
    if (!user) return;
    setClearing(true);
    try {
      const tables = ["activity", "notes", "tasks", "invoices", "quotes", "proposals", "clients"] as const;
      for (const t of tables) {
        const { error } = await supabase.from(t).delete().eq("owner_id", user.id);
        if (error) throw error;
      }
      await qc.invalidateQueries();
      toast.success("All client data cleared");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setClearing(false);
    }
  };

  const signupLink = typeof window !== "undefined" ? `${window.location.origin}/auth?signup=1` : "/auth?signup=1";

  const save = async () => {
    try {
      await update.mutateAsync({
        company_name: form.company_name, company_email: form.company_email, company_website: form.company_website,
        vat_enabled: form.vat_enabled, invoice_prefix: form.invoice_prefix, services: form.services,
        office_hours_start: form.office_hours_start,
        office_hours_end: form.office_hours_end,
        office_days: form.office_days,
        office_timezone: form.office_timezone,
      });
      toast.success("Settings saved");
    } catch (e: any) { toast.error(e.message); }
  };


  const copy = async () => {
    await navigator.clipboard.writeText(signupLink);
    toast.success("Signup link copied");
  };

  const toggleDay = (d: number) => {
    const has = form.office_days.includes(d);
    setForm({ ...form, office_days: has ? form.office_days.filter((x: number) => x !== d) : [...form.office_days, d] });
  };

  return (
    <div className="space-y-6">
      <Card className="card-surface p-6 space-y-4">
        <h2 className="font-semibold">Company</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Name</Label><Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input value={form.company_email} onChange={(e) => setForm({ ...form, company_email: e.target.value })} /></div>
          <div><Label>Website</Label><Input value={form.company_website || ""} onChange={(e) => setForm({ ...form, company_website: e.target.value })} /></div>
          <div><Label>Invoice prefix</Label><Input value={form.invoice_prefix} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} /></div>
        </div>
        <div className="flex items-center gap-3"><Switch checked={form.vat_enabled} onCheckedChange={(v) => setForm({ ...form, vat_enabled: v })} /><Label>Apply 20% VAT by default</Label></div>
      </Card>

      <Card className="card-surface p-6 space-y-3">
        <h2 className="font-semibold">Account access</h2>
        <div className="flex gap-2">
          <Input readOnly value={signupLink} className="font-mono text-xs" />
          <Button variant="outline" onClick={copy}><Copy className="h-4 w-4 mr-1" />Copy</Button>
        </div>
      </Card>

      <Card className="card-surface p-6 space-y-4">
        <h2 className="font-semibold">Services & pricing</h2>
        {form.services.map((s: any, i: number) => (
          <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
            <Input value={s.name} onChange={(e) => { const x = [...form.services]; x[i] = { ...x[i], name: e.target.value }; setForm({ ...form, services: x }); }} />
            <Input type="number" value={s.price} onChange={(e) => { const x = [...form.services]; x[i] = { ...x[i], price: Number(e.target.value) }; setForm({ ...form, services: x }); }} />
            <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, services: form.services.filter((_: any, j: number) => j !== i) })}>Remove</Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setForm({ ...form, services: [...form.services, { name: "New", price: 0 }] })}>Add service</Button>
      </Card>


      <Card className="card-surface p-6 space-y-4">
        <h2 className="font-semibold">Office hours</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div><Label>Start</Label><Input type="time" value={form.office_hours_start} onChange={(e) => setForm({ ...form, office_hours_start: e.target.value })} /></div>
          <div><Label>End</Label><Input type="time" value={form.office_hours_end} onChange={(e) => setForm({ ...form, office_hours_end: e.target.value })} /></div>
          <div><Label>Timezone</Label><Input value={form.office_timezone} onChange={(e) => setForm({ ...form, office_timezone: e.target.value })} /></div>
        </div>
        <div>
          <Label>Working days</Label>
          <div className="flex gap-2 mt-2 flex-wrap">
            {WEEKDAYS.map(w => (
              <button key={w.d} type="button" onClick={() => toggleDay(w.d)}
                className={`px-3 py-1.5 rounded-md text-xs border ${form.office_days.includes(w.d) ? "bg-accent text-accent-foreground border-accent" : "bg-background border-border"}`}>
                {w.l}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="card-surface p-6 space-y-3 border-destructive/40">
        <h2 className="font-semibold text-destructive">Danger zone</h2>
        <p className="text-sm text-muted-foreground">
          Permanently delete all clients, invoices, quotes, proposals, tasks, notes, and activity. Your account and settings are kept. This cannot be undone.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={clearing}>
              <Trash2 className="h-4 w-4 mr-1" />{clearing ? "Clearing…" : "Clear database"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all client data?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes every client, invoice, quote, proposal, task, note, and activity entry on your account. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={clearDatabase} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Yes, delete everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      <div className="flex justify-end"><Button onClick={save} disabled={update.isPending}>Save changes</Button></div>
    </div>
  );
}


export const Route = createFileRoute("/settings")({
  component: () => (
    <AppShell>
      <PageHeader title="Settings" subtitle="Company, services, office hours" />
      <SettingsView />
    </AppShell>
  ),
});
