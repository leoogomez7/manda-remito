import { createClient } from "@libsql/client";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name} en el servidor.`);
  return value;
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Método no permitido." });
  }

  try {
    const db = createClient({
      url: requiredEnv("TURSO_DATABASE_URL"),
      authToken: requiredEnv("TURSO_AUTH_TOKEN"),
    });
    await db.execute(`CREATE TABLE IF NOT EXISTS issued_invoice_numbers (
      number TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);

    // The primary key is the global uniqueness guarantee shared by registered
    // users and guests. Retry only in the vanishingly unlikely event of a collision.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
      const number = `MF-${suffix}`;
      const result = await db.execute({
        sql: "INSERT OR IGNORE INTO issued_invoice_numbers (number) VALUES (?)",
        args: [number],
      });
      if (result.rowsAffected === 1) return response.status(200).json({ number });
    }

    throw new Error("No se pudo reservar un número único. Intenta nuevamente.");
  } catch (error) {
    console.error("No se pudo asignar un número único de remito", error);
    return response.status(503).json({
      error: error instanceof Error ? error.message : "No se pudo asignar un número de remito.",
    });
  }
}
