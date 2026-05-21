import { jsPDF } from "jspdf";
import { gbp, fmtDate } from "@/lib/format";

interface Company {
  company_name: string;
  company_email: string;
  company_website?: string | null;
}

interface LineItem {
  description: string;
  qty: number;
  unit_price: number;
}

interface InvoiceLike {
  number?: string | null;
  issue_date: string;
  due_date?: string | null;
  line_items: LineItem[];
  subtotal: number;
  vat: boolean;
  vat_amount: number;
  total: number;
  notes?: string | null;
  status?: string;
}

const NAVY = "#2E3A59";

export function downloadDocPDF(opts: {
  kind: "Quote" | "Invoice";
  doc: InvoiceLike;
  client?: { name: string; business?: string | null; email?: string | null } | null;
  company: Company;
  filename?: string;
}) {
  const { kind, doc, client, company } = opts;
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  let y = 48;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(NAVY);
  pdf.text(company.company_name || "AstroLabs & Co.", 48, y);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor("#555");
  if (company.company_email) pdf.text(company.company_email, 48, y + 16);
  if (company.company_website) pdf.text(company.company_website, 48, y + 30);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(NAVY);
  pdf.text(kind.toUpperCase(), W - 48, y, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor("#555");
  if (doc.number) pdf.text(`No. ${doc.number}`, W - 48, y + 16, { align: "right" });
  pdf.text(`Issued: ${fmtDate(doc.issue_date)}`, W - 48, y + 30, { align: "right" });
  if (doc.due_date) pdf.text(`Due: ${fmtDate(doc.due_date)}`, W - 48, y + 44, { align: "right" });
  if (doc.status) pdf.text(`Status: ${doc.status}`, W - 48, y + 58, { align: "right" });

  y += 90;
  pdf.setDrawColor(220);
  pdf.line(48, y, W - 48, y);
  y += 20;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.setTextColor(NAVY);
  pdf.text("Billed to", 48, y);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor("#222");
  if (client) {
    pdf.text(client.name, 48, y + 14);
    if (client.business) pdf.text(client.business, 48, y + 28);
    if (client.email) pdf.text(client.email, 48, y + 42);
  } else {
    pdf.text("—", 48, y + 14);
  }

  y += 64;
  // table header
  pdf.setFillColor("#EEF0F5");
  pdf.rect(48, y, W - 96, 22, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(NAVY);
  pdf.text("Description", 56, y + 15);
  pdf.text("Qty", W - 260, y + 15);
  pdf.text("Unit", W - 200, y + 15);
  pdf.text("Total", W - 56, y + 15, { align: "right" });
  y += 30;

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor("#222");
  for (const li of doc.line_items || []) {
    const lineTotal = (li.qty || 0) * (li.unit_price || 0);
    const desc = pdf.splitTextToSize(li.description || "", W - 320);
    pdf.text(desc, 56, y);
    pdf.text(String(li.qty), W - 260, y);
    pdf.text(gbp(li.unit_price), W - 200, y);
    pdf.text(gbp(lineTotal), W - 56, y, { align: "right" });
    y += Math.max(16, desc.length * 14);
    if (y > 700) {
      pdf.addPage();
      y = 60;
    }
  }

  y += 12;
  pdf.setDrawColor(220);
  pdf.line(W - 240, y, W - 48, y);
  y += 16;
  pdf.text("Subtotal", W - 240, y);
  pdf.text(gbp(doc.subtotal), W - 56, y, { align: "right" });
  y += 16;
  if (doc.vat) {
    pdf.text("VAT (20%)", W - 240, y);
    pdf.text(gbp(doc.vat_amount), W - 56, y, { align: "right" });
    y += 16;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(NAVY);
  pdf.text("Total", W - 240, y);
  pdf.text(gbp(doc.total), W - 56, y, { align: "right" });

  if (doc.notes) {
    y += 36;
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(NAVY);
    pdf.text("Notes", 48, y);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor("#222");
    y += 14;
    const notes = pdf.splitTextToSize(doc.notes, W - 96);
    pdf.text(notes, 48, y);
  }

  pdf.save(opts.filename || `${kind}-${doc.number || "draft"}.pdf`);
}

export function downloadProposalPDF(opts: {
  title: string;
  content: string;
  clientName?: string;
  company: Company;
}) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  let y = 56;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(NAVY);
  pdf.text(opts.company.company_name || "AstroLabs & Co.", 48, y);
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor("#555");
  if (opts.company.company_email) pdf.text(opts.company.company_email, 48, y + 16);

  y += 56;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(NAVY);
  pdf.text(opts.title, 48, y);
  if (opts.clientName) {
    y += 18;
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor("#555");
    pdf.text(`Prepared for ${opts.clientName}`, 48, y);
  }

  y += 30;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor("#222");
  const lines = pdf.splitTextToSize(opts.content || "", W - 96);
  for (const line of lines) {
    if (y > H - 64) {
      pdf.addPage();
      y = 56;
    }
    pdf.text(line, 48, y);
    y += 16;
  }

  pdf.save(`${opts.title.replace(/[^a-z0-9]+/gi, "-")}.pdf`);
}
