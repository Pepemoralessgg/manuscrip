const { createClient } = require("@supabase/supabase-js");

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
}

/**
 * Cliente con service role: solo en servidor. Omite RLS para operaciones internas.
 */
function createSupabaseAdmin() {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase admin: faltan NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL) y/o SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Cliente con anon key: para llamadas desde el servidor que respeten RLS cuando pases el JWT del usuario.
 */
function createSupabaseAnon() {
  const url = getSupabaseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase anon: faltan NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL) y/o NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

module.exports = {
  createSupabaseAdmin,
  createSupabaseAnon,
  getSupabaseUrl
};
