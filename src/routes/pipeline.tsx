import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { useClients, type Client } from "@/hooks/useClients";
import { PIPELINE_STAGES, daysSince } from "@/lib/format";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent, useDroppable, useDraggable,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/pipeline")({
  component: () => (
    <AppShell>
      <PageHeader title="Pipeline" subtitle="Drag clients across stages" />
      <PipelineBoard />
    </AppShell>
  ),
});

function PipelineBoard() {
  const { data: clients = [], update } = useClients();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const grouped = useMemo(() => {
    const m: Record<string, Client[]> = {};
    PIPELINE_STAGES.forEach((s) => (m[s] = []));
    clients.forEach((c) => { (m[c.stage] || (m[c.stage] = [])).push(c); });
    return m;
  }, [clients]);

  const active = clients.find((c) => c.id === activeId) || null;

  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const id = e.active.id as string;
    const newStage = e.over?.id as string | undefined;
    const c = clients.find((x) => x.id === id);
    if (newStage && c && PIPELINE_STAGES.includes(newStage as any) && c.stage !== newStage) {
      update.mutate({ id, patch: { stage: newStage } });
    }
  };

  const saveNote = (id: string, note: string) => {
    update.mutate({ id, patch: { status_note: note } as any });
  };

  return (
    <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)} onDragEnd={onDragEnd}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {PIPELINE_STAGES.map((stage) => (
          <Column key={stage} stage={stage} clients={grouped[stage] || []} onSaveNote={saveNote} />
        ))}
      </div>
      <DragOverlay>{active && <ClientCard client={active} dragging />}</DragOverlay>
    </DndContext>
  );
}

function Column({ stage, clients, onSaveNote }: { stage: string; clients: Client[]; onSaveNote: (id: string, n: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <Card ref={setNodeRef as any} className={`card-surface p-3 min-h-[300px] transition-colors ${isOver ? "ring-2 ring-accent" : ""}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium">{stage}</div>
        <div className="text-xs text-muted-foreground">{clients.length}</div>
      </div>
      <div className="space-y-2">
        {clients.map((c) => <Draggable key={c.id} client={c} onSaveNote={onSaveNote} />)}
      </div>
    </Card>
  );
}

function Draggable({ client, onSaveNote }: { client: Client; onSaveNote: (id: string, n: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: client.id });
  return (
    <div ref={setNodeRef} className={isDragging ? "opacity-30" : ""}>
      <ClientCard client={client} dragHandle={{ ...listeners, ...attributes }} onSaveNote={onSaveNote} />
    </div>
  );
}

function ClientCard({
  client, dragging, dragHandle, onSaveNote,
}: { client: Client; dragging?: boolean; dragHandle?: any; onSaveNote?: (id: string, n: string) => void }) {
  const stale = daysSince(client.stage_changed_at) >= 14;
  const [note, setNote] = useState((client as any).status_note || "");
  const [editing, setEditing] = useState(false);

  return (
    <div className={`rounded-md border bg-background p-3 ${dragging ? "shadow-lg" : ""}`}>
      <div {...(dragHandle || {})} className="cursor-grab active:cursor-grabbing">
        <div className="text-sm font-medium">{client.name}</div>
        {client.business && <div className="text-xs text-muted-foreground">{client.business}</div>}
      </div>
      {onSaveNote && (
        editing ? (
          <Input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => { setEditing(false); if (note !== (client as any).status_note) onSaveNote(client.id, note); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
            className="mt-1 h-7 text-xs"
            placeholder="Status note…"
          />
        ) : (
          <div onClick={() => setEditing(true)}
               className="mt-1 text-[11px] text-muted-foreground italic cursor-text min-h-[16px]">
            {note || "+ add note"}
          </div>
        )
      )}
      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
        <span>{client.package || "—"}</span>
        <span className={stale ? "text-destructive" : ""}>{daysSince(client.stage_changed_at)}d</span>
      </div>
    </div>
  );
}
