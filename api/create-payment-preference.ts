import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type PaymentRequest = {
  number?: unknown;
};

const REMITO_GENERATION_FEE_ARS = 2000;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name} en el servidor.`);
  return value;
}

function normalizeIssuer(): string {
  const issuer = requiredEnv("KINDE_ISSUER_URL").replace(/\/+$/, "");
  return /^https?:\/\//i.test(issuer) ? issuer : `https://${issuer}`;
}

async function getAuthenticatedUser(request: VercelRequest): Promise<string | null> {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;

  const issuer = normalizeIssuer();
  const audience = requiredEnv("KINDE_CLIENT_ID");
  try {
    const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks`));
    const { payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer,
      audience,
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

  let userId: string | null;
  try {
    userId = await getAuthenticatedUser(request);
  } catch (error) {
    console.error("Fallo al verificar la sesión Kinde para el pago", error);
    return response.status(500).json({ error: error instanceof Error ? error.message : "No se pudo verificar la sesión." });
  }
  if (!userId) return response.status(401).json({ error: "Inicia sesión para crear el enlace de pago." });

  const body = request.body as PaymentRequest | undefined;
  const number = typeof body?.number === "string" ? body.number.trim() : "";
  if (!number || number.length > 100) {
    return response.status(400).json({ error: "Los datos del pago no son válidos." });
  }

  try {
    const accessToken = requiredEnv("MERCADOPAGO_ACCESS_TOKEN");
    const originHeader = request.headers.origin;
    const configuredOrigin = process.env.APP_URL?.trim();
    const origin = configuredOrigin || (typeof originHeader === "string" ? originHeader : "");
    let backUrls: { success: string; pending: string; failure: string } | undefined;
    if (origin) {
      const url = new URL(origin);
      if (url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
        const base = url.origin;
        backUrls = {
          success: `${base}/nueva?payment=success`,
          pending: `${base}/nueva?payment=pending`,
          failure: `${base}/nueva?payment=failure`,
        };
      }
    }

    const idempotencyKey = crypto.randomUUID();
    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        items: [{
          id: number,
          title: `Servicio de generación de remito ${number} — Manda Remito`,
          quantity: 1,
          unit_price: REMITO_GENERATION_FEE_ARS,
          currency_id: "ARS",
        }],
        external_reference: number,
        ...(backUrls ? { back_urls: backUrls, auto_return: "approved" } : {}),
        statement_descriptor: "MANDA REMITO",
      }),
    });
    const result = await mpResponse.json().catch(() => ({})) as {
      init_point?: unknown;
      sandbox_init_point?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (!mpResponse.ok) {
      console.error("Mercado Pago rechazó la creación del checkout", mpResponse.status, result);
      return response.status(502).json({ error: "Mercado Pago no pudo crear el enlace. Verifica las credenciales y la moneda de la cuenta." });
    }

    const paymentUrl = accessToken.startsWith("TEST-") ? result.sandbox_init_point : result.init_point;
    if (typeof paymentUrl !== "string" || !paymentUrl.startsWith("https://")) {
      console.error("Mercado Pago no devolvió un enlace válido", result);
      return response.status(502).json({ error: "Mercado Pago no devolvió un enlace de pago válido." });
    }
    return response.status(200).json({ paymentUrl });
  } catch (error) {
    console.error("No se pudo crear el enlace de pago de Mercado Pago", error);
    const message = error instanceof Error ? error.message : "No se pudo configurar el pago.";
    return response.status(503).json({ error: message });
  }
}
