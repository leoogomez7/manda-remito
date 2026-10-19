import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Archive, FileText, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconActionButton } from "@/components/icon-action-button";
import { Input } from "@/components/ui/input";
import { PAGE_CONTAINER_CLASS } from "@/lib/utils";
import { toast } from "sonner";
import { flushCloudChanges } from "@/lib/cloud-sync";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatMoney, getDrafts, moveDraftToTrash, PAYMENT_LABEL, saveDraft, type Invoice } from "@/lib/invoices";

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
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);

  useEffect(() => {
    const refreshDrafts = () => setDrafts([sampleDraft, ...getDrafts()]);
    refreshDrafts();
    window.addEventListener("mf:data-owner-changed", refreshDrafts);
    window.addEventListener("mf:cloud-data-ready", refreshDrafts);
    return () => {
      window.removeEventListener("mf:data-owner-changed", refreshDrafts);
      window.removeEventListener("mf:cloud-data-ready", refreshDrafts);
    };
  }, []);

  const handleEdit = async (draft: Invoice) => {
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
    try {
      await flushCloudChanges();
    } catch (error) {
      console.error("No se pudo sincronizar el borrador antes de abrirlo", error);
      toast.error("No se pudo sincronizar el borrador. Comprueba la conexión e intenta otra vez.");
      return;
    }
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
    setDraftToDelete(id);
  };

  const confirmDelete = () => {
    if (!draftToDelete) return;
    moveDraftToTrash(draftToDelete);
    setDrafts([sampleDraft, ...getDrafts()]);
    setDraftToDelete(null);
  };

  return (
    <div className={PAGE_CONTAINER_CLASS}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Pendientes
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            <span className="text-gradient">Remitos borradores</span>
          </h1>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Button asChild size="sm" className=".bg-gradient-to-r from-[#00E5FF] to-[#FF00D4] text-black">
            <Link to="/nueva"><Plus className="mr-2 h-4 w-4" />Nuevo borrador</Link>
          </Button>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar borradores..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass border-gradient rounded-2xl p-12 text-center">
          <Archive className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-lg font-semibold">No hay borradores</p>
          <p className="text-sm text-muted-foreground">
            Guarda un remito como borrador para verlo aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="glass border-gradient overflow-hidden rounded-2xl">
            <div>
            <table className="hidden w-full text-center text-sm md:table">
              <thead className="bg-background/40">
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Seña recibida</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((draft) => (
                  <tr key={draft.id} className="border-t border-border/40 hover:bg-card/40">
                    <td className="px-4 py-3 font-mono text-color:var(--neon-cyan)">
                      <div className="flex items-center justify-center gap-2">
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
                    <td className="px-4 py-3 text-muted-foreground">{PAYMENT_LABEL[draft.paymentMethod]}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums">
                      {formatMoney(draft.total, draft.currency)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatMoney(draft.deposit, draft.currency)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {!isSampleDraft(draft) ? (
                          <>
                            <IconActionButton label="Modificar" onClick={() => void handleEdit(draft)}>
                              <Pencil className="h-4 w-4" />
                            </IconActionButton>
                            <IconActionButton label="Eliminar" tone="danger" onClick={() => handleDelete(draft.id)}>
                              <Trash2 className="h-4 w-4" />
                            </IconActionButton>
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

            <div className="divide-y divide-cyan-400/30 md:hidden">
              {filtered.map((draft) => (
                <div key={draft.id} className="min-w-0 p-4">
                  <div className="flex min-w-0 flex-col gap-3">
                    <div>
                      <p className="break-all font-mono text-sm text-color:var(--neon-cyan)">{draft.number}</p>
                      <p className="mt-1 wrap-break-word font-semibold">{draft.client.name || "—"}</p>
                      <p className="wrap-break-word text-xs text-muted-foreground">
                        {new Date(draft.createdAt).toLocaleDateString("es-AR")} · {PAYMENT_LABEL[draft.paymentMethod]}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold tabular-nums">
                        Total: {formatMoney(draft.total, draft.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Seña recibida: {formatMoney(draft.deposit, draft.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-start gap-2">
                    {!isSampleDraft(draft) ? (
                      <>
                        <IconActionButton label="Modificar" onClick={() => void handleEdit(draft)}>
                          <Pencil className="h-4 w-4" />
                        </IconActionButton>
                        <IconActionButton label="Eliminar" tone="danger" onClick={() => handleDelete(draft.id)}>
                          <Trash2 className="h-4 w-4" />
                        </IconActionButton>
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
        </div>
      )}

      <AlertDialog open={draftToDelete !== null} onOpenChange={(open) => !open && setDraftToDelete(null)}>
        <AlertDialogContent className="border-border/70 bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar borrador a la papelera</AlertDialogTitle>
            <AlertDialogDescription>
              El borrador permanecerá en la papelera durante 5 días. Después se eliminará definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Mover a papelera
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
