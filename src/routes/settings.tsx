import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useSettings } from "@/hooks/useSettings";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";

function SettingsView() {
  const { data, update, isLoading } = useSettings();
  const [form, setForm] = useState<any>(null);

  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);

  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const save = async () => {
    try {
      await update.mutateAsync({
        company_name: form.company_name,
        company_email: form.company_email,
        company_website: form.company_website,
        vat_enabled: form.vat_enabled,
        invoice_prefix: form.invoice_prefix,
        services: form.services,
        chatbot_system_prompt: form.chatbot_system_prompt,
        notify_new_chat: form.notify_new_chat,
      });
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
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
        <h2 className="font-semibold">Chatbot</h2>
        <div><Label>System prompt</Label><Textarea rows={4} value={form.chatbot_system_prompt} onChange={(e) => setForm({ ...form, chatbot_system_prompt: e.target.value })} /></div>
        <div className="flex items-center gap-3"><Switch checked={form.notify_new_chat} onCheckedChange={(v) => setForm({ ...form, notify_new_chat: v })} /><Label>Email me on new human-handoff requests</Label></div>
      </Card>

      <div className="flex justify-end"><Button onClick={save} disabled={update.isPending}>Save changes</Button></div>
    </div>
  );
}

export const Route = createFileRoute("/settings")({
  component: () => (
    <AppShell>
      <PageHeader title="Settings" subtitle="Company, services, chatbot prompt and notifications" />
      <SettingsView />
    </AppShell>
  ),
});
