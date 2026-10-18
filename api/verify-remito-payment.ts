import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const REMITO_GENERATION_FEE_ARS = 2000;

type VerifyPaymentRequest = {
  paymentId?: unknown;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name} en el servidor.`);
  return value;
}

function normalizeIssuer(): string {
  const issuer = requiredEnv("KINDE_ISSUER_URL").replace(/\/+$/, "");
  return /^https?:\/\//i.test(issuer) ? issuer : `https://${issuer}`;
}

async function hasAuthenticatedUser(request: VercelRequest): Promise<boolean> {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return false;

  const issuer = normalizeIssuer();
  const audience = requiredEnv("KINDE_CLIENT_ID");
  try {
    const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
    const { payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer,
      audience,
      requiredClaims: ["sub", "exp", "iat"],
    });
    return typeof payload.sub === "string" && Boolean(payload.sub.trim());
  } catch {
    return false;
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
    if (!await hasAuthenticatedUser(request)) {
      return response.status(401).json({ error: "Inicia sesión para confirmar el pago." });
    }
  } catch (error) {
    console.error("Fallo al verificar la sesión Kinde para confirmar el pago", error);
    return response.status(500).json({ error: error instanceof Error ? error.message : "No se pudo verificar la sesión." });
  }

  const body = request.body as VerifyPaymentRequest | undefined;
  const paymentId = typeof body?.paymentId === "string" || typeof body?.paymentId === "number"
    ? String(body.paymentId).trim()
    : "";
  if (!/^\d{1,30}$/.test(paymentId)) {
    return response.status(400).json({ error: "Los datos para verificar el pago no son válidos." });
  }

  try {
    const accessToken = requiredEnv("MERCADOPAGO_ACCESS_TOKEN");
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const payment = await mpResponse.json().catch(() => ({})) as {
      status?: unknown;
      transaction_amount?: unknown;
      currency_id?: unknown;
      external_reference?: unknown;
    };

    if (!mpResponse.ok) {
      console.error("Mercado Pago no pudo verificar el pago", mpResponse.status, payment);
      return response.status(502).json({ error: "No se pudo verificar el pago con Mercado Pago." });
    }

    const approved = payment.status === "approved"
      && Number(payment.transaction_amount) === REMITO_GENERATION_FEE_ARS
      && payment.currency_id === "ARS"
      && typeof payment.external_reference === "string"
      && payment.external_reference.length > 0
      && payment.external_reference.length <= 100;
    if (!approved) {
      return response.status(402).json({ error: "Mercado Pago no confirmó un pago aprobado por ARS 2.000 para este remito." });
    }

    return response.status(200).json({ approved: true, number: payment.external_reference });
  } catch (error) {
    console.error("No se pudo verificar el pago del remito", error);
    return response.status(503).json({ error: error instanceof Error ? error.message : "No se pudo verificar el pago." });
  }
}
