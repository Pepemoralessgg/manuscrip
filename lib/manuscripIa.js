function chapterSummariesForPrompt(chapters, maxLen = 500) {
  return chapters
    .map((c) => {
      const snippet = (c.content || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
      return `Capítulo ${c.index} (${c.title}): ${snippet}`;
    })
    .join("\n\n");
}

function buildStructurePrompt(manuscript, chapters) {
  const summaries = chapterSummariesForPrompt(chapters, 450);
  return `
Eres un editor de desarrollo narrativo experto en español.
Evalúa la estructura global usando resúmenes por capítulo (no tienes el libro completo).
Marca incertidumbres si faltan datos.

Contexto:
- Título: ${manuscript.title}
- Género: ${manuscript.genre}
- Público: ${manuscript.audience}
- Objetivo: ${manuscript.goals || "No especificado"}
- Palabras aproximadas: ${manuscript.wordCount}

Resúmenes por capítulo:
${summaries}

Devuelve SOLO JSON válido con esta forma exacta:
{
  "tresActos": {
    "conflictoAntesDel12Porciento": "sí|no|incertidumbre",
    "puntoDeNoRetorno50a60": "sí|no|incertidumbre",
    "todoEstaPerdidoAntesClimax": "sí|no|incertidumbre",
    "comentario": "máx 600 caracteres"
  },
  "saveTheCat": {
    "beatsDetectados": ["...", "..."],
    "huecos": ["...", "..."],
    "comentario": "máx 500 caracteres"
  },
  "viajeDelHeroe": {
    "alineacion": "alta|media|baja",
    "comentario": "máx 500 caracteres"
  },
  "prioridades": ["...", "...", "..."]
}
Sin markdown. Máximo 6 items en beatsDetectados y 4 en huecos.
`.trim();
}

function buildPersonasPrompt(manuscript, chapters) {
  const summaries = chapterSummariesForPrompt(chapters, 400);
  return `
Simula 4 lectores distintos para este manuscrito (español).
Usa primera persona. Sé específico y referencia capítulos cuando puedas.

Contexto:
- Título: ${manuscript.title}
- Género: ${manuscript.genre}
- Público: ${manuscript.audience}

Resúmenes:
${summaries}

Devuelve SOLO JSON válido:
{
  "personas": [
    {
      "rol": "lector_casual",
      "feedback": "máx 900 caracteres",
      "puntoAbandono": "obligatorio: capítulo N, aprox. X% del libro, o exactamente no abandona",
      "motivoAbandono": "obligatorio: una frase si abandonaría; si no abandona, pon no aplica",
      "estrellasAmazon": 1
    },
    {
      "rol": "editor_profesional",
      "feedback": "máx 900 caracteres",
      "puntoAbandono": "obligatorio (mismo criterio)",
      "motivoAbandono": "obligatorio (mismo criterio)",
      "estrellasAmazon": 1
    },
    {
      "rol": "lector_critico",
      "feedback": "máx 900 caracteres",
      "puntoAbandono": "obligatorio (mismo criterio)",
      "motivoAbandono": "obligatorio (mismo criterio)",
      "estrellasAmazon": 1
    },
    {
      "rol": "lectora_genero",
      "feedback": "máx 900 caracteres",
      "puntoAbandono": "obligatorio (mismo criterio)",
      "motivoAbandono": "obligatorio (mismo criterio)",
      "estrellasAmazon": 1
    }
  ]
}

OBLIGATORIO para cada persona: puntoAbandono (ej.: "capítulo 3", "25% del libro", o "no abandona") y motivoAbandono (motivo breve si abandonaría; "no aplica" si no abandona).
estrellasAmazon: entero 1-5. Sin markdown.
`.trim();
}

function buildHookPrompt(manuscript, firstPages) {
  return `
Analiza el gancho inicial (aprox. primeras 8-12 páginas o primeros ~2500 palabras).

Contexto:
- Título: ${manuscript.title}
- Género: ${manuscript.genre}
- Público: ${manuscript.audience}

Texto inicial:
"""
${firstPages}
"""

Devuelve SOLO JSON válido:
{
  "preguntaDramatica": "sí|no|parcial",
  "tonoAdecuadoGenero": "sí|no|parcial",
  "agenciaProtagonista": "sí|no|parcial",
  "riesgos": ["...", "...", "..."],
  "mejorasPrioritarias": ["...", "...", "..."],
  "resumen": "máx 700 caracteres"
}
Sin markdown.
`.trim();
}

function buildSynopsisPrompt(manuscript, chapters) {
  const summaries = chapterSummariesForPrompt(chapters, 350);
  return `
Genera material de pitching en español a partir de los resúmenes por capítulo.

Título: ${manuscript.title}
Género: ${manuscript.genre}

Resúmenes:
${summaries}

Devuelve SOLO JSON válido:
{
  "sinopsis": ["...", "...", "...", "...", "..."],
  "titulos": ["...", "...", "...", "...", "..."],
  "hookUnaFrase": "...",
  "nota": "máx 300 caracteres"
}
Cada sinopsis 100-200 palabras aprox. Sin markdown.
`.trim();
}

function buildInconsistencyPrompt(manuscript, characterCandidates, chapters) {
  const names = characterCandidates
    .slice(0, 40)
    .map((c) => `${c.name} (${c.count})`)
    .join(", ");
  const samples = chapters
    .map((c) => `Cap ${c.index}: ${(c.content || "").slice(0, 900).replace(/\s+/g, " ")}`)
    .join("\n\n");
  return `
Eres un lector atento buscando inconsistencias obvias (nombres, continuidad, línea temporal).
No inventes hechos no presentes en el texto.

Título: ${manuscript.title}
Candidatos a nombres propios frecuentes: ${names}

Extractos (truncados):
${samples}

Devuelve SOLO JSON válido:
{
  "alertas": [
    {
      "tipo": "nombre|tiempo|espacio|otro",
      "descripcion": "máx 240 caracteres",
      "sugerencia": "máx 240 caracteres"
    }
  ],
  "riesgo": "bajo|medio|alto",
  "comentario": "máx 500 caracteres"
}
Máximo 8 alertas. Sin markdown.
`.trim();
}

function buildBenchmarkPlaceholder(_manuscript, _nlpGlobal) {
  return {
    upcoming: true,
    note: "Próximamente: benchmark contra catálogo real de referencia."
  };
}

function clampScore100(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 50;
  return Math.max(1, Math.min(100, Math.round(x)));
}

function buildEcoManuscripPrompt(manuscript, nlpMetrics, chapters) {
  const outline = chapters
    .slice(0, 28)
    .map(
      (c) =>
        `Cap ${c.index} (${c.wordCount} palabras) ${c.title}: ${(c.content || "")
          .slice(0, 100)
          .replace(/\s+/g, " ")}`
    )
    .join("\n");
  const allWords = chapters
    .map((c) => c.content)
    .join("\n\n")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const sample = allWords.slice(0, 900).join(" ");
  const g = nlpMetrics.global;

  return `
Eres editor literario senior en español. Tienes un presupuesto de tokens ajustado: devuelve UN SOLO JSON válido (sin markdown) que cubra todo lo pedido con texto breve.

Contexto:
- Título: ${manuscript.title}
- Género: ${manuscript.genre}
- Público: ${manuscript.audience}
- Objetivo: ${manuscript.goals || "No especificado"}
- Palabras totales: ${manuscript.wordCount}

Métricas locales (heurísticas, no perfectas):
- Flesch aprox: ${g.fleschSzigrisztLike}
- Oración media: ${g.avgSentenceLength}
- Oraciones largas (ratio): ${g.longSentenceRatio}
- Riqueza léxica: ${g.lexicalRichness}
- Muletillas (aprox): ${g.fillerHits}

Índice por capítulo (muy resumido):
${outline}

Muestra de texto continuo (primeras ~900 palabras):
"""
${sample}
"""

En personas: cada una debe incluir puntoAbandono (capítulo, % del libro, o «no abandona») y motivoAbandono (breve; «no aplica» si no abandona).

Devuelve SOLO JSON con esta forma exacta:
{
  "dimensionScores": {
    "ritmoScore": number,
    "claridadScore": number,
    "estructuraScore": number,
    "overallScore": number
  },
  "executiveSummary": "máx 700 caracteres",
  "fortalezas": ["máx 3 strings cortos"],
  "mejoras": ["máx 3 strings cortos"],
  "structure": {
    "tresActos": {
      "conflictoAntesDel12Porciento": "sí|no|incertidumbre",
      "puntoDeNoRetorno50a60": "sí|no|incertidumbre",
      "todoEstaPerdidoAntesClimax": "sí|no|incertidumbre",
      "comentario": "máx 400 caracteres"
    }
  },
  "personas": {
    "personas": [
      { "rol": "lector_casual", "feedback": "máx 500 caracteres", "puntoAbandono": "capítulo N, % o no abandona", "motivoAbandono": "obligatorio", "estrellasAmazon": 1 },
      { "rol": "editor_profesional", "feedback": "máx 500 caracteres", "puntoAbandono": "capítulo N, % o no abandona", "motivoAbandono": "obligatorio", "estrellasAmazon": 1 },
      { "rol": "lector_critico", "feedback": "máx 500 caracteres", "puntoAbandono": "capítulo N, % o no abandona", "motivoAbandono": "obligatorio", "estrellasAmazon": 1 },
      { "rol": "lectora_genero", "feedback": "máx 500 caracteres", "puntoAbandono": "capítulo N, % o no abandona", "motivoAbandono": "obligatorio", "estrellasAmazon": 1 }
    ]
  },
  "hook": {
    "preguntaDramatica": "sí|no|parcial",
    "tonoAdecuadoGenero": "sí|no|parcial",
    "agenciaProtagonista": "sí|no|parcial",
    "resumen": "máx 400 caracteres",
    "riesgos": ["máx 2"],
    "mejorasPrioritarias": ["máx 2"]
  },
  "synopsis": {
    "sinopsis": ["5 textos 80-120 palabras cada uno"],
    "titulos": ["5 títulos"],
    "hookUnaFrase": "una frase"
  },
  "inconsistencies": {
    "alertas": [
      { "tipo": "nombre|tiempo|otro", "descripcion": "máx 160 caracteres", "sugerencia": "máx 160 caracteres" }
    ],
    "riesgo": "bajo|medio|alto",
    "comentario": "máx 300 caracteres"
  },
  "chapterHighlights": [
    { "index": 1, "title": "...", "ritmoScore": 70, "nota": "máx 160 caracteres" }
  ]
}

chapterHighlights: máximo 6 capítulos. Si no hay datos, usa array vacío.
`.trim();
}

function mapEcoResponseToStored(manuscript, eco, model) {
  const d = eco.dimensionScores || {};
  const ritmo = clampScore100(d.ritmoScore);
  const claridad = clampScore100(d.claridadScore);
  const estructura = clampScore100(d.estructuraScore);
  const overall =
    d.overallScore != null ? clampScore100(d.overallScore) : Math.round((ritmo + claridad + estructura) / 3);

  let personasBlock = eco.personas;
  if (Array.isArray(personasBlock)) {
    personasBlock = { personas: personasBlock };
  }
  if (!personasBlock?.personas) {
    personasBlock = { personas: [] };
  }

  const manuscripIa = {
    structure: eco.structure || {},
    personas: personasBlock,
    hook: eco.hook || {},
    synopsis: eco.synopsis || {},
    inconsistencies: eco.inconsistencies || { alertas: [], riesgo: "bajo", comentario: "" },
    benchmark: null,
    completedAt: new Date().toISOString(),
    budgetMode: "eco",
    executiveSummary: eco.executiveSummary || ""
  };

  const highlights = Array.isArray(eco.chapterHighlights) ? eco.chapterHighlights : [];
  const chapterAnalyses = highlights.length
    ? highlights.slice(0, 8).map((h) => ({
        index: h.index,
        title: h.title || `Capítulo ${h.index}`,
        wordCount: manuscript.chapters.find((c) => c.index === h.index)?.wordCount ?? 0,
        ritmoScore: clampScore100(h.ritmoScore ?? ritmo),
        claridadScore: clampScore100(h.claridadScore ?? claridad),
        estructuraScore: clampScore100(h.estructuraScore ?? estructura),
        fortalezas: [],
        mejoras: [],
        observaciones: [],
        resumenCapitulo: h.nota || ""
      }))
    : [
        {
          index: 1,
          title: "Vista global (modo económico)",
          wordCount: manuscript.wordCount,
          ritmoScore: ritmo,
          claridadScore: claridad,
          estructuraScore: estructura,
          fortalezas: Array.isArray(eco.fortalezas) ? eco.fortalezas.slice(0, 3) : [],
          mejoras: Array.isArray(eco.mejoras) ? eco.mejoras.slice(0, 3) : [],
          observaciones: [],
          resumenCapitulo: eco.executiveSummary || "Un solo pase de IA para reducir coste de API."
        }
      ];

  const latestAnalysis = {
    analyzedAt: new Date().toISOString(),
    model,
    dimensions: {
      ritmoScore: ritmo,
      claridadScore: claridad,
      estructuraScore: estructura,
      overallScore: overall
    },
    chapterAnalyses,
    budgetMode: "eco"
  };

  return { manuscripIa, latestAnalysis };
}

module.exports = {
  chapterSummariesForPrompt,
  buildStructurePrompt,
  buildPersonasPrompt,
  buildHookPrompt,
  buildSynopsisPrompt,
  buildInconsistencyPrompt,
  buildBenchmarkPlaceholder,
  buildEcoManuscripPrompt,
  mapEcoResponseToStored
};
