/**
 * Cliente Supabase y fetch con JWT — solo APIs del navegador (sin require / CommonJS).
 */
import { buildScoreHintParts } from "./scoreHints.mjs";

let __sbClientPromise = null;

async function getSupabaseBrowser() {
  if (__sbClientPromise) return __sbClientPromise;
  __sbClientPromise = (async () => {
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
  return __sbClientPromise;
}

async function authHeaders(extra = {}) {
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

async function signOut() {
  const sb = await getSupabaseBrowser();
  await sb.auth.signOut();
}

async function apiFetch(url, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const headers = await authHeaders(extraHeaders || {});
  return fetch(url, { ...rest, headers });
}

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
const compareA = document.getElementById("compareA");
const compareB = document.getElementById("compareB");
const compareBtn = document.getElementById("compareBtn");
const compareResult = document.getElementById("compareResult");
const dropZone = document.getElementById("dropZone");
const goalPreset = document.getElementById("goalPreset");
let isAnalyzing = false;
let cachedManuscripts = [];

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

function estimateChapterAnalysisMinutes(m) {
  const ch = Math.max(1, m.chapterCount || 1);
  return Math.min(5 + ch * 2, 90);
}

function estimateManuscripEcoMinutes(m) {
  const w = m.wordCount || 0;
  return Math.max(2, Math.min(25, 2 + Math.ceil(w / 40000)));
}

function refreshCompareSelects(items) {
  cachedManuscripts = Array.isArray(items) ? items : [];
  if (!compareA || !compareB) return;
  const opts = (idSel) => {
    const cur = idSel.value;
    idSel.innerHTML =
      `<option value="">— Elegir —</option>` +
      cachedManuscripts
        .map(
          (m) =>
            `<option value="${escapeHtml(m.id)}">${escapeHtml(m.title)} · ${m.wordCount} pal. · ${new Date(m.createdAt).toLocaleDateString()}</option>`
        )
        .join("");
    if (cur && cachedManuscripts.some((m) => m.id === cur)) idSel.value = cur;
  };
  opts(compareA);
  opts(compareB);
}

function renderCompareResult(c) {
  if (!compareResult || !c) return;
  const lines = [];
  lines.push(
    `<p><strong>${escapeHtml(c.a.title)}</strong> (${c.a.wordCount} palabras, ${c.a.chapterCount} cap.) ↔ <strong>${escapeHtml(c.b.title)}</strong> (${c.b.wordCount} palabras, ${c.b.chapterCount} cap.)</p>`
  );
  lines.push(
    `<p><strong>Δ Palabras:</strong> ${c.summary.wordCountDelta >= 0 ? "+" : ""}${c.summary.wordCountDelta} · <strong>Δ Capítulos:</strong> ${c.summary.chapterCountDelta >= 0 ? "+" : ""}${c.summary.chapterCountDelta}</p>`
  );
  if (c.iaDimensions) {
    const o = c.iaDimensions.overall;
    const r = c.iaDimensions.ritmo;
    const cl = c.iaDimensions.claridad;
    const e = c.iaDimensions.estructura;
    const fmtD = (d) => (d == null || Number.isNaN(Number(d)) ? "—" : `${d >= 0 ? "+" : ""}${d}`);
    const t10 = (x) => (x == null ? "—" : x);
    lines.push(`<h4 class="compare-h4">Scores IA (0–100, y equivalente /10)</h4>`);
    lines.push(
      `<ul class="compare-ul"><li><strong>Global:</strong> ${o.a ?? "—"} → ${o.b ?? "—"} (Δ ${fmtD(o.delta)}) · ~${t10(o.on10?.a)}/10 vs ~${t10(o.on10?.b)}/10</li>` +
        `<li><strong>Ritmo:</strong> Δ ${fmtD(r.delta)}</li>` +
        `<li><strong>Claridad:</strong> Δ ${fmtD(cl.delta)}</li>` +
        `<li><strong>Estructura:</strong> Δ ${fmtD(e.delta)}</li></ul>`
    );
  } else {
    lines.push(
      `<p class="muted">No hay análisis “Solo capítulos (IA)” en <strong>ambas</strong> versiones. Ejecútalo en cada una para comparar scores.</p>`
    );
  }
  if (c.nlp) {
    const fd = c.nlp.fleschSzigrisztLike?.delta;
    const fh = c.nlp.fillerHits?.delta;
    const lr = c.nlp.longSentenceRatio?.delta;
    const fmtN = (d, dec) =>
      d == null || Number.isNaN(Number(d)) ? "—" : `${d >= 0 ? "+" : ""}${Number(d).toFixed(dec)}`;
    lines.push(`<h4 class="compare-h4">NLP (legibilidad)</h4>`);
    lines.push(
      `<ul class="compare-ul"><li><strong>Flesch-Szigriszt (aprox.):</strong> Δ ${fmtN(fd, 2)}</li>` +
        `<li><strong>Muletillas (aprox.):</strong> Δ ${fh == null || Number.isNaN(Number(fh)) ? "—" : `${fh >= 0 ? "+" : ""}${fh}`}</li>` +
        `<li><strong>Ratio oraciones largas:</strong> Δ ${fmtN(lr, 3)}</li></ul>`
    );
  } else {
    lines.push(`<p class="muted">NLP no disponible en una o ambas versiones (ejecuta Manuscrip económico o completo).</p>`);
  }
  compareResult.innerHTML = lines.join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scoreHintParagraph(dim, raw) {
  const p = buildScoreHintParts(dim, raw);
  if (!p) return "";
  return `<p class="score-hint muted"><strong>${escapeHtml(p.label)} ${p.n}/100</strong> — ${escapeHtml(p.nivel)}. ${escapeHtml(
    p.tip
  )} ${escapeHtml(p.optimal)}</p>`;
}

function structureTriRow(label, value) {
  const v = String(value ?? "")
    .trim()
    .toLowerCase();
  let cls = "structure-row structure-uncertain";
  let sym = "?";
  if (v === "sí" || v === "si" || v === "yes") {
    cls = "structure-row structure-yes";
    sym = "✓";
  } else if (v === "no") {
    cls = "structure-row structure-no";
    sym = "✗";
  }
  return `<li class="${cls}"><span class="structure-ico" aria-hidden="true">${sym}</span><div><strong>${escapeHtml(
    label
  )}</strong> <span class="structure-val">${escapeHtml(String(value ?? "—"))}</span></div></li>`;
}

function renderEstructuraHtml(struct) {
  if (!struct || typeof struct !== "object") {
    return "<p>No hay evaluación estructural.</p>";
  }
  const ta = struct.tresActos;
  const stc = struct.saveTheCat;
  const vh = struct.viajeDelHeroe;
  const pri = Array.isArray(struct.prioridades) ? struct.prioridades : [];
  const parts = [];

  if (ta && typeof ta === "object") {
    parts.push(`<h4 class="structure-h4">Tres actos</h4><ul class="structure-checks">`);
    parts.push(structureTriRow("Conflicto antes del ~12%", ta.conflictoAntesDel12Porciento));
    parts.push(structureTriRow("Punto de no retorno (~50–60%)", ta.puntoDeNoRetorno50a60));
    parts.push(structureTriRow("Todo está perdido antes del clímax", ta.todoEstaPerdidoAntesClimax));
    parts.push(`</ul>`);
    if (ta.comentario) {
      parts.push(`<div class="structure-narrative">${escapeHtml(ta.comentario)}</div>`);
    }
  }

  if (stc && typeof stc === "object") {
    parts.push(`<h4 class="structure-h4">Save the Cat (referencia)</h4>`);
    if (stc.comentario) {
      parts.push(`<div class="structure-narrative">${escapeHtml(stc.comentario)}</div>`);
    }
    const beats = Array.isArray(stc.beatsDetectados) ? stc.beatsDetectados : [];
    const huecos = Array.isArray(stc.huecos) ? stc.huecos : [];
    parts.push(`<h5 class="structure-h5">Beats detectados</h5>`);
    parts.push(
      beats.length
        ? `<ul class="structure-list">${beats.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
        : "<p class=\"muted\">Ninguno listado.</p>"
    );
    parts.push(`<h5 class="structure-h5">Huecos detectados</h5>`);
    parts.push(
      huecos.length
        ? `<ul class="structure-gaps">${huecos.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
        : "<p class=\"muted\">Ninguno listado.</p>"
    );
  }

  if (vh && typeof vh === "object") {
    parts.push(`<h4 class="structure-h4">Viaje del héroe</h4>`);
    parts.push(`<p><strong>Alineación:</strong> ${escapeHtml(vh.alineacion || "—")}</p>`);
    if (vh.comentario) {
      parts.push(`<div class="structure-narrative">${escapeHtml(vh.comentario)}</div>`);
    }
  }

  if (pri.length) {
    parts.push(`<h4 class="structure-h4">Prioridades</h4><ol class="structure-priorities">${pri
      .map((p) => `<li>${escapeHtml(p)}</li>`)
      .join("")}</ol>`);
  }

  if (!parts.length) {
    return "<p>No hay datos estructurales reconocibles.</p>";
  }
  return parts.join("");
}

function renderBenchmarkHtml(bench) {
  const note =
    bench && typeof bench.note === "string" && bench.note.trim()
      ? bench.note.trim()
      : "Próximamente: benchmark contra catálogo real de referencia.";
  return `
    <p class="benchmark-upcoming-msg">${escapeHtml(note)}</p>
    <p class="muted">No mostramos cifras comparativas inventadas. Cuando haya un catálogo real, verás aquí la comparación con obras de referencia.</p>
  `;
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
        <p class="eta-line muted">Tiempos orientativos: capítulos (IA) ~${estimateChapterAnalysisMinutes(m)} min · Manuscrip eco ~${estimateManuscripEcoMinutes(m)} min · completo: variable (largo).</p>
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
        ${scoreHintParagraph("ritmo", c.ritmoScore)}
        ${scoreHintParagraph("claridad", c.claridadScore)}
        ${scoreHintParagraph("estructura", c.estructuraScore)}
        <p>${escapeHtml(c.resumenCapitulo || "Sin resumen.")}</p>
      </div>
    `
    )
    .join("");

  latestResult.innerHTML = `
    <p><strong>Título:</strong> ${escapeHtml(manuscript.title)}</p>
    <p><strong>Modelo:</strong> ${escapeHtml(analysis.model)}</p>
    ${scoreHintParagraph("overall", analysis.dimensions.overallScore)}
    ${scoreHintParagraph("ritmo", analysis.dimensions.ritmoScore)}
    ${scoreHintParagraph("claridad", analysis.dimensions.claridadScore)}
    ${scoreHintParagraph("estructura", analysis.dimensions.estructuraScore)}
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
        ? `<div class="score-hint-block">
      <p><strong>Scores IA (resumen)</strong></p>
      ${scoreHintParagraph("overall", la.dimensions.overallScore)}
      ${scoreHintParagraph("ritmo", la.dimensions.ritmoScore)}
      ${scoreHintParagraph("claridad", la.dimensions.claridadScore)}
      ${scoreHintParagraph("estructura", la.dimensions.estructuraScore)}
    </div>`
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
          ${scoreHintParagraph("ritmo", c.ritmoScore)}
          ${scoreHintParagraph("claridad", c.claridadScore)}
          ${scoreHintParagraph("estructura", c.estructuraScore)}
          <p>${escapeHtml(c.resumenCapitulo || "")}</p>
        </div>`
          )
          .join("")
      : "<p>No hay análisis por capítulo.</p>";

  const estructuraHtml = mc.structure ? renderEstructuraHtml(mc.structure) : "<p>No hay evaluación estructural.</p>";

  const personasHtml =
    mc.personas && Array.isArray(mc.personas.personas)
      ? mc.personas.personas
          .map(
            (p) => `
        <div class="chapter-analysis">
          <h4>${escapeHtml(p.rol || "persona")}</h4>
          <p><strong>Punto de abandono:</strong> ${escapeHtml(p.puntoAbandono || p.punto_abandono || "—")}</p>
          <p><strong>Motivo (si aplica):</strong> ${escapeHtml(
            p.motivoAbandono != null ? p.motivoAbandono : p.motivo_abandono != null ? p.motivo_abandono : "—"
          )}</p>
          <p><strong>Estrellas (simulado):</strong> ${p.estrellasAmazon ?? "—"}</p>
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

  const benchHtml = mc.benchmark ? renderBenchmarkHtml(mc.benchmark) : "<p>No hay benchmark.</p>";

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
    refreshCompareSelects(data);
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
  const preset = goalPreset?.value?.trim() || "";
  const goalsText = String(formData.get("goals") || "").trim();
  const combined = [preset, goalsText].filter(Boolean).join(" — ");
  formData.set("goals", combined);

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
      const detail =
        typeof data.details === "string"
          ? data.details
          : data.details != null
            ? JSON.stringify(data.details)
            : "";
      uploadStatus.textContent = detail
        ? `${data.error || "Error"} — ${detail}`
        : data.error || "No se pudo procesar el manuscrito.";
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

if (dropZone) {
  const fileInput = uploadForm.querySelector('input[name="manuscript"]');
  ["dragenter", "dragover"].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add("drop-zone-active");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (ev !== "drop") dropZone.classList.remove("drop-zone-active");
    });
  });
  dropZone.addEventListener("drop", (e) => {
    dropZone.classList.remove("drop-zone-active");
    const f = e.dataTransfer?.files?.[0];
    if (f && fileInput) {
      const dt = new DataTransfer();
      dt.items.add(f);
      fileInput.files = dt.files;
    }
  });
}

if (compareBtn && compareResult) {
  compareBtn.addEventListener("click", async () => {
    const a = compareA?.value;
    const b = compareB?.value;
    if (!a || !b || a === b) {
      compareResult.innerHTML =
        "<p class=\"muted\">Elige dos manuscritos distintos (Versión A y Versión B).</p>";
      return;
    }
    compareResult.textContent = "Comparando…";
    try {
      const res = await apiFetch(
        `/api/manuscripts/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`
      );
      const data = await res.json();
      if (!res.ok) {
        compareResult.textContent = data.details
          ? `${data.error} — ${data.details}`
          : data.error || "Error al comparar.";
        return;
      }
      renderCompareResult(data);
    } catch (err) {
      compareResult.textContent = `Error: ${err.message}`;
    }
  });
}

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
