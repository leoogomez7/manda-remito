import {
  BUSINESS,
  CURRENCY_SYMBOL,
  PAYMENT_LABEL,
  formatMoney,
  type Invoice,
} from "./invoices";

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
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("es-AR");
  }

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
  let logoHeight = 70;

  if (invoice.logoDataUrl) {
    try {
      const logo = await loadLogo(invoice.logoDataUrl);
      const maxLogoWidth = 180;
      const maxLogoHeight = 70;
      const scale = Math.min(maxLogoWidth / logo.width, maxLogoHeight / logo.height, 1);
      const logoWidth = logo.width * scale;
      logoHeight = logo.height * scale;
      doc.addImage(logo.dataUrl, "PNG", pageW / 2 - logoWidth / 2, logoTop, logoWidth, logoHeight);
    } catch (error) {
      console.warn("No se pudo cargar el logo elegido en el PDF", error);
    }
  }

  const textTop = logoTop + logoHeight + 10;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(LIGHT);
  doc.text(BUSINESS.name, pageW - 40, textTop, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  doc.text(`${BUSINESS.role} • ${BUSINESS.location}`, pageW - 40, textTop + 14, { align: "right" });
  doc.text(`${BUSINESS.email} • ${BUSINESS.phone}`, pageW - 40, textTop + 28, { align: "right" });

  // Document title and invoice details on the left
  doc.setTextColor(CYAN);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("REMITO", 40, textTop);

  doc.setTextColor(LIGHT);
  doc.setFontSize(12);
  doc.text(invoice.number, 40, textTop + 18);

  doc.setTextColor(MUTED);
  doc.setFontSize(9);
  doc.text(`Emitido: ${formatDateOrRaw(invoice.issueDate || invoice.createdAt)}`, 40, textTop + 32);
  doc.text(`Entrega: ${formatDateOrRaw(invoice.deliveryDate)}`, 40, textTop + 46);

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
      2: { halign: "left", cellWidth: 100 },
      3: { halign: "left", cellWidth: 100 },
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
  const escapeHtml = (value: string | number | undefined) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character];
    });

  const itemRows = invoice.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.quantity)}</td>
      <td>${escapeHtml(item.description || "Sin descripción")}</td>
      <td>${escapeHtml(formatMoney(item.unitPrice, invoice.currency))}</td>
      <td>${escapeHtml(formatMoney((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), invoice.currency))}</td>
    </tr>
  `).join("");
  const logo = invoice.logoDataUrl
    ? `<img class="logo" src="${escapeHtml(invoice.logoDataUrl)}" alt="Logo" />`
    : "";
  const issueDate = formatDateOrRaw(invoice.issueDate || invoice.createdAt);
  const deliveryDate = formatDateOrRaw(invoice.deliveryDate);
  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(invoice.number)} - ${escapeHtml(BUSINESS.brand)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font: 12px Arial, sans-serif; }
    header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; padding: 18px; color: white; background: #0b0b0f; border-bottom: 4px solid #00dbe8; }
    .doc h1 { margin: 0 0 6px; color: #00dbe8; font-size: 25px; }
    .doc p, .business p { margin: 3px 0; }
    .business { text-align: right; }
    .business strong { font-size: 14px; }
    .business p, .doc .date { color: #c3cad5; }
    .logo { display: block; max-width: 110px; max-height: 75px; object-fit: contain; }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin: 22px 0; }
    .details h2 { margin: 0 0 9px; font-size: 12px; letter-spacing: .08em; }
    .details p { margin: 4px 0; }
    .payment { text-align: right; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th { padding: 9px; background: #111827; color: #00dbe8; text-align: left; }
    td { padding: 9px; border: 1px solid #d7dce3; }
    .totals { width: 280px; margin: 18px 0 0 auto; padding: 14px; border: 1px solid #00b8c7; border-radius: 8px; }
    .total-row { display: flex; justify-content: space-between; margin: 7px 0; }
    .grand-total { padding-top: 8px; border-top: 1px solid #cc00aa; color: #007d91; font-size: 15px; font-weight: bold; }
    .balance { color: #b00083; font-weight: bold; }
    .notes { margin-top: 24px; white-space: pre-wrap; }
    @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <header>
    <div class="doc">
      <h1>REMITO</h1>
      <p><strong>${escapeHtml(invoice.number)}</strong></p>
      <p class="date">Emitido: ${escapeHtml(issueDate)}</p>
      <p class="date">Entrega: ${escapeHtml(deliveryDate)}</p>
    </div>
    <div>${logo}</div>
    <div class="business">
      <strong>${escapeHtml(BUSINESS.name)}</strong>
      <p>${escapeHtml(BUSINESS.role)} · ${escapeHtml(BUSINESS.location)}</p>
      <p>${escapeHtml(BUSINESS.email)} · ${escapeHtml(BUSINESS.phone)}</p>
    </div>
  </header>
  <section class="details">
    <div>
      <h2>CLIENTE</h2>
      <p>${escapeHtml(invoice.client.name || "—")}</p>
      ${invoice.client.cuit ? `<p>CUIT: ${escapeHtml(invoice.client.cuit)}</p>` : ""}
      ${invoice.client.address ? `<p>${escapeHtml(invoice.client.address)}${invoice.client.zip ? ` · CP ${escapeHtml(invoice.client.zip)}` : ""}</p>` : ""}
      ${invoice.client.email ? `<p>${escapeHtml(invoice.client.email)}</p>` : ""}
      ${invoice.client.phone ? `<p>Tel: ${escapeHtml(invoice.client.phone)}</p>` : ""}
    </div>
    <div class="payment">
      <h2>PAGO</h2>
      <p>${escapeHtml(PAYMENT_LABEL[invoice.paymentMethod])}</p>
      <p>Moneda: ${escapeHtml(invoice.currency)} (${escapeHtml(CURRENCY_SYMBOL[invoice.currency])})</p>
    </div>
  </section>
  <table>
    <thead><tr><th>Cant.</th><th>Descripción</th><th>P. Unitario</th><th>Total</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <section class="totals">
    <div class="total-row"><span>Subtotal</span><span>${escapeHtml(formatMoney(invoice.subtotal, invoice.currency))}</span></div>
    <div class="total-row"><span>Seña</span><span>${escapeHtml(formatMoney(invoice.deposit, invoice.currency))}</span></div>
    <div class="total-row grand-total"><span>Total</span><span>${escapeHtml(formatMoney(invoice.total, invoice.currency))}</span></div>
    <div class="total-row balance"><span>Debe</span><span>${escapeHtml(formatMoney(invoice.balance, invoice.currency))}</span></div>
  </section>
  ${invoice.notes?.trim() ? `<section class="notes"><strong>OBSERVACIONES</strong><p>${escapeHtml(invoice.notes)}</p></section>` : ""}
</body>
</html>`;

  const frame = document.createElement("iframe");
  frame.title = `Imprimir remito ${invoice.number}`;
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "0";
  frame.style.top = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";

  const cleanup = () => {
    frame.remove();
  };

  frame.onload = () => {
    try {
      frame.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch (error) {
      cleanup();
      throw error;
    }
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
