import { createClient } from "@libsql/client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name} en el servidor.`);
  return value;
}

async function getUserId(request: VercelRequest): Promise<string | null> {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  const issuerValue = requiredEnv("KINDE_ISSUER_URL").replace(/\/+$/, "");
  const issuer = /^https?:\/\//i.test(issuerValue) ? issuerValue : `https://${issuerValue}`;
  try {
    const { payload } = await jwtVerify(authorization.slice(7), createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`)), {
      issuer,
      audience: requiredEnv("KINDE_CLIENT_ID"),
      requiredClaims: ["sub", "exp", "iat"],
    });
    return typeof payload.sub === "string" && payload.sub.trim() ? payload.sub.trim() : null;
  } catch {
    return null;
  }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Vary", "Authorization");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "Método no permitido." });
  }
  try {
    const userId = await getUserId(request);
    if (!userId) return response.status(401).json({ error: "Inicia sesión para consultar el plan." });
    const db = createClient({ url: requiredEnv("TURSO_DATABASE_URL"), authToken: requiredEnv("TURSO_AUTH_TOKEN") });
    await db.execute(`CREATE TABLE IF NOT EXISTS plan_subscriptions (
      user_id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const result = await db.execute({
      sql: "SELECT plan_id, starts_at, expires_at FROM plan_subscriptions WHERE user_id = ?",
      args: [userId],
    });
    const row = result.rows[0];
    if (!row) return response.status(200).json({ active: false, subscription: null });
    const subscription = {
      planId: String(row.plan_id),
      startsAt: String(row.starts_at),
      expiresAt: String(row.expires_at),
    };
    return response.status(200).json({ active: Date.parse(subscription.expiresAt) > Date.now(), subscription });
  } catch (error) {
    console.error("No se pudo consultar el plan", error);
    return response.status(503).json({ error: error instanceof Error ? error.message : "No se pudo consultar el plan." });
  }
}
