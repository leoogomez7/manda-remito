import { BUSINESS } from "./business";

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
}

const KEY_INVOICES = "mf:invoices";
const KEY_COUNTER = "mf:counter";
const KEY_DRAFT = "mf:draft";
const KEY_DRAFTS = "mf:drafts";

// Variables de caché para estabilizar las referencias en React
let _cachedInvoices: Invoice[] | null = null;
let _cachedPendingRoot: Invoice[] | null = null;
let _cachedPendingAll: Invoice[] | null = null;

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  credito: "Tarjeta de Crédito",
  debito: "Tarjeta de Débito",
  transferencia: "Transferencia Bancaria",
  efectivo: "Efectivo / Contado",
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

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getInvoices(): Invoice[] {
  if (typeof window === "undefined") return [];
  if (_cachedInvoices) return _cachedInvoices; // 💡 Retorna la misma referencia estable
  _cachedInvoices = safeParse<Invoice[]>(localStorage.getItem(KEY_INVOICES), []);
  return _cachedInvoices;
}

export function saveInvoices(list: Invoice[]) {
  _cachedInvoices = list;
  _cachedPendingRoot = null; // Invalidamos la caché al guardar
  _cachedPendingAll = null;
  localStorage.setItem(KEY_INVOICES, JSON.stringify(list));
}

export function nextNumber(): string {
  const current = Number(localStorage.getItem(KEY_COUNTER) || "0");
  const next = current + 1;
  localStorage.setItem(KEY_COUNTER, String(next));
  return `MF-${String(next).padStart(6, "0")}`;
}

export function peekNextNumber(): string {
  const current = Number(localStorage.getItem(KEY_COUNTER) || "0");
  return `MF-${String(current + 1).padStart(6, "0")}`;
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

  const rootInvoice = findRootInvoice(invoice, invoices);
  saveInvoices(
    invoices.filter(
      (item) => item.id !== rootInvoice.id && !isLinkedToInvoice(item, rootInvoice.id, invoices),
    ),
  );
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
  if (typeof window === "undefined") return [];
  return safeParse<Invoice[]>(localStorage.getItem(KEY_DRAFTS), []);
}

export function saveDrafts(list: Invoice[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_DRAFTS, JSON.stringify(list));
}

export function addDraft(draft: Invoice) {
  const drafts = getDrafts();
  drafts.unshift(draft);
  saveDrafts(drafts);
}

export function removeDraft(id: string) {
  saveDrafts(getDrafts().filter((d) => d.id !== id));
}

export function updateDraft(updated: Invoice) {
  saveDrafts(getDrafts().map((draft) => (draft.id === updated.id ? updated : draft)));
}

export function saveDraft(data: unknown) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_DRAFT, JSON.stringify(data));
}

export function loadDraft<T>(): T | null {
  if (typeof window === "undefined") return null;
  return safeParse<T | null>(localStorage.getItem(KEY_DRAFT), null);
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_DRAFT);
}

export { BUSINESS };
