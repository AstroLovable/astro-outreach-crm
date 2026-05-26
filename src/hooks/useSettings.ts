import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase-client";
import { useAuth } from "@/hooks/useAuth";

export interface Settings {
  id: string;
  owner_id: string;
  company_name: string;
  company_email: string;
  company_website: string | null;
  vat_enabled: boolean;
  invoice_prefix: string;
  next_invoice_number: number;
  services: { name: string; price: number }[];
  chatbot_system_prompt: string;
  notify_new_chat: boolean;
  idle_close_hours: number;
  greeting_delay_seconds: number;
  notification_sound: boolean;
  office_hours_start: string;
  office_hours_end: string;
  office_days: number[];
  office_timezone: string;
}

export function useSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["settings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings").select("*").eq("owner_id", user!.id).maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: created, error: ce } = await supabase
          .from("settings").insert({ owner_id: user!.id }).select().single();
        if (ce) throw ce;
        return created as unknown as Settings;
      }
      return data as unknown as Settings;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const { data, error } = await supabase
        .from("settings").update(patch).eq("owner_id", user!.id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });

  return { ...query, update };
}

export async function logActivity(userId: string, type: string, description: string, ref?: string) {
  await supabase.from("activity").insert({ owner_id: userId, type, description, ref_id: ref ?? null });
}
