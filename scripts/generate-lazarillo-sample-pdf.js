/**
 * Genera un PDF de muestra (Lazarillo) para verificar el informe descargable.
 * Uso: node scripts/generate-lazarillo-sample-pdf.js
 * Salida: scripts/informe-lazarillo-muestra.pdf
 */
const fs = require("fs");
const path = require("path");
const { generateManuscriptPdf } = require("../lib/pdfReport");

const mockManuscript = {
  title: "La vida de Lazarillo de Tormes",
  sourceFileName: "lazarillo.pdf",
  genre: "Novela picaresca / clásico",
  audience: "Lectura general",
  goals: "Evaluación estructural y lectores simulados",
  wordCount: 18420,
  chapterCount: 7,
  nlpMetrics: {
    note: "Métricas heurísticas sobre texto completo.",
    global: {
      fleschSzigrisztLike: 62.3,
      avgSentenceLength: 22.1,
      longSentenceRatio: 0.18,
      lexicalRichness: 0.44,
      fillerHits: 12,
      passiveHints: 8
    }
  },
  latestAnalysis: {
    dimensions: {
      overallScore: 71,
      ritmoScore: 69,
      claridadScore: 66,
      estructuraScore: 73
    }
  },
  manuscripIa: {
    structure: {
      tresActos: {
        conflictoAntesDel12Porciento: "sí",
        puntoDeNoRetorno50a60: "incertidumbre",
        todoEstaPerdidoAntesClimax: "no",
        comentario:
          "Estructura episódica en tratados; el conflicto del hambre y la supervivencia aparece pronto."
      },
      saveTheCat: {
        comentario: "Esquema clásico adaptado a relato en primera persona.",
        beatsDetectados: ["Apertura con tono confesional", "Catalizador: primer amo", "Midpoint: cambio de amo"],
        huecos: [
          "Transición entre tratados III y IV algo abrupta",
          "Poca presencia de subtrama romántica (si se buscara contraste)"
        ]
      },
      viajeDelHeroe: {
        alineacion: "media",
        comentario: "El protagonista aprende a sobrevivir; el viaje es social más que geográfico."
      },
      prioridades: [
        "Unificar el tono entre tratados si se reescribe para público actual",
        "Reforzar el clímax emocional del último tratado"
      ]
    },
    personas: {
      personas: [
        {
          rol: "lector_casual",
          puntoAbandono: "Tratado 4 (aprox. 45% del libro)",
          motivoAbandono: "Ritmo pausado y léxico arcaico; prefiere más diálogo.",
          feedback:
            "Me engancha el tono irónico al principio. A mitad de libro echo en falta más tensión continua. El desenlace del último tratado lo leo con curiosidad.",
          estrellasAmazon: 3
        },
        {
          rol: "editor_profesional",
          puntoAbandono: "no abandona",
          motivoAbandono: "no aplica",
          feedback: "Interés editorial como referencia del género picaresco; revisaría notas al pie para edición escolar.",
          estrellasAmazon: 4
        }
      ]
    },
    benchmark: {
      upcoming: true,
      note: "Próximamente: benchmark contra catálogo real de referencia."
    },
    hook: {
      preguntaDramatica: "parcial",
      tonoAdecuadoGenero: "sí",
      agenciaProtagonista: "sí",
      resumen: "Voz en primera persona que promete escándalo y entrega episodios breves."
    },
    synopsis: {
      sinopsis: ["Versión corta para cubierta: un niño aprende a vivir al servicio de amos que lo desprecian."],
      titulos: ["Lazarillo", "De la infancia a la picardía"],
      hookUnaFrase: "Un niño hambriento narra cómo el mundo lo enseña a sobrevivir."
    },
    inconsistencies: {
      alertas: [
        {
          tipo: "tiempo",
          descripcion: "Posible solapamiento de edades entre tratados I y II",
          sugerencia: "Revisar coherencia si se unifican fechas en edición moderna."
        }
      ]
    }
  }
};

async function main() {
  const buf = await generateManuscriptPdf(mockManuscript);
  const out = path.join(__dirname, "informe-lazarillo-muestra.pdf");
  fs.writeFileSync(out, buf);
  console.log("Escrito:", out, `(${buf.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
