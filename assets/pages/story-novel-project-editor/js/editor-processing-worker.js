'use strict';

const workerParameters = new URLSearchParams(self.location?.search || '');
const WORKER_READING_WORDS_PER_MINUTE = Math.max(50, Number(workerParameters.get('readingWpm')) || 200);

const BLOCK_TAG_PATTERN = /<\/?(?:address|article|aside|blockquote|div|dl|dt|dd|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)[^>]*>/gi;
const BREAK_TAG_PATTERN = /<br\s*\/?>/gi;

function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, token) => {
    const lowered = token.toLowerCase();
    if (named[lowered] !== undefined) return named[lowered];
    const numeric = lowered.startsWith('#x')
      ? Number.parseInt(lowered.slice(2), 16)
      : lowered.startsWith('#') ? Number.parseInt(lowered.slice(1), 10) : NaN;
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : match;
  });
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function plainTextToHTML(value) {
  const text = String(value || '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return '';
  return text.split('\n').map(line => `<p>${line ? escapeHTML(line) : '<br>'}</p>`).join('');
}

function sanitizeHTML(value) {
  return String(value || '')
    .replace(/<mark\b[^>]*class=(['"])[^'"]*\bhighlight-find\b[^'"]*\1[^>]*>([\s\S]*?)<\/mark>/gi, '$2')
    .replace(/<[^>]*(?:hindi-pending-virama-boundary|data-lm-pending-virama-boundary)[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
    .replace(/<[^>]*(?:hindi-pending-virama-boundary|data-lm-pending-virama-boundary)[^>]*\/?>/gi, '')
    .trim();
}

function htmlToText(value) {
  return decodeEntities(
    sanitizeHTML(value)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(BREAK_TAG_PATTERN, '\n')
      .replace(BLOCK_TAG_PATTERN, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function countWords(text) {
  const matches = String(text || '').trim().match(/[\p{L}\p{N}\p{M}]+(?:['’\-][\p{L}\p{N}\p{M}]+)*/gu);
  return matches ? matches.length : 0;
}

function calculateStats(text) {
  const value = String(text || '');
  const words = countWords(value);
  const paragraphs = value.split(/\n+/).filter(part => part.trim()).length || (value.trim() ? 1 : 0);
  const sentences = value.split(/[।.!?]+/).filter(sentence => sentence.trim()).length;
  return {
    words,
    characters: value.replace(/\s/g, '').length,
    paragraphs,
    sentences,
    readingTime: Math.max(1, Math.round(words / WORKER_READING_WORDS_PER_MINUTE))
  };
}

function normalizeScanText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countEntryNameUses(names, text) {
  const cleanText = normalizeScanText(text);
  const candidates = [...new Map((Array.isArray(names) ? names : [])
    .map(normalizeScanText)
    .filter(name => name.length >= 2)
    .map(name => [name.toLocaleLowerCase(), name])).values()]
    .sort((left, right) => right.length - left.length);
  const ranges = [];
  candidates.forEach(name => {
    try {
      const namePattern = name.split(/\s+/).map(escapeRegExp).join('\\s+');
      const matcher = new RegExp(`(^|[^\\p{L}\\p{N}_])(${namePattern})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
      for (const match of cleanText.matchAll(matcher)) {
        const start = (match.index || 0) + (match[1]?.length || 0);
        const end = start + (match[2]?.length || name.length);
        if (!ranges.some(range => start < range.end && end > range.start)) ranges.push({ start, end });
      }
    } catch (_error) {
      // Supported browsers use the Unicode-aware path above.
    }
  });
  return ranges.length;
}

function analyze(payload = {}) {
  const normalizedHTML = payload.plainTextMode
    ? plainTextToHTML(payload.rawText || '')
    : sanitizeHTML(payload.html || payload.rawHTML || '');
  const text = payload.plainTextMode
    ? String(payload.rawText || '').replace(/\r\n?/g, '\n')
    : htmlToText(normalizedHTML);
  const nameMatches = (payload.names || []).map(entry => ({
    id: entry.id,
    count: countEntryNameUses(entry.names || [entry.name], text)
  })).filter(entry => entry.count > 0);
  return { normalizedHTML, text, stats: calculateStats(text), nameMatches };
}

self.onmessage = event => {
  const message = event.data || {};
  if (message.type === 'cancel') return;
  try {
    self.postMessage({ id: message.id, ok: true, result: analyze(message.payload) });
  } catch (error) {
    self.postMessage({
      id: message.id,
      ok: false,
      error: { message: error?.message || String(error), stack: error?.stack || '' }
    });
  }
};
