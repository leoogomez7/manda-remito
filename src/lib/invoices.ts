import { BUSINESS } from "./business";
import type { BusinessProfile } from "./business";
import { allocateInvoiceNumber, getCloudRecord, getCloudRecords, queueCloudChange } from "./cloud-sync";

export type DocType = "factura" | "recibo";
export type PaymentMethod = "credito" | "debito" | "transferencia" | "efectivo";
export type Currency = "ARS" | "USD";

export interface LineItem {
  id: string;
  quantity: number;
  description: string;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  number: string;
  type: DocType;
  createdAt: string;
  deliveryDate: string;
  currency: Currency;
  paymentMethod: PaymentMethod;
  client: {
    name: string;
    phone: string;
    cuit: string;
    address: string;
    zip: string;
    email: string;
  };
  items: LineItem[];
  deposit: number;
  notes: string;
  issueDate: string;
  subtotal: number;
  total: number;
  balance: number;
  status: "emitida" | "pendiente" | "borrador";
  settlesInvoiceId?: string;
  logoDataUrl?: string;
  businessProfile?: BusinessProfile;
}

const TRASH_RETENTION_MS = 5 * 24 * 60 * 60 * 1000;

export interface TrashEntry {
  id: string;
  kind: "invoice" | "draft";
  deletedAt: string;
  records: Invoice[];
}

// Variables de caché para estabilizar las referencias en React
let _cachedInvoices: Invoice[] | null = null;
let _cachedPendingRoot: Invoice[] | null = null;
let _cachedPendingAll: Invoice[] | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("mf:data-owner-changed", () => {
    _cachedInvoices = null;
    _cachedPendingRoot = null;
    _cachedPendingAll = null;
  });
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  credito: "Tarjeta de Crédito",
  debito: "Tarjeta de Débito",
  transferencia: "Transferencia Bancaria",
  efectivo: "Efectivo",
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  ARS: "$",
  USD: "US$",
};

export function formatMoney(amount: number, currency: Currency) {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${CURRENCY_SYMBOL[currency]} ${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function calcTotals(items: LineItem[], deposit: number) {
  const subtotal = items.reduce(
    (acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const total = subtotal;
  const balance = Math.max(0, total - (Number(deposit) || 0));
  return { subtotal, total, balance };
}

export function getInvoices(): Invoice[] {
  if (_cachedInvoices) return _cachedInvoices;
  _cachedInvoices = getCloudRecords("invoices") as unknown as Invoice[];
  return _cachedInvoices;
}

export function saveInvoices(list: Invoice[]) {
  const previous = _cachedInvoices ?? getCloudRecords("invoices") as unknown as Invoice[];
  const previousById = new Map(previous.map((invoice) => [invoice.id, invoice]));
  const nextIds = new Set(list.map((invoice) => invoice.id));
  const records = list.filter((invoice) => JSON.stringify(previousById.get(invoice.id)) !== JSON.stringify(invoice));
  const deleteIds = previous.filter((invoice) => !nextIds.has(invoice.id)).map((invoice) => invoice.id);
  _cachedInvoices = list;
  _cachedPendingRoot = null; // Invalidamos la caché al guardar
  _cachedPendingAll = null;
  if (records.length || deleteIds.length) {
    void queueCloudChange({ collection: "invoices", records: records as unknown as Record<string, unknown>[], deleteIds });
  }
}

export async function nextNumber(): Promise<string> {
  return allocateInvoiceNumber();
}

export function peekNextNumber(): string {
  return "Aleatorio";
}

export function getNextSettlementNumber(invoice: Invoice): string {
  const invoices = getInvoices();
  const selectedInvoice = invoices.find((item) => item.id === invoice.id) ?? invoice;
  const rootInvoice = findRootInvoice(selectedInvoice, invoices);
  const prefix = `${rootInvoice.number}-`;
  const trashEntries = getTrash().filter(
        (entry) =>
          entry.kind === "invoice" &&
          Number.isFinite(Date.parse(entry.deletedAt)) &&
          Date.now() - Date.parse(entry.deletedAt) < TRASH_RETENTION_MS,
      );
  const usedSuffixes = [...invoices, ...trashEntries.flatMap((entry) => entry.records)]
    .map((item) => item.number.startsWith(prefix) ? item.number.slice(prefix.length) : "")
    .filter((suffix) => /^[A-Z]+$/.test(suffix));
  const nextSuffixIndex = usedSuffixes.reduce(
    (max, suffix) => Math.max(max, lettersToIndex(suffix)),
    -1,
  ) + 1;

  return `${prefix}${indexToLetters(nextSuffixIndex)}`;
}

function lettersToIndex(letters: string): number {
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function indexToLetters(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export function addInvoice(invoice: Invoice) {
  const all = [...getInvoices()];
  all.unshift(invoice);
  saveInvoices(all);
}

export function removeInvoice(id: string) {
  const invoices = getInvoices();
  const invoice = invoices.find((item) => item.id === id);
  if (!invoice) return;

  saveInvoices(removeInvoiceRecord(id, invoices));
}

export function moveInvoiceToTrash(id: string): boolean {
  const invoices = getInvoices();
  const invoice = invoices.find((item) => item.id === id);
  if (!invoice) return false;

  // Logos are stored separately in the business profile. Do not duplicate large
  // base64 images in the five-day trash archive.
  const archivedInvoice: Invoice = {
    ...invoice,
    logoDataUrl: undefined,
    businessProfile: invoice.businessProfile
      ? { ...invoice.businessProfile, logoDataUrl: undefined }
      : undefined,
  };
  const entry: TrashEntry = {
    id: crypto.randomUUID(),
    kind: "invoice",
    deletedAt: new Date().toISOString(),
    records: [archivedInvoice],
  };

  try {
    // Removing it first frees the space needed to archive the invoice locally.
    saveInvoices(removeInvoiceRecord(id, invoices));
    if (addTrashEntry(entry)) return true;
  } catch (error) {
    console.error("No se pudo guardar el remito en la papelera", error);
  }

  // Keep the invoice visible if browser storage is still full.
  try {
    saveInvoices(invoices);
  } catch (error) {
    console.error("No se pudo restaurar el remito después del fallo de papelera", error);
  }
  return false;
}

function removeInvoiceRecord(id: string, invoices: Invoice[]): Invoice[] {
  const deletedInvoice = invoices.find((invoice) => invoice.id === id);
  if (!deletedInvoice) return invoices;

  const remaining = invoices.filter((invoice) => invoice.id !== id);
  const parentStillExists = deletedInvoice.settlesInvoiceId
    ? remaining.find((invoice) => invoice.id === deletedInvoice.settlesInvoiceId)
    : undefined;
  const directChildren = remaining
    .filter((invoice) => invoice.settlesInvoiceId === id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  if (directChildren.length === 0) return remaining;

  // Keep the saved balance/status on each remito. If the deleted record was
  // the root, the latest child becomes the root so the current saldo remains
  // authoritative instead of summing historical saldo snapshots.
  const replacementRoot = parentStillExists ? undefined : directChildren[0];
  return remaining.map((invoice) => {
    if (invoice.settlesInvoiceId !== id) return invoice;
    if (parentStillExists) {
      return { ...invoice, settlesInvoiceId: parentStillExists.id };
    }
    if (invoice.id === replacementRoot?.id) {
      return {
        ...invoice,
        settlesInvoiceId: undefined,
        deposit: deletedInvoice.deposit,
        balance: deletedInvoice.balance,
        status: deletedInvoice.status,
      };
    }
    return { ...invoice, settlesInvoiceId: replacementRoot?.id };
  });
}

export function updateInvoice(invoice: Invoice) {
  saveInvoices(getInvoices().map((existing) => (existing.id === invoice.id ? invoice : existing)));
}

function findRootInvoice(invoice: Invoice, allInvoices: Invoice[]): Invoice {
  let current = invoice;
  while (current.settlesInvoiceId) {
    const parent = allInvoices.find((item) => item.id === current.settlesInvoiceId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

function isLinkedToInvoice(invoice: Invoice, rootId: string, allInvoices: Invoice[]): boolean {
  let current = invoice;
  while (current.settlesInvoiceId) {
    if (current.settlesInvoiceId === rootId) return true;
    const parent = allInvoices.find((item) => item.id === current.settlesInvoiceId);
    if (!parent) break;
    current = parent;
  }
  return false;
}

// 💡 SE OPTIMIZÓ ACÁ: Si React llama seguido a esta función, devuelve la caché en memoria para que useMemo no se rompa
export function getPendingInvoices(rootOnly = false): Invoice[] {
  if (rootOnly && _cachedPendingRoot) return _cachedPendingRoot;
  if (!rootOnly && _cachedPendingAll) return _cachedPendingAll;

  const pending = getInvoices().filter((invoice) => invoice.status === "pendiente");
  const result = rootOnly ? pending.filter((invoice) => !invoice.settlesInvoiceId) : pending;

  if (rootOnly) _cachedPendingRoot = result;
  else _cachedPendingAll = result;

  return result;
}

export function settleInvoice(id: string, paymentAmount?: number) {
  const invoices = getInvoices();
  const invoice = invoices.find((invoice) => invoice.id === id);
  if (!invoice) return;

  const rootInvoice = findRootInvoice(invoice, invoices);
  const payment = Number(paymentAmount || 0);
  const updatedBalance = Math.max(0, rootInvoice.balance - payment);
  const updatedRootInvoice: Invoice = {
    ...rootInvoice,
    deposit: rootInvoice.deposit + payment,
    balance: updatedBalance,
    status: updatedBalance > 0 ? "pendiente" : "emitida",
    notes: `${rootInvoice.notes ? `${rootInvoice.notes} | ` : ""}Pago ${formatMoney(
      payment,
      rootInvoice.currency,
    )}`,
  };

  saveInvoices(
    invoices.map((item) => {
      if (item.id === updatedRootInvoice.id) {
        return updatedRootInvoice;
      }
      if (isLinkedToInvoice(item, updatedRootInvoice.id, invoices)) {
        return {
          ...item,
          status: updatedRootInvoice.status,
        };
      }
      return item;
    }),
  );
}

export function getDrafts(): Invoice[] {
  return [...getCloudRecords("drafts")] as unknown as Invoice[];
}

export function saveDrafts(list: Invoice[]) {
  const previous = getCloudRecords("drafts") as unknown as Invoice[];
  const previousById = new Map(previous.map((draft) => [draft.id, draft]));
  const nextIds = new Set(list.map((draft) => draft.id));
  const records = list.filter((draft) => JSON.stringify(previousById.get(draft.id)) !== JSON.stringify(draft));
  const deleteIds = previous.filter((draft) => !nextIds.has(draft.id)).map((draft) => draft.id);
  if (records.length || deleteIds.length) {
    void queueCloudChange({ collection: "drafts", records: records as unknown as Record<string, unknown>[], deleteIds });
  }
}

export function addDraft(draft: Invoice) {
  const drafts = getDrafts().filter((existing) => existing.id !== draft.id);
  drafts.unshift(draft);
  saveDrafts(drafts);
}

export function removeDraft(id: string) {
  saveDrafts(getDrafts().filter((d) => d.id !== id));
}

export function moveDraftToTrash(id: string) {
  const draft = getDrafts().find((item) => item.id === id);
  if (!draft) return;
  addTrashEntry({
    id: crypto.randomUUID(),
    kind: "draft",
    deletedAt: new Date().toISOString(),
    records: [draft],
  });
  removeDraft(id);
}

export function getTrash(): TrashEntry[] {
  const entries = getCloudRecords("trash") as unknown as TrashEntry[];
  const activeEntries = entries.filter((entry) => {
    const deletedAt = Date.parse(entry.deletedAt);
    return Number.isFinite(deletedAt) && Date.now() - deletedAt < TRASH_RETENTION_MS;
  });
  if (activeEntries.length !== entries.length) saveTrash(activeEntries);
  return activeEntries;
}

export function restoreTrashEntry(id: string) {
  const entries = getTrash();
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;

  if (entry.kind === "invoice") {
    const currentIds = new Set(getInvoices().map((invoice) => invoice.id));
    saveInvoices([...entry.records.filter((invoice) => !currentIds.has(invoice.id)), ...getInvoices()]);
  } else {
    const currentIds = new Set(getDrafts().map((draft) => draft.id));
    saveDrafts([...entry.records.filter((draft) => !currentIds.has(draft.id)), ...getDrafts()]);
  }
  saveTrash(entries.filter((item) => item.id !== id));
}

export function permanentlyDeleteTrashEntry(id: string) {
  saveTrash(getTrash().filter((entry) => entry.id !== id));
}

function addTrashEntry(entry: TrashEntry): boolean {
  return saveTrash([entry, ...getTrash()]);
}

function saveTrash(entries: TrashEntry[]): boolean {
  const previous = getCloudRecords("trash") as unknown as TrashEntry[];
  const previousById = new Map(previous.map((entry) => [entry.id, entry]));
  const nextIds = new Set(entries.map((entry) => entry.id));
  const records = entries.filter((entry) => JSON.stringify(previousById.get(entry.id)) !== JSON.stringify(entry));
  const deleteIds = previous.filter((entry) => !nextIds.has(entry.id)).map((entry) => entry.id);
  if (records.length || deleteIds.length) {
    void queueCloudChange({ collection: "trash", records: records as unknown as Record<string, unknown>[], deleteIds });
  }
  return true;
}

export function updateDraft(updated: Invoice) {
  saveDrafts(getDrafts().map((draft) => (draft.id === updated.id ? updated : draft)));
}

export function saveDraft(data: unknown) {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    void queueCloudChange({
      collection: "working_drafts",
      records: [{ id: "current", draft: data as Record<string, unknown> }],
    });
  }
}

export function loadDraft<T>(): T | null {
  const current = getCloudRecord("working_drafts", "current")?.draft;
  return current && typeof current === "object" ? current as T : null;
}

export function clearDraft() {
  void queueCloudChange({ collection: "working_drafts", deleteIds: ["current"] });
}

export { BUSINESS };
