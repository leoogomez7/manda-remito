export type CloudCollection = "business_profiles" | "clients" | "invoices" | "drafts" | "working_drafts" | "trash" | "counters" | "pending_checkouts";
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
  pending_checkouts: Record<string, unknown>[];
};

let dataOwnerEmail: string | undefined;
let tokenGetter: TokenGetter | undefined;
const queueFlushes = new Map<string, Promise<void>>();
const pendingMemory = new Map<string, PendingCloudChange[]>();
let cloudSnapshot: CloudSnapshot | null = null;
let cloudProfile: Record<string, unknown> | null = null;
const CLOUD_CACHE_DB = "manda-remito-cloud-cache";
const CLOUD_CACHE_STORE = "snapshots";
const GUEST_CHECKOUT_STORE = "guest-checkouts";

function openCloudCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CLOUD_CACHE_DB, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CLOUD_CACHE_STORE)) {
        request.result.createObjectStore(CLOUD_CACHE_STORE);
      }
      if (!request.result.objectStoreNames.contains(GUEST_CHECKOUT_STORE)) {
        request.result.createObjectStore(GUEST_CHECKOUT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir la caché local."));
  });
}

async function readCloudCache(userEmail: string): Promise<CloudSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openCloudCache();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(CLOUD_CACHE_STORE, "readonly");
    const request = transaction.objectStore(CLOUD_CACHE_STORE).get(userEmail.trim().toLowerCase());
    request.onsuccess = () => resolve(request.result ? request.result as CloudSnapshot : null);
    request.onerror = () => reject(request.error ?? new Error("No se pudo leer la caché local."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

async function persistCloudCache(userEmail = dataOwnerEmail) {
  if (typeof indexedDB === "undefined" || !userEmail || !cloudSnapshot) return;
  try {
    const database = await openCloudCache();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CLOUD_CACHE_STORE, "readwrite");
      transaction.objectStore(CLOUD_CACHE_STORE).put(
        { ...cloudSnapshot, business_profiles: cloudProfile },
        userEmail.trim().toLowerCase(),
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("No se pudo guardar la caché."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Se canceló el guardado de caché."));
    });
    database.close();
  } catch (error) {
    // Cache persistence is an optimization only; database writes remain authoritative.
    console.warn("No se pudo actualizar la caché local de Turso", error);
  }
}

export async function loadCachedCloudSnapshot(userEmail: string): Promise<boolean> {
  setDataOwner(userEmail);
  try {
    const cached = await readCloudCache(userEmail);
    if (!cached) return false;
    cloudSnapshot = { ...emptySnapshot(), ...cached };
    cloudProfile = cached.business_profiles ?? null;
    window.dispatchEvent(new Event("mf:cloud-data-ready"));
    return true;
  } catch (error) {
    console.warn("No se pudo leer la caché local; se cargarán los datos directamente de Turso", error);
    return false;
  }
}

export function scopedStorageKey(key: string, userEmail = dataOwnerEmail) {
  const owner = userEmail?.trim().toLowerCase() || "anonymous";
  return `${key}:${encodeURIComponent(owner)}`;
}

export function setDataOwner(userEmail?: string) {
  const nextOwner = userEmail?.trim().toLowerCase() || undefined;
  if (dataOwnerEmail !== nextOwner) {
    cloudSnapshot = null;
    cloudProfile = null;
  }
  dataOwnerEmail = nextOwner;
  if (!nextOwner) {
    cloudSnapshot = loadAnonymousSnapshot();
    cloudProfile = readAnonymousProfile();
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("mf:data-owner-changed"));
  }
}

function pendingQueueKey(userEmail = dataOwnerEmail) {
  return scopedStorageKey("mf:cloud-pending", userEmail);
}

function readPending(userEmail = dataOwnerEmail): PendingCloudChange[] {
  return [...(pendingMemory.get(pendingQueueKey(userEmail)) ?? [])];
}

function writePending(changes: PendingCloudChange[], userEmail = dataOwnerEmail) {
  pendingMemory.set(pendingQueueKey(userEmail), changes);
}

const emptySnapshot = (): CloudSnapshot => ({
  business_profiles: null,
  clients: [], invoices: [], drafts: [], working_drafts: [], trash: [], counters: [], pending_checkouts: [],
});

const ANONYMOUS_COLLECTION_KEYS: Partial<Record<Exclude<CloudCollection, "business_profiles" | "working_drafts">, string>> = {
  clients: "mf:clients",
  invoices: "mf:invoices",
  drafts: "mf:drafts",
  trash: "mf:trash",
  counters: "mf:counters",
  pending_checkouts: "mf:pending-checkouts",
};

function readAnonymousArray(key: string): Record<string, unknown>[] {
  try {
    const byId = new Map<string, Record<string, unknown>>();
    for (const storageKey of [`${key}:anonymous`, key]) {
      const value = JSON.parse(localStorage.getItem(storageKey) || "[]") as unknown;
      if (!Array.isArray(value)) continue;
      for (const record of value) {
        if (record && typeof record === "object" && typeof (record as { id?: unknown }).id === "string") {
          byId.set((record as { id: string }).id, record as Record<string, unknown>);
        }
      }
    }
    return [...byId.values()];
  } catch {
    return [];
  }
}

function readAnonymousProfile(): Record<string, unknown> | null {
  try {
    return JSON.parse(localStorage.getItem("mf:business-profile:anonymous") || localStorage.getItem("mf:business-profile") || "null") as Record<string, unknown> | null;
  } catch {
    return null;
  }
}

function loadAnonymousSnapshot(): CloudSnapshot {
  const snapshot = emptySnapshot();
  for (const [collection, key] of Object.entries(ANONYMOUS_COLLECTION_KEYS)) {
    snapshot[collection as keyof CloudSnapshot] = readAnonymousArray(key) as never;
  }
  try {
    const draft = JSON.parse(localStorage.getItem("mf:draft:anonymous") || localStorage.getItem("mf:draft") || "null") as Record<string, unknown> | null;
    if (draft && typeof draft === "object") snapshot.working_drafts = [{ id: "current", draft }];
  } catch {
    // Ignore malformed anonymous working-draft data and keep the remaining local data available.
  }
  snapshot.business_profiles = readAnonymousProfile();
  return snapshot;
}

function persistAnonymousChange(change: CloudDelta) {
  if (change.collection === "business_profiles") {
    if (change.value) localStorage.setItem("mf:business-profile:anonymous", JSON.stringify(change.value));
    return;
  }
  if (change.collection === "working_drafts") {
    const currentDraft = cloudSnapshot?.working_drafts.find((record) => record.id === "current")?.draft;
    if (currentDraft) localStorage.setItem("mf:draft:anonymous", JSON.stringify(currentDraft));
    else localStorage.removeItem("mf:draft:anonymous");
    return;
  }
  const key = ANONYMOUS_COLLECTION_KEYS[change.collection];
  if (key) localStorage.setItem(`${key}:anonymous`, JSON.stringify(cloudSnapshot?.[change.collection] ?? []));
}

export function getCloudRecords(collection: Exclude<CloudCollection, "business_profiles">): Record<string, unknown>[] {
  return cloudSnapshot?.[collection] ?? [];
}

export function getCloudProfile(): Record<string, unknown> | null {
  return cloudProfile;
}

export function getCloudRecord(collection: Exclude<CloudCollection, "business_profiles">, id: string): Record<string, unknown> | undefined {
  return getCloudRecords(collection).find((record) => record.id === id);
}

function applyCloudDelta(change: CloudDelta) {
  if (change.collection === "business_profiles") {
    if (change.value) cloudProfile = change.value;
    return;
  }
  if (!cloudSnapshot) cloudSnapshot = emptySnapshot();
  const current = cloudSnapshot[change.collection];
  const deletes = new Set(change.deleteIds ?? []);
  const byId = new Map(current.filter((record) => typeof record.id === "string" && !deletes.has(record.id)).map((record) => [record.id as string, record]));
  for (const record of change.records ?? []) {
    if (typeof record.id === "string") byId.set(record.id, record);
  }
  if (change.value && typeof change.value.id === "string") byId.set(change.value.id, change.value);
  cloudSnapshot[change.collection] = [...byId.values()];
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
    await persistCloudCache(owner);
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
  if (typeof window === "undefined") return;
  if (!owner || !getToken) {
    if (!cloudSnapshot) cloudSnapshot = loadAnonymousSnapshot();
    applyCloudDelta(change);
    try {
      persistAnonymousChange(change);
    } catch (error) {
      console.error("No se pudieron guardar los datos del visitante en este dispositivo", error);
    }
    return;
  }
  applyCloudDelta(change);
  const pending = readPending(owner);
  const records = change.records ?? [];
  for (let offset = 0; offset < records.length; offset += 10) {
    pending.push({ ...change, records: records.slice(offset, offset + 10), deleteIds: [] });
  }
  const deletes = change.deleteIds ?? [];
  for (let offset = 0; offset < deletes.length; offset += 100) {
    pending.push({ collection: change.collection, records: [], deleteIds: deletes.slice(offset, offset + 100) });
  }
  if (change.value) pending.push({ collection: change.collection, value: change.value });
  writePending(pending, owner);
  try {
    await flushPendingQueue(owner, getToken);
  } catch (error) {
    console.error("Los cambios quedaron en cola y se sincronizarán cuando vuelva la conexión", error);
  }
}

function readLegacyArray(key: string, userEmail: string): Record<string, unknown>[] {
  try {
    const scoped = localStorage.getItem(scopedStorageKey(key, userEmail));
    const anonymous = localStorage.getItem(`${key}:anonymous`);
    const unscoped = localStorage.getItem(key);
    const byId = new Map<string, Record<string, unknown>>();
    for (const raw of [anonymous, unscoped, scoped]) {
      const value = JSON.parse(raw || "[]") as unknown;
      if (!Array.isArray(value)) continue;
      for (const record of value) {
        if (record && typeof record === "object" && typeof (record as { id?: unknown }).id === "string") {
          byId.set((record as { id: string }).id, record as Record<string, unknown>);
        }
      }
    }
    return [...byId.values()];
  } catch {
    return [];
  }
}

function removeLegacyLocalData(userEmail: string) {
  const scopedSuffix = `:${encodeURIComponent(userEmail.trim().toLowerCase())}`;
  const unscopedKeys = new Set([
    "mf:invoices", "mf:counter", "mf:draft", "mf:drafts", "mf:trash", "mf:counters", "mf:clients",
    "mf:business-profile", "mf:cloud-pending", "mf:pending-remito-checkout",
  ]);
  const obsoleteKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith("mf:")) continue;
    if (key.endsWith(scopedSuffix) || key.endsWith(":anonymous") || unscopedKeys.has(key) || key === "mf:cloud-legacy-migrated") obsoleteKeys.push(key);
  }
  for (const key of obsoleteKeys) localStorage.removeItem(key);
}

async function migrateLegacyData(userEmail: string, data: CloudSnapshot, getToken: TokenGetter): Promise<boolean> {
  let changedCloudData = false;
  const legacyCollections: Array<{ collection: Exclude<CloudCollection, "business_profiles">; key: string }> = [
    { collection: "clients", key: "mf:clients" },
    { collection: "invoices", key: "mf:invoices" },
    { collection: "drafts", key: "mf:drafts" },
    { collection: "trash", key: "mf:trash" },
    { collection: "counters", key: "mf:counters" },
  ];

  for (const { collection, key } of legacyCollections) {
    const legacy = readLegacyArray(key, userEmail);
    const remoteIds = new Set((data[collection] ?? []).map((record) => record.id).filter((id): id is string => typeof id === "string"));
    const missing = legacy.filter((record) => typeof record.id === "string" && !remoteIds.has(record.id));
    for (let offset = 0; offset < missing.length; offset += 10) {
      await requestCloud("PUT", { collection, records: missing.slice(offset, offset + 10) }, getToken);
      changedCloudData = true;
    }
  }

  const profileKey = scopedStorageKey("mf:business-profile", userEmail);
  const oldProfile = (() => {
    try {
      return JSON.parse(localStorage.getItem(profileKey) || localStorage.getItem("mf:business-profile:anonymous") || "null") as Record<string, unknown> | null;
    } catch { return null; }
  })();
  if (!data.business_profiles && oldProfile) {
    await requestCloud("PUT", { collection: "business_profiles", value: oldProfile }, getToken);
    changedCloudData = true;
  }

  const workingDraftKey = scopedStorageKey("mf:draft", userEmail);
  const oldWorkingDraft = (() => {
    try {
      return JSON.parse(
        localStorage.getItem(workingDraftKey)
          || localStorage.getItem("mf:draft:anonymous")
          || localStorage.getItem("mf:draft")
          || "null",
      ) as Record<string, unknown> | null;
    }
    catch { return null; }
  })();
  if (!(data.working_drafts ?? []).some((record) => record.id === "current") && oldWorkingDraft) {
    await requestCloud("PUT", { collection: "working_drafts", records: [{ id: "current", draft: oldWorkingDraft }] }, getToken);
    changedCloudData = true;
  }

  const pendingCheckoutKey = scopedStorageKey("mf:pending-remito-checkout", userEmail);
  try {
    const oldPendingInvoice = JSON.parse(localStorage.getItem(pendingCheckoutKey) || "null") as Record<string, unknown> | null;
    if (typeof oldPendingInvoice?.number === "string" && !(data.pending_checkouts ?? []).some((record) => record.id === oldPendingInvoice.number)) {
      await requestCloud("PUT", {
        collection: "pending_checkouts",
        records: [{ id: oldPendingInvoice.number, invoice: oldPendingInvoice }],
      }, getToken);
      changedCloudData = true;
    }
  } catch {
    // Ignore a malformed obsolete checkout cache; the cloud remains authoritative.
  }

  const invoices = readLegacyArray("mf:invoices", userEmail);
  const storedCounter = Number(localStorage.getItem(scopedStorageKey("mf:counter", userEmail)) || "0");
  const invoiceCounter = invoices.reduce((max, invoice) => {
    const match = typeof invoice.number === "string" ? invoice.number.match(/^MF-(\d{6,})/) : null;
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const remoteCounter = Math.max(0, ...(data.counters ?? []).map((record) => Number(record.value) || 0));
  const counter = Math.max(storedCounter, invoiceCounter, remoteCounter);
  if (counter > remoteCounter) {
    await requestCloud("PUT", { collection: "counters", records: [{ id: "global", value: counter }] }, getToken);
    changedCloudData = true;
  }

  // Replay queued writes left by older releases before deleting their browser cache.
  const legacyQueueKey = scopedStorageKey("mf:cloud-pending", userEmail);
  try {
    const queued = JSON.parse(localStorage.getItem(legacyQueueKey) || "[]") as PendingCloudChange[];
    for (const change of queued) {
      await requestCloud("PUT", change, getToken);
      changedCloudData = true;
    }
  } catch (error) {
    if (error instanceof SyntaxError) console.warn("Se omitió una cola local antigua mal formada");
    else throw error;
  }
  return changedCloudData;
}

export async function bootstrapCloudData(userEmail: string, getIdToken: TokenGetter) {
  setDataOwner(userEmail);
  tokenGetter = getIdToken;
  await flushPendingQueue(userEmail, getIdToken);

  let { data } = await requestCloud<{ data: CloudSnapshot }>("GET", undefined, getIdToken);
  const migratedData = await migrateLegacyData(userEmail, data, getIdToken);
  if (migratedData) {
    ({ data } = await requestCloud<{ data: CloudSnapshot }>("GET", undefined, getIdToken));
  }

  cloudSnapshot = { ...emptySnapshot(), ...data };
  cloudProfile = data.business_profiles ?? null;
  pendingMemory.set(pendingQueueKey(userEmail), []);
  await persistCloudCache(userEmail);
  removeLegacyLocalData(userEmail);
  window.dispatchEvent(new Event("mf:cloud-data-ready"));
}

export function clearCloudSession() {
  tokenGetter = undefined;
  setDataOwner(undefined);
}

export async function allocateInvoiceNumber() {
  const getToken = tokenGetter;
  const result = await requestCloud<{ number: string }>("POST", { action: "allocate-invoice-number" }, getToken);
  const parsed = Number(result.number.match(/^MF-(\d+)$/)?.[1]);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("Turso devolvió un número de remito inválido.");
  applyCloudDelta({ collection: "counters", records: [{ id: "global", value: parsed }] });
  return result.number;
}

export async function flushCloudChanges() {
  await flushPendingQueue();
}

export async function saveGuestCheckout(reference: string, invoice: Record<string, unknown>) {
  if (typeof indexedDB === "undefined") throw new Error("Este navegador no permite guardar el checkout invitado.");
  const database = await openCloudCache();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(GUEST_CHECKOUT_STORE, "readwrite");
    transaction.objectStore(GUEST_CHECKOUT_STORE).put(invoice, reference);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("No se pudo guardar el remito pendiente."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Se canceló el guardado del remito pendiente."));
  });
  database.close();
}

export async function getGuestCheckout(reference: string): Promise<Record<string, unknown> | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openCloudCache();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(GUEST_CHECKOUT_STORE, "readonly");
    const request = transaction.objectStore(GUEST_CHECKOUT_STORE).get(reference);
    request.onsuccess = () => resolve(request.result ? request.result as Record<string, unknown> : null);
    request.onerror = () => reject(request.error ?? new Error("No se pudo recuperar el remito pendiente."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function removeGuestCheckout(reference: string) {
  if (typeof indexedDB === "undefined") return;
  const database = await openCloudCache();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(GUEST_CHECKOUT_STORE, "readwrite");
    transaction.objectStore(GUEST_CHECKOUT_STORE).delete(reference);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("No se pudo limpiar el remito pendiente."));
  });
  database.close();
}