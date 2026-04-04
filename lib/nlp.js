const FILLERS_ES =
  /\b(pues|bueno|o sea|vaya|claro|cosa|tal|cual|digamos|básicamente|realmente|literalmente|entonces|es decir|vamos a ver|de hecho)\b/gi;

const PASSIVE_HINTS =
  /\b(se\s+(?:le|les|nos|os|me|te|había|habían|fue|fueron|dijo|dijeron|ve|ven|vio|vieron|puede|pueden)\b|fue\s+(?:creado|hecho|dicho|escrito|visto)|fueron\s+(?:creados|hechos)|será\s+(?:publicado|leído))\b/gi;

function tokenizeWords(text) {
  const m = text.toLowerCase().match(/[a-záéíóúüñ]+/gi);
  return m || [];
}

function splitSentences(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return [];
  return flat.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
}

function estimateSyllablesEs(word) {
  const w = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, "");
  if (!w) return 0;
  const groups = w.match(/[aeiouáéíóúü]+/gi);
  return Math.max(1, groups ? groups.length : 1);
}

function analyzeTextBlock(text) {
  const words = tokenizeWords(text);
  const sentences = splitSentences(text.replace(/\n+/g, " "));
  const sentenceWordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const avgSentenceLength = sentenceWordCounts.length
    ? sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceWordCounts.length
    : 0;
  const longSentenceRatio = sentenceWordCounts.length
    ? sentenceWordCounts.filter((n) => n > 35).length / sentenceWordCounts.length
    : 0;

  const unique = new Set(words);
  const lexicalRichness = words.length ? unique.size / words.length : 0;

  let fillerHits = 0;
  let fm;
  const re = new RegExp(FILLERS_ES.source, "gi");
  while ((fm = re.exec(text)) !== null) fillerHits += 1;

  let passiveHits = 0;
  let pm;
  const pr = new RegExp(PASSIVE_HINTS.source, "gi");
  while ((pm = pr.exec(text)) !== null) passiveHits += 1;

  const syllables = words.reduce((acc, w) => acc + estimateSyllablesEs(w), 0);
  const sCount = Math.max(1, sentences.length);
  const wCount = Math.max(1, words.length);
  let fleschLike = 206.835 - 1.015 * (wCount / sCount) - 84.6 * (syllables / wCount);
  fleschLike = Math.max(0, Math.min(100, fleschLike));

  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    longSentenceRatio: Math.round(longSentenceRatio * 1000) / 1000,
    lexicalRichness: Math.round(lexicalRichness * 1000) / 1000,
    fillerHits,
    passiveHints: passiveHits,
    fleschSzigrisztLike: Math.round(fleschLike * 10) / 10
  };
}

function extractCharacterCandidates(text, limit = 25) {
  const counts = new Map();
  const re = /\b[A-ZÁÉÍÓÚÜÑ][a-záéíóúüñ]{2,}\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const w = m[0];
    if (w.length < 3) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function rhythmByChapter(chapters) {
  return chapters.map((ch) => {
    const s = analyzeTextBlock(ch.content);
    const dialogueRatio = estimateDialogueRatio(ch.content);
    const density = Math.min(
      1,
      Math.max(0, s.avgSentenceLength / 45) * (1 - dialogueRatio * 0.35)
    );
    return {
      index: ch.index,
      title: ch.title,
      wordCount: ch.wordCount,
      avgSentenceLength: s.avgSentenceLength,
      longSentenceRatio: s.longSentenceRatio,
      dialogueRatio,
      densityScore: Math.round(density * 100) / 100
    };
  });
}

function estimateDialogueRatio(text) {
  const em = text.match(/[«“"].*?[»”"]/gs);
  if (!em || !em.length) return 0;
  const diaLen = em.join(" ").length;
  return Math.min(1, diaLen / Math.max(1, text.length));
}

function emotionalHeuristicByChapter(chapters) {
  const pos = /\b(amor|feliz|esperanza|calma|paz|alegría|ríe|sonrisa|beso|victoria)\b/gi;
  const neg = /\b(miedo|muerte|dolor|llora|sangre|odio|ira|pánico|terror|traición)\b/gi;
  return chapters.map((ch) => {
    const t = ch.content;
    const p = (t.match(pos) || []).length;
    const n = (t.match(neg) || []).length;
    const score = (p - n) / Math.max(1, Math.sqrt(ch.wordCount || 1));
    return {
      index: ch.index,
      title: ch.title,
      emotionalTone: Math.round(score * 1000) / 1000,
      positiveHits: p,
      negativeHits: n
    };
  });
}

function analyzeManuscriptNlp(fullText, chapters) {
  const globalMetrics = analyzeTextBlock(fullText);
  const perChapter = chapters.map((ch) => ({
    index: ch.index,
    title: ch.title,
    metrics: analyzeTextBlock(ch.content)
  }));
  const characters = extractCharacterCandidates(fullText);
  const rhythm = rhythmByChapter(chapters);
  const emotional = emotionalHeuristicByChapter(chapters);

  return {
    global: globalMetrics,
    perChapter,
    rhythmCurve: rhythm,
    emotionalCurve: emotional,
    characterCandidates: characters,
    note:
      "Métricas heurísticas en español (MVP). No sustituyen un análisis lingüístico profesional ni modelos entrenados."
  };
}

module.exports = { analyzeManuscriptNlp };
