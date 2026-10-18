import type { Invoice } from "@/lib/invoices";
import { getCloudRecords, queueCloudChange } from "@/lib/cloud-sync";

export type ClientData = Invoice["client"];

export interface SavedClient {
  id: string;
  createdAt: string;
  client: ClientData;
}

export function getSavedClients(userEmail?: string): SavedClient[] {
  void userEmail;
  return getCloudRecords("clients") as unknown as SavedClient[];
}

export function saveClient(client: ClientData, userEmail?: string, id?: string) {
  void userEmail;
  const clients = getSavedClients(userEmail);
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
  for (const invoice of invoices) {
    if (!clients.some((client) => sameClient(client, invoice.client))) {
      clients.push(invoice.client);
    }
  }
  return clients;
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