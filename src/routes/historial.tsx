import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, FileText, Printer, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { PASSWORD } from "@/lib/env";
import {
  formatMoney,
  getInvoices,
  PAYMENT_LABEL,
  removeInvoice,
  type Invoice,
} from "@/lib/invoices";

const sampleHistorialInvoices: Invoice[] = [
  {
    id: "__sample-pending",
    number: "EJ-100",
    type: "factura",
    createdAt: "2025-01-15T10:00:00.000Z",
    deliveryDate: "2025-01-16",
    issueDate: "2025-01-15",
    currency: "ARS",
    paymentMethod: "transferencia",
    client: {
      name: "Cliente de ejemplo",
      phone: "11 1234-5678",
      cuit: "20-12345678-9",
      address: "Calle Falsa 123",
      zip: "C1428",
      email: "cliente@ejemplo.com",
    },
    items: [
      {
        id: "sample-1",
        quantity: 1,
        description: "Remito de ejemplo pendiente",
        unitPrice: 24000,
      },
    ],
    deposit: 0,
    notes: "Remito de ejemplo pendiente para mostrar cómo queda el listado.",
    subtotal: 24000,
    total: 24000,
    balance: 24000,
    status: "pendiente",
  },
  {
    id: "__sample-paid",
    number: "EJ-101",
    type: "factura",
    createdAt: "2025-01-10T15:30:00.000Z",
    deliveryDate: "2025-01-11",
    issueDate: "2025-01-10",
    currency: "ARS",
    paymentMethod: "efectivo",
    client: {
      name: "Cliente de ejemplo",
      phone: "11 9876-5432",
      cuit: "27-87654321-0",
      address: "Av. Ejemplo 456",
      zip: "C1001",
      email: "prueba@ejemplo.com",
    },
    items: [
      {
        id: "sample-2",
        quantity: 1,
        description: "Remito de ejemplo saldado",
        unitPrice: 18500,
      },
    ],
    deposit: 18500,
    notes: "Remito de ejemplo saldado para mostrar estado terminado.",
    subtotal: 18500,
    total: 18500,
    balance: 0,
    status: "emitida",
  },
];

function isSampleInvoice(invoice: Invoice) {
  return invoice.id.startsWith("__sample");
}

export const Route = createFileRoute("/historial")({
  component: HistorialPage,
  head: () => ({
    meta: [
      { title: "Remitos emitidos" },
      { name: "description", content: "Historial de remitos y recibos generados." },
    ],
  }),
});

function HistorialPage() {
  const [list, setList] = useState<Invoice[]>([]);
  const [q, setQ] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedPdfAction, setSelectedPdfAction] = useState<"download" | "print" | null>(null);

  useEffect(() => {
    setList([...sampleHistorialInvoices, ...getInvoices()]);
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return list;
    const term = q.toLowerCase();
    return list.filter(
      (i) =>
        i.number.toLowerCase().includes(term) ||
        i.client.name.toLowerCase().includes(term) ||
        PAYMENT_LABEL[i.paymentMethod].toLowerCase().includes(term),
    );
  }, [list, q]);

  const handleDelete = (id: string) => {
    if (id.startsWith("__sample")) return;

    const confirmed = window.confirm(
      "¿Deseas eliminar este remito y todos los remitos relacionados a él?"
    );
    if (!confirmed) return;
    removeInvoice(id);
    setList([...sampleHistorialInvoices, ...getInvoices()]);
    toast.success("Remito eliminado");
  };

  const clearPasswordDialog = () => {
    setPasswordModalOpen(false);
    setPasswordInput("");
    setPasswordError("");
    setShowPassword(false);
    setSelectedInvoice(null);
    setSelectedPdfAction(null);
  };

  const handleDownloadPDF = async (invoice: Invoice) => {
    if (isSampleInvoice(invoice)) {
      const pdf = await import("../lib/pdf");
      pdf.downloadInvoicePdf(invoice);
      return;
    }

    setSelectedInvoice(invoice);
    setSelectedPdfAction("download");
    setPasswordError("");
    setPasswordInput("");
    setShowPassword(false);
    setPasswordModalOpen(true);
  };

  const handlePrintPDF = async (invoice: Invoice) => {
    if (isSampleInvoice(invoice)) {
      const pdf = await import("../lib/pdf");
      pdf.printInvoicePdf(invoice);
      return;
    }

    setSelectedInvoice(invoice);
    setSelectedPdfAction("print");
    setPasswordError("");
    setPasswordInput("");
    setShowPassword(false);
    setPasswordModalOpen(true);
  };

  const handlePasswordSubmit = async () => {
    if (passwordInput !== PASSWORD) {
      setPasswordError("Contraseña incorrecta.");
      return;
    }

    if (!selectedInvoice || !selectedPdfAction) {
      clearPasswordDialog();
      return;
    }

    const pdf = await import("../lib/pdf");
    if (selectedPdfAction === "download") {
      pdf.downloadInvoicePdf(selectedInvoice);
    } else {
      pdf.printInvoicePdf(selectedInvoice);
    }

    clearPasswordDialog();
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Archivo
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            <span className="text-gradient">Remitos emitidos</span>
          </h1>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por número, cliente..."
            className="pl-9"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass border-gradient rounded-2xl p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-lg font-semibold">Aún no hay remitos</p>
          <p className="text-sm text-muted-foreground">
            Generá tu primer remito para verlo acá.
          </p>
          <Button
            asChild
            className="mt-5 .bg-gradient-to-r from-[#00E5FF] to-[#FF00D4] text-black"
          >
            <Link to="/nueva">Crear remito</Link>
          </Button>
        </div>
      ) : (
        <div className="glass border-gradient overflow-hidden rounded-2xl">
          {/* Desktop table */}
          <table className="hidden w-full text-sm md:table">
            <thead className="bg-background/40">
              <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 text-left">Número</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Pago</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>

            <tbody>
              <AnimatePresence initial={false}>
                {filtered.map((i) => (
                  <motion.tr
                    key={i.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="border-t border-border/40 hover:bg-card/40"
                  >
                    <td className="px-4 py-3 font-mono text-color:var(--neon-cyan)">
                      <div className="flex items-center gap-2">
                        <span>{i.number}</span>
                        {isSampleInvoice(i) && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                            Ejemplo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{i.client.name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(i.createdAt).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {PAYMENT_LABEL[i.paymentMethod]}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {formatMoney(i.total, i.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={i.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <IconBtn
                          title="Descargar PDF"
                          onClick={() => handleDownloadPDF(i)}
                        >
                          <Download className="h-4 w-4" />
                        </IconBtn>

                        <IconBtn
                          title="Imprimir"
                          onClick={() => handlePrintPDF(i)}
                        >
                          <Printer className="h-4 w-4" />
                        </IconBtn>

                        {!isSampleInvoice(i) && (
                          <IconBtn
                            title="Eliminar"
                            onClick={() => handleDelete(i.id)}
                            danger
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconBtn>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>

          {/* Mobile cards */}
          <div className="divide-y divide-border/40 md:hidden">
            {filtered.map((i) => (
              <div key={i.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm text-color:var(--neon-cyan)">
                      {i.number}
                    </p>
                    <p className="mt-0.5 font-semibold">{i.client.name || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(i.createdAt).toLocaleDateString("es-AR")} ·{" "}
                      {PAYMENT_LABEL[i.paymentMethod]}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="font-bold tabular-nums">
                      {formatMoney(i.total, i.currency)}
                    </p>
                    <StatusPill status={i.status} />
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    type="button"
                    onClick={() => handleDownloadPDF(i)}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" /> PDF
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handlePrintPDF(i)}
                  >
                    <Printer className="mr-1 h-3.5 w-3.5" /> Imprimir
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(i.id)}
                    className="ml-auto text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
          <div className="w-full max-w-md rounded-3xl bg-background p-6 shadow-xl ring-1 ring-border">
            <h2 className="text-xl font-semibold">Contraseña requerida</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ingresa la contraseña para descargar o imprimir este remito.
            </p>
            <input
              autoFocus
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              type={showPassword ? "text" : "password"}
              className="mt-4 w-full rounded-2xl border border-border/60 bg-background/80 px-4 py-3 text-sm outline-none focus:border-(--neon-cyan)/70"
              placeholder="Contraseña"
            />
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="h-4 w-4 rounded border border-border/60 bg-background text-cyan-500 focus:ring-cyan-500"
              />
              Mostrar contraseña
            </label>
            {passwordError && (
              <p className="mt-2 text-sm text-destructive">{passwordError}</p>
            )}
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-sm transition hover:bg-card"
                onClick={clearPasswordDialog}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#FF00D4] px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                onClick={handlePasswordSubmit}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Invoice["status"] }) {
  const isPaid = status === "emitida";
  const isPending = status === "pendiente";
  const baseClasses = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium";
  const statusClass = isPaid
    ? "bg-emerald-100 text-emerald-600 ring-1 ring-emerald-200"
    : isPending
    ? "bg-red-100 text-red-600 ring-1 ring-red-200"
    : "bg-slate-100 text-slate-600 ring-1 ring-slate-200";

  return (
    <span className={`${baseClasses} ${statusClass}`}>
      <span className="h-2.5 w-2.5 rounded-full bg-current" />
      {isPaid ? "Saldado" : isPending ? "Pendiente" : "Borrador"}
    </span>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded-md p-1.5 transition-colors ${
        danger
          ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : "text-muted-foreground hover:bg-accent/10 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}