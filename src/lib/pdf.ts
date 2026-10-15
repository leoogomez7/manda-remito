import {
  BUSINESS,
  CURRENCY_SYMBOL,
  PAYMENT_LABEL,
  formatMoney,
  type Invoice,
} from "./invoices";
import logoUrl from "@/assets/logo.png?url";

const CYAN = "#00E5FF";
const FUCHSIA = "#FF00D4";
const DARK = "#0B0B0F";
const LIGHT = "#F5F7FA";
const MUTED = "#9CA3AF";

// Volvemos la función asíncrona para inyectar dinámicamente las librerías
async function loadImageDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function loadLogo(url: string): Promise<{ dataUrl: string; width: number; height: number }> {
  const dataUrl = await loadImageDataUrl(url);
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ dataUrl, width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function formatDateOrRaw(value: string) {
  const date = new Date(value);
  return value && !isNaN(date.getTime()) ? date.toLocaleDateString("es-AR") : value || "—";
}

export async function generateInvoicePdf(invoice: Invoice) {
  // 🚀 CARGA BAJO DEMANDA: Se descargan solo cuando se ejecuta la función
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const headerHeight = 150;

  // Dark header band
  doc.setFillColor(DARK);
  doc.rect(0, 0, pageW, headerHeight, "F");

  // Neon gradient strip
  doc.setFillColor(CYAN);
  doc.rect(0, headerHeight - 2, pageW / 2, 3, "F");
  doc.setFillColor(FUCHSIA);
  doc.rect(pageW / 2, headerHeight - 2, pageW / 2, 3, "F");

  // Logo in header, centered at top
  const logoTop = 18;
  let logoHeight = 0;
  let logoWidth = 0;

  try {
    const logo = await loadLogo(logoUrl);
    const maxLogoWidth = 180;
    const maxLogoHeight = 70;
    const scale = Math.min(maxLogoWidth / logo.width, maxLogoHeight / logo.height, 1);
    logoWidth = logo.width * scale;
    logoHeight = logo.height * scale;
    doc.addImage(logo.dataUrl, "PNG", pageW / 2 - logoWidth / 2, logoTop, logoWidth, logoHeight);
  } catch (error) {
    console.warn("No se pudo cargar el logo en el PDF", error);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(LIGHT);
    const text = BUSINESS.brand.toUpperCase();
    const textWidth = doc.getTextWidth(text);
    logoWidth = textWidth;
    logoHeight = 24;
    doc.text(text, pageW / 2 - textWidth / 2, logoTop + 16);
  }

  const textTop = logoTop + logoHeight + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(LIGHT);
  doc.text(BUSINESS.name, 40, textTop);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(`${BUSINESS.role} • ${BUSINESS.location}`, 40, textTop + 14);
  doc.text(`${BUSINESS.email} • ${BUSINESS.phone}`, 40, textTop + 28);

  // Document title and invoice details on the right
  doc.setTextColor(CYAN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("REMITO", pageW - 40, textTop, { align: "right" });

  doc.setTextColor(LIGHT);
  doc.setFontSize(12);
  doc.text(invoice.number, pageW - 40, textTop + 18, { align: "right" });

  doc.setTextColor(MUTED);
  doc.setFontSize(9);
  doc.text(`Emitido: ${formatDateOrRaw(invoice.createdAt)}`, pageW - 40, textTop + 32, {
    align: "right",
  });
  doc.text(`Entrega: ${formatDateOrRaw(invoice.deliveryDate)}`, pageW - 40, textTop + 46, {
    align: "right",
  });

  const clientTop = headerHeight + 18;

  // Client block
  let y = clientTop;
  doc.setTextColor(DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("CLIENTE", 40, y);
  doc.setDrawColor(CYAN);
  doc.setLineWidth(0.8);
  doc.line(40, y + 4, 110, y + 4);

  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#222");
  doc.text(invoice.client.name || "—", 40, y);
  y += 14;
  doc.setTextColor("#555");
  doc.setFontSize(9);
  if (invoice.client.cuit) doc.text(`CUIT: ${invoice.client.cuit}`, 40, y), (y += 12);
  if (invoice.client.address)
    doc.text(`${invoice.client.address}${invoice.client.zip ? " — CP " + invoice.client.zip : ""}`, 40, y),
      (y += 12);
  if (invoice.client.email) doc.text(invoice.client.email, 40, y), (y += 12);
  if (invoice.client.phone) doc.text(`Tel: ${invoice.client.phone}`, 40, y), (y += 12);

  // Payment & currency right side
  const paymentTop = clientTop;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(DARK);
  doc.text("PAGO", pageW - 40, paymentTop, { align: "right" });
  doc.setDrawColor(FUCHSIA);
  doc.line(pageW - 90, paymentTop + 4, pageW - 40, paymentTop + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#222");
  doc.text(PAYMENT_LABEL[invoice.paymentMethod], pageW - 40, paymentTop + 18, { align: "right" });
  doc.setTextColor("#555");
  doc.setFontSize(9);
  doc.text(`Moneda: ${invoice.currency} (${CURRENCY_SYMBOL[invoice.currency]})`, pageW - 40, paymentTop + 30, {
    align: "right",
  });

  // Items table
  const tableStartY = Math.max(y + 10, paymentTop + 48);
  autoTable(doc, {
    startY: tableStartY,
    head: [["Cant.", "Descripción", "P. Unitario", "Total"]],
    body: invoice.items.map((it) => [
      String(it.quantity),
      it.description,
      formatMoney(it.unitPrice, invoice.currency),
      formatMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), invoice.currency),
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 10, cellPadding: 8, textColor: "#222" },
    headStyles: {
      fillColor: DARK,
      textColor: CYAN,
      fontStyle: "bold",
      lineColor: CYAN,
    },
    alternateRowStyles: { fillColor: "#F7F8FB" },
    columnStyles: {
      0: { halign: "center", cellWidth: 50 },
      2: { halign: "right", cellWidth: 100 },
      3: { halign: "right", cellWidth: 100 },
    },
    margin: { left: 40, right: 40 },
  });

  // Totals box
  // @ts-expect-error injected by autotable
  const afterTableY: number = doc.lastAutoTable.finalY + 20;
  const boxX = pageW - 280;
  const boxW = 240;
  doc.setFillColor("#0F1218");
  doc.roundedRect(boxX, afterTableY, boxW, 110, 8, 8, "F");
  doc.setDrawColor(CYAN);
  doc.setLineWidth(0.6);
  doc.roundedRect(boxX, afterTableY, boxW, 110, 8, 8, "S");

  const labelX = boxX + 16;
  const valueX = boxX + boxW - 16;
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text("Subtotal", labelX, afterTableY + 24);
  doc.text("Seña", labelX, afterTableY + 44);
  doc.text("Debe", labelX, afterTableY + 88);

  doc.setTextColor(LIGHT);
  doc.setFont("helvetica", "normal");
  doc.text(formatMoney(invoice.subtotal, invoice.currency), valueX, afterTableY + 24, { align: "right" });
  doc.text(formatMoney(invoice.deposit, invoice.currency), valueX, afterTableY + 44, { align: "right" });

  doc.setDrawColor(FUCHSIA);
  doc.line(labelX, afterTableY + 58, valueX, afterTableY + 58);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(CYAN);
  doc.text("Total", labelX, afterTableY + 76);
  doc.text(formatMoney(invoice.total, invoice.currency), valueX, afterTableY + 76, { align: "right" });

  doc.setFontSize(11);
  doc.setTextColor(FUCHSIA);
  doc.text(formatMoney(invoice.balance, invoice.currency), valueX, afterTableY + 88, { align: "right" });

  // Notes
  if (invoice.notes?.trim()) {
    const notesY = afterTableY + 140;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(DARK);
    doc.text("OBSERVACIONES", 40, notesY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#444");
    const split = doc.splitTextToSize(invoice.notes, pageW - 80);
    doc.text(split, 40, notesY + 16);
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(MUTED);
  doc.text(
    `${BUSINESS.brand} • Remito generado con ${BUSINESS.brand}`,
    pageW / 2,
    pageH - 24,
    { align: "center" },
  );

  return doc;
}

export async function downloadInvoicePdf(invoice: Invoice) {
  const doc = await generateInvoicePdf(invoice);
  const fileName = `${invoice.number}-${invoice.client.name || "cliente"}.pdf`;

  try {
    doc.save(fileName);
  } catch (error) {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

export async function printInvoicePdf(invoice: Invoice) {
  const doc = await generateInvoicePdf(invoice);
  const url = doc.output("bloburl");
  window.open(url, "_blank");
}
