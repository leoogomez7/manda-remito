import { createClient } from "@libsql/client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type PlanId = "bronze" | "silver" | "gold" | "platinum";
const PLANS: Record<PlanId, { months: number }> = {
  bronze: { months: 1 },
  silver: { months: 3 },
  gold: { months: 6 },
  platinum: { months: 12 },
};

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

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Vary", "Authorization");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Método no permitido." });
  }

  try {
    const userId = await getUserId(request);
    if (!userId) return response.status(401).json({ error: "Inicia sesión para activar un plan." });

    const body = request.body as { planId?: unknown; code?: unknown } | undefined;
    const planId = body?.planId;
    if (typeof planId !== "string" || !Object.prototype.hasOwnProperty.call(PLANS, planId)) {
      return response.status(400).json({ error: "El plan seleccionado no es válido." });
    }
    const configuredCode = process.env.GRATIS2026?.trim();
    if (!configuredCode) {
      return response.status(503).json({ error: "La variable de entorno GRATIS2026 no está configurada en este deployment." });
    }
    if (typeof body?.code !== "string" || body.code.trim().toUpperCase() !== configuredCode.toUpperCase()) {
      return response.status(400).json({ error: "El código promocional no es válido." });
    }

    const plan = PLANS[planId as PlanId];
    const db = createClient({ url: requiredEnv("TURSO_DATABASE_URL"), authToken: requiredEnv("TURSO_AUTH_TOKEN") });
    await db.execute(`CREATE TABLE IF NOT EXISTS plan_subscriptions (
      user_id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      payment_id TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    const startsAt = new Date();
    const expiresAt = addMonths(startsAt, plan.months);
    const startsIso = startsAt.toISOString();
    const expiresIso = expiresAt.toISOString();
    await db.execute({
      sql: `INSERT INTO plan_subscriptions (user_id, plan_id, starts_at, expires_at, payment_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET plan_id = excluded.plan_id, starts_at = excluded.starts_at,
        expires_at = excluded.expires_at, payment_id = excluded.payment_id, updated_at = excluded.updated_at`,
      args: [userId, planId, startsIso, expiresIso, `promo:${configuredCode}`, startsIso],
    });

    return response.status(200).json({
      subscription: { planId, startsAt: startsIso, expiresAt: expiresIso },
    });
  } catch (error) {
    console.error("No se pudo activar el plan con código promocional", error);
    return response.status(503).json({ error: error instanceof Error ? error.message : "No se pudo activar el plan promocional." });
  }
}
