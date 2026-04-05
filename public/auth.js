import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

const authStatus = document.getElementById("authStatus");
const authSuccess = document.getElementById("authSuccess");
const authContinueWrap = document.getElementById("authContinueWrap");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const panelLogin = document.getElementById("panel-login");
const panelRegister = document.getElementById("panel-register");

/** Se asigna en init(); los formularios deben poder enlazarse aunque init falle a medias. */
let supabase = null;

function setStatus(msg, isError) {
  authStatus.textContent = msg || "";
  authStatus.classList.toggle("auth-status-error", Boolean(isError && msg));
}

function showSessionOk(message) {
  authSuccess.hidden = false;
  authSuccess.textContent = message;
  authContinueWrap.hidden = false;
  setStatus("", false);
}

function ensureSupabaseClient() {
  if (!supabase) {
    setStatus(
      "Supabase no está listo. Comprueba que el servidor expone /api/public-config y las variables NEXT_PUBLIC_SUPABASE_*.",
      true
    );
    return false;
  }
  return true;
}

document.querySelectorAll(".auth-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    const panel = btn.dataset.panel;
    document.querySelectorAll(".auth-tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    panelLogin.hidden = panel !== "login";
    panelRegister.hidden = panel !== "register";
    panelLogin.classList.toggle("active", panel === "login");
    panelRegister.classList.toggle("active", panel === "register");
    setStatus("");
  });
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ensureSupabaseClient()) return;
  const fd = new FormData(loginForm);
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  setStatus("Entrando…");
  const submitBtn = loginForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus(error.message || "No se pudo iniciar sesión.", true);
      return;
    }
    showSessionOk(`Sesión iniciada como ${email}.`);
  } finally {
    submitBtn.disabled = false;
  }
});

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!ensureSupabaseClient()) return;
  const fd = new FormData(registerForm);
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const password2 = String(fd.get("password2") || "");
  if (password !== password2) {
    setStatus("Las contraseñas no coinciden.", true);
    return;
  }
  setStatus("Creando cuenta…");
  const submitBtn = registerForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setStatus(error.message || "No se pudo registrar.", true);
      return;
    }
    if (data.user && !data.session) {
      setStatus(
        "Revisa tu email para confirmar la cuenta (si tienes confirmación activada en Supabase).",
        false
      );
      return;
    }
    if (data.session?.user) {
      showSessionOk(`Cuenta creada e iniciada sesión como ${email}.`);
    } else {
      setStatus("Registro recibido. Intenta iniciar sesión.", false);
    }
  } finally {
    submitBtn.disabled = false;
  }
});

async function init() {
  let res;
  try {
    res = await fetch("/api/public-config");
  } catch {
    setStatus("No se pudo contactar con el servidor.", true);
    return;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    setStatus(body.error || "Configuración de Supabase no disponible.", true);
    return;
  }
  const { supabaseUrl, supabaseAnonKey } = body;
  if (!supabaseUrl || !supabaseAnonKey) {
    setStatus("Respuesta de configuración incompleta.", true);
    return;
  }

  try {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (err) {
    setStatus(err?.message || "No se pudo inicializar Supabase.", true);
    return;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (session?.user) {
    showSessionOk(`Sesión activa como ${session.user.email}.`);
  }

  supabase.auth.onAuthStateChange((_event, newSession) => {
    if (newSession?.user) {
      showSessionOk(`Sesión activa como ${newSession.user.email}.`);
    } else {
      authSuccess.hidden = true;
      authContinueWrap.hidden = true;
    }
  });
}

init();
