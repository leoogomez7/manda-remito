import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  CreditCard,
  Landmark,
  Plus,
  Receipt,
  Save,
  Send,
  Trash2,
  Upload,
  X,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PASSWORD } from "@/lib/env";
import {
  addDraft,
  addInvoice,
  calcTotals,
  clearDraft,
  CURRENCY_SYMBOL,
  formatMoney,
  getPendingInvoices,
  loadDraft,
  nextNumber,
  PAYMENT_LABEL,
  peekNextNumber,
  removeDraft,
  settleInvoice,
  type Currency,
  type Invoice,
  type LineItem,
  type PaymentMethod,
} from "@/lib/invoices";
import { BUSINESS } from "@/lib/business";
import { cn, PAGE_CONTAINER_CLASS } from "@/lib/utils";

export const Route = createFileRoute("/nueva")({
  component: NuevaFactura,
  head: () => ({
    meta: [
      { title: "Nuevo remito" },
      { name: "description", content: "Generá un nuevo remito o recibo profesional." },
    ],
  }),
});

type FormState = {
  draftId?: string;
  draftNumber?: string;
  draftCreatedAt?: string;
  settleInvoiceId?: string;
  currency: Currency;
  paymentMethod: PaymentMethod;
  issueDate: string;
  deliveryDate: string;
  notes: string;
  logoDataUrl?: string;
  deposit: number;
  client: Invoice["client"];
  items: LineItem[];
};

const emptyItem = (): LineItem => ({
  id: crypto.randomUUID(),
  quantity: 0,
  description: "",
  unitPrice: 0,
});

const initial: FormState = {
  draftId: undefined,
  draftNumber: undefined,
  draftCreatedAt: undefined,
  settleInvoiceId: undefined,
  currency: "ARS",
  paymentMethod: "transferencia",
  issueDate: new Date().toISOString().slice(0, 10),
  deliveryDate: "",
  notes: "",
  logoDataUrl: undefined,
  deposit: 0,
  client: { name: "", phone: "", cuit: "", address: "", zip: "", email: "" },
  items: [emptyItem()],
};

export function NuevaFactura() {
  const navigate = useNavigate();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>(() => {
    const draft = loadDraft<FormState>();
    return draft || {
      ...initial,
      issueDate: new Date().toISOString().slice(0, 10),
    };
  });
  const [generatedInvoice, setGeneratedInvoice] = useState<Invoice | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // const [nextNum, setNextNum] = useState("MF-000001");
  const [editingDraftId, setEditingDraftId] = useState<string | null>(() => {
    const draft = loadDraft<FormState>();
    return draft ? draft.draftId ?? null : null;
  });
  const [nextNum, setNextNum] = useState(() => peekNextNumber());

  // OPTIMIZACIÓN: useMemo evita leer el localStorage en cada renderizado
  const pendingInvoices = useMemo(() => getPendingInvoices(true), []);

  useEffect(() => {
    // Dejalo vacío o borralo, la inicialización ya se hizo arriba de forma nativa.
  }, []);

  const totals = useMemo(
    () => calcTotals(form.items, form.deposit),
    [form.items, form.deposit],
  );

  const resetForm = () => {
    setForm({
      ...initial,
      issueDate: new Date().toISOString().slice(0, 10),
    });
    setEditingDraftId(null);
    setNextNum(peekNextNumber());
  };

  const sendInvoiceNotifications = (invoice: Invoice) => {
    const subject = `Remito ${invoice.number} - ${BUSINESS.brand}`;
    const body = `Hola ${invoice.client.name || "cliente"},\n\nAdjunto se encuentra el remito ${invoice.number}. Total: ${formatMoney(invoice.total, invoice.currency)}.\n\nGracias por tu confianza.\n${BUSINESS.brand}`;
    
    if (invoice.client.email) {
      const mailto = `mailto:${encodeURIComponent(invoice.client.email)}?cc=${encodeURIComponent(
        BUSINESS.email,
      )}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailto, "_blank");
    }

    const phone = invoice.client.phone?.replace(/\D/g, "");
    if (phone) {
      const message = `Hola ${invoice.client.name || "cliente"}, te envío el remito ${invoice.number}. Total: ${formatMoney(
        invoice.total,
        invoice.currency,
      )}.`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank");
    }
  };

  const selectedPendingInvoice = pendingInvoices.find((invoice) => invoice.id === form.settleInvoiceId);

  useEffect(() => {
    if (!selectedPendingInvoice) return;

    // Evitamos re-escribir el estado si el ítem de saldo ya está cargado
    setForm((current) => {
      const yaEstaCargado = current.items.some(it => it.id === `saldo-${selectedPendingInvoice.id}`);
      if (yaEstaCargado) return current;

      return {
        ...current,
        currency: selectedPendingInvoice.currency,
        client: selectedPendingInvoice.client,
        notes: current.notes || `Pago de ${selectedPendingInvoice.number}`,
        items: [
          {
            id: `saldo-${selectedPendingInvoice.id}`, // 💡 ID Estable: Rompe el bucle infinito
            quantity: 1,
            description: `Saldo pendiente de ${selectedPendingInvoice.number}`,
            unitPrice: selectedPendingInvoice.balance,
          },
        ],
      };
    });
  }, [selectedPendingInvoice?.id]);


  const generateInvoice = async () => {
    const num = nextNumber();
    const rawPayment = Number(form.deposit) || 0;
    const payment = selectedPendingInvoice
      ? Math.min(rawPayment, selectedPendingInvoice.balance)
      : rawPayment;
    let updatedOriginal: Invoice | null = null;

    if (selectedPendingInvoice) {
      const updatedBalance = Math.max(0, selectedPendingInvoice.balance - payment);
      updatedOriginal = {
        ...selectedPendingInvoice,
        deposit: selectedPendingInvoice.deposit + payment,
        balance: updatedBalance,
        status: updatedBalance > 0 ? "pendiente" : "emitida",
        notes: `${selectedPendingInvoice.notes ? `${selectedPendingInvoice.notes} | ` : ""}Pago ${formatMoney(
          payment,
          selectedPendingInvoice.currency,
        )}`,
      };
    }

    const invoice: Invoice = {
      id: crypto.randomUUID(),
      number: num,
      type: "factura",
      issueDate: form.issueDate,
      createdAt: new Date().toISOString(),
      deliveryDate: form.deliveryDate,
      currency: form.currency,
      paymentMethod: form.paymentMethod,
      client: form.client,
      items: form.items,
      deposit: payment,
      notes: selectedPendingInvoice && !form.notes ? `Pago de ${selectedPendingInvoice.number}` : form.notes,
      logoDataUrl: form.logoDataUrl,
      subtotal: totals.subtotal,
      total: totals.total,
      balance: totals.balance,
      status: updatedOriginal ? updatedOriginal.status : totals.balance > 0 ? "pendiente" : "emitida",
      settlesInvoiceId: selectedPendingInvoice?.id,
    };

    if (editingDraftId) {
      removeDraft(editingDraftId);
      setEditingDraftId(null);
    }

    if (updatedOriginal && payment > 0) {
      settleInvoice(updatedOriginal.id, payment);
    }

    addInvoice(invoice);

    try {
      // OPTIMIZACIÓN: Carga diferida dinámica del generador de PDF
      const { downloadInvoicePdf } = await import("@/lib/pdf");
      await downloadInvoicePdf(invoice);
      toast.success(`Remito ${num} generado`, {
        description: "PDF descargado y guardado en el historial.",
      });
    } catch (error) {
      console.error("Error al generar o descargar PDF", error);
      toast.success(`Remito ${num} generado`, {
        description: "Remito guardado en el historial, pero no se pudo descargar el PDF.",
      });
    }

    sendInvoiceNotifications(invoice);
    clearDraft();
    setGeneratedInvoice(invoice);
    resetForm();
  };

  const handleGenerateClick = () => {
    if (!form.client.name) {
      window.alert("Ingresa el nombre del cliente antes de generar el remito.");
      return;
    }

    if (totals.total <= 0) {
      window.alert("Agrega al menos un ítem con importe válido antes de generar el remito.");
      return;
    }

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

    setPasswordModalOpen(false);
    setPasswordInput("");
    await generateInvoice();
  };

  const saveDraftDocument = () => {
    if (form.draftId) {
      removeDraft(form.draftId);
    }

    const draft: Invoice = {
      id: form.draftId ?? crypto.randomUUID(),
      number: form.draftNumber ?? `BOR-${String(Date.now()).slice(-6)}`,
      type: "factura",
      issueDate: form.issueDate,
      createdAt: form.draftCreatedAt ?? new Date().toISOString(),
      deliveryDate: form.deliveryDate,
      currency: form.currency,
      paymentMethod: form.paymentMethod,
      client: form.client,
      items: form.items,
      deposit: Number(form.deposit) || 0,
      notes: form.notes,
      logoDataUrl: form.logoDataUrl,
      subtotal: totals.subtotal,
      total: totals.total,
      balance: totals.balance,
      status: "borrador",
    };

    addDraft(draft);
    clearDraft();
    setEditingDraftId(null);
    toast.success("Borrador guardado");
    resetForm();
  };

const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((s) => (s[key] === value ? s : { ...s, [key]: value }));
  };

  const updateClient = (patch: Partial<FormState["client"]>) => {
    setForm((s) => ({ ...s, client: { ...s.client, ...patch } }));
  };

  const handleLogoUpload = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Seleccioná un archivo de imagen.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("La imagen debe pesar menos de 10 MB.");
      return;
    }

    try {
      const bitmap = await createImageBitmap(file);
      const maxDimension = 600;
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo procesar la imagen.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      update("logoDataUrl", canvas.toDataURL("image/png"));
    } catch (error) {
      console.error("No se pudo procesar el logo", error);
      toast.error("No se pudo abrir esa imagen. Probá con otro formato.");
    }
  };

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    setForm((s) => {
      const updatedItems = s.items.map((it) => 
        it.id === id ? { ...it, ...patch } : it
      );
      return { ...s, items: updatedItems };
    });
  };

  const addItem = () =>
    setForm((s) => ({ ...s, items: [...s.items, emptyItem()] }));

  const removeItem = (id: string) =>
    setForm((s) => ({
      ...s,
      items: s.items.length > 1 ? s.items.filter((it) => it.id !== id) : s.items,
    }));

  // VISTA CONDICIONAL: Factura recién generada con éxito
  if (generatedInvoice) {
    return (
      <div className={PAGE_CONTAINER_CLASS}>
        <div className="glass rounded-2xl p-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Remito generado
              </p>
              <h1 className="mt-1 text-3xl font-bold">
                <span className="text-gradient">{generatedInvoice.number}</span>
              </h1>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setGeneratedInvoice(null);
                navigate({ to: "/" });
              }}
            >
              Volver al inicio
            </Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Cliente
                </p>
                <p className="mt-2 text-lg font-semibold">
                  {generatedInvoice.client.name || "Cliente sin nombre"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {generatedInvoice.client.email || "Sin correo"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Fecha de emisión
                </p>
                <p className="mt-2 text-sm">
                  {new Date(generatedInvoice.createdAt).toLocaleDateString("es-AR")}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Moneda
                </p>
                <p className="mt-2 text-sm">{generatedInvoice.currency}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 bg-background/50 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Totales
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatMoney(generatedInvoice.subtotal, generatedInvoice.currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Seña</span>
                  <span>{formatMoney(generatedInvoice.deposit, generatedInvoice.currency)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatMoney(generatedInvoice.total, generatedInvoice.currency)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-border/60 bg-background/50 p-5">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 text-center">Cantidad</th>
                  <th className="pb-2 text-center">Descripción</th>
                  <th className="pb-2 text-left">Precio unitario</th>
                  <th className="pb-2 text-left">Total</th>
                </tr>
              </thead>
              <tbody>
                {generatedInvoice.items.map((item) => (
                  <tr key={item.id} className="border-t border-border/40">
                    <td className="py-3">{item.quantity || "-"}</td>
                    <td className="py-3">{item.description || "Sin descripción"}</td>
                    <td className="py-3 tabular-nums">
                      {formatMoney(item.unitPrice, generatedInvoice.currency)}
                    </td>
                    <td className="py-3 tabular-nums">
                      {formatMoney(item.quantity * item.unitPrice, generatedInvoice.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

    return (
    <div className={PAGE_CONTAINER_CLASS}>
      {/* Título Principal */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Nuevo remito · {nextNum}
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            <span className="text-gradient">Generar</span> remito
          </h1>
        </div>
      </motion.div>

      {/* Grid del Formulario */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          
          {/* SECCIÓN: DATOS CLIENTE */}
          <Section title="Datos del cliente" subtitle="A quién va dirigido el remito">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre / Empresa">
                <Input
                  value={form.client.name}
                  onChange={(e) => updateClient({ name: e.target.value })}
                  placeholder="Acme S.A."
                />
              </Field>
              <Field label="Correo electrónico">
                <Input
                  type="email"
                  value={form.client.email}
                  onChange={(e) => updateClient({ email: e.target.value })}
                  placeholder="cliente@empresa.com"
                />
              </Field>
              <Field label="Celular">
                <Input
                  value={form.client.phone}
                  onChange={(e) => updateClient({ phone: e.target.value })}
                  placeholder="11 1234-5678"
                />
              </Field>
              <Field label="CUIT">
                <Input
                  value={form.client.cuit}
                  onChange={(e) => updateClient({ cuit: e.target.value })}
                  placeholder="20-12345678-9"
                />
              </Field>
              <Field label="Domicilio">
                <Input
                  value={form.client.address}
                  onChange={(e) => updateClient({ address: e.target.value })}
                  placeholder="Av. Siempre Viva 742"
                />
              </Field>
              <Field label="Código postal">
                <Input
                  value={form.client.zip}
                  onChange={(e) => updateClient({ zip: e.target.value })}
                  placeholder="1722"
                />
              </Field>
            </div>
          </Section>

          <Section title="Seleccionar logo" subtitle="Opcional · aparecerá en el encabezado del PDF">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              {form.logoDataUrl ? (
                <div className="flex h-20 w-32 items-center justify-center rounded-xl border border-border/60 bg-background/60 p-2">
                  <img src={form.logoDataUrl} alt="Vista previa del logo" className="max-h-full max-w-full object-contain" />
                </div>
              ) : (
                <div className="flex h-20 w-32 items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/40 text-xs text-muted-foreground">
                  Sin logo
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    void handleLogoUpload(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
                <Button type="button" variant="secondary" onClick={() => logoInputRef.current?.click()}>
                  <Upload className="mr-2 h-4 w-4" /> Importar desde la PC
                </Button>
                {form.logoDataUrl && (
                  <Button type="button" variant="ghost" onClick={() => update("logoDataUrl", undefined)}>
                    <X className="mr-2 h-4 w-4" /> Quitar logo
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Formatos de imagen que admita el navegador. Si no elegís uno, el remito se genera sin logo.</p>
          </Section>

          {/* SECCIÓN: MÉTODO DE PAGO */}
          {/* SECCIÓN: MÉTODO DE PAGO */}
          <Section title="Método de pago">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(
                [
                  { id: "credito", label: "Crédito", icon: CreditCard },
                  { id: "debito", label: "Débito", icon: CreditCard },
                  { id: "transferencia", label: "Transferencia", icon: Landmark },
                  { id: "efectivo", label: "Efectivo", icon: Banknote },
                ] as { id: PaymentMethod; label: string; icon: typeof CreditCard }[]
              ).map((m) => {
                const active = form.paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => update("paymentMethod", m.id)}
                    className={cn(
                      "group relative flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all duration-200 active:scale-[0.98] cursor-pointer",
                      active
                        ? "border-(--neon-cyan)/70 bg-card glow-cyan shadow-[0_0_15px_rgba(0,229,255,0.15)]"
                        : "border-border/60 bg-card/40 hover:border-(--neon-fuchsia)/40",
                    )}
                  >
                    <m.icon
                      className={cn(
                        "h-5 w-5 transition-colors",
                        active ? "text-(--neon-cyan)" : "text-muted-foreground",
                      )}
                    />
                    <span className="text-xs font-medium">{m.label}</span>
                    {active && (
                      <div className="absolute inset-0 rounded-xl ring-1 ring-(--neon-cyan)/60 pointer-events-none" />
                    )}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* SECCIÓN: SALDAR CUENTA */}
          <Section
            title="Saldar cuenta"
            subtitle="Selecciona un remito pendiente para marcar como pagado cuando generes este remito"
          >
            <div className="grid gap-4">
              <Field label="Remito pendiente">
                <select
                  value={form.settleInvoiceId ?? ""}
                  onChange={(e) => update("settleInvoiceId", e.target.value || undefined)}
                  className="w-full rounded-xl border border-border/60 bg-background/80 px-3 py-2"
                >
                  <option value="">Ninguna</option>
                  {pendingInvoices.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.number} — {invoice.client.name || "Cliente"} ({formatMoney(invoice.balance, invoice.currency)})
                    </option>
                  ))}
                </select>
              </Field>

              {selectedPendingInvoice ? (
                <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-sm">
                  <p className="font-semibold">{selectedPendingInvoice.number}</p>
                  <p className="text-muted-foreground">
                    Cliente: {selectedPendingInvoice.client.name || "Sin nombre"}
                  </p>
                  <p className="mt-2">
                    Monto pendiente: {formatMoney(selectedPendingInvoice.balance, selectedPendingInvoice.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    El nuevo remito se genera por separado y actualiza el saldo del remito original.
                    Si pagás parcialmente, el remito original seguirá pendiente con su saldo actualizado.
                  </p>
                </div>
              ) : form.settleInvoiceId ? (
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  El remito seleccionado ya no está pendiente.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay ningún remito seleccionado. Si quieres saldar una cuenta, elige uno pendiente.
                </p>
              )}
            </div>
          </Section>

          {/* SECCIÓN: MONEDA */}
          <Section title="Moneda">
            <div className="inline-flex rounded-xl border border-border/60 bg-card/40 p-1">
              {(["ARS", "USD"] as Currency[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => update("currency", c)}
                  className={cn(
                    "rounded-lg px-5 py-2 text-sm font-semibold transition-all",
                    form.currency === c
                      ? ".bg-gradient-to-r from-[#00E5FF] to-[#FF00D4] text-black"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {c} · {CURRENCY_SYMBOL[c]}
                </button>
              ))}
            </div>
          </Section>

                    {/* SECCIÓN: PRODUCTOS / SERVICIOS */}
          <Section
            title="Productos / Servicios"
            subtitle="Cantidad × Precio unitario = Total"
            actions={
              <Button size="sm" variant="secondary" onClick={addItem}>
                <Plus className="mr-1 h-4 w-4" /> Agregar
              </Button>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="w-20 pb-2 text-left">Cant.</th>
                    <th className="pb-2 text-left">Descripción</th>
                    <th className="w-32 pb-2 text-left">P. Unit.</th>
                    <th className="w-32 pb-2 text-left">Total</th>
                    <th className="w-10 pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it) => {
                    const line = (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0);
                    return (
                      <tr key={it.id} className="border-t border-border/40 transition-colors duration-150">
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={0}
                            value={it.quantity || ""}
                            onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            value={it.description}
                            placeholder="Descripción del ítem"
                            onChange={(e) => updateItem(it.id, { description: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="text-left"
                            value={it.unitPrice || ""}
                            onChange={(e) => updateItem(it.id, { unitPrice: Number(e.target.value) })}
                          />
                        </td>
                        <td className="py-2 pr-2 text-left tabular-nums font-medium">
                          {formatMoney(line, form.currency)}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
                            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Eliminar fila"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>


          {/* SECCIÓN: ENTREGA Y OBSERVACIONES */}
          <Section title="Entrega y observaciones">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Fecha de emisión">
                <Input
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => update("issueDate", e.target.value)}
                />
              </Field>
              <Field label="Fecha estimada de entrega">
                <Input
                  type="date"
                  value={form.deliveryDate}
                  onChange={(e) => update("deliveryDate", e.target.value)}
                />
              </Field>
              <Field label="Seña recibida">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.deposit}
                  onChange={(e) => update("deposit", Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Observaciones adicionales" className="mt-4">
              <Textarea
                rows={4}
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Garantías, condiciones, notas..."
              />
            </Field>
          </Section>
        </div>

        {/* COMPONENTE LATERAL DE RESUMEN */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass border-gradient rounded-2xl p-5"
          >
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Resumen</h3>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label="Subtotal" value={formatMoney(totals.subtotal, form.currency)} />
              <Row label="Seña" value={formatMoney(form.deposit, form.currency)} muted />
              <div className="my-3 h-px .bg-gradient-to-r from-transparent via-(--neon-cyan)/40 to-transparent" />
              <Row label="Total" value={formatMoney(totals.total, form.currency)} bold accent="cyan" />
              <Row label="Debe" value={formatMoney(totals.balance, form.currency)} bold accent="fuchsia" />
            </dl>

            <div className="mt-5 space-y-2 text-xs text-muted-foreground">
              <p>Pago: <span className="text-foreground">{PAYMENT_LABEL[form.paymentMethod]}</span></p>
              <p>Moneda: <span className="text-foreground">{form.currency}</span></p>
            </div>

            <div className="mt-5 space-y-3">
              <Button
                type="button"
                size="lg"
                className="w-full .bg-gradient-to-r from-[#00E5FF] to-[#FF00D4] text-black hover:opacity-90"
                onClick={handleGenerateClick}
              >
                <Send className="mr-2 h-4 w-4" /> Generar remito
              </Button>

              <Button
                size="lg"
                variant="secondary"
                className="w-full"
                onClick={saveDraftDocument}
              >
                <Save className="mr-2 h-4 w-4" /> Guardar borrador
              </Button>
            </div>
          </motion.div>

          {passwordModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8">
              <div className="w-full max-w-md rounded-3xl bg-background p-6 shadow-xl ring-1 ring-border">
                <h2 className="text-xl font-semibold">Contraseña requerida</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ingresa la contraseña para generar el remito.
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
                    onClick={() => setPasswordModalOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl .bg-gradient-to-r from-[#00E5FF] to-[#FF00D4] px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                    onClick={handlePasswordSubmit}
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="glass rounded-2xl p-4 text-xs text-muted-foreground">
            <p className="mb-2 flex items-center gap-2 font-semibold text-foreground">
              <Receipt className="h-3.5 w-3.5" /> Número del remito
            </p>
            <p className="font-mono text-base text-gradient">{nextNum}</p>
            <p className="mt-1">Número asignado al generar el remito.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ==========================================
// COMPONENTES COMPLEMENTARIOS REUTILIZABLES NATIVOS
// ==========================================
function Section({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass border-gradient rounded-2xl p-5 transition-all duration-300">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground/80">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  accent?: "cyan" | "fuchsia";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cn("text-xs uppercase tracking-wider", muted ? "text-muted-foreground/70" : "text-muted-foreground")}>
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          bold && "text-lg font-bold",
          accent === "cyan" && "text-(--neon-cyan)",
          accent === "fuchsia" && "text-(--neon-fuchsia)",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

