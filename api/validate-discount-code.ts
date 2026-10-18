import { createRemoteJWKSet, jwtVerify } from "jose";
import type { VercelRequest, VercelResponse } from "@vercel/node";

type DiscountCodeRequest = {
  code?: unknown;
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
      return response.status(401).json({ error: "Inicia sesión para validar el código." });
    }
  } catch (error) {
    console.error("Fallo al verificar la sesión Kinde para el código promocional", error);
    return response.status(500).json({ error: error instanceof Error ? error.message : "No se pudo verificar la sesión." });
  }

  const body = request.body as DiscountCodeRequest | undefined;
  const providedCode = typeof body?.code === "string" ? body.code.trim() : "";
  if (!providedCode || providedCode.length > 200) {
    return response.status(400).json({ error: "Ingresa un código válido." });
  }

  const configuredCode = process.env.GRATIS2026?.trim();
  if (!configuredCode) {
    return response.status(503).json({ error: "La variable de entorno GRATIS2026 no está configurada en este deployment." });
  }

  const valid = providedCode.toUpperCase() === configuredCode.toUpperCase();
  if (!valid) return response.status(400).json({ error: "El código ingresado no es válido." });

  return response.status(200).json({ valid: true, discountPercent: 100 });
}
