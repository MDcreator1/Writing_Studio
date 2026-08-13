'use strict';

const virtualDocuments = new Map();
const workerParameters = new URLSearchParams(self.location?.search || '');
const WORKER_READING_WORDS_PER_MINUTE = Math.max(50, Number(workerParameters.get('readingWpm')) || 200);
const WORKER_WINDOW_MAXIMUM = Math.max(10, Number(workerParameters.get('maxWindow')) || 40);

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

function sanitizeEditorHTML(value) {
  return String(value || '')
    .replace(/<mark\b[^>]*class=(['"])[^'"]*\bhighlight-find\b[^'"]*\1[^>]*>([\s\S]*?)<\/mark>/gi, '$2')
    .replace(/<[^>]*(?:hindi-pending-virama-boundary|data-lm-pending-virama-boundary)[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
    .replace(/<[^>]*(?:hindi-pending-virama-boundary|data-lm-pending-virama-boundary)[^>]*\/?>/gi, '')
    .trim();
}

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

function htmlToParagraphs(value) {
  const text = decodeEntities(
    sanitizeEditorHTML(value)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(?:address|article|aside|blockquote|div|h[1-6]|li|p|pre|section|tr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  ).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text ? text.split(/\n+/) : [''];
}

function paragraphsToHTML(paragraphs) {
  return (paragraphs || []).map(value => `<p>${value ? escapeHTML(value) : '<br>'}</p>`).join('');
}

function paragraphStats(value) {
  const text = String(value || '');
  const wordMatches = text.trim().match(/[\p{L}\p{N}\p{M}]+(?:['’\-][\p{L}\p{N}\p{M}]+)*/gu);
  return {
    words: wordMatches ? wordMatches.length : 0,
    characters: text.replace(/\s/g, '').length,
    sentences: text.split(/[।.!?]+/).filter(part => part.trim()).length,
    paragraphs: text.trim() ? 1 : 0
  };
}

function sumDocumentStats(statsList) {
  return statsList.reduce((total, stats) => {
    total.words += stats.words;
    total.characters += stats.characters;
    total.sentences += stats.sentences;
    total.paragraphs += stats.paragraphs;
    return total;
  }, { words: 0, characters: 0, sentences: 0, paragraphs: 0 });
}

function documentStats(state) {
  return {
    ...state.totals,
    readingTime: Math.max(1, Math.round(state.totals.words / WORKER_READING_WORDS_PER_MINUTE))
  };
}

function replaceParagraphRange(state, start, end, replacement) {
  const removedStats = state.paragraphStats.slice(start, end);
  const replacementStats = replacement.map(paragraphStats);
  const removedTotals = sumDocumentStats(removedStats);
  const addedTotals = sumDocumentStats(replacementStats);
  state.paragraphs.splice(start, end - start, ...replacement);
  state.paragraphStats.splice(start, end - start, ...replacementStats);
  state.totals.words += addedTotals.words - removedTotals.words;
  state.totals.characters += addedTotals.characters - removedTotals.characters;
  state.totals.sentences += addedTotals.sentences - removedTotals.sentences;
  state.totals.paragraphs += addedTotals.paragraphs - removedTotals.paragraphs;
  state.dirty = true;
  state.revision += 1;
  return {
    wordDelta: addedTotals.words - removedTotals.words,
    characterDelta: addedTotals.characters - removedTotals.characters,
    sentenceDelta: addedTotals.sentences - removedTotals.sentences,
    paragraphDelta: addedTotals.paragraphs - removedTotals.paragraphs
  };
}

function virtualWindow(documentState, start = 0, size = 25) {
  const safeSize = Math.max(1, Math.min(WORKER_WINDOW_MAXIMUM, Number(size) || 25));
  const maxStart = Math.max(0, documentState.paragraphs.length - safeSize);
  const safeStart = Math.max(0, Math.min(maxStart, Number(start) || 0));
  const end = Math.min(documentState.paragraphs.length, safeStart + safeSize);
  const windowParagraphs = documentState.paragraphs.slice(safeStart, end);
  return {
    documentKey: documentState.key,
    start: safeStart,
    end,
    total: documentState.paragraphs.length,
    windowText: windowParagraphs.join('\n')
  };
}

function handleVirtualMessage(type, payload) {
  const key = String(payload.documentKey || '');
  if (!key) throw new Error('Virtual document key is required');

  if (type === 'load-virtual-document') {
    const paragraphs = Array.isArray(payload.paragraphs)
      ? payload.paragraphs.map(value => String(value || ''))
      : htmlToParagraphs(payload.html || '');
    const statsList = paragraphs.map(paragraphStats);
    const state = {
      key,
      paragraphs,
      paragraphStats: statsList,
      totals: sumDocumentStats(statsList),
      dirty: false,
      revision: 0
    };
    virtualDocuments.set(key, state);
    return { ...virtualWindow(state, payload.start || 0, payload.windowSize || 25), stats: documentStats(state), revision: state.revision };
  }

  const state = virtualDocuments.get(key);
  if (!state) throw new Error(`Virtual document is not loaded: ${key}`);

  if (type === 'render-virtual-window') {
    return virtualWindow(state, payload.start || 0, payload.windowSize || 25);
  }

  if (type === 'merge-virtual-window') {
    const start = Math.max(0, Math.min(state.paragraphs.length, Number(payload.start) || 0));
    const end = Math.max(start, Math.min(state.paragraphs.length, Number(payload.end) || start));
    const replacement = String(payload.rawText || '').replace(/\r\n?/g, '\n').split('\n');
    const delta = replaceParagraphRange(state, start, end, replacement);
    return { ...virtualWindow(state, start, payload.windowSize || 25), stats: documentStats(state), delta, revision: state.revision };
  }

  if (type === 'patch-virtual-range') {
    const start = Math.max(0, Math.min(state.paragraphs.length, Number(payload.start) || 0));
    const end = Math.max(start, Math.min(state.paragraphs.length, Number(payload.end) || start));
    const replacement = Array.isArray(payload.paragraphs)
      ? payload.paragraphs.map(value => String(value || ''))
      : String(payload.rawText || '').replace(/\r\n?/g, '\n').split('\n');
    const delta = replaceParagraphRange(state, start, end, replacement);
    const windowResult = virtualWindow(state, payload.windowStart ?? start, payload.windowSize || 25);
    return {
      documentKey: key,
      start: windowResult.start,
      end: windowResult.end,
      total: windowResult.total,
      stats: documentStats(state),
      delta,
      revision: state.revision,
      dirty: true
    };
  }

  if (type === 'patch-virtual-batch') {
    const patches = Array.isArray(payload.patches) ? payload.patches : [];
    const delta = { wordDelta: 0, characterDelta: 0, sentenceDelta: 0, paragraphDelta: 0 };
    let windowStart = Number(payload.windowStart) || 0;
    patches.forEach(patch => {
      const start = Math.max(0, Math.min(state.paragraphs.length, Number(patch.start) || 0));
      const end = Math.max(start, Math.min(state.paragraphs.length, Number(patch.end) || start));
      const replacement = Array.isArray(patch.paragraphs)
        ? patch.paragraphs.map(value => String(value || ''))
        : String(patch.rawText || '').replace(/\r\n?/g, '\n').split('\n');
      const patchDelta = replaceParagraphRange(state, start, end, replacement);
      Object.keys(delta).forEach(keyName => { delta[keyName] += patchDelta[keyName] || 0; });
      if (Number.isFinite(Number(patch.windowStart))) windowStart = Number(patch.windowStart);
    });
    const windowResult = virtualWindow(state, windowStart, payload.windowSize || 25);
    return {
      documentKey: key,
      start: windowResult.start,
      end: windowResult.end,
      total: windowResult.total,
      stats: documentStats(state),
      delta,
      revision: state.revision,
      dirty: patches.length > 0,
      batchSize: patches.length
    };
  }

  if (type === 'materialize-virtual-document') {
    const html = paragraphsToHTML(state.paragraphs);
    state.dirty = false;
    return {
      documentKey: key,
      html,
      text: state.paragraphs.join('\n'),
      stats: documentStats(state),
      total: state.paragraphs.length,
      revision: state.revision,
      dirty: false
    };
  }

  if (type === 'release-virtual-document') {
    virtualDocuments.delete(key);
    return { documentKey: key, released: true };
  }

  throw new Error(`Unsupported virtual editor operation: ${type}`);
}

self.onmessage = event => {
  const message = event.data || {};
  try {
    const payload = message.payload || {};
    if (message.type && message.type !== 'analyze') {
      self.postMessage({ id: message.id, ok: true, result: handleVirtualMessage(message.type, payload) });
      return;
    }
    const html = payload.plainTextMode
      ? plainTextToHTML(payload.rawText || '')
      : sanitizeEditorHTML(payload.rawHTML || '');
    self.postMessage({
      id: message.id,
      ok: true,
      result: {
        html,
        inputSequence: payload.inputSequence,
        capturedAt: payload.capturedAt
      }
    });
  } catch (error) {
    self.postMessage({
      id: message.id,
      ok: false,
      error: { message: error?.message || String(error), stack: error?.stack || '' }
    });
  }
};
