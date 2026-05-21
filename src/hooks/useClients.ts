import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Client {
  id: string;
  owner_id: string;
  name: string;
  business: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  service_type: string | null;
  package: string | null;
  stage: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  stage_changed_at: string;
}

export function useClients() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["clients", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("owner_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as Client[];
    },
  });

  const create = useMutation({
    mutationFn: async (c: Partial<Client>) => {
      const { data, error } = await supabase
        .from("clients")
        .insert({ ...c, owner_id: user!.id, name: c.name || "Unnamed" })
        .select()
        .single();
      if (error) throw error;
      await supabase.from("activity").insert({
        owner_id: user!.id, type: "client", description: `Added client ${data.name}`, ref_id: data.id,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Client> }) => {
      if (patch.stage) (patch as any).stage_changed_at = new Date().toISOString();
      const { data, error } = await supabase.from("clients").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });

  return { ...list, create, update, remove };
}
