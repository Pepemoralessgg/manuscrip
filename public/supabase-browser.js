let clientPromise = null;

export async function getSupabaseBrowser() {
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const res = await fetch("/api/public-config");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || "No hay configuración de Supabase");
    }
    const { supabaseUrl, supabaseAnonKey } = body;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Configuración incompleta");
    }
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm"
    );
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  })();
  return clientPromise;
}

export async function authHeaders(extra = {}) {
  const sb = await getSupabaseBrowser();
  const {
    data: { session }
  } = await sb.auth.getSession();
  const h = { Accept: "application/json", ...extra };
  if (session?.access_token) {
    h.Authorization = `Bearer ${session.access_token}`;
  }
  return h;
}

export async function signOut() {
  const sb = await getSupabaseBrowser();
  await sb.auth.signOut();
}

export async function apiFetch(url, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const headers = await authHeaders(extraHeaders || {});
  return fetch(url, { ...rest, headers });
}
