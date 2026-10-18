import { createClient } from "@libsql/client";
import { jwtVerify, createRemoteJWKSet } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const TABLES = ["business_profiles", "clients", "invoices", "drafts", "working_drafts", "trash", "counters", "pending_checkouts"] as const;
type Collection = (typeof TABLES)[number];
type Payload = {
  collection: Collection;
  value?: unknown;
  records?: unknown[];
  deleteIds?: string[];
};

let schemaReady: Promise<void> | undefined;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name} en el servidor.`);
  return value;
}

function normalizeIssuerDomain(): string {
  const domain = requiredEnv("KINDE_ISSUER_URL").replace(/\/+$/, "");
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

async function getAuthenticatedUser(request: VercelRequest): Promise<string | null> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;

  const issuer = normalizeIssuerDomain();
  const audience = requiredEnv("KINDE_CLIENT_ID");
  try {
    const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
    const { payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer,
      audience,
      requiredClaims: ["sub", "exp", "iat"],
    });
    const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
    return subject || null;
  } catch {
    return null;
  }
}

async function getDatabase() {
  const db = createClient({
    url: requiredEnv("TURSO_DATABASE_URL"),
    authToken: requiredEnv("TURSO_AUTH_TOKEN"),
  });

  schemaReady ??= db.batch([
    `CREATE TABLE IF NOT EXISTS business_profiles (
      user_id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS clients (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS invoices (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS drafts (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS working_drafts (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS trash (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS counters (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, id)
    )`,
    `CREATE TABLE IF NOT EXISTS pending_checkouts (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, id)
    )`,
    "CREATE INDEX IF NOT EXISTS clients_user_updated ON clients(user_id, updated_at)",
    "CREATE INDEX IF NOT EXISTS invoices_user_updated ON invoices(user_id, updated_at)",
    "CREATE INDEX IF NOT EXISTS drafts_user_updated ON drafts(user_id, updated_at)",
    "CREATE INDEX IF NOT EXISTS trash_user_updated ON trash(user_id, updated_at)",
    "CREATE INDEX IF NOT EXISTS pending_checkouts_user_updated ON pending_checkouts(user_id, updated_at)",
  ]).then(() => undefined).catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  await schemaReady;
  return db;
}

function isCollection(value: unknown): value is Collection {
  return typeof value === "string" && TABLES.includes(value as Collection);
}

function getRecordId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 && id.length <= 200 ? id : null;
}

function getProfileId(userId: string) {
  return userId;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Vary", "Authorization");

  if (request.method !== "GET" && request.method !== "PUT" && request.method !== "POST") {
    response.setHeader("Allow", "GET, PUT, POST");
    return response.status(405).json({ error: "Método no permitido." });
  }

  let userId: string | null;
  try {
    userId = await getAuthenticatedUser(request);
  } catch (error) {
    console.error("Fallo al verificar la sesión Kinde", error);
    return response.status(500).json({ error: "No se pudo verificar la sesión." });
  }
  if (!userId) return response.status(401).json({ error: "Inicia sesión para acceder a tus datos." });

  let db;
  try {
    db = await getDatabase();
  } catch (error) {
    console.error("Fallo al conectar/inicializar Turso", error);
    const message = error instanceof Error ? error.message : "Error de configuración de base de datos.";
    return response.status(503).json({ error: message });
  }

  if (request.method === "GET") {
    try {
        const result = await db.batch(TABLES.map((collection) => ({
          sql: collection === "business_profiles"
            ? "SELECT value FROM business_profiles WHERE user_id = ?"
            : `SELECT id, value FROM ${collection} WHERE user_id = ? ORDER BY updated_at DESC`,
          args: [collection === "business_profiles" ? getProfileId(userId) : userId],
        })), "read");
      const data: Record<string, unknown> = {};
      TABLES.forEach((collection, index) => {
        const rows = result[index].rows.map((row) => {
          const value = JSON.parse(String(row.value)) as unknown;
            return collection === "business_profiles" ? value : { id: String(row.id), value };
        });
        data[collection] = collection === "business_profiles" ? rows[0] ?? null : rows.map((row) => {
          const record = row as { id: string; value: unknown };
          return { ...(record.value as object), id: record.id };
        });
      });
      return response.status(200).json({ data });
    } catch (error) {
      console.error("No se pudieron leer los datos de Turso", error);
      return response.status(500).json({ error: "No se pudieron cargar los datos de la cuenta." });
    }
  }

  const body = request.body as Partial<Payload> | undefined;
  if (request.method === "POST") {
    if ((body as (Partial<Payload> & { action?: string }) | undefined)?.action !== "allocate-invoice-number") {
      return response.status(400).json({ error: "Acción inválida." });
    }
    try {
      const result = await db.execute({
        sql: `INSERT INTO counters (user_id, id, value, updated_at)
          VALUES (?, 'global', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, id) DO UPDATE SET
            value = json_set(counters.value, '$.value', CAST(json_extract(counters.value, '$.value') AS INTEGER) + 1),
            updated_at = CURRENT_TIMESTAMP
          RETURNING value`,
        args: [userId, JSON.stringify({ id: "global", value: 1 })],
      });
      const stored = JSON.parse(String(result.rows[0]?.value ?? "{}")) as { value?: unknown };
      const next = Number(stored.value);
      if (!Number.isSafeInteger(next) || next < 1) throw new Error("El contador de remitos no devolvió un número válido.");
      return response.status(200).json({ number: `MF-${String(next).padStart(6, "0")}` });
    } catch (error) {
      console.error("No se pudo asignar un número de remito", error);
      return response.status(503).json({ error: "No se pudo asignar el número del remito. Verifica la conexión con Turso e intenta otra vez." });
    }
  }

  if (!body || !isCollection(body.collection)) {
    return response.status(400).json({ error: "Colección inválida." });
  }

  try {
    if (body.collection === "business_profiles") {
      if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
        return response.status(400).json({ error: "Perfil inválido." });
      }
      await db.execute({
        sql: `INSERT INTO business_profiles (user_id, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        args: [userId, JSON.stringify(body.value)],
      });
      return response.status(200).json({ ok: true });
    }

    const records = body.records ?? (body.value !== undefined ? [body.value] : []);
    if (!Array.isArray(records) || records.length > 100 || JSON.stringify(body).length > 4_000_000) {
      return response.status(413).json({ error: "La sincronización supera el tamaño permitido." });
    }
    const deleteIds = Array.isArray(body.deleteIds)
      ? body.deleteIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 200).slice(0, 100)
      : [];
    const statements = records.map((record) => {
      const id = getRecordId(record);
      if (!id) throw new Error("Registro sin identificador válido.");
      return {
        sql: `INSERT INTO ${body.collection} (user_id, id, value, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, id) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        args: [userId, id, JSON.stringify(record)],
      };
    });
    for (const id of deleteIds) {
      statements.push({ sql: `DELETE FROM ${body.collection} WHERE user_id = ? AND id = ?`, args: [userId, id] });
    }
    if (statements.length) await db.batch(statements, "write");
    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error("No se pudieron guardar los datos en Turso", error);
    return response.status(500).json({ error: "No se pudieron guardar los datos." });
  }
}