const PDFDocument = require("pdfkit");
const path = require("path");
const { pathToFileURL } = require("url");

let scoreHintsModulePromise = null;

function loadScoreHintsModule() {
  if (!scoreHintsModulePromise) {
    const url = pathToFileURL(path.join(__dirname, "..", "public", "scoreHints.mjs")).href;
    scoreHintsModulePromise = import(url);
  }
  return scoreHintsModulePromise;
}

function writeSection(doc, title, lines) {
  doc.fontSize(14).font("Helvetica-Bold").text(title, { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(10).font("Helvetica");
  lines.forEach((line) => {
    doc.text(line || "", { align: "left" });
    doc.moveDown(0.2);
  });
  doc.moveDown(0.6);
}

async function generateManuscriptPdf(manuscript) {
  const { buildScoreHintParts } = await loadScoreHintsModule();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).font("Helvetica-Bold").text("Manuscrip — Informe editorial", { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(`Generado: ${new Date().toLocaleString("es-ES")}`, { align: "center" });
    doc.moveDown(1);

    writeSection(doc, "Ficha", [
      `Título: ${manuscript.title}`,
      `Archivo: ${manuscript.sourceFileName}`,
      `Género: ${manuscript.genre}`,
      `Público: ${manuscript.audience}`,
      `Objetivo: ${manuscript.goals || "—"}`,
      `Palabras: ${manuscript.wordCount}`,
      `Capítulos detectados: ${manuscript.chapterCount}`
    ]);

    const nlp = manuscript.nlpMetrics;
    if (nlp?.global) {
      const g = nlp.global;
      writeSection(doc, "Capa 1 — Legibilidad y estilo (heurístico)", [
        `Índice Flesch-Szigriszt aproximado: ${g.fleschSzigrisztLike}`,
        `Longitud media de oración: ${g.avgSentenceLength}`,
        `Ratio de oraciones largas: ${g.longSentenceRatio}`,
        `Riqueza léxica (aprox.): ${g.lexicalRichness}`,
        `Muletillas detectadas (aprox.): ${g.fillerHits}`,
        `Pistas de voz pasiva (aprox.): ${g.passiveHints}`,
        nlp.note || ""
      ]);
    }

    const la = manuscript.latestAnalysis;
    if (la?.dimensions) {
      const d = la.dimensions;
      const scoreLines = [];
      const dims = [
        ["overall", d.overallScore],
        ["ritmo", d.ritmoScore],
        ["claridad", d.claridadScore],
        ["estructura", d.estructuraScore]
      ];
      for (const [dim, val] of dims) {
        const label =
          dim === "overall"
            ? "Score global"
            : dim === "ritmo"
              ? "Ritmo"
              : dim === "claridad"
                ? "Claridad"
                : "Estructura";
        scoreLines.push(`${label}: ${val}/100`);
        const p = buildScoreHintParts(dim, val);
        if (p) {
          scoreLines.push(`  ${p.nivel}. ${p.tip} ${p.optimal}`);
        }
        scoreLines.push("");
      }
      while (scoreLines.length && scoreLines[scoreLines.length - 1] === "") scoreLines.pop();
      writeSection(doc, "Scores IA (capítulos)", scoreLines);
    }

    const mc = manuscript.manuscripIa;
    if (mc?.structure && typeof mc.structure === "object") {
      const st = mc.structure;
      const ta = st.tresActos || {};
      const lines = [
        `Conflicto antes del ~12%: ${ta.conflictoAntesDel12Porciento || "—"}`,
        `Punto de no retorno (~50–60%): ${ta.puntoDeNoRetorno50a60 || "—"}`,
        `Todo está perdido antes del clímax: ${ta.todoEstaPerdidoAntesClimax || "—"}`,
        `Comentario (tres actos): ${ta.comentario || "—"}`
      ];

      const stc = st.saveTheCat;
      if (stc && typeof stc === "object") {
        lines.push("");
        lines.push("— Save the Cat (referencia) —");
        if (stc.comentario) lines.push(`Comentario: ${stc.comentario}`);
        const beats = Array.isArray(stc.beatsDetectados) ? stc.beatsDetectados : [];
        if (beats.length) {
          lines.push("Beats detectados:");
          beats.forEach((b, i) => lines.push(`  ${i + 1}. ${b}`));
        } else {
          lines.push("Beats detectados: —");
        }
        const huecos = Array.isArray(stc.huecos) ? stc.huecos : [];
        if (huecos.length) {
          lines.push("Huecos identificados:");
          huecos.forEach((h, i) => lines.push(`  ${i + 1}. ${h}`));
        } else {
          lines.push("Huecos identificados: —");
        }
      }

      const vh = st.viajeDelHeroe;
      if (vh && typeof vh === "object") {
        lines.push("");
        lines.push("— Viaje del héroe —");
        lines.push(`Alineación: ${vh.alineacion || "—"}`);
        if (vh.comentario) lines.push(`Comentario: ${vh.comentario}`);
      }

      const pri = Array.isArray(st.prioridades) ? st.prioridades : [];
      if (pri.length) {
        lines.push("");
        lines.push("Prioridades de mejora:");
        pri.forEach((p, i) => lines.push(`  ${i + 1}. ${p}`));
      }

      writeSection(doc, "Estructura narrativa", lines);
    }

    if (mc?.personas?.personas?.length) {
      const lines = [];
      mc.personas.personas.forEach((p) => {
        const fb = (p.feedback || "").slice(0, 800);
        const punto = p.puntoAbandono || p.punto_abandono || "—";
        const motivo =
          p.motivoAbandono != null ? p.motivoAbandono : p.motivo_abandono != null ? p.motivo_abandono : "—";
        lines.push(`• ${p.rol || "persona"}`);
        lines.push(`  Punto de abandono: ${punto}`);
        lines.push(`  Motivo (si aplica): ${motivo}`);
        lines.push(`  Feedback: ${fb}`);
        lines.push(`  Estrellas (simulado): ${p.estrellasAmazon ?? "—"}`);
        lines.push("");
      });
      writeSection(doc, "Simulación de lectores", lines);
    }

    if (mc?.hook) {
      const h = mc.hook;
      writeSection(doc, "Hook inicial", [
        `Pregunta dramática: ${h.preguntaDramatica || "—"}`,
        `Tono adecuado al género: ${h.tonoAdecuadoGenero || "—"}`,
        `Agencia del protagonista: ${h.agenciaProtagonista || "—"}`,
        `Resumen: ${h.resumen || "—"}`
      ]);
    }

    if (mc?.synopsis) {
      const s = mc.synopsis;
      writeSection(doc, "Sinopsis y títulos (propuestas)", [
        ...(s.sinopsis || []).map((x, i) => `Sinopsis ${i + 1}: ${x}`),
        ...(s.titulos || []).map((x, i) => `Título ${i + 1}: ${x}`),
        `Hook de una frase: ${s.hookUnaFrase || "—"}`
      ]);
    }

    if (mc?.inconsistencies?.alertas?.length) {
      const lines = mc.inconsistencies.alertas.map(
        (a) => `[${a.tipo || "alerta"}] ${a.descripcion || ""} → ${a.sugerencia || ""}`
      );
      writeSection(doc, "Inconsistencias (sospechas)", lines);
    }

    const benchNote =
      mc?.benchmark && typeof mc.benchmark.note === "string" && mc.benchmark.note.trim()
        ? mc.benchmark.note.trim()
        : "Próximamente: benchmark contra catálogo real de referencia.";
    writeSection(doc, "Benchmark", [
      benchNote,
      "No se incluyen comparaciones con mercado hasta disponer de un catálogo real."
    ]);

    doc.end();
  });
}

module.exports = { generateManuscriptPdf };
