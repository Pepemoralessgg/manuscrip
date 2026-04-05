require("./lib/loadEnv");
const express = require("express");
const path = require("path");
const multer = require("multer");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const crypto = require("crypto");
const { analyzeManuscriptNlp } = require("./lib/nlp");
const {
  buildStructurePrompt,
  buildPersonasPrompt,
  buildHookPrompt,
  buildSynopsisPrompt,
  buildInconsistencyPrompt,
  buildBenchmarkPlaceholder,
  buildEcoManuscripPrompt,
  mapEcoResponseToStored
} = require("./lib/manuscripIa");
const { generateManuscriptPdf } = require("./lib/pdfReport");
const {
  resolveUserId,
  listManuscripts,
  getManuscript,
  insertManuscript,
  updateManuscript,
  recordAnalysisSnapshot
} = require("./lib/manuscriptRepository");

const app = express();
const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");
const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();
const anthropicModel =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const manuscripMode = (process.env.MANUSCRIP_MODE || "eco").toLowerCase();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json({ limit: "2mb" }));
// Vercel ignora express.static: los archivos en public/ salen por CDN; la raíz la cubrimos aquí.
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});
app.use(express.static(publicDir));

async function requireUserOrDefault(req, res) {
  const userId = await resolveUserId(req);
  if (!userId) {
    res.status(401).json({
      error:
        "Falta usuario. Configura SUPABASE_DEFAULT_USER_ID en .env o envía Authorization: Bearer <access_token de Supabase Auth>."
    });
    return null;
  }
  return userId;
}

function splitIntoChapters(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chapterRegex =
    /(?:^|\n)\s*(chapter|cap[ií]tulo)\s+([0-9ivxlcdm]+)\b[^\n]*/gim;
  const matches = [...normalized.matchAll(chapterRegex)];
  if (!matches.length) {
    return [
      {
        title: "Texto completo",
        content: normalized
      }
    ];
  }

  const chapters = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index || 0;
    const end = i < matches.length - 1 ? matches[i + 1].index : normalized.length;
    const content = normalized.slice(start, end).trim();
    if (content) {
      const line = content.split("\n")[0].trim();
      chapters.push({ title: line || `Capítulo ${i + 1}`, content });
    }
  }
  return chapters.length
    ? chapters
    : [
        {
          title: "Texto completo",
          content: normalized
        }
      ];
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function extractTextFromUpload(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext === ".txt") {
    return file.buffer.toString("utf8");
  }
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value || "";
  }
  if (ext === ".pdf") {
    const result = await pdfParse(file.buffer);
    return result.text || "";
  }
  throw new Error("Formato no soportado. Solo DOCX, TXT y PDF en esta versión.");
}

function buildPrompt({ title, genre, audience, excerpt, goals }) {
  return `
You are a professional literary editor helping an author improve a draft.

Analyze the following writing sample and return concise, practical, and actionable feedback.

Book title: ${title || "Unknown"}
Genre: ${genre || "Unknown"}
Target audience: ${audience || "Unknown"}
Author's goals: ${goals || "Not provided"}

Writing sample:
"""
${excerpt}
"""

Return ONLY valid JSON with this exact shape:
{
  "overallScore": number,
  "readabilityScore": number,
  "voiceConsistencyScore": number,
  "plotAndStructureScore": number,
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "lineEdits": [
    {
      "issue": "...",
      "suggestion": "...",
      "exampleRewrite": "..."
    }
  ],
  "nextSteps": ["...", "..."]
}

Scoring scale is 1-100. Keep arrays short and high-value.
Return ONLY the raw JSON object. Do not wrap it in markdown fences. Do not add any text before or after the JSON.
`.trim();
}

function buildChapterPrompt({ manuscript, chapter }) {
  return `
Eres un editor literario senior especializado en narrativa en español.

Analiza este capítulo y devuelve feedback profundo y accionable.
Debes puntuar exactamente estas 3 dimensiones:
- ritmoScore (1-100)
- claridadScore (1-100)
- estructuraScore (1-100)

Contexto del manuscrito:
- Título: ${manuscript.title}
- Género: ${manuscript.genre}
- Público objetivo: ${manuscript.audience}
- Objetivo del autor: ${manuscript.goals || "No especificado"}

Capítulo:
- Índice: ${chapter.index}
- Título: ${chapter.title}
- Palabras: ${chapter.wordCount}

Texto del capítulo:
"""
${chapter.content}
"""

Devuelve SOLO JSON válido, sin markdown ni texto adicional, con esta forma exacta:
{
  "ritmoScore": number,
  "claridadScore": number,
  "estructuraScore": number,
  "fortalezas": ["...", "..."],
  "mejoras": ["...", "..."],
  "observaciones": [
    {
      "problema": "...",
      "impacto": "...",
      "accion": "..."
    }
  ],
  "resumenCapitulo": "..."
}

Restricciones de longitud:
- fortalezas: máximo 3 elementos
- mejoras: máximo 3 elementos
- observaciones: máximo 4 elementos
- cada string con máximo 220 caracteres
`.trim();
}

function getMessageText(payload) {
  const blocks = payload?.content;
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter((b) => b?.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("\n");
}

function parseModelJson(text) {
  if (!text || typeof text !== "string") {
    return { ok: false, error: "Empty model text." };
  }

  let s = text.trim();

  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    s = fenced[1].trim();
  }

  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    // fall through
  }

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = s.slice(start, end + 1);
    try {
      return { ok: true, value: JSON.parse(slice) };
    } catch {
      return {
        ok: false,
        error: "Found {...} but JSON.parse failed (truncated or invalid).",
        snippet: slice.slice(0, 500)
      };
    }
  }

  return { ok: false, error: "No JSON object found in model output." };
}

function normalizeJsonLikeText(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2018|\u2019/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  if (n < 1) return 1;
  if (n > 100) return 100;
  return Math.round(n);
}

async function requestAnthropicJson(prompt, maxTokens = 4096) {
  const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: maxTokens,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!anthropicResponse.ok) {
    const raw = await anthropicResponse.text();
    let details = raw;
    try {
      const errJson = JSON.parse(raw);
      if (errJson?.error?.message) {
        details = errJson.error.message;
      }
    } catch {
      // keep raw text
    }
    const error = new Error("Anthropic request failed.");
    error.status = anthropicResponse.status;
    error.details = details;
    error.raw = raw;
    throw error;
  }

  const payload = await anthropicResponse.json();
  const text = getMessageText(payload) || payload?.content?.[0]?.text || "";

  let parsed = parseModelJson(text);
  if (parsed.ok) {
    return parsed.value;
  }

  const normalized = normalizeJsonLikeText(text);
  parsed = parseModelJson(normalized);
  if (parsed.ok) {
    return parsed.value;
  }

  const repairPrompt = `
Recibirás una salida JSON malformada. Devuelve SOLO JSON válido.
No añadas markdown ni texto fuera del JSON.
Conserva las mismas claves y valores cuando sea posible.
Si está truncado, completa solo con valores mínimos seguros.

Texto original:
"""
${text}
"""
`.trim();

  const repairResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 1800,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: repairPrompt
        }
      ]
    })
  });

  if (!repairResponse.ok) {
    const raw = await repairResponse.text();
    const error = new Error("Model response was not valid JSON.");
    error.status = 502;
    error.details = `${parsed.error} (JSON repair request failed)`;
    error.raw = raw || text;
    throw error;
  }

  const repairPayload = await repairResponse.json();
  const repairedText =
    getMessageText(repairPayload) || repairPayload?.content?.[0]?.text || "";
  const repairedParsed = parseModelJson(normalizeJsonLikeText(repairedText));
  if (!repairedParsed.ok) {
    const error = new Error("Model response was not valid JSON.");
    error.status = 502;
    error.details = `${parsed.error} (JSON repair failed)`;
    error.raw = repairedText || text;
    throw error;
  }

  return repairedParsed.value;
}

async function runChapterAnalysis(manuscript) {
  const chapters = Array.isArray(manuscript.chapters) ? manuscript.chapters : [];
  const chapterAnalyses = [];
  for (const chapter of chapters) {
    console.log(
      `[analyze] capítulo ${chapter.index}/${chapters.length} (${chapter.wordCount} palabras)`
    );
    const prompt = buildChapterPrompt({ manuscript, chapter });
    const chapterResult = await requestAnthropicJson(prompt, 2200);
    chapterAnalyses.push({
      index: chapter.index,
      title: chapter.title,
      wordCount: chapter.wordCount,
      ritmoScore: clampScore(chapterResult.ritmoScore),
      claridadScore: clampScore(chapterResult.claridadScore),
      estructuraScore: clampScore(chapterResult.estructuraScore),
      fortalezas: Array.isArray(chapterResult.fortalezas) ? chapterResult.fortalezas : [],
      mejoras: Array.isArray(chapterResult.mejoras) ? chapterResult.mejoras : [],
      observaciones: Array.isArray(chapterResult.observaciones) ? chapterResult.observaciones : [],
      resumenCapitulo:
        typeof chapterResult.resumenCapitulo === "string" ? chapterResult.resumenCapitulo : ""
    });
  }

  const average = (values) =>
    Math.round(values.reduce((acc, value) => acc + value, 0) / values.length);
  const ritmoScore = average(chapterAnalyses.map((c) => c.ritmoScore));
  const claridadScore = average(chapterAnalyses.map((c) => c.claridadScore));
  const estructuraScore = average(chapterAnalyses.map((c) => c.estructuraScore));
  const overallScore = Math.round((ritmoScore + claridadScore + estructuraScore) / 3);

  return {
    analyzedAt: new Date().toISOString(),
    model: anthropicModel,
    dimensions: {
      ritmoScore,
      claridadScore,
      estructuraScore,
      overallScore
    },
    chapterAnalyses
  };
}

function sanitizeManuscript(manuscript) {
  return {
    id: manuscript.id,
    title: manuscript.title,
    genre: manuscript.genre,
    audience: manuscript.audience,
    goals: manuscript.goals,
    sourceFileName: manuscript.sourceFileName,
    chapterCount: manuscript.chapterCount,
    wordCount: manuscript.wordCount,
    createdAt: manuscript.createdAt,
    updatedAt: manuscript.updatedAt,
    chapters: (manuscript.chapters || []).map((chapter) => ({
      index: chapter.index,
      title: chapter.title,
      wordCount: chapter.wordCount,
      excerpt: chapter.excerpt
    })),
    latestAnalysis: manuscript.latestAnalysis
      ? {
          analyzedAt: manuscript.latestAnalysis.analyzedAt,
          model: manuscript.latestAnalysis.model,
          dimensions: manuscript.latestAnalysis.dimensions
        }
      : null,
    hasManuscripBundle: Boolean(manuscript.manuscripIa?.completedAt),
    hasNlpMetrics: Boolean(manuscript.nlpMetrics)
  };
}

app.post("/api/evaluate", async (req, res) => {
  try {
    const { title, genre, audience, excerpt, goals } = req.body || {};

    if (!excerpt || excerpt.trim().length < 120) {
      return res.status(400).json({
        error: "Please provide at least 120 characters of writing to evaluate."
      });
    }

    if (!anthropicApiKey) {
      return res.status(500).json({
        error: "Missing ANTHROPIC_API_KEY in your environment."
      });
    }

    const prompt = buildPrompt({ title, genre, audience, excerpt, goals });

    const parsed = await requestAnthropicJson(prompt, 4096);
    return res.json(parsed);
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || "Unexpected server error.",
      details: err.details || err.message,
      raw: err.raw
    });
  }
});

app.post("/api/manuscripts/upload", upload.single("manuscript"), async (req, res) => {
  try {
    const userId = await requireUserOrDefault(req, res);
    if (!userId) return;

    const file = req.file;
    const { title, genre, audience, goals } = req.body || {};

    if (!file) {
      return res.status(400).json({ error: "Debes subir un archivo DOCX, TXT o PDF." });
    }

    const text = await extractTextFromUpload(file);
    if (!text || text.trim().length < 500) {
      return res
        .status(400)
        .json({ error: "El manuscrito es demasiado corto (mínimo ~500 caracteres)." });
    }

    const chapters = splitIntoChapters(text).map((chapter, idx) => {
      const cleanContent = chapter.content.trim();
      return {
        index: idx + 1,
        title: chapter.title,
        wordCount: countWords(cleanContent),
        excerpt: cleanContent.slice(0, 280),
        content: cleanContent
      };
    });

    const manuscript = {
      id: crypto.randomUUID(),
      title: title?.trim() || file.originalname.replace(/\.[^/.]+$/, ""),
      genre: genre?.trim() || "No especificado",
      audience: audience?.trim() || "No especificado",
      goals: goals?.trim() || "",
      sourceFileName: file.originalname,
      chapterCount: chapters.length,
      wordCount: countWords(text),
      createdAt: new Date().toISOString(),
      chapters,
      latestAnalysis: null
    };

    const saved = await insertManuscript(userId, manuscript);

    return res.json({
      message: "Manuscrito procesado correctamente.",
      manuscript: sanitizeManuscript(saved)
    });
  } catch (err) {
    return res.status(500).json({
      error: "No se pudo procesar el manuscrito.",
      details: err.message
    });
  }
});

app.get("/api/manuscripts", async (req, res) => {
  try {
    const userId = await requireUserOrDefault(req, res);
    if (!userId) return;
    const items = await listManuscripts(userId);
    return res.json(items.map(sanitizeManuscript));
  } catch (err) {
    return res.status(500).json({
      error: "No se pudo cargar la lista de manuscritos.",
      details: err.message
    });
  }
});

app.post("/api/manuscripts/:id/analyze", async (req, res) => {
  try {
    if (!anthropicApiKey) {
      return res.status(500).json({
        error: "Missing ANTHROPIC_API_KEY in your environment."
      });
    }

    const userId = await requireUserOrDefault(req, res);
    if (!userId) return;

    const { id } = req.params;
    const manuscript = await getManuscript(userId, id);
    if (!manuscript) {
      return res.status(404).json({ error: "Manuscrito no encontrado." });
    }
    const chapters = Array.isArray(manuscript.chapters) ? manuscript.chapters : [];
    if (!chapters.length) {
      return res.status(400).json({ error: "El manuscrito no tiene capítulos para analizar." });
    }

    console.log(
      `[analyze] inicio ${id} — ${chapters.length} capítulo(s), ~${manuscript.wordCount} palabras`
    );

    const latestAnalysis = await runChapterAnalysis(manuscript);

    manuscript.latestAnalysis = latestAnalysis;
    await updateManuscript(userId, manuscript);
    await recordAnalysisSnapshot(manuscript);

    console.log(
      `[analyze] fin ${id} — score global ${latestAnalysis.dimensions.overallScore}`
    );

    return res.json({
      message: "Análisis completo finalizado.",
      manuscript: sanitizeManuscript(manuscript),
      analysis: latestAnalysis
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || "No se pudo analizar el manuscrito.",
      details: err.details || err.message,
      raw: err.raw
    });
  }
});

app.get("/api/manuscripts/:id/full", async (req, res) => {
  try {
    const userId = await requireUserOrDefault(req, res);
    if (!userId) return;
    const { id } = req.params;
    const manuscript = await getManuscript(userId, id);
    if (!manuscript) {
      return res.status(404).json({ error: "Manuscrito no encontrado." });
    }
    return res.json(manuscript);
  } catch (err) {
    return res.status(500).json({
      error: "No se pudo cargar el manuscrito.",
      details: err.message
    });
  }
});

app.get("/api/manuscripts/:id/pdf", async (req, res) => {
  try {
    const userId = await requireUserOrDefault(req, res);
    if (!userId) return;
    const { id } = req.params;
    const manuscript = await getManuscript(userId, id);
    if (!manuscript) {
      return res.status(404).send("Manuscrito no encontrado.");
    }
    const buffer = await generateManuscriptPdf(manuscript);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="manuscrip-${String(manuscript.title || "informe")
        .replace(/[^\w\-]+/g, "_")
        .slice(0, 40)}.pdf"`
    );
    return res.send(buffer);
  } catch (err) {
    return res.status(500).send(err.message || "Error generando PDF.");
  }
});

app.post("/api/manuscripts/:id/analyze-manuscrip", async (req, res) => {
  try {
    if (!anthropicApiKey) {
      return res.status(500).json({
        error: "Missing ANTHROPIC_API_KEY in your environment."
      });
    }

    const userId = await requireUserOrDefault(req, res);
    if (!userId) return;

    const { id } = req.params;
    const manuscript = await getManuscript(userId, id);
    if (!manuscript) {
      return res.status(404).json({ error: "Manuscrito no encontrado." });
    }
    const chapters = Array.isArray(manuscript.chapters) ? manuscript.chapters : [];
    if (!chapters.length) {
      return res.status(400).json({ error: "El manuscrito no tiene capítulos para analizar." });
    }

    const fullText = chapters.map((c) => c.content).join("\n\n");
    const queryMode = (req.query.mode || "").toLowerCase();
    const bodyMode = (req.body && typeof req.body.mode === "string" && req.body.mode) || "";
    const effectiveMode = (queryMode || bodyMode || manuscripMode || "eco").toLowerCase();
    const isFull = effectiveMode === "full";

    const nlpMetrics = analyzeManuscriptNlp(fullText, chapters);
    manuscript.nlpMetrics = nlpMetrics;

    if (!isFull) {
      console.log(`[manuscrip] modo ECO ${id} — 1 llamada IA + NLP local`);
      const eco = await requestAnthropicJson(
        buildEcoManuscripPrompt(manuscript, nlpMetrics, chapters),
        4096
      );
      const { manuscripIa, latestAnalysis } = mapEcoResponseToStored(
        manuscript,
        eco,
        anthropicModel
      );
      manuscripIa.benchmark = buildBenchmarkPlaceholder(manuscript, nlpMetrics.global);
      manuscript.manuscripIa = manuscripIa;
      manuscript.latestAnalysis = latestAnalysis;
      await updateManuscript(userId, manuscript);
      await recordAnalysisSnapshot(manuscript);
      console.log(`[manuscrip] fin ECO ${id}`);
      return res.json({
        message: "Análisis Manuscrip guardado (modo económico: 1 llamada a la API).",
        mode: "eco",
        manuscript: sanitizeManuscript(manuscript)
      });
    }

    console.log(`[manuscrip] modo COMPLETO ${id} — NLP + IA global + capítulos (muchas llamadas)`);

    const structure = await requestAnthropicJson(buildStructurePrompt(manuscript, chapters), 3500);
    console.log("[manuscrip] estructura OK");

    const personas = await requestAnthropicJson(buildPersonasPrompt(manuscript, chapters), 4000);
    console.log("[manuscrip] personas OK");

    const words = fullText.trim().split(/\s+/).filter(Boolean);
    const firstPages = words.slice(0, 2500).join(" ");
    const hook = await requestAnthropicJson(buildHookPrompt(manuscript, firstPages), 2500);
    console.log("[manuscrip] hook OK");

    const synopsis = await requestAnthropicJson(buildSynopsisPrompt(manuscript, chapters), 4000);
    console.log("[manuscrip] sinopsis OK");

    const inconsistencies = await requestAnthropicJson(
      buildInconsistencyPrompt(manuscript, nlpMetrics.characterCandidates, chapters),
      3500
    );
    console.log("[manuscrip] inconsistencias OK");

    const benchmark = buildBenchmarkPlaceholder(manuscript, nlpMetrics.global);

    manuscript.manuscripIa = {
      structure,
      personas,
      hook,
      synopsis,
      inconsistencies,
      benchmark,
      completedAt: new Date().toISOString(),
      budgetMode: "full"
    };

    console.log("[manuscrip] análisis por capítulo (IA)…");
    const latestAnalysis = await runChapterAnalysis(manuscript);
    manuscript.latestAnalysis = latestAnalysis;

    await updateManuscript(userId, manuscript);
    await recordAnalysisSnapshot(manuscript);

    console.log(`[manuscrip] fin COMPLETO ${id}`);

    return res.json({
      message: "Análisis Manuscrip completo guardado (modo completo).",
      mode: "full",
      manuscript: sanitizeManuscript(manuscript)
    });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.message || "No se pudo completar el análisis Manuscrip.",
      details: err.details || err.message,
      raw: err.raw
    });
  }
});

module.exports = app;

if (require.main === module) {
  const server = app.listen(port, () => {
    console.log(`Book Evaluator running on http://localhost:${port}`);
  });
  server.timeout = 0;
  if (typeof server.requestTimeout !== "undefined") {
    server.requestTimeout = 0;
  }
  if (typeof server.headersTimeout !== "undefined") {
    server.headersTimeout = 0;
  }
}
