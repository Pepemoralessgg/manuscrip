const { createSupabaseAdmin, createSupabaseAnon } = require("./supabase");

function buildContentPayload(manuscript) {
  return {
    sourceFileName: manuscript.sourceFileName,
    chapterCount: manuscript.chapterCount,
    chapters: manuscript.chapters || [],
    latestAnalysis: manuscript.latestAnalysis ?? null,
    nlpMetrics: manuscript.nlpMetrics ?? null,
    manuscripIa: manuscript.manuscripIa ?? null
  };
}

function parseContentColumn(raw) {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function rowToAppManuscript(row) {
  const payload = parseContentColumn(row.content);
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title,
    genre: row.genre || "No especificado",
    audience: row.target_audience || "No especificado",
    goals: row.analysis_goal || "",
    sourceFileName: payload.sourceFileName,
    chapterCount: payload.chapterCount ?? (payload.chapters || []).length,
    wordCount: row.word_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    chapters: payload.chapters || [],
    latestAnalysis: payload.latestAnalysis ?? null,
    nlpMetrics: payload.nlpMetrics ?? null,
    manuscripIa: payload.manuscripIa ?? null
  };
}

async function resolveUserId(req) {
  const h = req.headers?.authorization;
  if (h && h.startsWith("Bearer ")) {
    const token = h.slice(7).trim();
    if (token) {
      try {
        const anon = createSupabaseAnon();
        const {
          data: { user },
          error
        } = await anon.auth.getUser(token);
        if (!error && user?.id) return user.id;
      } catch {
        /* usar fallback */
      }
    }
  }
  const def = process.env.SUPABASE_DEFAULT_USER_ID?.trim();
  return def || null;
}

function emotionHeuristic(manuscript) {
  const ec = manuscript.nlpMetrics?.emotionalCurve;
  if (!ec?.length) return null;
  const avg = ec.reduce((s, e) => s + (Number(e.emotionalTone) || 0), 0) / ec.length;
  return Math.max(0, Math.min(100, Math.round(50 + avg * 15)));
}

function characterHeuristic(manuscript) {
  const list = manuscript.nlpMetrics?.characterCandidates;
  if (!list?.length) return null;
  return Math.min(100, Math.round(Math.min(list.length, 20) * 5));
}

async function listManuscripts(userId) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("manuscripts")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToAppManuscript);
}

async function getManuscript(userId, id) {
  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("manuscripts")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAppManuscript(data) : null;
}

function serializeManuscriptContent(manuscript) {
  const payload = buildContentPayload(manuscript);
  return process.env.MANUSCRIP_CONTENT_JSONB === "1" ? payload : JSON.stringify(payload);
}

async function insertManuscript(userId, manuscript) {
  const supabase = createSupabaseAdmin();
  const row = {
    id: manuscript.id,
    user_id: userId,
    title: manuscript.title,
    word_count: manuscript.wordCount,
    genre: manuscript.genre,
    target_audience: manuscript.audience,
    analysis_goal: manuscript.goals || "",
    status: manuscript.status || "uploaded",
    content: serializeManuscriptContent(manuscript)
  };
  const { data, error } = await supabase.from("manuscripts").insert(row).select().single();
  if (error) throw error;
  return rowToAppManuscript(data);
}

async function updateManuscript(userId, manuscript) {
  const supabase = createSupabaseAdmin();
  const { error } = await supabase
    .from("manuscripts")
    .update({
      title: manuscript.title,
      word_count: manuscript.wordCount,
      genre: manuscript.genre,
      target_audience: manuscript.audience,
      analysis_goal: manuscript.goals || "",
      status: manuscript.status || "ready",
      content: serializeManuscriptContent(manuscript),
      updated_at: new Date().toISOString()
    })
    .eq("id", manuscript.id)
    .eq("user_id", userId);
  if (error) throw error;
}

async function recordAnalysisSnapshot(manuscript) {
  const d = manuscript.latestAnalysis?.dimensions;
  if (!d) return;

  const supabase = createSupabaseAdmin();
  const { data: prev, error: verErr } = await supabase
    .from("analyses")
    .select("version")
    .eq("manuscript_id", manuscript.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (verErr) throw verErr;

  const nextVersion = (prev?.version ?? 0) + 1;

  const fullReport = {
    latestAnalysis: manuscript.latestAnalysis,
    nlpMetrics: manuscript.nlpMetrics,
    manuscripIa: manuscript.manuscripIa
  };

  const { error } = await supabase.from("analyses").insert({
    manuscript_id: manuscript.id,
    version: nextVersion,
    readability_score: Math.round(d.claridadScore),
    rhythm_score: Math.round(d.ritmoScore),
    emotion_score: emotionHeuristic(manuscript),
    structure_score: Math.round(d.estructuraScore),
    character_score: characterHeuristic(manuscript),
    hook_score: null,
    global_score: Math.round(d.overallScore),
    full_report: fullReport
  });
  if (error) throw error;
}

module.exports = {
  resolveUserId,
  listManuscripts,
  getManuscript,
  insertManuscript,
  updateManuscript,
  recordAnalysisSnapshot,
  rowToAppManuscript
};
