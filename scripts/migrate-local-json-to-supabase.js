/**
 * Migra data/manuscripts.json a Supabase (mismo esquema que la app).
 * Requiere: .env.local o .env con Supabase + SUPABASE_DEFAULT_USER_ID = uuid del usuario destino.
 *
 * Uso: node scripts/migrate-local-json-to-supabase.js
 */
require("../lib/loadEnv");
const fs = require("fs/promises");
const path = require("path");
const {
  insertManuscript,
  updateManuscript,
  getManuscript
} = require("../lib/manuscriptRepository");

async function main() {
  const userId = process.env.SUPABASE_DEFAULT_USER_ID?.trim();
  if (!userId) {
    console.error("Define SUPABASE_DEFAULT_USER_ID (uuid de auth.users / profiles).");
    process.exit(1);
  }

  const jsonPath = path.join(__dirname, "..", "data", "manuscripts.json");
  let raw;
  try {
    raw = await fs.readFile(jsonPath, "utf8");
  } catch {
    console.error("No se encontró data/manuscripts.json. Nada que migrar.");
    process.exit(0);
  }

  const items = JSON.parse(raw);
  if (!Array.isArray(items) || !items.length) {
    console.log("Lista vacía. Nada que migrar.");
    process.exit(0);
  }

  for (const m of items) {
    if (!m.id) continue;
    const existing = await getManuscript(userId, m.id);
    if (existing) {
      await updateManuscript(userId, m);
      console.log("Actualizado:", m.id, m.title);
    } else {
      await insertManuscript(userId, m);
      console.log("Insertado:", m.id, m.title);
    }
  }
  console.log("Migración terminada.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
