export const gbp = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    Number(n ?? 0),
  );

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

export const daysSince = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = Date.now() - date.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

export const PIPELINE_STAGES = [
  "Lead",
  "Quoted",
  "In Progress",
  "Review",
  "Completed",
  "Retained",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const PACKAGES = [
  { name: "Launch", price: 299 },
  { name: "Standard", price: 399 },
  { name: "Pro", price: 699 },
  { name: "Custom", price: 0 },
];
