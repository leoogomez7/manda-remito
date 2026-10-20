import { createClient } from "@libsql/client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type PlanPaymentRequest = { paymentId?: unknown };
const PLANS: Record<string, { price: number; months: number }> = {
  bronze: { price: 9999, months: 1 },
  silver: { price: 19999, months: 3 },
  gold: { price: 32999, months: 6 },
  platinum: { price: 52999, months: 12 },
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
  const endOfTargetMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, endOfTargetMonth));
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
    if (!userId) return response.status(401).json({ error: "Inicia sesión para verificar el pago del plan." });
    const paymentIdValue = (request.body as PlanPaymentRequest | undefined)?.paymentId;
    const paymentId = typeof paymentIdValue === "string" || typeof paymentIdValue === "number" ? String(paymentIdValue).trim() : "";
    if (!/^\d{1,30}$/.test(paymentId)) return response.status(400).json({ error: "El identificador de pago no es válido." });

    const accessToken = requiredEnv("MERCADOPAGO_ACCESS_TOKEN");
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const payment = await mpResponse.json().catch(() => ({})) as {
      status?: unknown; transaction_amount?: unknown; currency_id?: unknown; external_reference?: unknown;
    };
    if (!mpResponse.ok) {
      console.error("Mercado Pago no pudo verificar el pago del plan", mpResponse.status, payment);
      return response.status(502).json({ error: "No se pudo verificar el pago con Mercado Pago." });
    }
    const purchaseId = typeof payment.external_reference === "string" ? payment.external_reference : "";
    if (!purchaseId || purchaseId.length > 100 || payment.status !== "approved" || payment.currency_id !== "ARS") {
      return response.status(402).json({ error: "El pago del plan todavía no está aprobado." });
    }

    const db = createClient({ url: requiredEnv("TURSO_DATABASE_URL"), authToken: requiredEnv("TURSO_AUTH_TOKEN") });
    await db.batch([
      `CREATE TABLE IF NOT EXISTS plan_purchases (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, plan_id TEXT NOT NULL, amount INTEGER NOT NULL,
        duration_months INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', payment_id TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS plan_subscriptions (
        user_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, starts_at TEXT NOT NULL, expires_at TEXT NOT NULL,
        payment_id TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    ]);
    const purchaseResult = await db.execute({
      sql: "SELECT plan_id, amount, duration_months, status FROM plan_purchases WHERE id = ? AND user_id = ?",
      args: [purchaseId, userId],
    });
    const purchase = purchaseResult.rows[0];
    if (!purchase) return response.status(404).json({ error: "No se encontró la compra de este plan para tu cuenta." });
    const planId = String(purchase.plan_id);
    const plan = PLANS[planId];
    const amount = Number(purchase.amount);
    const months = Number(purchase.duration_months);
    if (!plan || amount !== plan.price || months !== plan.months || Number(payment.transaction_amount) !== amount) {
      return response.status(402).json({ error: "El importe pagado no coincide con el plan seleccionado." });
    }

    if (purchase.status === "paid") {
      const existing = await db.execute({ sql: "SELECT plan_id, starts_at, expires_at FROM plan_subscriptions WHERE user_id = ?", args: [userId] });
      const active = existing.rows[0];
      return response.status(200).json({
        approved: true,
        subscription: active ? { planId: String(active.plan_id), startsAt: String(active.starts_at), expiresAt: String(active.expires_at) } : null,
      });
    }

    const now = new Date();
    const existingSubscription = await db.execute({
      sql: "SELECT expires_at FROM plan_subscriptions WHERE user_id = ?",
      args: [userId],
    });
    const currentExpiration = existingSubscription.rows[0]
      ? new Date(String(existingSubscription.rows[0].expires_at))
      : null;
    const hasActivePlan = currentExpiration !== null
      && Number.isFinite(currentExpiration.getTime())
      && currentExpiration.getTime() > now.getTime();
    const startsAt = hasActivePlan ? currentExpiration : now;
    const expiresAt = addMonths(startsAt, months);
    const nowIso = now.toISOString();
    const startsIso = startsAt.toISOString();
    const expiresIso = expiresAt.toISOString();

    await db.batch([
      {
        sql: "UPDATE plan_purchases SET status = 'paid', payment_id = ? WHERE id = ? AND user_id = ? AND status = 'pending'",
        args: [paymentId, purchaseId, userId],
      },
      {
        sql: `INSERT INTO plan_subscriptions (user_id, plan_id, starts_at, expires_at, payment_id, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET plan_id = excluded.plan_id, starts_at = excluded.starts_at,
          expires_at = excluded.expires_at, payment_id = excluded.payment_id, updated_at = excluded.updated_at`,
        args: [userId, planId, startsIso, expiresIso, paymentId, nowIso],
      },
    ], "write");

    return response.status(200).json({ approved: true, subscription: { planId, startsAt: startsIso, expiresAt: expiresIso } });
  } catch (error) {
    console.error("No se pudo activar el plan", error);
    return response.status(503).json({ error: error instanceof Error ? error.message : "No se pudo confirmar el pago del plan." });
  }
}
