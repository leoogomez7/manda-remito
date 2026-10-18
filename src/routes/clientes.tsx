import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Pencil, Plus, Search, Users, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IconActionButton } from "@/components/icon-action-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppAuth } from "@/lib/auth";
import { emptyClient, getSavedClients, mergeClientsWithInvoices, sameClient, saveClient, type ClientData } from "@/lib/clients";
import { getBusinessProfile } from "@/lib/business";
import { formatMoney, getInvoices, saveInvoices, type Currency, type Invoice } from "@/lib/invoices";
import { PAGE_CONTAINER_CLASS } from "@/lib/utils";

export const Route = createFileRoute("/clientes")({
  component: ClientesPage,
  head: () => ({
    meta: [
      { title: "Clientes" },
      { name: "description", content: "Administra tus clientes y consulta sus remitos." },
    ],
  }),
});

const currencies: Currency[] = ["ARS", "USD"];

function ClientesPage() {
  const { user } = useAppAuth();
  const [savedClients, setSavedClients] = useState(() => getSavedClients(user?.email));
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [query, setQuery] = useState("");
  const [clientDialogOpen, setClientDialogOpen] = useState(false);
  const [remitosClient, setRemitosClient] = useState<ClientData | null>(null);
  const [formClient, setFormClient] = useState<ClientData>(emptyClient);
  const [editingClient, setEditingClient] = useState<ClientData | null>(null);

  useEffect(() => {
    setSavedClients(getSavedClients(user?.email));
    setInvoices(getInvoices());
  }, [user?.email]);

  const clients = useMemo(
    () => mergeClientsWithInvoices(savedClients, invoices),
    [savedClients, invoices],
  );
  const filteredClients = clients.filter((client) => {
    const term = query.trim().toLowerCase();
    return !term || [client.name, client.email, client.phone, client.cuit]
      .some((value) => value.toLowerCase().includes(term));
  });

  const invoicesForClient = (client: ClientData) => invoices.filter((invoice) => sameClient(client, invoice.client));
  const openNewClient = () => {
    setFormClient(emptyClient());
    setEditingClient(null);
    setClientDialogOpen(true);
  };
  const openEditClient = (client: ClientData) => {
    setFormClient({ ...client });
    setEditingClient({ ...client });
    setClientDialogOpen(true);
  };
  const handleSaveClient = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const existingSaved = editingClient
      ? savedClients.find((item) => sameClient(item.client, editingClient))
      : undefined;
    const saved = saveClient(formClient, user?.email, existingSaved?.id);
    if (!saved) return;
    setSavedClients(getSavedClients(user?.email));
    if (editingClient) {
      const updatedInvoices = getInvoices().map((invoice) =>
        sameClient(editingClient, invoice.client)
          ? { ...invoice, client: { ...formClient } }
          : invoice,
      );
      saveInvoices(updatedInvoices);
      setInvoices(updatedInvoices);
    }
    setClientDialogOpen(false);
    setEditingClient(null);
    toast.success(editingClient ? "Datos del cliente actualizados" : "Cliente guardado");
  };

  const downloadInvoice = async (invoice: Invoice) => {
    try {
      const { downloadInvoicePdf } = await import("@/lib/pdf");
      await downloadInvoicePdf(invoice, getBusinessProfile(user?.email));
    } catch (error) {
      console.error("No se pudo descargar el remito", error);
      toast.error(`No se pudo descargar ${invoice.number}`);
    }
  };

  const currencyTotals = (client: ClientData, field: "total" | "deposit") => {
    const list = invoicesForClient(client);
    const countedInvoices = field === "deposit"
      ? list.filter((invoice) => !invoice.settlesInvoiceId)
      : list;
    return currencies.map((currency) => ({
      currency,
      value: countedInvoices
        .filter((invoice) => invoice.currency === currency)
        .reduce((sum, invoice) => sum + invoice[field], 0),
    }));
  };

  return (
    <div className={PAGE_CONTAINER_CLASS}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Agenda</p>
          <h1 className="mt-1 text-3xl font-bold"><span className="text-gradient">Clientes</span></h1>
          <p className="mt-2 text-sm text-muted-foreground">Consulta sus remitos, señas y totales acumulados.</p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Button onClick={openNewClient} className=".bg-gradient-to-r from-[#00E5FF] to-[#FF00D4] text-black">
            <Plus className="mr-2 h-4 w-4" /> Nuevo cliente
          </Button>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar clientes..." className="pl-9" />
          </div>
        </div>
      </div>

      {filteredClients.length === 0 ? (
        <div className="glass border-gradient rounded-2xl p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-lg font-semibold">Todavía no hay clientes</p>
          <p className="text-sm text-muted-foreground">Agrega uno con «Nuevo cliente» o genera un remito para que aparezca aquí.</p>
        </div>
      ) : (
        <div className="glass border-gradient overflow-hidden rounded-2xl">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-250 text-center text-sm">
              <thead className="bg-background/40">
                <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Cantidad de remitos</th>
                  <th className="px-4 py-3">Total señado</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client, index) => {
                  const relatedInvoices = invoicesForClient(client);
                  const saved = savedClients.find((item) => sameClient(item.client, client));
                  return (
                    <tr key={saved?.id ?? `${client.name}-${client.email}-${index}`} className="border-t border-border/40 hover:bg-card/40">
                      <td className="px-4 py-3 text-center">
                        <p className="font-semibold">{client.name || "Cliente sin nombre"}</p>
                        <p className="text-xs text-muted-foreground">{client.email || client.phone || "Sin contacto"}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{relatedInvoices.length}</td>
                      <td className="px-4 py-3 tabular-nums">
                        <MoneyTotals values={currencyTotals(client, "deposit")} />
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums">
                        <MoneyTotals values={currencyTotals(client, "total")} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          <IconActionButton label="Ver remitos" onClick={() => setRemitosClient(client)}>
                            <Eye className="h-4 w-4" />
                          </IconActionButton>
                          <IconActionButton label="Editar" onClick={() => openEditClient(client)}>
                            <Pencil className="h-4 w-4" />
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
            {filteredClients.map((client, index) => {
              const relatedInvoices = invoicesForClient(client);
              const saved = savedClients.find((item) => sameClient(item.client, client));
              return (
                <article key={saved?.id ?? `${client.name}-${client.email}-${index}`} className="min-w-0 space-y-3 p-4">
                  <div className="min-w-0">
                    <h2 className="wrap-break-word font-semibold">{client.name || "Cliente sin nombre"}</h2>
                    <p className="break-all text-xs text-muted-foreground">{client.email || client.phone || "Sin contacto"}</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border/50 bg-background/30 p-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Remitos</dt>
                      <dd className="font-medium tabular-nums">{relatedInvoices.length}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Total señado</dt>
                      <dd className="font-medium tabular-nums"><MoneyTotals values={currencyTotals(client, "deposit")} /></dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">Total de remitos</dt>
                      <dd className="font-semibold tabular-nums"><MoneyTotals values={currencyTotals(client, "total")} /></dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <IconActionButton label="Ver remitos" onClick={() => setRemitosClient(client)}>
                      <Eye className="h-4 w-4" />
                    </IconActionButton>
                    <IconActionButton label="Editar" onClick={() => openEditClient(client)}>
                      <Pencil className="h-4 w-4" />
                    </IconActionButton>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border/70 bg-background sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingClient ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
            <DialogDescription>
              {editingClient
                ? "Actualiza los datos guardados y los datos de cliente en sus remitos existentes."
                : "Guarda los datos para seleccionarlos al crear futuros remitos."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-5" onSubmit={handleSaveClient}>
            <ClientFields client={formClient} onChange={setFormClient} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setClientDialogOpen(false)}><X className="mr-2 h-4 w-4" />Cancelar</Button>
              <Button type="submit">
                <Save className="mr-2 h-4 w-4" />
                {editingClient ? "Guardar cambios" : "Guardar cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={remitosClient !== null} onOpenChange={(open) => !open && setRemitosClient(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-border/70 bg-background sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Remitos de {remitosClient?.name}</DialogTitle>
            <DialogDescription>Descarga un remito directamente desde esta lista.</DialogDescription>
          </DialogHeader>
          {remitosClient && (
            <ClientInvoices invoices={invoicesForClient(remitosClient)} onDownload={downloadInvoice} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MoneyTotals({ values }: { values: { currency: Currency; value: number }[] }) {
  return (
    <div className="space-y-0.5">
      {values.map(({ currency, value }) => (
        <p key={currency} className="whitespace-nowrap">{formatMoney(value, currency)}</p>
      ))}
    </div>
  );
}

function ClientFields({ client, onChange }: { client: ClientData; onChange: (client: ClientData) => void }) {
  const setField = (field: keyof ClientData, value: string) => onChange({ ...client, [field]: value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2"><Label htmlFor="client-name">Nombre / Empresa</Label><Input id="client-name" autoFocus required value={client.name} onChange={(event) => setField("name", event.target.value)} placeholder="Acme S.A." /></div>
      <div className="space-y-2"><Label htmlFor="client-email">Correo electrónico</Label><Input id="client-email" type="email" value={client.email} onChange={(event) => setField("email", event.target.value)} placeholder="cliente@empresa.com" /></div>
      <div className="space-y-2"><Label htmlFor="client-phone">Celular</Label><Input id="client-phone" type="tel" value={client.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="11 1234-5678" /></div>
      <div className="space-y-2"><Label htmlFor="client-cuit">CUIT</Label><Input id="client-cuit" value={client.cuit} onChange={(event) => setField("cuit", event.target.value)} placeholder="20-12345678-9" /></div>
      <div className="space-y-2"><Label htmlFor="client-address">Domicilio</Label><Input id="client-address" value={client.address} onChange={(event) => setField("address", event.target.value)} placeholder="Av. Siempre Viva 742" /></div>
      <div className="space-y-2"><Label htmlFor="client-zip">Código postal</Label><Input id="client-zip" value={client.zip} onChange={(event) => setField("zip", event.target.value)} placeholder="1722" /></div>
    </div>
  );
}

function ClientInvoices({ invoices, onDownload }: { invoices: Invoice[]; onDownload: (invoice: Invoice) => void }) {
  if (!invoices.length) {
    return <p className="rounded-xl border border-border/60 p-6 text-center text-sm text-muted-foreground">Este cliente todavía no tiene remitos emitidos.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-150 text-sm">
        <thead className="bg-background/60"><tr className="text-xs uppercase text-muted-foreground"><th className="px-4 py-3 text-left">Número</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Seña</th><th className="px-4 py-3">PDF</th></tr></thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="border-t border-border/40">
              <td className="px-4 py-3 font-mono">{invoice.number}</td>
              <td className="px-4 py-3 text-center text-muted-foreground">{new Date(`${invoice.issueDate}T00:00:00`).toLocaleDateString("es-AR")}</td>
              <td className="px-4 py-3 text-center font-semibold">{formatMoney(invoice.total, invoice.currency)}</td>
              <td className="px-4 py-3 text-center">{formatMoney(invoice.deposit, invoice.currency)}</td>
              <td className="px-4 py-3 text-center"><Button size="sm" variant="secondary" onClick={() => onDownload(invoice)}><Download className="mr-2 h-4 w-4" />Descargar</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
