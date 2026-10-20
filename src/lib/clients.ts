import type { Invoice } from "@/lib/invoices";
import { getCloudRecords, queueCloudChange } from "@/lib/cloud-sync";

export type ClientData = Invoice["client"];

export interface SavedClient {
  id: string;
  createdAt: string;
  client: ClientData;
  deletedAt?: string;
}

export function getSavedClients(userEmail?: string): SavedClient[] {
  void userEmail;
  return (getCloudRecords("clients") as unknown as SavedClient[]).filter((item) => !item.deletedAt);
}

export function saveClient(client: ClientData, userEmail?: string, id?: string) {
  void userEmail;
  const clients = getCloudRecords("clients") as unknown as SavedClient[];
  const existing = id
    ? clients.find((item) => item.id === id)
    : clients.find((item) => sameClient(item.client, client));
  const savedClient: SavedClient = {
    id: existing?.id ?? id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    client: { ...client },
  };
  const updated = existing
    ? clients.map((item) => item.id === existing.id ? savedClient : item)
    : [savedClient, ...clients];
  void queueCloudChange({ collection: "clients", records: [savedClient as unknown as Record<string, unknown>] });
  return savedClient;
}

export function mergeClientsWithInvoices(savedClients: SavedClient[], invoices: Invoice[]): ClientData[] {
  const clients = savedClients.map((item) => item.client);
  const deletedClients = (getCloudRecords("clients") as unknown as SavedClient[])
    .filter((item) => item.deletedAt)
    .map((item) => item.client);
  for (const invoice of invoices) {
    if (!clients.some((client) => sameClient(client, invoice.client)) &&
      !deletedClients.some((client) => sameClient(client, invoice.client))) {
      clients.push(invoice.client);
    }
  }
  return clients;
}

export function removeClientFromAgenda(client: ClientData, userEmail?: string): void {
  void userEmail;
  const savedClients = getCloudRecords("clients") as unknown as SavedClient[];
  const existing = savedClients.find((item) => sameClient(item.client, client));
  const deletedClient: SavedClient = {
    id: existing?.id ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    client: { ...client },
    deletedAt: new Date().toISOString(),
  };
  void queueCloudChange({ collection: "clients", records: [deletedClient as unknown as Record<string, unknown>] });
}

export function sameClient(left: ClientData, right: ClientData): boolean {
  if (left.cuit.trim() && right.cuit.trim()) {
    return left.cuit.trim().toLowerCase() === right.cuit.trim().toLowerCase();
  }
  if (left.email.trim() && right.email.trim()) {
    return left.email.trim().toLowerCase() === right.email.trim().toLowerCase();
  }
  return left.name.trim().toLowerCase() === right.name.trim().toLowerCase() &&
    left.phone.replace(/\D/g, "") === right.phone.replace(/\D/g, "");
}

export function emptyClient(): ClientData {
  return { name: "", phone: "", cuit: "", address: "", zip: "", email: "" };
}