import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Archive, CalendarClock, FileText, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
    <div className="container mx-auto max-w-7xl px-4 py-5 sm:py-7">
      <div className="mb-6 flex items-end gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Eliminados recientemente</p>
          <h1 className="mt-1 text-3xl font-bold"><span className="text-gradient">Papelera</span></h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Los elementos se eliminan automáticamente después de 5 días.
          </p>
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-190 text-center text-sm">
              <thead className="bg-background/40">
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Número</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Total</th>
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
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center justify-center gap-2">
                          {entry.kind === "draft" ? <Archive className="h-4 w-4 text-cyan-300" /> : <FileText className="h-4 w-4 text-fuchsia-300" />}
                          {entry.kind === "draft" ? "Borrador" : "Remito"}
                          {entry.records.length > 1 && <span className="text-xs text-muted-foreground">(+{entry.records.length - 1} cobros)</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">{record.number}</td>
                      <td className="px-4 py-3">{record.client.name || "—"}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{formatMoney(record.total, record.currency)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <CalendarClock className="h-4 w-4" />
                          {expiry.toLocaleDateString("es-AR")} · {daysLeft} día{daysLeft === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <Button size="sm" variant="secondary" onClick={() => handleRestore(entry)}>
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Restaurar
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setEntryToDelete(entry.id)} aria-label={`Eliminar ${record.number} definitivamente`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
