import type { VercelRequest, VercelResponse } from "@vercel/node";

type DiscountCodeRequest = {
  code?: unknown;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Método no permitido." });
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
