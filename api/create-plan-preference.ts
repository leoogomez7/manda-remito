import { createClient } from "@libsql/client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type PlanId = "bronze" | "silver" | "gold" | "platinum";
const PLANS: Record<PlanId, { name: string; price: number; months: number }> = {
  bronze: { name: "Bronce", price: 9999, months: 1 },
  silver: { name: "Plata", price: 19999, months: 3 },
  gold: { name: "Oro", price: 32999, months: 6 },
  platinum: { name: "Platino", price: 52999, months: 12 },
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

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Vary", "Authorization");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Método no permitido." });
  }

  try {
    const userId = await getUserId(request);
    if (!userId) return response.status(401).json({ error: "Inicia sesión para comprar un plan." });

    const planId = (request.body as { planId?: unknown } | undefined)?.planId;
    if (typeof planId !== "string" || !(planId in PLANS)) {
      return response.status(400).json({ error: "El plan seleccionado no es válido." });
    }
    const plan = PLANS[planId as PlanId];
    const db = createClient({ url: requiredEnv("TURSO_DATABASE_URL"), authToken: requiredEnv("TURSO_AUTH_TOKEN") });
    await db.execute(`CREATE TABLE IF NOT EXISTS plan_purchases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      duration_months INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    const purchaseId = crypto.randomUUID();
    await db.execute({
      sql: "INSERT INTO plan_purchases (id, user_id, plan_id, amount, duration_months, status) VALUES (?, ?, ?, ?, ?, 'pending')",
      args: [purchaseId, userId, planId, plan.price, plan.months],
    });

    const originValue = process.env.APP_URL?.trim() || (typeof request.headers.origin === "string" ? request.headers.origin : "");
    const origin = originValue ? new URL(originValue).origin : "";
    const token = requiredEnv("MERCADOPAGO_ACCESS_TOKEN");
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": purchaseId,
      },
      body: JSON.stringify({
        items: [{
          id: planId,
          title: `Plan ${plan.name} — ${plan.months} ${plan.months === 1 ? "mes" : "meses"} de Manda Remito`,
          quantity: 1,
          unit_price: plan.price,
          currency_id: "ARS",
        }],
        external_reference: purchaseId,
        ...(origin ? {
          back_urls: {
            success: `${origin}/planes?payment=success`,
            pending: `${origin}/planes?payment=pending`,
            failure: `${origin}/planes?payment=failure`,
          },
          auto_return: "approved",
        } : {}),
        statement_descriptor: "MANDA REMITO",
        metadata: { plan_id: planId, user_id: userId },
      }),
    });
    const result = await mpResponse.json().catch(() => ({})) as { init_point?: unknown; sandbox_init_point?: unknown };
    if (!mpResponse.ok) {
      console.error("Mercado Pago rechazó el plan", mpResponse.status, result);
      return response.status(502).json({ error: "Mercado Pago no pudo iniciar el pago del plan." });
    }
    const paymentUrl = token.startsWith("TEST-") ? result.sandbox_init_point : result.init_point;
    if (typeof paymentUrl !== "string" || !paymentUrl.startsWith("https://")) {
      return response.status(502).json({ error: "Mercado Pago no devolvió un enlace válido." });
    }
    return response.status(200).json({ paymentUrl });
  } catch (error) {
    console.error("No se pudo crear el pago del plan", error);
    return response.status(503).json({ error: error instanceof Error ? error.message : "No se pudo iniciar el pago del plan." });
  }
}
