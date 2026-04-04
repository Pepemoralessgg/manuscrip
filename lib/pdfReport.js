const PDFDocument = require("pdfkit");

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

function generateManuscriptPdf(manuscript) {
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
      writeSection(doc, "Scores IA (capítulos)", [
        `Global: ${d.overallScore}/100`,
        `Ritmo: ${d.ritmoScore}`,
        `Claridad: ${d.claridadScore}`,
        `Estructura: ${d.estructuraScore}`
      ]);
    }

    const mc = manuscript.manuscripIa;
    if (mc?.structure) {
      const t = mc.structure.tresActos || {};
      writeSection(doc, "Estructura narrativa", [
        `Conflicto antes del 12%: ${t.conflictoAntesDel12Porciento || "—"}`,
        `Punto de no retorno 50-60%: ${t.puntoDeNoRetorno50a60 || "—"}`,
        `Todo está perdido antes del clímax: ${t.todoEstaPerdidoAntesClimax || "—"}`,
        `Comentario: ${t.comentario || "—"}`
      ]);
    }

    if (mc?.personas?.personas?.length) {
      const lines = mc.personas.personas.map(
        (p) =>
          `${p.rol || "persona"}: ${(p.feedback || "").slice(0, 500)} (abandono: ${p.puntoAbandono || "—"})`
      );
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

    doc.end();
  });
}

module.exports = { generateManuscriptPdf };
