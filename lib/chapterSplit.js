/**
 * Detección de secciones/capítulos para ingesta DOCX/TXT/PDF.
 * Cubre: CAPÍTULO, TRATADO, PARTE, LIBRO, patrones numéricos, romanos (I., II.),
 * y líneas cortas tipo título en mayúsculas tras salto doble (línea en blanco).
 */

const SECTION_KEYWORD =
  /\b(?:CAP[IÍ]TULO|CAPITULO|TRATADO|PARTE|LIBRO|CHAPTER)\b/i;

const NUMBERED_SPANISH =
  /^(?:Cap[ií]tulo|Tratado|Parte|Libro)\s+(?:[0-9]{1,3}|[IVXLCDM]{1,8}\.?|primero|segundo|tercero|cuarto|quinto|sexto|s[eé]ptimo|octavo|noveno|d[eé]cimo|und[eé]cimo|duod[eé]cimo)\b/i;

const ENGLISH_CHAPTER = /^chapter\s+([0-9]{1,3}|[ivxlcdm]{1,8})\b/i;

/** Línea que solo es numeral romano con punto (p. ej. I. II.) */
const ROMAN_LINE = /^[IVXLCDM]{1,8}\.\s*$/i;

function lineLooksLikeAllCapsTitle(t) {
  if (t.length < 3 || t.length >= 60) return false;
  if (t !== t.toUpperCase()) return false;
  const letters = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  if (letters.length < 3) return false;
  return /^[A-ZÁÉÍÓÚÑ0-9\s.,;:¿?¡!\-«»""''·]+$/.test(t);
}

/**
 * @param {string[]} lines
 * @param {number} i
 */
function isSectionHeader(lines, i) {
  const t = lines[i].replace(/^\s*[•\-\*]\s*/, "").trim();
  if (!t) return false;

  const prevBlank = i === 0 || lines[i - 1].trim() === "";

  if (t.length <= 140 && SECTION_KEYWORD.test(t)) return true;

  if (NUMBERED_SPANISH.test(t)) return true;

  if (ENGLISH_CHAPTER.test(t)) return true;

  if (t.length <= 24 && ROMAN_LINE.test(t) && (prevBlank || i === 0)) return true;

  if (prevBlank && lineLooksLikeAllCapsTitle(t)) return true;

  if (prevBlank && t.length >= 3 && t.length < 60) {
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 10) {
      const titleCase =
        words.every((w) => {
          if (/^[0-9]+$/.test(w)) return true;
          return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(w) || /^[A-ZÁÉÍÓÚÑ]\.$/.test(w);
        }) && words[0][0] === words[0][0].toUpperCase();
      if (titleCase) return true;
    }
  }

  return false;
}

/**
 * @param {string} text
 * @returns {{ title: string, content: string }[]}
 */
function splitIntoChapters(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const headerLineIndices = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (isSectionHeader(lines, i)) headerLineIndices.push(i);
  }

  if (headerLineIndices.length === 0) {
    return [{ title: "Texto completo", content: normalized }];
  }

  const chapters = [];

  let preamble = "";
  if (headerLineIndices[0] > 0) {
    preamble = lines.slice(0, headerLineIndices[0]).join("\n").trim();
    if (preamble.length > 120) {
      const firstLine = lines[0].replace(/^\s*[•\-\*]\s*/, "").trim();
      chapters.push({
        title: firstLine.length <= 80 ? firstLine : "Inicio",
        content: preamble
      });
      preamble = "";
    }
  }

  for (let h = 0; h < headerLineIndices.length; h += 1) {
    const startLine = headerLineIndices[h];
    const endLine =
      h < headerLineIndices.length - 1 ? headerLineIndices[h + 1] - 1 : lines.length - 1;
    let slice = lines.slice(startLine, endLine + 1).join("\n").trim();
    if (!slice) continue;
    if (h === 0 && preamble) {
      slice = `${preamble}\n\n${slice}`;
    }
    const title = lines[startLine].replace(/^\s*[•\-\*]\s*/, "").trim() || `Sección ${h + 1}`;
    chapters.push({ title, content: slice });
  }

  return chapters.length
    ? chapters
    : [{ title: "Texto completo", content: normalized }];
}

module.exports = { splitIntoChapters, isSectionHeader };
