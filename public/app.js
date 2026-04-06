import { apiFetch, signOut, getSupabaseBrowser } from "./supabase-browser.js";

const uploadForm = document.getElementById("uploadForm");
const uploadBtn = document.getElementById("uploadBtn");
const uploadStatus = document.getElementById("uploadStatus");
const latestCard = document.getElementById("latestCard");
const latestResult = document.getElementById("latestResult");
const refreshBtn = document.getElementById("refreshBtn");
const listStatus = document.getElementById("listStatus");
const manuscriptsList = document.getElementById("manuscriptsList");
const manuscripDashboard = document.getElementById("manuscripDashboard");
const dashboardTabs = document.getElementById("dashboardTabs");
const dashboardBody = document.getElementById("dashboardBody");
let isAnalyzing = false;

async function downloadPdf(manuscriptId) {
  try {
    const res = await apiFetch(`/api/manuscripts/${encodeURIComponent(manuscriptId)}/pdf`);
    if (!res.ok) {
      listStatus.textContent = "No se pudo descargar el PDF. ¿Sesión caducada? Vuelve a iniciar sesión.";
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manuscrip-${String(manuscriptId).slice(0, 8)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    listStatus.textContent = `Error al descargar PDF: ${err.message}`;
  }
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a.pdf-link");
  if (a && a.dataset.id) {
    e.preventDefault();
    downloadPdf(a.dataset.id);
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderLatest(manuscript) {
  const chapterPreview = manuscript.chapters
    .slice(0, 5)
    .map(
      (c) =>
        `<li><strong>${escapeHtml(c.title)}</strong> — ${c.wordCount} palabras<br/><small>${escapeHtml(c.excerpt)}...</small></li>`
    )
    .join("");

  latestResult.innerHTML = `
    <p><strong>Título:</strong> ${escapeHtml(manuscript.title)}</p>
    <p><strong>Archivo:</strong> ${escapeHtml(manuscript.sourceFileName)}</p>
    <p><strong>Capítulos detectados:</strong> ${manuscript.chapterCount}</p>
    <p><strong>Palabras aproximadas:</strong> ${manuscript.wordCount}</p>
    <h3>Primeros capítulos detectados</h3>
    <ul>${chapterPreview || "<li>Sin capítulos</li>"}</ul>
  `;
  latestCard.hidden = false;
}

function renderManuscriptList(items) {
  if (!Array.isArray(items) || !items.length) {
    manuscriptsList.innerHTML = "<p>Aún no hay manuscritos cargados.</p>";
    return;
  }

  manuscriptsList.innerHTML = items
    .map(
      (m) => `
      <article class="list-item">
        <h3>${escapeHtml(m.title)}</h3>
        <p><strong>Género:</strong> ${escapeHtml(m.genre)} | <strong>Público:</strong> ${escapeHtml(m.audience)}</p>
        <p><strong>Capítulos:</strong> ${m.chapterCount} | <strong>Palabras:</strong> ${m.wordCount}</p>
        <p><small>Cargado: ${new Date(m.createdAt).toLocaleString()}</small></p>
        ${
          m.latestAnalysis
            ? `<p><strong>Último score global:</strong> ${m.latestAnalysis.dimensions.overallScore}/100</p>`
            : "<p><strong>Sin análisis IA todavía.</strong></p>"
        }
        ${
          m.hasManuscripBundle
            ? `<p><strong>Informe Manuscrip:</strong> generado</p>`
            : "<p><strong>Informe Manuscrip:</strong> pendiente</p>"
        }
        <div class="btn-row">
          <button type="button" class="analyze-btn" data-id="${escapeHtml(m.id)}" ${
            isAnalyzing ? "disabled" : ""
          }>
            ${isAnalyzing ? "Analizando..." : "Solo capítulos (IA)"}
          </button>
          <button type="button" class="manuscrip-btn btn-secondary" data-id="${escapeHtml(m.id)}" ${
            isAnalyzing ? "disabled" : ""
          }>
            ${isAnalyzing ? "Analizando..." : "Manuscrip económico (1× API)"}
          </button>
          <button type="button" class="manuscrip-full-btn" data-id="${escapeHtml(m.id)}" ${
            isAnalyzing ? "disabled" : ""
          }>
            ${isAnalyzing ? "Analizando..." : "Manuscrip completo (caro)"}
          </button>
        </div>
        ${
          m.hasManuscripBundle
            ? `<a href="#" class="pdf-link" data-id="${escapeHtml(m.id)}">Descargar PDF</a>`
            : ""
        }
      </article>
    `
    )
    .join("");
}

function renderAnalysis(manuscript, analysis) {
  if (!analysis || !Array.isArray(analysis.chapterAnalyses)) {
    latestResult.innerHTML =
      "<p>El servidor devolvió un análisis incompleto. Revisa la consola del servidor o vuelve a intentarlo.</p>";
    latestCard.hidden = false;
    return;
  }

  const chapters = analysis.chapterAnalyses
    .map(
      (c) => `
      <div class="chapter-analysis">
        <h4>${c.index}. ${escapeHtml(c.title)}</h4>
        <p><strong>Ritmo:</strong> ${c.ritmoScore} | <strong>Claridad:</strong> ${c.claridadScore} | <strong>Estructura:</strong> ${c.estructuraScore}</p>
        <p>${escapeHtml(c.resumenCapitulo || "Sin resumen.")}</p>
      </div>
    `
    )
    .join("");

  latestResult.innerHTML = `
    <p><strong>Título:</strong> ${escapeHtml(manuscript.title)}</p>
    <p><strong>Modelo:</strong> ${escapeHtml(analysis.model)}</p>
    <p><strong>Score global:</strong> ${analysis.dimensions.overallScore}/100</p>
    <p>
      <strong>Dimensiones:</strong>
      Ritmo ${analysis.dimensions.ritmoScore} |
      Claridad ${analysis.dimensions.claridadScore} |
      Estructura ${analysis.dimensions.estructuraScore}
    </p>
    <h3>Análisis por capítulo</h3>
    ${chapters}
  `;
  latestCard.hidden = false;
}

function wireTabs() {
  const buttons = dashboardTabs.querySelectorAll(".tab-btn");
  const panels = dashboardBody.querySelectorAll(".tab-panel");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      buttons.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const panel = dashboardBody.querySelector(`#panel-${tab}`);
      if (panel) panel.classList.add("active");
    });
  });
}

function renderManuscripDashboard(m) {
  const la = m.latestAnalysis;
  const nlp = m.nlpMetrics;
  const mc = m.manuscripIa || {};

  const tabs = [
    { id: "resumen", label: "Resumen" },
    { id: "nlp", label: "Capa 1 · NLP" },
    { id: "capitulos", label: "Capítulos IA" },
    { id: "estructura", label: "Estructura" },
    { id: "personas", label: "4 personas" },
    { id: "hook", label: "Hook" },
    { id: "sinopsis", label: "Sinopsis" },
    { id: "inconsistencias", label: "Inconsistencias" },
    { id: "benchmark", label: "Benchmark" }
  ];

  dashboardTabs.innerHTML = tabs
    .map(
      (t, i) =>
        `<button type="button" class="tab-btn ${i === 0 ? "active" : ""}" data-tab="${t.id}">${t.label}</button>`
    )
    .join("");

  const resumenHtml = `
    <p><strong>Título:</strong> ${escapeHtml(m.title)}</p>
    <p><strong>Palabras:</strong> ${m.wordCount} · <strong>Capítulos:</strong> ${m.chapterCount}</p>
    ${
      la
        ? `<p><strong>Score global IA:</strong> ${la.dimensions.overallScore}/100 (Ritmo ${la.dimensions.ritmoScore}, Claridad ${la.dimensions.claridadScore}, Estructura ${la.dimensions.estructuraScore})</p>`
        : "<p>Sin análisis por capítulo todavía.</p>"
    }
    <p><a href="#" class="pdf-link" data-id="${escapeHtml(m.id)}">Descargar informe PDF</a></p>
  `;

  const nlpHtml = nlp
    ? `
    <p class="muted">${escapeHtml(nlp.note || "")}</p>
    <h4>Global</h4>
    <ul>
      <li>Flesch-Szigriszt aprox.: ${nlp.global.fleschSzigrisztLike}</li>
      <li>Longitud media de oración: ${nlp.global.avgSentenceLength}</li>
      <li>Oraciones largas (ratio): ${nlp.global.longSentenceRatio}</li>
      <li>Riqueza léxica: ${nlp.global.lexicalRichness}</li>
      <li>Muletillas (aprox.): ${nlp.global.fillerHits}</li>
      <li>Pistas pasivas (aprox.): ${nlp.global.passiveHints}</li>
    </ul>
    <h4>Curva emocional (heurística)</h4>
    <ul>
      ${(nlp.emotionalCurve || [])
        .map(
          (e) =>
            `<li>Cap ${e.index}: tono ${e.emotionalTone} (+${e.positiveHits} / −${e.negativeHits})</li>`
        )
        .join("")}
    </ul>
    <h4>Candidatos a nombres propios</h4>
    <p>${(nlp.characterCandidates || [])
      .map((c) => `${escapeHtml(c.name)} (${c.count})`)
      .join(", ") || "—"}</p>
  `
    : "<p>No hay métricas NLP.</p>";

  const capHtml =
    la && Array.isArray(la.chapterAnalyses)
      ? la.chapterAnalyses
          .map(
            (c) => `
        <div class="chapter-analysis">
          <h4>${c.index}. ${escapeHtml(c.title)}</h4>
          <p><strong>Ritmo:</strong> ${c.ritmoScore} | <strong>Claridad:</strong> ${c.claridadScore} | <strong>Estructura:</strong> ${c.estructuraScore}</p>
          <p>${escapeHtml(c.resumenCapitulo || "")}</p>
        </div>`
          )
          .join("")
      : "<p>No hay análisis por capítulo.</p>";

  const estructuraHtml = mc.structure
    ? `<pre class="json-block">${escapeHtml(JSON.stringify(mc.structure, null, 2))}</pre>`
    : "<p>No hay evaluación estructural.</p>";

  const personasHtml =
    mc.personas && Array.isArray(mc.personas.personas)
      ? mc.personas.personas
          .map(
            (p) => `
        <div class="chapter-analysis">
          <h4>${escapeHtml(p.rol || "persona")}</h4>
          <p><strong>Abandono estimado:</strong> ${escapeHtml(p.puntoAbandono || "—")} · <strong>Estrellas:</strong> ${p.estrellasAmazon ?? "—"}</p>
          <p>${escapeHtml(p.feedback || "")}</p>
        </div>`
          )
          .join("")
      : "<p>No hay simulación de personas.</p>";

  const hookHtml = mc.hook
    ? `
    <ul>
      <li>Pregunta dramática: ${escapeHtml(mc.hook.preguntaDramatica || "—")}</li>
      <li>Tono vs género: ${escapeHtml(mc.hook.tonoAdecuadoGenero || "—")}</li>
      <li>Agencia protagonista: ${escapeHtml(mc.hook.agenciaProtagonista || "—")}</li>
    </ul>
    <p>${escapeHtml(mc.hook.resumen || "")}</p>
    <h4>Riesgos</h4>
    <ul>${(mc.hook.riesgos || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
    <h4>Mejoras prioritarias</h4>
    <ul>${(mc.hook.mejorasPrioritarias || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
  `
    : "<p>No hay análisis de hook.</p>";

  const sinopsisHtml = mc.synopsis
    ? `
    <h4>Sinopsis (propuestas)</h4>
    <ol>${(mc.synopsis.sinopsis || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
    <h4>Títulos (propuestas)</h4>
    <ul>${(mc.synopsis.titulos || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>
    <p><strong>Hook 1 frase:</strong> ${escapeHtml(mc.synopsis.hookUnaFrase || "")}</p>
  `
    : "<p>No hay sinopsis generada.</p>";

  const incHtml =
    mc.inconsistencies && Array.isArray(mc.inconsistencies.alertas)
      ? `<ul>${mc.inconsistencies.alertas
          .map(
            (a) =>
              `<li><strong>${escapeHtml(a.tipo)}:</strong> ${escapeHtml(a.descripcion)} → ${escapeHtml(
                a.sugerencia
              )}</li>`
          )
          .join("")}</ul><p><strong>Riesgo:</strong> ${escapeHtml(mc.inconsistencies.riesgo || "—")}</p>`
      : "<p>No hay alertas de inconsistencias.</p>";

  const benchHtml = mc.benchmark
    ? `
    <p class="muted">${escapeHtml(mc.benchmark.note || "")}</p>
    <pre class="json-block">${escapeHtml(JSON.stringify(mc.benchmark, null, 2))}</pre>
  `
    : "<p>No hay benchmark.</p>";

  dashboardBody.innerHTML = `
    <div id="panel-resumen" class="tab-panel active">${resumenHtml}</div>
    <div id="panel-nlp" class="tab-panel">${nlpHtml}</div>
    <div id="panel-capitulos" class="tab-panel">${capHtml}</div>
    <div id="panel-estructura" class="tab-panel">${estructuraHtml}</div>
    <div id="panel-personas" class="tab-panel">${personasHtml}</div>
    <div id="panel-hook" class="tab-panel">${hookHtml}</div>
    <div id="panel-sinopsis" class="tab-panel">${sinopsisHtml}</div>
    <div id="panel-inconsistencias" class="tab-panel">${incHtml}</div>
    <div id="panel-benchmark" class="tab-panel">${benchHtml}</div>
  `;

  wireTabs();
  manuscripDashboard.hidden = false;
  manuscripDashboard.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadManuscripts(options = {}) {
  const { preserveStatusMessage } = options;
  if (!preserveStatusMessage) {
    listStatus.textContent = "Cargando manuscritos...";
  }
  try {
    const response = await apiFetch("/api/manuscripts");
    let data;
    try {
      data = await response.json();
    } catch {
      listStatus.textContent = "El servidor no devolvió JSON. ¿Está `npm start` en marcha?";
      return;
    }
    if (!response.ok) {
      listStatus.textContent = data.error || "No se pudo cargar el listado.";
      return;
    }
    renderManuscriptList(data);
    if (!preserveStatusMessage) {
      listStatus.textContent = `Versiones cargadas: ${data.length}`;
    }
  } catch (err) {
    listStatus.textContent = `Error de red: ${err.message}`;
  }
}

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(uploadForm);
  const file = formData.get("manuscript");
  if (!file || !(file instanceof File) || !file.name) {
    uploadStatus.textContent = "Selecciona un archivo antes de continuar.";
    return;
  }

  uploadBtn.disabled = true;
  uploadStatus.textContent = "Procesando manuscrito...";

  try {
    const response = await apiFetch("/api/manuscripts/upload", {
      method: "POST",
      body: formData
    });
    const data = await response.json();
    if (!response.ok) {
      uploadStatus.textContent = data.error || "No se pudo procesar el manuscrito.";
      return;
    }
    renderLatest(data.manuscript);
    uploadStatus.textContent = "Manuscrito procesado correctamente.";
    await loadManuscripts();
  } catch (err) {
    uploadStatus.textContent = `Error de red: ${err.message}`;
  } finally {
    uploadBtn.disabled = false;
  }
});

refreshBtn.addEventListener("click", () => loadManuscripts());

manuscriptsList.addEventListener("click", async (event) => {
  const analyzeBtn = event.target.closest(".analyze-btn");
  const manuscripBtn = event.target.closest(".manuscrip-btn");
  const manuscripFullBtn = event.target.closest(".manuscrip-full-btn");

  if (manuscripBtn || manuscripFullBtn) {
    if (isAnalyzing) return;
    const btn = manuscripBtn || manuscripFullBtn;
    const manuscriptId = btn.dataset.id;
    const fullMode = Boolean(manuscripFullBtn);
    if (!manuscriptId) {
      listStatus.textContent =
        "No se pudo identificar el manuscrito. Recarga la página o vuelve a subir el archivo.";
      return;
    }

    isAnalyzing = true;
    listStatus.textContent = fullMode
      ? "Modo COMPLETO en curso… muchas llamadas a la API y tiempo largo."
      : "Modo ECONÓMICO en curso… 1 llamada a la API + NLP local.";
    await loadManuscripts({ preserveStatusMessage: true });
    listStatus.textContent = fullMode
      ? "Modo COMPLETO en curso… muchas llamadas a la API y tiempo largo."
      : "Modo ECONÓMICO en curso… 1 llamada a la API + NLP local.";

    try {
      const url = fullMode
        ? `/api/manuscripts/${encodeURIComponent(manuscriptId)}/analyze-manuscrip?mode=full`
        : `/api/manuscripts/${encodeURIComponent(manuscriptId)}/analyze-manuscrip`;
      const response = await apiFetch(url, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const raw = await response.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        listStatus.textContent = `Respuesta no válida del servidor (${response.status}). ${raw.slice(0, 240)}`;
        return;
      }
      if (!response.ok) {
        const details = data.details ? ` — ${data.details}` : "";
        listStatus.textContent = `${data.error || "Error en análisis Manuscrip"}${details}`;
        return;
      }

      const fullRes = await apiFetch(`/api/manuscripts/${encodeURIComponent(manuscriptId)}/full`);
      const full = await fullRes.json();
      if (!fullRes.ok) {
        listStatus.textContent = full.error || "No se pudo cargar el informe completo.";
        return;
      }
      renderManuscripDashboard(full);
      listStatus.textContent = "Análisis Manuscrip completado.";
    } catch (err) {
      listStatus.textContent = `Error de red o tiempo de espera: ${err.message}`;
    } finally {
      isAnalyzing = false;
      await loadManuscripts({ preserveStatusMessage: true });
    }
    return;
  }

  if (!analyzeBtn || isAnalyzing) return;
  const manuscriptId = analyzeBtn.dataset.id;
  if (!manuscriptId) {
    listStatus.textContent =
      "No se pudo identificar el manuscrito. Recarga la página o vuelve a subir el archivo.";
    return;
  }

  isAnalyzing = true;
  listStatus.textContent =
    "Analizando con IA… puede tardar varios minutos. No cierres esta pestaña.";
  await loadManuscripts({ preserveStatusMessage: true });
  listStatus.textContent =
    "Analizando con IA… puede tardar varios minutos. No cierres esta pestaña.";

  try {
    const response = await apiFetch(`/api/manuscripts/${encodeURIComponent(manuscriptId)}/analyze`, {
      method: "POST",
      headers: { Accept: "application/json" }
    });
    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      listStatus.textContent = `Respuesta no válida del servidor (${response.status}). ${raw.slice(0, 240)}`;
      return;
    }
    if (!response.ok) {
      const details = data.details ? ` — ${data.details}` : "";
      listStatus.textContent = `${data.error || "Error en análisis"}${details}`;
      return;
    }
    renderAnalysis(data.manuscript, data.analysis);
    listStatus.textContent = "Análisis completado correctamente.";
    latestCard.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    listStatus.textContent = `Error de red o tiempo de espera: ${err.message}`;
  } finally {
    isAnalyzing = false;
    await loadManuscripts({ preserveStatusMessage: true });
  }
});

async function boot() {
  try {
    const sb = await getSupabaseBrowser();
    const {
      data: { session }
    } = await sb.auth.getSession();
    if (!session) {
      window.location.replace("/auth");
      return;
    }
    document.body.classList.remove("auth-checking");
    const userBar = document.getElementById("userBar");
    if (userBar) {
      userBar.innerHTML = `<span class="user-email">${escapeHtml(session.user.email)}</span>
        <button type="button" class="btn-logout" id="logoutBtn">Cerrar sesión</button>`;
      document.getElementById("logoutBtn").addEventListener("click", async () => {
        await signOut();
        window.location.href = "/auth";
      });
    }
  } catch (e) {
    window.location.replace("/auth");
    return;
  }
  await loadManuscripts();
}

boot();
