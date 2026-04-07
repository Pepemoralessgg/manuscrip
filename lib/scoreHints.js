/**
 * Hints de contexto para scores (0–100).
 * Compartido por lib/pdfReport.js (Node). La UI del navegador replica la lógica en public/app.js
 * para evitar import de .mjs en cliente (Vercel / compatibilidad).
 */

function buildScoreHintParts(dim, raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return null;
  const label =
    { ritmo: "Ritmo", claridad: "Claridad", estructura: "Estructura", overall: "Score global" }[dim] ||
    dim;
  let nivel = "Nivel medio";
  if (n < 45) nivel = "Nivel bajo";
  else if (n < 60) nivel = "Nivel medio-bajo";
  else if (n < 75) nivel = "Nivel medio";
  else if (n < 88) nivel = "Nivel alto";
  else nivel = "Nivel muy alto";
  const optimal =
    dim === "overall"
      ? "En muchos géneros, 70–88 suele ser un buen objetivo editorial."
      : "Referencia orientativa: ~65–85 según género (no es un examen).";
  const tips = {
    ritmo:
      n < 60
        ? "Alterna escenas más ágiles con otras más pausadas; revisa si el medio del libro se aplana."
        : "Mantén contraste: tensión con frases cortas y respiro donde el lector asimile emociones.",
    claridad:
      n < 60
        ? "Divide oraciones muy largas; aclara referencias (quién hace qué) y tecnicismos sueltos."
        : "Sigue puliendo subtramas y coherencia pronominal en diálogos densos.",
    estructura:
      n < 60
        ? "Define mejor el objetivo de cada capítulo y refuerza transiciones y planteamiento vs. clímax."
        : "Comprueba que el desenlace pague lo prometido y que no queden hilos olvidados.",
    overall:
      n < 60
        ? "Prioriza una pasada de claridad + ritmo en los capítulos que arrastran según el resumen."
        : "Refina con foco en coherencia global y en el capítulo más débil del análisis por bloques."
  };
  const tip = tips[dim] || tips.claridad;
  return { label, n, nivel, tip, optimal };
}

function buildScoreHintPlainText(dim, raw) {
  const p = buildScoreHintParts(dim, raw);
  if (!p) return "";
  return `${p.label} ${p.n}/100 — ${p.nivel}. ${p.tip} ${p.optimal}`;
}

module.exports = { buildScoreHintParts, buildScoreHintPlainText };
