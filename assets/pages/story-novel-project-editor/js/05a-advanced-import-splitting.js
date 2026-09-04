function advancedImportCustomWordRegex(value = '') {
  const escaped = String(value || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped ? new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${escaped}(?![\\p{L}\\p{N}\\p{M}_])`, 'giu') : null;
}

function advancedImportCustomSplit(sourceText = '', customWord = '', wordLimit = 2500, separateRemainder = false) {
  const source = advancedPromoteNormalizedText(sourceText);
  const regex = advancedImportCustomWordRegex(customWord);
  if (!source || !regex) return { valid: false, reason: 'Enter a custom split word.', parts: [], remainderText: '' };
  if (advancedPromoteWordCount(source) < wordLimit) return { valid: false, reason: `The imported text has fewer than ${wordLimit} words.`, parts: [], remainderText: '' };
  const occurrences = Array.from(source.matchAll(regex)).map(match => match.index);
  if (occurrences.length < ADVANCED_IMPORT_CUSTOM_MINIMUM_OCCURRENCES) return { valid: false, reason: `The custom word needs at least ${ADVANCED_IMPORT_CUSTOM_MINIMUM_OCCURRENCES} occurrences.`, parts: [], remainderText: '', occurrences: occurrences.length };
  const parts = [];
  let cursor = 0;
  while (cursor < source.length) {
    const boundary = occurrences.find(position => position > cursor && advancedPromoteWordCount(source.slice(cursor, position)) >= wordLimit);
    if (!Number.isFinite(boundary)) break;
    const part = source.slice(cursor, boundary).trim();
    if (part) parts.push(part);
    cursor = boundary;
  }
  const remainder = source.slice(cursor).trim();
  if (!parts.length) return { valid: false, reason: `No occurrence creates a chapter of at least ${wordLimit} words.`, parts: [], remainderText: '', occurrences: occurrences.length };
  let remainderText = '';
  if (remainder) {
    if (advancedPromoteWordCount(remainder) < wordLimit) {
      if (separateRemainder) remainderText = remainder;
      else parts[parts.length - 1] = `${parts[parts.length - 1]}\n\n${remainder}`.trim();
    } else parts.push(remainder);
  }
  const valid = parts.length >= 2 && parts.every(part => advancedPromoteWordCount(part) >= wordLimit);
  return { valid, reason: valid ? '' : 'The occurrences cannot produce at least two chapters at this word parameter.', parts: valid ? parts : [], remainderText: valid ? remainderText : '', occurrences: occurrences.length };
}

function advancedImportAutoSplit(sourceText = '', wordLimit = 2500, separateRemainder = false) {
  let remaining = advancedPromoteNormalizedText(sourceText);
  const parts = [];
  while (advancedPromoteWordCount(remaining) > wordLimit) {
    const matches = Array.from(remaining.matchAll(/[\p{L}\p{N}\p{M}]+(?:['’\-][\p{L}\p{N}\p{M}]+)*/gu));
    const target = matches[Math.max(0, wordLimit - 1)];
    if (!target) break;
    const minimumBoundary = target.index + target[0].length;
    const lookAhead = remaining.slice(minimumBoundary, minimumBoundary + ADVANCED_IMPORT_SMART_LOOK_AHEAD);
    const sentenceMatch = lookAhead.match(/^[\s\S]*?[।.!?](?=\s|$)/u);
    const newlineIndex = lookAhead.indexOf('\n');
    const candidates = [sentenceMatch ? minimumBoundary + sentenceMatch[0].length : -1, newlineIndex >= 0 ? minimumBoundary + newlineIndex : -1].filter(position => position >= minimumBoundary);
    const boundary = candidates.length ? Math.min(...candidates) : minimumBoundary;
    const part = remaining.slice(0, boundary).trim();
    const rest = remaining.slice(boundary).trim();
    if (!part || !rest || part === remaining) break;
    parts.push(part);
    remaining = rest;
  }
  let remainderText = '';
  if (remaining) {
    if (parts.length && advancedPromoteWordCount(remaining) < wordLimit) {
      if (separateRemainder) remainderText = remaining;
      else parts[parts.length - 1] = `${parts[parts.length - 1]}\n\n${remaining}`.trim();
    } else parts.push(remaining);
  }
  return { parts, remainderText };
}

function advancedImportGenerateChapters(state) {
  const separateRemainder = state.importTarget === 'chapters';
  const result = state.splitMode === 'custom'
    ? advancedImportCustomSplit(state.sourceText, state.customWord, state.wordLimit, separateRemainder)
    : advancedImportAutoSplit(state.sourceText, state.wordLimit, separateRemainder);
  return {
    valid: state.splitMode === 'custom' ? result.valid : result.parts.length > 0,
    reason: result.reason || '',
    chapters: result.parts.map((body, index) => ({ id: `advanced-import-${Date.now()}-${index}`, title: advancedImportDocumentTitle(state, index), body, conclusion: state.permanentConclusion, usesPermanentConclusion: true })),
    remainderText: result.remainderText || ''
  };
}
