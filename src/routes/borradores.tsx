import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Archive, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, getDrafts, removeDraft, saveDraft, type Invoice } from "@/lib/invoices";

const sampleDraft: Invoice = {
  id: "__sample-draft",
  number: "EJ-001",
  type: "factura",
  createdAt: "2025-01-12T09:00:00.000Z",
  deliveryDate: "2025-01-13",
  issueDate: "2025-01-12",
  currency: "ARS",
  paymentMethod: "efectivo",
  client: {
    name: "Ejemplo Cliente",
    phone: "11 2345-6789",
    cuit: "30-11223344-5",
    address: "Ej. Av. de la Prueba 123",
    zip: "C1426",
    email: "ejemplo@cliente.com",
  },
  items: [
    {
      id: "sample-draft-item",
      quantity: 1,
      description: "Remito de ejemplo para ver el formato",
      unitPrice: 14000,
    },
  ],
  deposit: 0,
  notes: "Borrador de ejemplo para mostrar cómo se ve un remito antes de emitirlo.",
  subtotal: 14000,
  total: 14000,
  balance: 14000,
  status: "borrador",
};

function isSampleDraft(draft: Invoice) {
  return draft.id.startsWith("__sample");
}

export const Route = createFileRoute("/borradores")({
  component: BorradoresPage,
  head: () => ({
    meta: [
      { title: "Remitos borradores" },
      { name: "description", content: "Borradores guardados en tu workspace." },
    ],
  }),
});

function BorradoresPage() {
  const navigate = useNavigate();
  const [drafts, setDrafts] = useState<Invoice[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    setDrafts([sampleDraft, ...getDrafts()]);
  }, []);

  const handleEdit = (draft: Invoice) => {
    if (isSampleDraft(draft)) return;

    saveDraft({
      draftId: draft.id,
      draftNumber: draft.number,
      draftCreatedAt: draft.createdAt,
      issueDate: draft.issueDate || new Date().toISOString().slice(0, 10),
      deliveryDate: draft.deliveryDate,
      currency: draft.currency,
      paymentMethod: draft.paymentMethod,
      client: draft.client,
      items: draft.items,
      deposit: draft.deposit,
      notes: draft.notes,
    });
    navigate({ to: "/nueva" });
  };

  const filtered = drafts.filter((draft) => {
    if (!q.trim()) return true;
    const term = q.toLowerCase();
    return (
      draft.number.toLowerCase().includes(term) ||
      draft.client.name.toLowerCase().includes(term) ||
      draft.type.toLowerCase().includes(term)
    );
  });

  const handleDelete = (id: string) => {
    if (id.startsWith("__sample")) return;

    const confirmed = window.confirm("¿Deseas eliminar este borrador?");
    if (!confirmed) return;
    removeDraft(id);
    setDrafts([sampleDraft, ...getDrafts()]);
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Pendientes
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            <span className="text-gradient">Remitos borradores</span>
          </h1>
        </div>
        <div className="relative w-full sm:w-72">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar borradores..."
            className="pl-3"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass border-gradient rounded-2xl p-12 text-center">
          <Archive className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-lg font-semibold">No hay borradores</p>
          <p className="text-sm text-muted-foreground">
            Guarda un remito como borrador para verlo aquí.
          </p>
          <Button asChild className="mt-5 .bg-gradient-to-r from-[#00E5FF] to-[#FF00D4] text-black">
            <Link to="/nueva">Crear nuevo remito</Link>
          </Button>
        </div>
      ) : (
        <div className="glass border-gradient overflow-hidden rounded-2xl">
          <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">
              {filtered.length} borrador{filtered.length === 1 ? "" : "es"} guardado{filtered.length === 1 ? "" : "s"}.
            </p>
            <Button asChild size="sm" className=".bg-gradient-to-r from-[#00E5FF] to-[#FF00D4] text-black">
              <Link to="/nueva">Crear nuevo</Link>
            </Button>
          </div>
          <div className="overflow-x-auto md:overflow-visible">
            <table className="hidden min-w-full text-sm md:table">
              <thead className="bg-background/40">
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 text-left">Número</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((draft) => (
                  <tr key={draft.id} className="border-t border-border/40 hover:bg-card/40">
                    <td className="px-4 py-3 font-mono text-color:var(--neon-cyan)">
                      <div className="flex items-center gap-2">
                        <span>{draft.number}</span>
                        {isSampleDraft(draft) && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                            Ejemplo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">{draft.client.name || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(draft.createdAt).toLocaleDateString("es-AR")}
                    </td>
                    <td className="px-4 py-3 capitalize">{draft.type === "factura" ? "Remito" : "Recibo"}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {formatMoney(draft.total, draft.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {!isSampleDraft(draft) ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleEdit(draft)}
                            >
                              Modificar
                            </Button>
                            <button
                              onClick={() => handleDelete(draft.id)}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              title="Eliminar borrador"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                            Solo ejemplo
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divide-y divide-border/40 md:hidden">
              {filtered.map((draft) => (
                <div key={draft.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-mono text-sm text-color:var(--neon-cyan)">{draft.number}</p>
                      <p className="mt-1 font-semibold">{draft.client.name || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(draft.createdAt).toLocaleDateString("es-AR")} · {draft.type === "factura" ? "Remito" : "Recibo"}
                      </p>
                    </div>
                    <p className="text-right font-semibold tabular-nums">
                      {formatMoney(draft.total, draft.currency)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!isSampleDraft(draft) ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleEdit(draft)}
                        >
                          Modificar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(draft.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          Eliminar
                        </Button>
                      </>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                        Solo ejemplo
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
