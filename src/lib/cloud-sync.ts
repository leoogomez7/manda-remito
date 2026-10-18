export type CloudCollection = "business_profiles" | "clients" | "invoices" | "drafts" | "working_drafts" | "trash" | "counters";
type CloudDelta = {
  collection: CloudCollection;
  records?: Record<string, unknown>[];
  deleteIds?: string[];
  value?: Record<string, unknown>;
};
type PendingCloudChange = CloudDelta;
type TokenGetter = () => Promise<string | undefined>;
type CloudSnapshot = {
  business_profiles: Record<string, unknown> | null;
  clients: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  drafts: Record<string, unknown>[];
  working_drafts: Record<string, unknown>[];
  trash: Record<string, unknown>[];
  counters: Record<string, unknown>[];
};

const LEGACY_MIGRATION_KEY = "mf:cloud-legacy-migrated";
let dataOwnerEmail: string | undefined;
let tokenGetter: TokenGetter | undefined;
const queueFlushes = new Map<string, Promise<void>>();

const BASE_KEYS = ["mf:invoices", "mf:counter", "mf:draft", "mf:drafts", "mf:trash", "mf:counters", "mf:clients"] as const;

export function scopedStorageKey(key: string, userEmail = dataOwnerEmail) {
  const owner = userEmail?.trim().toLowerCase() || "anonymous";
  return `${key}:${encodeURIComponent(owner)}`;
}

export function setDataOwner(userEmail?: string) {
  dataOwnerEmail = userEmail?.trim().toLowerCase() || undefined;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("mf:data-owner-changed"));
  }
}

function pendingQueueKey(userEmail = dataOwnerEmail) {
  return scopedStorageKey("mf:cloud-pending", userEmail);
}

function parseArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(scopedStorageKey(key)) || "[]") as unknown;
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function writeLocal(collection: Exclude<CloudCollection, "business_profiles">, values: Record<string, unknown>[]) {
  const key = {
    clients: "mf:clients",
    invoices: "mf:invoices",
    drafts: "mf:drafts",
    working_drafts: "mf:working-drafts",
    trash: "mf:trash",
    counters: "mf:counters",
  }[collection];
  localStorage.setItem(scopedStorageKey(key), JSON.stringify(values));
}

function collectionKey(collection: Exclude<CloudCollection, "business_profiles">) {
  return { clients: "mf:clients", invoices: "mf:invoices", drafts: "mf:drafts", working_drafts: "mf:working-drafts", trash: "mf:trash", counters: "mf:counters" }[collection];
}

function mergeRecords(remote: Record<string, unknown>[], local: Record<string, unknown>[]) {
  const merged = new Map<string, Record<string, unknown>>();
  for (const record of remote) {
    if (typeof record.id === "string") merged.set(record.id, record);
  }
  for (const record of local) {
    if (typeof record.id === "string" && !merged.has(record.id)) merged.set(record.id, record);
  }
  return [...merged.values()];
}

function readPending(userEmail = dataOwnerEmail): PendingCloudChange[] {
  try {
    const value = JSON.parse(localStorage.getItem(pendingQueueKey(userEmail)) || "[]") as unknown;
    return Array.isArray(value) ? value as PendingCloudChange[] : [];
  } catch {
    return [];
  }
}

function writePending(changes: PendingCloudChange[], userEmail = dataOwnerEmail) {
  if (typeof window === "undefined") return;
  localStorage.setItem(pendingQueueKey(userEmail), JSON.stringify(changes));
}

async function requestCloud<T>(method: "GET" | "PUT" | "POST", body?: unknown, getToken = tokenGetter): Promise<T> {
  const token = await getToken?.();
  if (!token) throw new Error("No se pudo obtener la sesión segura para sincronizar.");
  const response = await fetch("/api/data", {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "Falló la sincronización con Turso.");
  return payload;
}

async function flushPendingQueue(owner = dataOwnerEmail, getToken = tokenGetter) {
  if (!owner || !getToken) return;
  const activeFlush = queueFlushes.get(owner);
  if (activeFlush) return activeFlush;
  const activeFlushPromise = (async () => {
    while (true) {
      const pending = readPending(owner);
      const change = pending[0];
      if (!change) break;
      await requestCloud("PUT", change, getToken);
      const currentPending = readPending(owner);
      const completedIndex = currentPending.findIndex((item) => JSON.stringify(item) === JSON.stringify(change));
      if (completedIndex >= 0) currentPending.splice(completedIndex, 1);
      writePending(currentPending, owner);
    }
  })();
  queueFlushes.set(owner, activeFlushPromise);
  try {
    await activeFlushPromise;
  } finally {
    if (queueFlushes.get(owner) === activeFlushPromise) queueFlushes.delete(owner);
  }
}

export async function queueCloudChange(change: CloudDelta) {
  const owner = dataOwnerEmail;
  const getToken = tokenGetter;
  if (typeof window === "undefined" || !owner || !getToken) return;
  const pending = readPending(owner);
  const records = change.records ?? [];
  for (let offset = 0; offset < records.length; offset += 100) {
    pending.push({ ...change, records: records.slice(offset, offset + 100), deleteIds: [] });
  }
  const deletes = change.deleteIds ?? [];
  for (let offset = 0; offset < deletes.length; offset += 100) {
    pending.push({ collection: change.collection, records: [], deleteIds: deletes.slice(offset, offset + 100) });
  }
  if (change.value) pending.push({ collection: change.collection, value: change.value });
  try {
    writePending(pending, owner);
  } catch (error) {
    console.warn("No hay espacio para guardar la cola local; se intentará sincronizar directamente", error);
    try {
      await requestCloud("PUT", change, getToken);
    } catch (syncError) {
      console.error("No se pudo guardar el cambio localmente ni sincronizarlo con la nube", syncError);
    }
    return;
  }
  try {
    await flushPendingQueue(owner, getToken);
  } catch (error) {
    console.error("Los cambios quedaron en cola y se sincronizarán cuando vuelva la conexión", error);
  }
}

function migrateLegacyLocalData() {
  if (localStorage.getItem(LEGACY_MIGRATION_KEY)) return;
  for (const key of BASE_KEYS) {
    const legacy = localStorage.getItem(key);
    const anonymous = localStorage.getItem(`${key}:anonymous`);
    const scoped = scopedStorageKey(key);
    const current = localStorage.getItem(scoped);
    if (!current) {
      const source = legacy ?? anonymous;
      if (source) localStorage.setItem(scoped, source);
      continue;
    }
    if (!anonymous || key === "mf:counter") continue;
    try {
      if (key === "mf:draft") continue;
      const currentValues = JSON.parse(current) as unknown;
      const anonymousValues = JSON.parse(anonymous) as unknown;
      if (Array.isArray(currentValues) && Array.isArray(anonymousValues)) {
        const byId = new Map<string, Record<string, unknown>>();
        for (const record of [...anonymousValues, ...currentValues]) {
          if (record && typeof record === "object" && typeof (record as { id?: unknown }).id === "string") {
            byId.set((record as { id: string }).id, record as Record<string, unknown>);
          }
        }
        localStorage.setItem(scoped, JSON.stringify([...byId.values()]));
      }
    } catch {
      // Leave the already-scoped account data intact if an old cache is malformed.
    }
  }
  localStorage.setItem(LEGACY_MIGRATION_KEY, "true");
}

function queueMissingRecords(
  collection: Exclude<CloudCollection, "business_profiles">,
  remote: Record<string, unknown>[],
  local: Record<string, unknown>[],
  userEmail = dataOwnerEmail,
) {
  const remoteIds = new Set(remote.map((record) => record.id).filter((id): id is string => typeof id === "string"));
  const missing = local.filter((record) => typeof record.id === "string" && !remoteIds.has(record.id));
  if (missing.length) {
    const pending = readPending(userEmail);
    for (let offset = 0; offset < missing.length; offset += 100) {
      pending.push({ collection, records: missing.slice(offset, offset + 100) });
    }
    writePending(pending, userEmail);
  }
}

export async function bootstrapCloudData(userEmail: string, getIdToken: TokenGetter) {
  setDataOwner(userEmail);
  tokenGetter = getIdToken;
  migrateLegacyLocalData();
  await flushPendingQueue(userEmail, getIdToken);

  let { data } = await requestCloud<{ data: CloudSnapshot }>("GET", undefined, getIdToken);
  const collections: Array<Exclude<CloudCollection, "business_profiles">> = [
    "clients", "invoices", "drafts", "working_drafts", "trash", "counters",
  ];
  for (const collection of collections) {
    const local = parseArray<Record<string, unknown>>(collectionKey(collection));
    const remote = data[collection] ?? [];
    queueMissingRecords(collection, remote, local, userEmail);
    writeLocal(collection, mergeRecords(remote, local));
  }

  const counterKey = scopedStorageKey("mf:counter");
  const remoteCounter = Math.max(0, ...((data.counters ?? [])
    .map((record) => Number(record.value))
    .filter((value) => Number.isFinite(value))));
  const localCounter = Number(localStorage.getItem(counterKey) || "0");
  const invoiceCounter = parseArray<Record<string, unknown>>("mf:invoices").reduce((max, invoice) => {
    const match = typeof invoice.number === "string" ? invoice.number.match(/^MF-(\d{6,})/) : null;
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const nextCounter = Math.max(remoteCounter, localCounter, invoiceCounter);
  localStorage.setItem(counterKey, String(nextCounter));
  if (nextCounter > remoteCounter) {
    const pending = readPending(userEmail);
    pending.push({ collection: "counters", records: [{ id: "global", value: nextCounter }] });
    writePending(pending, userEmail);
  }

  const profileKey = scopedStorageKey("mf:business-profile", userEmail);
  const anonymousProfileKey = "mf:business-profile:anonymous";
  const localProfile = (() => {
    try {
      return JSON.parse(localStorage.getItem(profileKey) || localStorage.getItem(anonymousProfileKey) || "null") as Record<string, unknown> | null;
    }
    catch { return null; }
  })();
  if (!data.business_profiles && localProfile) {
    localStorage.setItem(profileKey, JSON.stringify(localProfile));
    const pending = readPending(userEmail);
    pending.push({ collection: "business_profiles", value: localProfile });
    writePending(pending, userEmail);
  } else if (data.business_profiles) {
    localStorage.setItem(profileKey, JSON.stringify(data.business_profiles));
  }

  const workingDraftKey = scopedStorageKey("mf:draft", userEmail);
  const localWorkingDraft = (() => {
    try {
      return JSON.parse(localStorage.getItem(workingDraftKey) || "null") as Record<string, unknown> | null;
    } catch { return null; }
  })();
  const cloudWorkingDraft = (data.working_drafts ?? []).find((record) => record.id === "current");
  if (!cloudWorkingDraft && localWorkingDraft) {
    const pending = readPending(userEmail);
    pending.push({ collection: "working_drafts", records: [{ id: "current", draft: localWorkingDraft }] });
    writePending(pending, userEmail);
  }

  await flushPendingQueue();
  // Refresh from the database after migrating older device-local records.
  ({ data } = await requestCloud<{ data: CloudSnapshot }>("GET", undefined, getIdToken));
  for (const collection of collections) writeLocal(collection, data[collection] ?? []);
  if (data.business_profiles) localStorage.setItem(profileKey, JSON.stringify(data.business_profiles));
  const synchronizedWorkingDraft = (data.working_drafts ?? []).find((record) => record.id === "current");
  if (synchronizedWorkingDraft && synchronizedWorkingDraft.draft && typeof synchronizedWorkingDraft.draft === "object") {
    localStorage.setItem(workingDraftKey, JSON.stringify(synchronizedWorkingDraft.draft));
  } else {
    localStorage.removeItem(workingDraftKey);
  }

  window.dispatchEvent(new Event("mf:cloud-data-ready"));
}

export function clearCloudSession() {
  tokenGetter = undefined;
  setDataOwner(undefined);
}

export async function allocateInvoiceNumber() {
  const owner = dataOwnerEmail;
  const getToken = tokenGetter;
  const result = await requestCloud<{ number: string }>("POST", { action: "allocate-invoice-number" }, getToken);
  const parsed = Number(result.number.match(/^MF-(\d+)$/)?.[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("Turso devolvió un número de remito inválido.");
  if (owner) localStorage.setItem(scopedStorageKey("mf:counter", owner), String(parsed));
  return result.number;
}

export async function flushCloudChanges() {
  await flushPendingQueue();
}