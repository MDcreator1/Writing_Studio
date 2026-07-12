const lmRawDraftPromoteRequest = typeof requestPromoteDraftToChapter === 'function'
  ? requestPromoteDraftToChapter
  : null;

let advancedDraftPromoteState = null;

const ADVANCED_PROMOTE_SENTENCE_ENDINGS = ['\u0964', '.', '!', '?', '\u2026\u2026', '---'];
const ADVANCED_PROMOTE_OPEN_QUOTE = '\u201c';
const ADVANCED_PROMOTE_CLOSE_QUOTE = '\u201d';
const ADVANCED_PROMOTE_CONCLUSION_STORAGE_PREFIX = 'lm_advanced_promote_conclusion_v1';

function advancedPromoteCopy(key, fallback = '') {
  const value = text()?.[key];
  return typeof value === 'string' && value ? value : fallback;
}

function advancedPromoteNormalizedText(value = '') {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function advancedPromoteWordCount(value = '') {
  return countWordsFromText(advancedPromoteNormalizedText(value));
}

function advancedPromoteSentenceEndPosition(value = '') {
  const source = String(value || '');
  const positions = ADVANCED_PROMOTE_SENTENCE_ENDINGS
    .map(symbol => source.indexOf(symbol))
    .filter(position => position >= 0);
  return positions.length ? Math.min(...positions) + 1 : -1;
}

function advancedPromotePreviousSentenceStart(value = '') {
  const source = String(value || '');
  let latestIndex = -1;
  let latestLength = 0;
  ADVANCED_PROMOTE_SENTENCE_ENDINGS.forEach(symbol => {
    const index = source.lastIndexOf(symbol);
    if (index > latestIndex) {
      latestIndex = index;
      latestLength = symbol.length;
    }
  });
  return latestIndex >= 0 ? latestIndex + latestLength : 0;
}

function advancedPromoteSafeSplit(value = '', limit = 2500) {
  const tokens = String(value || '').split(/(\s+)/);
  let words = 0;
  let index = 0;

  while (index < tokens.length && words < limit) {
    if (!/^\s+$/.test(tokens[index] || '')) words += 1;
    index += 1;
  }

  return [tokens.slice(0, index).join(''), tokens.slice(index).join('')];
}

function advancedPromoteSmartSplit(value = '', limit = 2500) {
  const [safeLeft, safeRight] = advancedPromoteSafeSplit(value, limit);
  let left = safeLeft;
  let right = safeRight;

  if (!right.trim()) return [left.trim(), right.trim()];

  let cut = advancedPromoteSentenceEndPosition(right);
  const lastOpenLeft = left.lastIndexOf(ADVANCED_PROMOTE_OPEN_QUOTE);
  const lastCloseLeft = left.lastIndexOf(ADVANCED_PROMOTE_CLOSE_QUOTE);
  const closeRight = right.indexOf(ADVANCED_PROMOTE_CLOSE_QUOTE);

  if (lastOpenLeft !== -1 && lastOpenLeft > lastCloseLeft && closeRight !== -1) {
    cut = closeRight + ADVANCED_PROMOTE_CLOSE_QUOTE.length;
  }

  if (cut < 0) {
    const newlineIndex = right.indexOf('\n');
    cut = newlineIndex >= 0 ? newlineIndex : 0;
  }

  const trimmedLeft = left.trimEnd();
  if (ADVANCED_PROMOTE_SENTENCE_ENDINGS.some(symbol => trimmedLeft.endsWith(symbol))) {
    return [left.trim(), right.trim()];
  }

  if (cut <= 0) return [left.trim(), right.trim()];
  return [(left + right.slice(0, cut)).trim(), right.slice(cut).trim()];
}

function advancedPromoteLastSentence(value = '', parameter = 0) {
  let full = advancedPromoteNormalizedText(value);
  if (!full) return '';

  if (parameter > 0) {
    const [firstPart] = advancedPromoteSmartSplit(full, parameter);
    full = firstPart.trim();
  }

  const noteIndex = full.indexOf('{Note');
  const cleaned = (noteIndex >= 0 ? full.slice(0, noteIndex) : full).trim();
  if (!cleaned) return '';

  if (cleaned.endsWith(ADVANCED_PROMOTE_CLOSE_QUOTE)) {
    const openIndex = cleaned.lastIndexOf(ADVANCED_PROMOTE_OPEN_QUOTE);
    if (openIndex >= 0) return cleaned.slice(openIndex).trim();
  }

  if (ADVANCED_PROMOTE_SENTENCE_ENDINGS.some(symbol => cleaned.endsWith(symbol))) {
    const start = advancedPromotePreviousSentenceStart(cleaned.slice(0, -1));
    return cleaned.slice(start).trim();
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length <= 6 ? cleaned : words.slice(-6).join(' ');
}

function advancedPromoteFixSplitForChapter(value = '', limit = 2500) {
  let [firstPart, rest] = advancedPromoteSmartSplit(value, limit);
  firstPart = firstPart.trim();
  rest = rest.trim();
  if (!firstPart || !rest) return [firstPart, rest];

  const lastSentence = advancedPromoteLastSentence(firstPart);
  const lastSentenceWords = advancedPromoteWordCount(lastSentence);
  if (lastSentenceWords < 18 || !lastSentence) return [firstPart, rest];

  const safeFirst = firstPart.slice(0, Math.max(0, firstPart.length - lastSentence.length)).trim();
  if (advancedPromoteWordCount(safeFirst) <= limit - 10) {
    if (rest.startsWith(ADVANCED_PROMOTE_OPEN_QUOTE)) {
      const closeIndex = rest.indexOf(ADVANCED_PROMOTE_CLOSE_QUOTE);
      if (closeIndex !== -1) {
        return [(`${firstPart}\n\n${rest.slice(0, closeIndex + 1)}`).trim(), rest.slice(closeIndex + 1).trim()];
      }
    }

    const symbolIndex = advancedPromoteSentenceEndPosition(rest);
    if (symbolIndex > 0) {
      return [(`${firstPart}\n\n${rest.slice(0, symbolIndex)}`).trim(), rest.slice(symbolIndex).trim()];
    }

    return [firstPart, rest];
  }

  const sentenceStart = Math.max(0, firstPart.length - lastSentence.length);
  return [firstPart.slice(0, sentenceStart).trim(), (`${lastSentence}\n\n${rest}`).trim()];
}

function advancedPromoteDefaultChapterCount(sourceText = '', wordLimit = 2500) {
  const words = advancedPromoteWordCount(sourceText);
  if (!words) return 1;
  return clampNumber(Math.floor(words / Math.max(1, wordLimit)) || 1, 1, 50);
}

function advancedPromoteConclusionStorageKey() {
  const folderName = projectDirectoryHandle?.name ||
    localStorage.getItem(typeof PROJECT_FOLDER_KEY === 'string' ? PROJECT_FOLDER_KEY : 'lm_projectFolder') ||
    normalizeProjectManifest(projectManifest || createProjectManifest()).title ||
    'default';
  return `${ADVANCED_PROMOTE_CONCLUSION_STORAGE_PREFIX}:${encodeURIComponent(folderName)}`;
}

function advancedPromoteReadPermanentConclusion() {
  try {
    return localStorage.getItem(advancedPromoteConclusionStorageKey()) || '';
  } catch (error) {
    console.warn('Advanced promote conclusion could not be read:', error);
    return '';
  }
}

function advancedPromoteSavePermanentConclusion(value = '') {
  try {
    localStorage.setItem(advancedPromoteConclusionStorageKey(), String(value || ''));
  } catch (error) {
    console.warn('Advanced promote conclusion could not be saved:', error);
  }
}

function advancedPromoteChapterBody(chapter = {}) {
  return String(chapter.body ?? chapter.text ?? '').replace(/\r\n?/g, '\n').trim();
}

function advancedPromoteChapterFullText(chapter = {}) {
  const body = advancedPromoteChapterBody(chapter);
  const conclusion = String(chapter.conclusion || '').replace(/\r\n?/g, '\n').trim();
  return [body, conclusion].filter(Boolean).join('\n\n\n');
}

function advancedPromoteSplitIsStale(state) {
  if (!state) return false;
  return state.generatedSourceText !== state.sourceText ||
    state.generatedWordLimit !== state.wordLimit ||
    state.generatedChapterCount !== state.chapterCount;
}

function advancedPromoteChapterIsReady(chapter, state = advancedDraftPromoteState) {
  return advancedPromoteWordCount(advancedPromoteChapterBody(chapter)) >= (state?.wordLimit || 1);
}

function advancedPromoteHasInvalidChapters(state) {
  return Boolean(state?.chapters?.some(chapter => {
    const words = advancedPromoteWordCount(advancedPromoteChapterBody(chapter));
    return words > 0 && words < state.wordLimit;
  }));
}

function advancedPromoteDefaultTitle(baseTitle = '', index = 0) {
  const cleanBase = String(baseTitle || advancedPromoteCopy('chapterTitleLabel', 'Chapter')).trim() || advancedPromoteCopy('chapterTitleLabel', 'Chapter');
  return `${cleanBase} ${index + 1}`;
}

function advancedPromoteUniqueChapterTitle(baseTitle = '', usedKeys = new Set()) {
  const fallbackTitle = advancedPromoteCopy('chapterTitleLabel', 'Chapter');
  const cleanBase = String(baseTitle || fallbackTitle).trim() || fallbackTitle;
  let title = cleanBase;
  let suffix = 2;
  while (chapterTitleExists(title) || usedKeys.has(uniqueNameKey(title))) {
    title = `${cleanBase} ${suffix}`;
    suffix += 1;
  }
  usedKeys.add(uniqueNameKey(title));
  return title;
}

function advancedPromoteGenerateChapters(sourceText = '', options = {}) {
  const wordLimit = clampNumber(parseInt(options.wordLimit, 10) || 2500, 100, 50000);
  const requestedCount = clampNumber(parseInt(options.chapterCount, 10) || 1, 1, 50);
  const permanentConclusion = String(options.permanentConclusion || '').trim();
  const titleBase = String(options.titleBase || advancedPromoteCopy('chapterTitleLabel', 'Chapter')).trim();
  let remainingText = advancedPromoteNormalizedText(sourceText);
  const chaptersToCreate = [];

  for (let index = 0; index < requestedCount && remainingText.trim(); index += 1) {
    const remainingWords = advancedPromoteWordCount(remainingText);
    if (remainingWords < wordLimit) break;

    let [chapterText, restText] = advancedPromoteFixSplitForChapter(remainingText, wordLimit);
    if (advancedPromoteWordCount(chapterText) < wordLimit) {
      [chapterText, restText] = advancedPromoteSmartSplit(remainingText, wordLimit);
    }
    if (!chapterText.trim() || advancedPromoteWordCount(chapterText) < wordLimit) break;

    chaptersToCreate.push({
      id: `advanced-promote-${Date.now()}-${index}`,
      title: advancedPromoteDefaultTitle(titleBase, index),
      body: chapterText.trim(),
      conclusion: permanentConclusion,
      usesPermanentConclusion: true
    });

    if (!restText.trim()) {
      remainingText = '';
      break;
    }

    const carryLine = advancedPromoteLastSentence(chapterText);
    remainingText = `${carryLine ? `${carryLine}\n` : ''}${restText}`.trim();
  }

  return {
    chapters: chaptersToCreate,
    remainderText: remainingText.trim()
  };
}

function advancedPromoteSyncDraftSnapshot(draftIndex) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  const draft = chapterDrafts[draftIndex];
  if (!draft) return null;
  if (isDraftActive() && draftIndex === curDraft) {
    draft.content = getCleanEditorHTML();
    setDraftWordCache(draftIndex, countWordsFromText(getCleanEditorText()));
  }
  return draft;
}

function advancedPromoteSourceTextForDraft(draftIndex) {
  const draft = advancedPromoteSyncDraftSnapshot(draftIndex);
  if (!draft) return '';
  return isDraftActive() && draftIndex === curDraft
    ? getCleanEditorText()
    : editorHTMLToText(draft.content || '');
}

function openDraftPromoteModePanel(draftIndex, anchor = null) {
  chapterDrafts = normalizeDrafts(chapterDrafts);
  const panel = document.getElementById('draftDetailsPanel');
  const draft = chapterDrafts[draftIndex];
  if (!panel || !draft) return;

  const copy = text();
  const openedFromDraftActionPanel = Boolean(anchor?.closest?.('#draftDetailsPanel'));
  const positionAnchor = openedFromDraftActionPanel ? floatingAnchorSnapshot(anchor) : anchor;
  const positionKey = openedFromDraftActionPanel
    ? 'draftActionPromoteDestinationPanel'
    : 'editorPromoteDestinationPanel';
  closePartDetailsPanel();
  closeChapterDetailsPanel();
  closeDraftActionsPanel();
  activeDraftDetailsIndex = `promote-mode:${draftIndex}`;
  activeFloatingAnchor = positionAnchor;
  panel.dataset.positionKey = positionKey;
  panel.classList.add('draft-actions-panel', 'draft-promote-destination-panel', 'draft-promote-mode-panel');
  panel.innerHTML = `
    <div class="part-details-head draft-delete-confirm-head">
      <strong>${escapeHtml(copy.promoteModeTitle || 'Promote draft')}</strong>
      <button class="name-panel-close" type="button" onclick="closeDraftActionsPanel()">${CROSS_CLOSE_SVG}</button>
    </div>
    <p class="draft-delete-confirm-copy">${escapeHtml(copy.promoteModeBody || '')}</p>
    <div class="draft-promote-mode-grid">
      <button class="draft-promote-mode-btn" type="button" onclick="requestRawPromoteDraftToChapter(${draftIndex}, this)">
        <strong>${escapeHtml(copy.rawPromote || 'Raw Promote')}</strong>
        <span>${escapeHtml(copy.rawPromoteBody || '')}</span>
      </button>
      <button class="draft-promote-mode-btn is-advanced" type="button" onclick="openAdvancedDraftPromotePanel(${draftIndex})">
        <strong>${escapeHtml(copy.advancedPromote || 'Advanced Promote')}</strong>
        <span>${escapeHtml(copy.advancedPromoteBody || '')}</span>
      </button>
    </div>`;

  panel.hidden = false;
  positionFloatingPanel(panel, positionAnchor);
}

async function requestRawPromoteDraftToChapter(draftIndex, anchor = null) {
  if (typeof lmRawDraftPromoteRequest === 'function') {
    await lmRawDraftPromoteRequest(draftIndex, anchor || document.getElementById('promoteDraftBtn'));
  }
}

async function requestAdvancedPromoteDraftToChapter(draftIndex, anchor = null) {
  openDraftPromoteModePanel(draftIndex, anchor || document.getElementById('promoteDraftBtn'));
}

function ensureAdvancedDraftPromoteModal() {
  let modal = document.getElementById('advancedDraftPromoteModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'advancedDraftPromoteModal';
  modal.className = 'advanced-draft-promote-modal lm-id-advancedDraftPromoteModal';
  modal.hidden = true;
  document.body.appendChild(modal);
  return modal;
}

function openAdvancedDraftPromotePanel(draftIndex) {
  const draft = advancedPromoteSyncDraftSnapshot(draftIndex);
  if (!draft) return;

  const sourceText = advancedPromoteSourceTextForDraft(draftIndex);
  const wordLimit = 2500;
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const showDestination = hasRawChaptersInPanel(manifest);
  const permanentConclusion = advancedPromoteReadPermanentConclusion();
  advancedDraftPromoteState = {
    draftIndex,
    draftTitle: draft.title || `${text().draftPrefix} ${draftIndex + 1}`,
    sourceText,
    generatedSourceText: sourceText,
    wordLimit,
    generatedWordLimit: wordLimit,
    chapterCount: advancedPromoteDefaultChapterCount(sourceText, wordLimit),
    generatedChapterCount: advancedPromoteDefaultChapterCount(sourceText, wordLimit),
    permanentConclusion,
    destination: 'part',
    showDestination,
    activeView: 'chapters',
    selectedChapterIndex: 0,
    chapters: [],
    remainderText: ''
  };

  const generated = advancedPromoteGenerateChapters(sourceText, {
    wordLimit: advancedDraftPromoteState.wordLimit,
    chapterCount: advancedDraftPromoteState.chapterCount,
    permanentConclusion,
    titleBase: advancedDraftPromoteState.draftTitle
  });
  advancedDraftPromoteState.chapters = generated.chapters;
  advancedDraftPromoteState.remainderText = generated.remainderText;

  closeDraftActionsPanel();
  renderAdvancedDraftPromotePanel();
}

function advancedPromoteDestinationHTML(state) {
  if (!state?.showDestination) return '';
  const copy = text();
  return `
    <fieldset class="advanced-promote-destination">
      <legend>${escapeHtml(copy.advancedPromoteDestination || 'Destination')}</legend>
      <label>
        <input type="radio" name="advancedPromoteDestination" value="part" ${state.destination === 'raw' ? '' : 'checked'} onchange="setAdvancedPromoteDestination('part')">
        <span>${escapeHtml(copy.promoteToRecentPart || 'Recent Part')}</span>
      </label>
      <label>
        <input type="radio" name="advancedPromoteDestination" value="raw" ${state.destination === 'raw' ? 'checked' : ''} onchange="setAdvancedPromoteDestination('raw')">
        <span>${escapeHtml(copy.promoteToRawChapters || 'Raw Chapters')}</span>
      </label>
    </fieldset>`;
}

function advancedPromoteSourceViewHTML(state) {
  const copy = text();
  const sourceWords = advancedPromoteWordCount(state.sourceText);
  const remainderWords = advancedPromoteWordCount(state.remainderText);
  const splitIsStale = advancedPromoteSplitIsStale(state);
  return `
    <main class="advanced-promote-source-view">
      <div class="advanced-promote-settings-bar ${state.showDestination ? 'has-destination' : ''}">
        <label>
          <span>${escapeHtml(copy.advancedPromoteWordLimit || 'Words per chapter')}</span>
          <input id="advancedPromoteWordLimitInp" type="number" min="100" max="50000" step="100" value="${state.wordLimit}" oninput="updateAdvancedPromoteSetting('wordLimit', this.value)">
        </label>
        <label>
          <span>${escapeHtml(copy.advancedPromoteChapterCount || 'Chapter count')}</span>
          <input id="advancedPromoteChapterCountInp" type="number" min="1" max="50" value="${state.chapterCount}" oninput="updateAdvancedPromoteSetting('chapterCount', this.value)">
        </label>
        ${advancedPromoteDestinationHTML(state)}
        <button class="advanced-promote-create-btn" type="button" onclick="generateAdvancedPromoteChaptersFromPanel()">${escapeHtml(copy.advancedPromoteCreate || 'Create Chapters')}</button>
      </div>

      <section class="advanced-promote-conclusion-setting">
        <div class="advanced-promote-section-head">
          <div>
            <strong>${escapeHtml(copy.advancedPromotePermanentConclusion || 'Permanent conclusion')}</strong>
            <p>${escapeHtml(copy.advancedPromotePermanentConclusionBody || 'Saved for this project and automatically added to every created chapter.')}</p>
          </div>
          <span>${state.permanentConclusion ? escapeHtml(copy.advancedPromoteConclusionReady || 'Auto-add on') : escapeHtml(copy.advancedPromoteConclusionEmpty || 'No conclusion set')}</span>
        </div>
        <textarea id="advancedPromotePermanentConclusionInp" rows="3" placeholder="${escapeHtml(copy.advancedPromoteConclusionPlaceholder || 'Write the reusable chapter conclusion...')}" oninput="updateAdvancedPromotePermanentConclusion(this.value)">${escapeHtml(state.permanentConclusion)}</textarea>
      </section>

      <section class="advanced-promote-source-workspace">
        <div class="advanced-promote-section-head">
          <div>
            <strong>${escapeHtml(copy.advancedPromoteFullSource || copy.advancedPromoteSource || 'Source draft')}</strong>
            <p class="advanced-promote-stale-note" ${splitIsStale ? '' : 'hidden'}>${escapeHtml(copy.advancedPromoteRegenerateRequired || 'Source changed. Create chapters again before promoting.')}</p>
          </div>
          <span data-advanced-promote-source-words>${sourceWords} ${escapeHtml(copy.words || 'words')}</span>
        </div>
        <textarea id="advancedPromoteSourceText" oninput="updateAdvancedPromoteSourceText(this.value)">${escapeHtml(state.sourceText)}</textarea>
      </section>

      <section class="advanced-promote-source-remainder" ${state.chapters.length || state.remainderText ? '' : 'hidden'}>
        <div class="advanced-promote-section-head">
          <div>
            <strong>${escapeHtml(copy.advancedPromoteRemainder || 'Text staying in source draft')}</strong>
            <p>${escapeHtml(copy.advancedPromoteRemainderBody || 'This text is not promoted and will remain saved in the same draft.')}</p>
          </div>
          <span>${remainderWords} ${escapeHtml(copy.words || 'words')}</span>
        </div>
        <textarea rows="5" oninput="updateAdvancedPromoteRemainderText(this.value)">${escapeHtml(state.remainderText)}</textarea>
      </section>
    </main>`;
}

function advancedPromoteChapterListHTML(state) {
  const copy = text();
  if (!state.chapters.length) {
    return `<div class="advanced-promote-empty">${escapeHtml(copy.advancedPromoteNoFullChapter || 'The source does not contain enough words for a full chapter at this parameter.')}</div>`;
  }

  return state.chapters.map((chapter, index) => {
    const bodyWords = advancedPromoteWordCount(advancedPromoteChapterBody(chapter));
    const isSelected = index === state.selectedChapterIndex;
    return `
      <button class="advanced-promote-chapter-list-btn ${isSelected ? 'is-selected' : ''}" type="button" data-advanced-promote-list-index="${index}" onclick="selectAdvancedPromoteChapter(${index})" aria-pressed="${isSelected}">
        <span class="advanced-promote-chapter-number">${String(index + 1).padStart(2, '0')}</span>
        <span class="advanced-promote-chapter-list-copy">
          <strong data-advanced-promote-list-title="${index}">${escapeHtml(chapter.title)}</strong>
          <small><span data-advanced-promote-list-words="${index}">${bodyWords}</span> ${escapeHtml(copy.advancedPromoteWords || copy.words || 'words')} · ${chapter.conclusion ? escapeHtml(copy.advancedPromoteConclusionAdded || 'Conclusion added') : escapeHtml(copy.advancedPromoteNoConclusion || 'No conclusion')}</small>
        </span>
      </button>`;
  }).join('');
}

function advancedPromoteSelectedChapterHTML(state) {
  const copy = text();
  const chapter = state.chapters[state.selectedChapterIndex];
  if (!chapter) {
    return `
      <section class="advanced-promote-chapter-preview is-empty">
        <div class="advanced-promote-empty">${escapeHtml(copy.advancedPromoteNoChapters || 'Create split chapters to preview them here.')}</div>
      </section>`;
  }

  const index = state.selectedChapterIndex;
  const body = advancedPromoteChapterBody(chapter);
  const fullText = advancedPromoteChapterFullText(chapter);
  const bodyWords = advancedPromoteWordCount(body);
  const finalWords = advancedPromoteWordCount(fullText);
  const lastLine = advancedPromoteLastSentence(body) || (copy.advancedPromoteEmptyChapter || 'This chapter is empty.');
  const conclusionMode = chapter.usesPermanentConclusion
    ? (copy.advancedPromotePermanentStatus || 'Permanent conclusion')
    : (copy.advancedPromoteCustomStatus || 'Custom conclusion');
  const isReady = advancedPromoteChapterIsReady(chapter, state);
  const readinessLabel = isReady
    ? (copy.advancedPromoteReady || 'Ready')
    : (copy.advancedPromoteBelowParameter || 'Below parameter');

  return `
    <section class="advanced-promote-chapter-preview" data-advanced-promote-chapter="${index}">
      <header class="advanced-promote-chapter-preview-head">
        <label>
          <span>${escapeHtml(copy.chapterTitleLabel || 'Chapter title')}</span>
          <input type="text" value="${escapeHtml(chapter.title)}" oninput="updateAdvancedPromoteChapterTitle(${index}, this.value)">
        </label>
        <div class="advanced-promote-chapter-actions">
          <button type="button" onclick="focusAdvancedPromoteChapterEditor(${index})">${escapeHtml(copy.advancedPromoteEdit || 'Edit')}</button>
          <button type="button" onclick="copyAdvancedPromoteChapter(${index})">${escapeHtml(copy.advancedPromoteCopy || 'Copy')}</button>
          <button type="button" onclick="clearAdvancedPromoteChapter(${index})">${escapeHtml(copy.advancedPromoteClear || 'Clear')}</button>
          <button type="button" class="is-danger" onclick="deleteAdvancedPromoteChapter(${index})">${escapeHtml(copy.advancedPromoteDelete || 'Delete')}</button>
        </div>
      </header>

      <div class="advanced-promote-chapter-status" aria-live="polite">
        <span class="${isReady ? 'is-ready' : 'is-warning'}" data-advanced-promote-readiness>${escapeHtml(readinessLabel)}</span>
        <span><b data-advanced-promote-body-words>${bodyWords}</b> ${escapeHtml(copy.advancedPromoteBodyWords || 'body words')}</span>
        <span><b data-advanced-promote-final-words>${finalWords}</b> ${escapeHtml(copy.advancedPromoteFinalWords || 'final words')}</span>
        <span data-advanced-promote-conclusion-status>${escapeHtml(conclusionMode)}</span>
      </div>

      <div class="advanced-promote-last-line">
        <span>${escapeHtml(copy.advancedPromoteLastLine || 'Last line')}</span>
        <p data-advanced-promote-last-line>${escapeHtml(lastLine)}</p>
      </div>

      <label class="advanced-promote-chapter-editor">
        <span>${escapeHtml(copy.advancedPromoteFullPreview || 'Full chapter preview / edit')}</span>
        <textarea oninput="updateAdvancedPromoteChapterText(${index}, this.value)">${escapeHtml(body)}</textarea>
      </label>

      <section class="advanced-promote-chapter-conclusion">
        <div class="advanced-promote-section-head">
          <div>
            <strong>${escapeHtml(copy.advancedPromoteChapterConclusion || 'Chapter conclusion')}</strong>
            <p>${escapeHtml(copy.advancedPromoteChapterConclusionBody || 'This is appended to the chapter when promoted.')}</p>
          </div>
          <button type="button" onclick="usePermanentAdvancedPromoteConclusion(${index})">${escapeHtml(copy.advancedPromoteUsePermanent || 'Use permanent')}</button>
        </div>
        <textarea rows="5" oninput="updateAdvancedPromoteChapterConclusion(${index}, this.value)">${escapeHtml(chapter.conclusion || '')}</textarea>
      </section>
    </section>`;
}

function advancedPromoteCreatedViewHTML(state) {
  const copy = text();
  const remainderWords = advancedPromoteWordCount(state.remainderText);
  return `
    <main class="advanced-promote-created-view">
      <aside class="advanced-promote-chapter-index">
        <div class="advanced-promote-section-head">
          <strong>${escapeHtml(copy.advancedPromoteCreatedChapters || 'Created chapters')}</strong>
          <span>${state.chapters.length}</span>
        </div>
        <div class="advanced-promote-chapter-index-list">${advancedPromoteChapterListHTML(state)}</div>
        <div class="advanced-promote-remainder-status">
          <strong>${escapeHtml(copy.advancedPromoteRemainder || 'Source draft remainder')}</strong>
          <span>${remainderWords} ${escapeHtml(copy.words || 'words')}</span>
          <p>${escapeHtml(copy.advancedPromoteRemainderBody || 'This text stays saved in the source draft.')}</p>
        </div>
      </aside>
      ${advancedPromoteSelectedChapterHTML(state)}
    </main>`;
}

function advancedPromoteSummaryHTML(state, metrics) {
  const copy = text();
  return `
    <div class="advanced-promote-summary" aria-live="polite">
      <div class="advanced-promote-view-tabs" role="tablist" aria-label="${escapeHtml(copy.advancedPromoteViews || 'Advanced promote views')}">
        <button type="button" role="tab" aria-selected="${state.activeView === 'source'}" class="${state.activeView === 'source' ? 'is-active' : ''}" onclick="setAdvancedPromoteView('source')">
          ${escapeHtml(copy.advancedPromoteSource || 'Source Draft')}
          <span>${metrics.sourceWords}</span>
        </button>
        <button type="button" role="tab" aria-selected="${state.activeView === 'chapters'}" class="${state.activeView === 'chapters' ? 'is-active' : ''}" onclick="setAdvancedPromoteView('chapters')">
          ${escapeHtml(copy.advancedPromoteCreatedChapters || 'Created Chapters')}
          <span>${state.chapters.length}</span>
        </button>
      </div>
      <div class="advanced-promote-summary-metrics">
        <span>${metrics.chapterWords} ${escapeHtml(copy.words || 'words')} ${escapeHtml(copy.advancedPromoteProposed || 'proposed')}</span>
        <span>${metrics.remainderWords} ${escapeHtml(copy.words || 'words')} ${escapeHtml(copy.advancedPromoteRemaining || 'remaining')}</span>
      </div>
    </div>`;
}

function renderAdvancedDraftPromotePanel() {
  const state = advancedDraftPromoteState;
  const modal = ensureAdvancedDraftPromoteModal();
  if (!state) {
    modal.hidden = true;
    return;
  }

  if (state.chapters.length) {
    state.selectedChapterIndex = clampNumber(state.selectedChapterIndex, 0, state.chapters.length - 1);
  } else {
    state.selectedChapterIndex = 0;
  }

  const copy = text();
  const metrics = {
    sourceWords: advancedPromoteWordCount(state.sourceText),
    chapterWords: state.chapters.reduce((total, chapter) => total + advancedPromoteWordCount(advancedPromoteChapterBody(chapter)), 0),
    remainderWords: advancedPromoteWordCount(state.remainderText)
  };
  const hasChapters = state.chapters.some(chapter => advancedPromoteChapterBody(chapter));
  const hasInvalidChapters = advancedPromoteHasInvalidChapters(state);
  const splitIsStale = advancedPromoteSplitIsStale(state);
  const activeViewHTML = state.activeView === 'source'
    ? advancedPromoteSourceViewHTML(state)
    : advancedPromoteCreatedViewHTML(state);

  modal.innerHTML = `
    <section class="advanced-promote-panel" role="dialog" aria-modal="true" aria-labelledby="advancedPromoteTitle">
      <header class="advanced-promote-header">
        <div>
          <span class="advanced-promote-kicker">${escapeHtml(copy.advancedPromoteKicker || 'Draft splitter')}</span>
          <h2 id="advancedPromoteTitle">${escapeHtml(copy.advancedPromoteTitle || 'Advanced Promote')}</h2>
          <p>${escapeHtml(state.draftTitle)}</p>
        </div>
        <button class="advanced-promote-close" type="button" onclick="closeAdvancedDraftPromotePanel()" aria-label="${escapeHtml(copy.close || 'Close')}">${CROSS_CLOSE_SVG}</button>
      </header>

      ${advancedPromoteSummaryHTML(state, metrics)}
      <div class="advanced-promote-body">${activeViewHTML}</div>

      <footer class="advanced-promote-footer">
        <button type="button" onclick="reverseAdvancedPromoteCreation()" ${state.chapters.length ? '' : 'disabled'}>${escapeHtml(copy.advancedPromoteReverse || 'Reverse Creation')}</button>
        <button type="button" onclick="closeAdvancedDraftPromotePanel()">${escapeHtml(copy.storyInfoCancel || 'Cancel')}</button>
        <button class="advanced-promote-apply-btn" type="button" onclick="applyAdvancedDraftPromote()" ${hasChapters && !hasInvalidChapters && !splitIsStale ? '' : 'disabled'}>
          ${escapeHtml(copy.advancedPromoteApply || 'Promote Chapters')}
        </button>
      </footer>
    </section>`;

  modal.hidden = false;
  document.body.classList.add('is-advanced-promote-open');
  requestAnimationFrame(() => {
    if (state.activeView === 'chapters') document.querySelector('.advanced-promote-chapter-list-btn.is-selected')?.focus();
  });
}
function closeAdvancedDraftPromotePanel() {
  const modal = document.getElementById('advancedDraftPromoteModal');
  if (modal) {
    modal.hidden = true;
    modal.innerHTML = '';
  }
  document.body.classList.remove('is-advanced-promote-open');
  advancedDraftPromoteState = null;
}

function setAdvancedPromoteView(view = 'chapters') {
  if (!advancedDraftPromoteState) return;
  syncAdvancedPromoteControlsFromPanel();
  advancedDraftPromoteState.activeView = view === 'source' ? 'source' : 'chapters';
  renderAdvancedDraftPromotePanel();
}

function selectAdvancedPromoteChapter(index) {
  const state = syncAdvancedPromoteControlsFromPanel();
  if (!state?.chapters?.[index]) return;
  state.selectedChapterIndex = index;
  state.activeView = 'chapters';
  renderAdvancedDraftPromotePanel();
}

function updateAdvancedPromoteSetting(setting, value) {
  const state = advancedDraftPromoteState;
  if (!state) return;
  if (setting === 'wordLimit') {
    state.wordLimit = clampNumber(parseInt(value, 10) || 2500, 100, 50000);
  } else if (setting === 'chapterCount') {
    state.chapterCount = clampNumber(parseInt(value, 10) || 1, 1, 50);
  }
  const staleNote = document.querySelector('.advanced-promote-stale-note');
  if (staleNote) staleNote.hidden = !advancedPromoteSplitIsStale(state);
  const applyButton = document.querySelector('.advanced-promote-apply-btn');
  if (applyButton) applyButton.disabled = advancedPromoteSplitIsStale(state) || !state.chapters.some(chapter => advancedPromoteChapterBody(chapter));
}

function updateAdvancedPromoteSourceText(value = '') {
  const state = advancedDraftPromoteState;
  if (!state) return;
  state.sourceText = String(value || '').replace(/\r\n?/g, '\n');
  const wordNode = document.querySelector('[data-advanced-promote-source-words]');
  if (wordNode) wordNode.textContent = `${advancedPromoteWordCount(state.sourceText)} ${text().words || 'words'}`;
  const staleNote = document.querySelector('.advanced-promote-stale-note');
  if (staleNote) staleNote.hidden = !advancedPromoteSplitIsStale(state);
  const applyButton = document.querySelector('.advanced-promote-apply-btn');
  if (applyButton) applyButton.disabled = true;
}

function updateAdvancedPromoteRemainderText(value = '') {
  if (!advancedDraftPromoteState) return;
  advancedDraftPromoteState.remainderText = String(value || '').replace(/\r\n?/g, '\n');
}

function updateAdvancedPromotePermanentConclusion(value = '') {
  const state = advancedDraftPromoteState;
  if (!state) return;
  state.permanentConclusion = String(value || '').replace(/\r\n?/g, '\n');
  advancedPromoteSavePermanentConclusion(state.permanentConclusion);
  state.chapters.forEach(chapter => {
    if (chapter.usesPermanentConclusion) chapter.conclusion = state.permanentConclusion;
  });
}

function updateAdvancedPromoteChapterTitle(index, value = '') {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  if (!chapter) return;
  chapter.title = String(value || '').trimStart();
  const listTitle = document.querySelector(`[data-advanced-promote-list-title="${index}"]`);
  if (listTitle) listTitle.textContent = chapter.title || advancedPromoteDefaultTitle(advancedDraftPromoteState.draftTitle, index);
}

function refreshAdvancedPromoteChapterMetrics(index) {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  const preview = document.querySelector(`[data-advanced-promote-chapter="${index}"]`);
  if (!chapter || !preview) return;
  const body = advancedPromoteChapterBody(chapter);
  const fullText = advancedPromoteChapterFullText(chapter);
  const bodyWords = advancedPromoteWordCount(body);
  const finalWords = advancedPromoteWordCount(fullText);
  const lastLine = advancedPromoteLastSentence(body) || (text().advancedPromoteEmptyChapter || 'This chapter is empty.');
  const conclusionMode = chapter.usesPermanentConclusion
    ? (text().advancedPromotePermanentStatus || 'Permanent conclusion')
    : (text().advancedPromoteCustomStatus || 'Custom conclusion');
  const isReady = advancedPromoteChapterIsReady(chapter);
  const readinessNode = preview.querySelector('[data-advanced-promote-readiness]');
  const bodyWordNode = preview.querySelector('[data-advanced-promote-body-words]');
  const finalWordNode = preview.querySelector('[data-advanced-promote-final-words]');
  const lastLineNode = preview.querySelector('[data-advanced-promote-last-line]');
  const conclusionNode = preview.querySelector('[data-advanced-promote-conclusion-status]');
  const listWordNode = document.querySelector(`[data-advanced-promote-list-words="${index}"]`);
  if (readinessNode) {
    readinessNode.textContent = isReady
      ? (text().advancedPromoteReady || 'Ready')
      : (text().advancedPromoteBelowParameter || 'Below parameter');
    readinessNode.classList.toggle('is-ready', isReady);
    readinessNode.classList.toggle('is-warning', !isReady);
  }
  if (bodyWordNode) bodyWordNode.textContent = bodyWords;
  if (finalWordNode) finalWordNode.textContent = finalWords;
  if (lastLineNode) lastLineNode.textContent = lastLine;
  if (conclusionNode) conclusionNode.textContent = conclusionMode;
  if (listWordNode) listWordNode.textContent = bodyWords;
  const applyButton = document.querySelector('.advanced-promote-apply-btn');
  if (applyButton) {
    applyButton.disabled = advancedPromoteSplitIsStale(advancedDraftPromoteState) ||
      advancedPromoteHasInvalidChapters(advancedDraftPromoteState) ||
      !advancedDraftPromoteState.chapters.some(item => advancedPromoteChapterBody(item));
  }
}

function updateAdvancedPromoteChapterText(index, value = '') {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  if (!chapter) return;
  chapter.body = String(value || '').replace(/\r\n?/g, '\n');
  refreshAdvancedPromoteChapterMetrics(index);
}

function updateAdvancedPromoteChapterConclusion(index, value = '') {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  if (!chapter) return;
  chapter.conclusion = String(value || '').replace(/\r\n?/g, '\n');
  chapter.usesPermanentConclusion = chapter.conclusion === advancedDraftPromoteState.permanentConclusion;
  refreshAdvancedPromoteChapterMetrics(index);
}

function usePermanentAdvancedPromoteConclusion(index) {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  if (!chapter) return;
  chapter.conclusion = advancedDraftPromoteState.permanentConclusion;
  chapter.usesPermanentConclusion = true;
  renderAdvancedDraftPromotePanel();
}

function focusAdvancedPromoteChapterEditor(index) {
  const preview = document.querySelector(`[data-advanced-promote-chapter="${index}"]`);
  preview?.querySelector('.advanced-promote-chapter-editor textarea')?.focus();
}

function advancedPromoteFallbackCopy(value = '') {
  const textarea = document.createElement('textarea');
  textarea.value = String(value || '');
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand?.('copy');
  textarea.remove();
  return Boolean(copied);
}

async function copyAdvancedPromoteChapter(index) {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  if (!chapter) return;
  const chapterText = advancedPromoteChapterFullText(chapter);
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(chapterText);
    else if (!advancedPromoteFallbackCopy(chapterText)) throw new Error('Clipboard unavailable');
    showMiniReminder(text().advancedPromoteCopied || 'Chapter copied');
  } catch (error) {
    if (advancedPromoteFallbackCopy(chapterText)) {
      showMiniReminder(text().advancedPromoteCopied || 'Chapter copied');
      return;
    }
    console.warn('Advanced promote copy failed:', error);
  }
}

function clearAdvancedPromoteChapter(index) {
  const chapter = advancedDraftPromoteState?.chapters?.[index];
  if (!chapter) return;
  chapter.body = '';
  renderAdvancedDraftPromotePanel();
}

function deleteAdvancedPromoteChapter(index) {
  const state = advancedDraftPromoteState;
  const chapter = state?.chapters?.[index];
  if (!state || !chapter) return;
  const returnedText = advancedPromoteChapterBody(chapter);
  if (returnedText) state.remainderText = [returnedText, state.remainderText].filter(Boolean).join('\n\n');
  state.chapters.splice(index, 1);
  state.selectedChapterIndex = clampNumber(index, 0, Math.max(0, state.chapters.length - 1));
  renderAdvancedDraftPromotePanel();
}

function setAdvancedPromoteDestination(destination = 'part') {
  if (!advancedDraftPromoteState) return;
  advancedDraftPromoteState.destination = destination === 'raw' ? 'raw' : 'part';
}

function syncAdvancedPromoteControlsFromPanel() {
  const state = advancedDraftPromoteState;
  if (!state) return null;

  const sourceInput = document.getElementById('advancedPromoteSourceText');
  if (sourceInput) state.sourceText = sourceInput.value.replace(/\r\n?/g, '\n');

  const limitInput = document.getElementById('advancedPromoteWordLimitInp');
  if (limitInput) state.wordLimit = clampNumber(parseInt(limitInput.value, 10) || state.wordLimit, 100, 50000);

  const countInput = document.getElementById('advancedPromoteChapterCountInp');
  if (countInput) state.chapterCount = clampNumber(parseInt(countInput.value, 10) || state.chapterCount, 1, 50);

  const permanentConclusionInput = document.getElementById('advancedPromotePermanentConclusionInp');
  if (permanentConclusionInput) state.permanentConclusion = permanentConclusionInput.value.replace(/\r\n?/g, '\n');

  const destinationInput = document.querySelector('input[name="advancedPromoteDestination"]:checked');
  if (destinationInput) state.destination = destinationInput.value === 'raw' ? 'raw' : 'part';

  const preview = document.querySelector(`[data-advanced-promote-chapter="${state.selectedChapterIndex}"]`);
  const selectedChapter = state.chapters[state.selectedChapterIndex];
  if (preview && selectedChapter) {
    selectedChapter.title = preview.querySelector('.advanced-promote-chapter-preview-head input')?.value || selectedChapter.title;
    selectedChapter.body = preview.querySelector('.advanced-promote-chapter-editor textarea')?.value?.replace(/\r\n?/g, '\n') || '';
    selectedChapter.conclusion = preview.querySelector('.advanced-promote-chapter-conclusion textarea')?.value?.replace(/\r\n?/g, '\n') || '';
  }

  const remainderInput = document.querySelector('.advanced-promote-source-remainder textarea');
  if (remainderInput) state.remainderText = remainderInput.value.replace(/\r\n?/g, '\n');
  return state;
}

function generateAdvancedPromoteChaptersFromPanel() {
  const state = syncAdvancedPromoteControlsFromPanel();
  if (!state) return;
  advancedPromoteSavePermanentConclusion(state.permanentConclusion);
  const generated = advancedPromoteGenerateChapters(state.sourceText, {
    wordLimit: state.wordLimit,
    chapterCount: state.chapterCount,
    permanentConclusion: state.permanentConclusion,
    titleBase: state.draftTitle
  });
  state.chapters = generated.chapters;
  state.remainderText = generated.remainderText;
  state.generatedSourceText = state.sourceText;
  state.generatedWordLimit = state.wordLimit;
  state.generatedChapterCount = state.chapterCount;
  state.selectedChapterIndex = 0;
  state.activeView = 'chapters';
  renderAdvancedDraftPromotePanel();
}

function reverseAdvancedPromoteCreation() {
  const state = syncAdvancedPromoteControlsFromPanel();
  if (!state) return;
  state.chapters = [];
  state.remainderText = '';
  state.generatedSourceText = state.sourceText;
  state.generatedWordLimit = state.wordLimit;
  state.generatedChapterCount = state.chapterCount;
  state.selectedChapterIndex = 0;
  state.activeView = 'source';
  renderAdvancedDraftPromotePanel();
}
async function applyAdvancedDraftPromote() {
  const state = syncAdvancedPromoteControlsFromPanel();
  if (!state) return;

  if (advancedPromoteSplitIsStale(state)) {
    showMiniReminder(text().advancedPromoteRegenerateRequired || 'Source or split settings changed. Create chapters again before promoting.');
    state.activeView = 'source';
    renderAdvancedDraftPromotePanel();
    return;
  }
  if (advancedPromoteHasInvalidChapters(state)) {
    showMiniReminder(text().advancedPromoteBelowParameterBody || 'Every non-empty chapter must meet the word parameter before promotion.');
    return;
  }

  const draft = advancedPromoteSyncDraftSnapshot(state.draftIndex);
  if (!draft) return;

  const proposedChapters = state.chapters
    .map(chapter => ({
      ...chapter,
      title: String(chapter.title || '').trim(),
      body: advancedPromoteNormalizedText(advancedPromoteChapterBody(chapter)),
      text: advancedPromoteNormalizedText(advancedPromoteChapterFullText(chapter))
    }))
    .filter(chapter => chapter.body);

  if (!proposedChapters.length) {
    showMiniReminder(text().advancedPromoteCreateFirst || 'Create at least one chapter first.');
    return;
  }

  showAppLoader(text().advancedPromoteApply || text().saveDraftAsChapter);

  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const hasParts = manifest.parts.length > 0;
  const shouldPromoteToRaw = state.destination === 'raw' && state.showDestination && hasRawChaptersInPanel(manifest);
  const targetPartIndex = shouldPromoteToRaw ? -1 : hasParts ? latestPartIndex(manifest) : -1;
  const firstChapterIndex = chapters.length;
  const basePartChapterCount = targetPartIndex >= 0
    ? chapters.filter(chapter => chapter.partIndex === targetPartIndex).length
    : hasParts
      ? chapters.filter(chapter => {
        const partIndex = Number.isInteger(chapter.partIndex) ? chapter.partIndex : -1;
        return partIndex < 0 || partIndex >= manifest.parts.length;
      }).length
      : chapters.length;
  const promotedAt = new Date().toISOString();
  const usedTitleKeys = new Set();
  const draftPath = draft.contentPath;

  const newChapters = proposedChapters.map((item, offset) => {
    const chapterIndex = firstChapterIndex + offset;
    const title = advancedPromoteUniqueChapterTitle(
      item.title || advancedPromoteDefaultTitle(state.draftTitle, offset),
      usedTitleKeys
    );
    return normalizeChapter({
      id: Date.now() + offset,
      title,
      content: textToEditorHTML(item.text),
      notes: draft.notes || [],
      contentPath: chapterFilePath(chapterIndex),
      partIndex: targetPartIndex,
      chapterNo: basePartChapterCount + offset + 1,
      createdAt: promotedAt,
      alignment: draft.alignment,
      lineHeight: draft.lineHeight,
      paragraphGap: draft.paragraphGap,
      paragraphMargin: draft.paragraphMargin,
      fontFamily: draft.fontFamily,
      fontSize: draft.fontSize,
      _wordCount: advancedPromoteWordCount(item.text)
    }, chapterIndex, targetPartIndex, basePartChapterCount + offset);
  });

  newChapters.forEach((chapter, offset) => {
    chapters.push(chapter);
    scanCurrentChapterForNamingUses(firstChapterIndex + offset, proposedChapters[offset].text, promotedAt);
  });

  const remainderText = advancedPromoteNormalizedText(state.remainderText);
  if (remainderText) {
    const remainderDraft = normalizeDraft({
      ...draft,
      title: draft.title || `${text().draftPrefix} ${state.draftIndex + 1}`,
      content: textToEditorHTML(remainderText),
      updatedAt: promotedAt,
      _wordCount: advancedPromoteWordCount(remainderText)
    }, state.draftIndex);
    chapterDrafts.splice(state.draftIndex, 1, remainderDraft);
  } else {
    chapterDrafts.splice(state.draftIndex, 1);
  }

  chapterDrafts = normalizeDrafts(chapterDrafts);
  selectedDraftIndexes.clear();
  lastSelectedDraftIndex = null;
  activeEditorMode = 'chapter';
  isChapterEditUnlocked = false;
  curChap = firstChapterIndex;
  curDraft = chapterDrafts.length ? Math.min(state.draftIndex, chapterDrafts.length - 1) : -1;
  syncDraftPromoteButton();
  curPart = targetPartIndex;
  expandedPartIndex = targetPartIndex;
  isRawChapterSectionExpanded = shouldPromoteToRaw;
  isPartsListCollapsedByRaw = shouldPromoteToRaw;
  isPartsListForceExpanded = !shouldPromoteToRaw && targetPartIndex >= 0;
  if (!shouldPromoteToRaw && targetPartIndex >= 0 && chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';

  persistProjectManifestSnapshot();
  saveToStorage(false);
  closeAdvancedDraftPromotePanel();
  setDraftBoxSaveIndicator('busy');
  loadEditor();
  renderChapters();
  renderTags();
  renderNotes();
  updateChapterStatus();

  try {
    if (projectDirectoryHandle) {
      await Promise.all(newChapters.map((chapter, offset) =>
        getProjectFileHandle(chapter.contentPath, { create: true })
          .then(fileHandle => {
            chapter.contentHandle = fileHandle;
            return writeFileText(fileHandle, proposedChapters[offset].text);
          })
      ));

      if (remainderText) await writeDraftToLocalFile(state.draftIndex, remainderText);
      else await removeProjectFileIfExists(draftPath);

      await writeProjectManifest();
      await writeDraftsDataToProject();
      await writeNamingDataToProject();
    }
    rememberCurrentChapterSaved();
    setDraftBoxSaveIndicator('saved');
    setSaveStatusDot('saved', text().advancedPromoteSaved || text().draftPromoted);
  } catch (error) {
    console.warn('Advanced draft promote failed:', error);
    setDraftBoxSaveIndicator('idle');
  } finally {
    hideAppLoader();
  }
}

try {
  requestPromoteDraftToChapter = requestAdvancedPromoteDraftToChapter;
} catch (error) {
  console.warn('Advanced promote hook failed:', error);
}

window.openDraftPromoteModePanel = openDraftPromoteModePanel;
window.requestRawPromoteDraftToChapter = requestRawPromoteDraftToChapter;
window.requestPromoteDraftToChapter = requestAdvancedPromoteDraftToChapter;
window.openAdvancedDraftPromotePanel = openAdvancedDraftPromotePanel;
window.closeAdvancedDraftPromotePanel = closeAdvancedDraftPromotePanel;
window.generateAdvancedPromoteChaptersFromPanel = generateAdvancedPromoteChaptersFromPanel;
window.reverseAdvancedPromoteCreation = reverseAdvancedPromoteCreation;
window.applyAdvancedDraftPromote = applyAdvancedDraftPromote;
window.setAdvancedPromoteView = setAdvancedPromoteView;
window.selectAdvancedPromoteChapter = selectAdvancedPromoteChapter;
window.updateAdvancedPromoteSetting = updateAdvancedPromoteSetting;
window.updateAdvancedPromoteSourceText = updateAdvancedPromoteSourceText;
window.updateAdvancedPromoteRemainderText = updateAdvancedPromoteRemainderText;
window.updateAdvancedPromotePermanentConclusion = updateAdvancedPromotePermanentConclusion;
window.updateAdvancedPromoteChapterTitle = updateAdvancedPromoteChapterTitle;
window.updateAdvancedPromoteChapterText = updateAdvancedPromoteChapterText;
window.updateAdvancedPromoteChapterConclusion = updateAdvancedPromoteChapterConclusion;
window.usePermanentAdvancedPromoteConclusion = usePermanentAdvancedPromoteConclusion;
window.focusAdvancedPromoteChapterEditor = focusAdvancedPromoteChapterEditor;
window.copyAdvancedPromoteChapter = copyAdvancedPromoteChapter;
window.clearAdvancedPromoteChapter = clearAdvancedPromoteChapter;
window.deleteAdvancedPromoteChapter = deleteAdvancedPromoteChapter;
window.setAdvancedPromoteDestination = setAdvancedPromoteDestination;

