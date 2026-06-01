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
import { Copy } from "lucide-react";

const WEEKDAYS = [
  { d: 1, l: "Mon" }, { d: 2, l: "Tue" }, { d: 3, l: "Wed" },
  { d: 4, l: "Thu" }, { d: 5, l: "Fri" }, { d: 6, l: "Sat" }, { d: 0, l: "Sun" },
];

function SettingsView() {
  const { data, update, isLoading } = useSettings();
  const [form, setForm] = useState<any>(null);

  useEffect(() => { if (data && !form) setForm(data); }, [data, form]);
  if (isLoading || !form) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const signupLink = typeof window !== "undefined" ? `${window.location.origin}/auth?signup=1` : "/auth?signup=1";

  const save = async () => {
    try {
      await update.mutateAsync({
        company_name: form.company_name, company_email: form.company_email, company_website: form.company_website,
        vat_enabled: form.vat_enabled, invoice_prefix: form.invoice_prefix, services: form.services,
        chatbot_system_prompt: form.chatbot_system_prompt, notify_new_chat: form.notify_new_chat,
        idle_close_hours: Number(form.idle_close_hours) || 24,
        greeting_delay_seconds: Number(form.greeting_delay_seconds) || 60,
        notification_sound: form.notification_sound,
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

      <Card className="card-surface p-6 space-y-5">
        <h2 className="font-semibold">Chatbot</h2>
        <div className="space-y-2">
          <Label>System prompt</Label>
          <Textarea rows={4} value={form.chatbot_system_prompt} onChange={(e) => setForm({ ...form, chatbot_system_prompt: e.target.value })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Pre-chat greeting delay (seconds)</Label>
            <Input type="number" value={form.greeting_delay_seconds} onChange={(e) => setForm({ ...form, greeting_delay_seconds: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Auto-close idle chats after (hours)</Label>
            <Input type="number" value={form.idle_close_hours} onChange={(e) => setForm({ ...form, idle_close_hours: e.target.value })} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t">
          <div className="flex items-center justify-between gap-3">
            <Label className="font-normal">Play sound on new chat</Label>
            <Switch checked={form.notification_sound} onCheckedChange={(v) => setForm({ ...form, notification_sound: v })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="font-normal">Email me on human-handoff requests</Label>
            <Switch checked={form.notify_new_chat} onCheckedChange={(v) => setForm({ ...form, notify_new_chat: v })} />
          </div>
        </div>
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

      <div className="flex justify-end"><Button onClick={save} disabled={update.isPending}>Save changes</Button></div>

      <EmbedSnippet businessName={form.company_name} greetingDelay={form.greeting_delay_seconds} />
    </div>
  );
}

function EmbedSnippet({ businessName, greetingDelay }: { businessName: string; greetingDelay: number }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-crm.lovable.app";
  const snippet = `<!-- AstroLabs & Co. CRM chat widget -->
<script
  src="${origin}/api/public/widget"
  data-base="${origin}"
  data-business="${(businessName || "").replace(/"/g, "&quot;")}"
  data-title="Chat with us"
  data-color="#4A6FA5"
  data-greeting-delay="${greetingDelay}"
  defer
></script>`;
  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    toast.success("Embed code copied");
  };
  return (
    <Card className="card-surface p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Website chat embed</h2>
          <p className="text-sm text-muted-foreground">Paste before <code>&lt;/body&gt;</code> on any site.</p>
        </div>
        <Button variant="outline" size="sm" onClick={copy}><Copy className="h-4 w-4 mr-1" />Copy</Button>
      </div>
      <Textarea readOnly rows={10} value={snippet} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
    </Card>
  );
}

export const Route = createFileRoute("/settings")({
  component: () => (
    <AppShell>
      <PageHeader title="Settings" subtitle="Company, chatbot, office hours and notifications" />
      <SettingsView />
    </AppShell>
  ),
});
