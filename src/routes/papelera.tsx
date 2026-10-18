import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarClock, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconActionButton } from "@/components/icon-action-button";
import { PAGE_CONTAINER_CLASS } from "@/lib/utils";
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
import {
  formatMoney,
  getTrash,
  PAYMENT_LABEL,
  permanentlyDeleteTrashEntry,
  restoreTrashEntry,
  type TrashEntry,
} from "@/lib/invoices";

export const Route = createFileRoute("/papelera")({
  component: PapeleraPage,
  head: () => ({
    meta: [
      { title: "Papelera" },
      { name: "description", content: "Remitos y borradores eliminados recientemente." },
    ],
  }),
});

function PapeleraPage() {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);

  const refreshEntries = () => setEntries(getTrash());

  useEffect(() => {
    refreshEntries();
    window.addEventListener("mf:cloud-data-ready", refreshEntries);
    window.addEventListener("storage", refreshEntries);
    window.addEventListener("focus", refreshEntries);
    return () => {
      window.removeEventListener("mf:cloud-data-ready", refreshEntries);
      window.removeEventListener("storage", refreshEntries);
      window.removeEventListener("focus", refreshEntries);
    };
  }, []);
     const handleRestore = (entry: TrashEntry) => {
    restoreTrashEntry(entry.id);
    refreshEntries();
    toast.success(entry.kind === "draft" ? "Borrador restaurado" : "Remito restaurado");
  };

  const confirmPermanentDelete = () => {
    if (!entryToDelete) return;
    permanentlyDeleteTrashEntry(entryToDelete);
    setEntryToDelete(null);
    refreshEntries();
    toast.success("Elemento eliminado definitivamente");
  };

  return (
    <div className={PAGE_CONTAINER_CLASS}>
      <div className="mb-6 flex items-end gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Eliminados recientemente</p>
          <h1 className="mt-1 text-3xl font-bold"><span className="text-gradient">Papelera</span></h1>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="glass border-gradient rounded-2xl p-12 text-center">
          <Trash2 className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-lg font-semibold">La papelera está vacía</p>
          <p className="text-sm text-muted-foreground">Los remitos y borradores que elimines aparecerán aquí.</p>
        </div>
      ) : (
        <div className="glass border-gradient overflow-hidden rounded-2xl">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-190 text-center text-sm">
              <thead className="bg-background/40">
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Seña</th>
                  <th className="px-4 py-3">Se elimina</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const record = entry.records[0];
                  const expiry = new Date(Date.parse(entry.deletedAt) + 5 * 24 * 60 * 60 * 1000);
                  const daysLeft = Math.max(1, Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
                  return (
                    <tr key={entry.id} className="border-t border-border/40 hover:bg-card/40">
                      <td className="px-4 py-3 font-mono">{record.number}</td>
                      <td className="px-4 py-3">{record.client.name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {record.issueDate
                          ? new Date(`${record.issueDate}T00:00:00`).toLocaleDateString("es-AR")
                          : new Date(record.createdAt).toLocaleDateString("es-AR")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{PAYMENT_LABEL[record.paymentMethod]}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{formatMoney(record.total, record.currency)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatMoney(record.deposit, record.currency)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <CalendarClock className="h-4 w-4" />
                          {expiry.toLocaleDateString("es-AR")} · {daysLeft} día{daysLeft === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <IconActionButton label={`Restaurar ${record.number}`} tone="success" onClick={() => handleRestore(entry)}>
                            <RotateCcw className="h-4 w-4" />
                          </IconActionButton>
                          <IconActionButton label={`Eliminar ${record.number} definitivamente`} tone="danger" onClick={() => setEntryToDelete(entry.id)}>
                            <Trash2 className="h-4 w-4" />
                          </IconActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-cyan-400/30 md:hidden">
            {entries.map((entry) => {
              const record = entry.records[0];
              const expiry = new Date(Date.parse(entry.deletedAt) + 5 * 24 * 60 * 60 * 1000);
              const daysLeft = Math.max(1, Math.ceil((expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
              return (
                <article key={entry.id} className="min-w-0 space-y-3 p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-all font-mono text-sm text-(--neon-cyan)">{record.number}</p>
                      <h2 className="wrap-break-word font-semibold">{record.client.name || "—"}</h2>
                      <p className="wrap-break-word text-xs text-muted-foreground">
                        {record.issueDate
                          ? new Date(`${record.issueDate}T00:00:00`).toLocaleDateString("es-AR")
                          : new Date(record.createdAt).toLocaleDateString("es-AR")} · {PAYMENT_LABEL[record.paymentMethod]}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums">{formatMoney(record.total, record.currency)}</p>
                      <p className="text-xs text-muted-foreground">Seña: {formatMoney(record.deposit, record.currency)}</p>
                    </div>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="h-4 w-4 shrink-0" />
                    Se elimina {expiry.toLocaleDateString("es-AR")} · {daysLeft} día{daysLeft === 1 ? "" : "s"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <IconActionButton label={`Restaurar ${record.number}`} tone="success" onClick={() => handleRestore(entry)}>
                      <RotateCcw className="h-4 w-4" />
                    </IconActionButton>
                    <IconActionButton label={`Eliminar ${record.number} definitivamente`} tone="danger" onClick={() => setEntryToDelete(entry.id)}>
                      <Trash2 className="h-4 w-4" />
                    </IconActionButton>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <AlertDialog open={entryToDelete !== null} onOpenChange={(open) => !open && setEntryToDelete(null)}>
        <AlertDialogContent className="border-border/70 bg-background">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar definitivamente</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer y eliminará el elemento de la papelera ahora.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmPermanentDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
