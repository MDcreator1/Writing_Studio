function refreshFindResultsFromOpenQuery() {
  const findInput = document.getElementById('findInp');
  if (!findInput?.value) {
    updateFindMatchCount();
    renderFindMarkerRail();
    return;
  }
  doFind({
    preferredSnapshot: findPanelReturnSelection,
    searchAnchorSnapshot: findPanelSearchAnchorSelection
  });
}

function updateFindMatchCount() {
  const matchCount = document.getElementById('matchCount');
  if (!matchCount) {
    syncFindReplaceAvailability();
    return;
  }
  const query = document.getElementById('findInp')?.value || '';
  if (!query) {
    matchCount.textContent = '';
    syncFindReplaceAvailability();
    return;
  }
  matchCount.textContent = findMatches.length ? `${findIdx + 1}/${findMatches.length}` : '0/0';
  syncFindReplaceAvailability();
}

function renderFindMarkerRail() {
  const rail = document.getElementById('find-marker-rail');
  const editor = document.getElementById('editor');
  const wrap = document.getElementById('editor-wrap');
  const query = document.getElementById('findInp')?.value || '';
  if (!rail || !editor) return;

  const shouldShow = Boolean(query && findMatches.length);
  rail.hidden = !shouldShow;
  rail.innerHTML = '';
  editor.classList.toggle('has-find-rail', shouldShow);
  if (shouldShow) {
    editor.classList.remove('is-scrolling');
    clearTimeout(editorScrollHideTimer);
  }
  updateEditorScrollThumb(false);
  if (!shouldShow) return;

  if (wrap) {
    const editorRect = editor.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const editorStyle = window.getComputedStyle(editor);
    const topInset = parseFloat(editorStyle.paddingTop) || 54;
    const bottomInset = 48;
    const rightInset = 14;
    const railWidth = rail.offsetWidth || 8;
    const left = Math.max(0, editorRect.right - wrapRect.left - rightInset - railWidth);
    const top = Math.max(0, editorRect.top - wrapRect.top + topInset);
    const bottom = Math.max(0, wrapRect.bottom - editorRect.bottom + bottomInset);
    rail.style.left = `${Math.round(left)}px`;
    rail.style.right = 'auto';
    rail.style.top = `${Math.round(top)}px`;
    rail.style.bottom = `${Math.round(bottom)}px`;
  }

  const scrollHeight = Math.max(editor.scrollHeight, editor.clientHeight, 1);
  const markerMaxPercent = 98;
  findMatches.forEach((match, index) => {
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = `find-marker-dot${index === findIdx ? ' current' : ''}`;
    marker.tabIndex = -1;
    marker.title = `${index + 1}/${findMatches.length}`;
    const topPercent = Math.min(markerMaxPercent, Math.max(2, (match.offsetTop / scrollHeight) * 100));
    marker.style.top = `${topPercent}%`;
    marker.addEventListener('pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    });
    marker.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      goToFindMatch(index, { preservePanel: true });
    });
    rail.appendChild(marker);
  });
}

function preserveOpenFindPanelAfterMarkerNavigation() {
  const findBar = document.getElementById('find-bar');
  const findBtn = document.getElementById('findBtn');
  isFindOpen = true;
  if (findBar) findBar.hidden = false;
  if (findBtn) findBtn.setAttribute('aria-expanded', 'true');
  if (typeof positionFindPanelFromDock === 'function') positionFindPanelFromDock();
}

function goToFindMatch(index, options = {}) {
  if (!findMatches.length) return;
  if (options.preservePanel) preserveOpenFindPanelAfterMarkerNavigation();
  findIdx = Math.min(Math.max(index, 0), findMatches.length - 1);
  highlightCurrent();
  if (options.preservePanel) {
    preserveOpenFindPanelAfterMarkerNavigation();
    requestAnimationFrame(preserveOpenFindPanelAfterMarkerNavigation);
  }
}

function clampFindScrollValue(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scrollFindMatchToAutoScrollDepth(match) {
  const editor = document.getElementById('editor');
  if (!editor || !match?.isConnected || !editor.contains(match)) return false;
  const canUseAutoScroll = typeof isEditorAutoScrollSystemActive === 'function'
    ? isEditorAutoScrollSystemActive()
    : Boolean(isEditorAutoScrollEnabled);
  if (!canUseAutoScroll) return false;

  const editorRect = editor.getBoundingClientRect();
  const matchRect = match.getBoundingClientRect();
  if (!editorRect.height || !matchRect.height) return false;

  const depth = typeof editorAutoScrollTargetDepthPx === 'function'
    ? editorAutoScrollTargetDepthPx(editor)
    : typeof editorAutoScrollDepthPx === 'function'
      ? editorAutoScrollDepthPx(editor)
    : editor.clientHeight * 0.72;
  const safeDepth = Number.isFinite(depth) && depth > 0
    ? clampFindScrollValue(depth, 0, editor.clientHeight)
    : editor.clientHeight / 2;
  const matchCenterY = matchRect.top - editorRect.top + (matchRect.height / 2);
  const maxScrollTop = Math.max(0, editor.scrollHeight - editor.clientHeight);
  const nextScrollTop = clampFindScrollValue(editor.scrollTop + matchCenterY - safeDepth, 0, maxScrollTop);

  if (typeof setEditorAutoScrollTop === 'function') {
    setEditorAutoScrollTop(editor, nextScrollTop);
  } else {
    editor.scrollTop = nextScrollTop;
  }
  return true;
}

function doFind(options = {}) {
  const query = document.getElementById('findInp').value;
  clearHighlights({ sync: false });
  if (!query) {
    updateFindMatchCount();
    renderFindMarkerRail();
    return;
  }
  const editor = document.getElementById('editor');
  const findMode = typeof currentEditorFindMode === 'function' ? currentEditorFindMode() : 'deep';

  getEditorTextNodes().forEach(node => {
    if (!countEditorFindMatches(node.nodeValue, query, findMode)) return;
    node.replaceWith(buildHighlightedFragment(node.nodeValue, query, { mode: findMode }));
  });

  findMatches = [...editor.querySelectorAll('mark.highlight-find')];
  if (findMatches.length) {
    const preferredIndex = findMatchIndexForEditorSnapshot(options.preferredSnapshot);
    const anchorIndex = preferredIndex >= 0
      ? preferredIndex
      : findMatchIndexAfterEditorSnapshot(options.searchAnchorSnapshot || findPanelSearchAnchorSelection);
    findIdx = anchorIndex >= 0 ? anchorIndex : 0;
    highlightCurrent();
  } else {
    updateFindMatchCount();
    renderFindMarkerRail();
  }
}

function highlightCurrent() {
  findMatches.forEach((match, index) => match.classList.toggle('current', index === findIdx));
  updateFindMatchCount();
  renderFindMarkerRail();
  const currentMatch = findMatches[findIdx];
  if (currentMatch && !scrollFindMatchToAutoScrollDepth(currentMatch)) {
    currentMatch.scrollIntoView({ block: 'center' });
  }
}

function nextMatch() {
  if (!findMatches.length) return;
  findIdx = (findIdx + 1) % findMatches.length;
  highlightCurrent();
}

function prevMatch() {
  if (!findMatches.length) return;
  findIdx = (findIdx - 1 + findMatches.length) % findMatches.length;
  highlightCurrent();
}

function replacementCountReminderMessage(count) {
  const safeCount = Math.max(0, Number(count) || 0);
  if (!safeCount) return '';
  const copy = typeof text === 'function' ? text() : {};
  if (safeCount === 1) return copy.replaceCountSingle || '1 word replaced';
  const template = copy.replaceCountMany || '{count} words replaced';
  return template.replace('{count}', String(safeCount));
}

function showReplacementCountReminder(count) {
  const message = replacementCountReminderMessage(count);
  if (message && typeof showMiniReminder === 'function') showMiniReminder(message);
}

function queueAdvancedWordEditingLearning(source, replacement, count = 1) {
  const safeSource = String(source || '').trim();
  const safeReplacement = String(replacement || '').trim();
  if (!safeSource || !safeReplacement || safeSource === safeReplacement || !(Number(count) > 0)) return;
  const learn = () => {
    try {
      const task = window.lmAdvancedWordEditing?.learnFromEditorReplacement?.({
        source: safeSource,
        replacement: safeReplacement,
        count: Number(count) || 1
      });
      if (task && typeof task.catch === 'function') task.catch(() => {});
    } catch { /* Dictionary learning must never interrupt Find & Replace. */ }
  };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(learn, { timeout: 1200 });
  else window.setTimeout(learn, 0);
}

function replaceOne() {
  if (!canEditActiveDocument()) return;
  const query = document.getElementById('findInp').value;
  const replacement = document.getElementById('replInp').value;
  if (!query) return;
  const currentMatch = findMatches[findIdx];
  if (!currentMatch) {
    doFind();
    return;
  }

  const matchSnapshot = currentFindMatchSelectionSnapshot();
  const parent = currentMatch.parentNode;
  if (typeof captureEditorHistorySnapshot === 'function') {
    captureEditorHistorySnapshot('replace-one-before', { force: true });
  }
  currentMatch.replaceWith(document.createTextNode(replacement));
  if (parent) parent.normalize();
  const nextMatchAnchor = matchSnapshot
    ? {
      ...matchSnapshot,
      start: matchSnapshot.start + replacement.length,
      end: matchSnapshot.start + replacement.length
    }
    : null;
  findPanelLastReplacementSelection = replacementSelectionSnapshotFromMatchSnapshot(matchSnapshot, replacement);
  doFind({ searchAnchorSnapshot: nextMatchAnchor });
  if (typeof captureEditorHistorySnapshot === 'function') {
    captureEditorHistorySnapshot('replace-one-after', { force: true });
  }
  updateStats();
  showReplacementCountReminder(1);
  queueAdvancedWordEditingLearning(query, replacement, 1);
}

function replaceFindMatchElements(matches, replacement) {
  matches.forEach(match => {
    if (!match?.isConnected) return;
    const parent = match.parentNode;
    match.replaceWith(document.createTextNode(replacement));
    if (parent) parent.normalize();
  });
}

function findReplacementEditSnapshots(matches, replacement) {
  const editor = document.getElementById('editor');
  if (!editor) return [];
  const replacementLength = String(replacement ?? '').length;

  return matches
    .map(match => {
      if (!match?.isConnected || !editor.contains(match)) return null;
      const range = document.createRange();
      range.selectNodeContents(match);
      const snapshot = editorRangeToTextOffsets(range, editor);
      range.detach?.();
      if (!snapshot || !Number.isFinite(snapshot.start) || !Number.isFinite(snapshot.end)) return null;
      return {
        start: snapshot.start,
        end: snapshot.end,
        replacementLength,
        delta: replacementLength - Math.max(0, snapshot.end - snapshot.start)
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.start - second.start || first.end - second.end);
}

function remapTextOffsetAfterReplacementEdits(offset, edits) {
  if (!Number.isFinite(offset) || !Array.isArray(edits) || !edits.length) return offset;
  let shift = 0;

  for (const edit of edits) {
    if (!edit || !Number.isFinite(edit.start) || !Number.isFinite(edit.end)) continue;
    const oldStart = edit.start;
    const oldEnd = Math.max(oldStart, edit.end);
    const replacementLength = Math.max(0, Number(edit.replacementLength) || 0);
    const newStart = oldStart + shift;
    const newEnd = newStart + replacementLength;

    if (offset < oldStart) break;
    if (offset > oldEnd) {
      shift += Number(edit.delta) || 0;
      continue;
    }
    if (offset === oldStart) return newStart;
    if (offset === oldEnd) return newEnd;
    return newStart + Math.min(Math.max(0, offset - oldStart), replacementLength);
  }

  return offset + shift;
}

function remapSelectionSnapshotAfterReplacementEdits(snapshot, edits) {
  if (!snapshot || !Array.isArray(edits) || !edits.length) return snapshot;
  const start = remapTextOffsetAfterReplacementEdits(snapshot.start, edits);
  const end = remapTextOffsetAfterReplacementEdits(snapshot.end, edits);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return snapshot;
  return {
    ...snapshot,
    start: Math.max(0, Math.min(start, end)),
    end: Math.max(0, Math.max(start, end))
  };
}

function remapFindPanelReturnSelectionAfterReplacementEdits(edits) {
  findPanelReturnSelection = remapSelectionSnapshotAfterReplacementEdits(findPanelReturnSelection, edits);
  findPanelSearchAnchorSelection = remapSelectionSnapshotAfterReplacementEdits(findPanelSearchAnchorSelection, edits);
}

function replacementSelectionSnapshotFromEdits(snapshot, edits) {
  if (!snapshot || !Array.isArray(edits) || !edits.length) return null;
  const sourceStart = Number(snapshot.start);
  const sourceEnd = Number(snapshot.end);
  if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceStart === sourceEnd) return null;

  let shift = 0;
  for (const edit of edits) {
    if (!edit || !Number.isFinite(edit.start) || !Number.isFinite(edit.end)) continue;
    const oldStart = edit.start;
    const oldEnd = Math.max(oldStart, edit.end);
    const replacementLength = Math.max(0, Number(edit.replacementLength) || 0);
    const newStart = oldStart + shift;
    const newEnd = newStart + replacementLength;
    if (sourceStart < oldEnd && sourceEnd > oldStart && newEnd > newStart) {
      return {
        ...snapshot,
        start: newStart,
        end: newEnd
      };
    }
    shift += Number(edit.delta) || 0;
  }

  return null;
}

function scopedReplaceAllMatches(query, scope = 'all') {
  if (!findMatches.length && query) doFind();
  if (!findMatches.length) return [];
  const safeScope = normalizeReplaceAllScope(scope);
  if (safeScope === 'all') return [...findMatches];
  const currentIndex = Math.min(Math.max(findIdx, 0), findMatches.length - 1);
  if (safeScope === 'after') return findMatches.slice(currentIndex);
  return findMatches.slice(0, currentIndex);
}

function replaceAll(scope) {
  const selectedScope = scope ?? (
    typeof currentEditorReplaceScope === 'function'
      ? currentEditorReplaceScope()
      : 'all'
  );
  const safeScope = normalizeReplaceAllScope(selectedScope);
  if (scope !== undefined && typeof setEditorReplaceScope === 'function') setEditorReplaceScope(safeScope);
  if (!canEditActiveDocument()) {
    return;
  }
  const query = document.getElementById('findInp').value;
  const replacement = document.getElementById('replInp').value;
  if (!query) {
    return;
  }
  const targetMatches = scopedReplaceAllMatches(query, safeScope);
  if (!targetMatches.length) {
    return;
  }
  if (typeof captureEditorHistorySnapshot === 'function') {
    captureEditorHistorySnapshot('replace-all-before', { force: true });
  }
  const replacementEdits = findReplacementEditSnapshots(targetMatches, replacement);
  const lastReplacementSelection = replacementSelectionSnapshotFromEdits(findPanelReturnSelection, replacementEdits);
  replaceFindMatchElements(targetMatches, replacement);
  remapFindPanelReturnSelectionAfterReplacementEdits(replacementEdits);
  findPanelLastReplacementSelection = lastReplacementSelection;
  syncSavedEditorRangeFromTextOffsets(findPanelReturnSelection);
  if (isReplaceOpen) queueFindCloseFocusAfterReplaceClose();
  doFind({
    searchAnchorSnapshot: findPanelSearchAnchorSelection,
    preferredSnapshot: findPanelReturnSelection
  });
  if (findMatches.length) shouldFocusFindCloseAfterReplaceClose = false;
  if (typeof captureEditorHistorySnapshot === 'function') {
    captureEditorHistorySnapshot('replace-all-after', { force: true });
  }
  updateStats();
  showReplacementCountReminder(targetMatches.length);
  queueAdvancedWordEditingLearning(query, replacement, targetMatches.length);
}

function fillPrompt() {
  const select = document.getElementById('ai-prompt-select');
  if (select.value) {
    document.getElementById('ai-input').value = select.value;
    select.value = '';
    queueCustomSelectSync();
  }
}

const AI_DESK_STORAGE_PREFIX = 'lm_ai_desk_state:';
const AI_NORMAL_BRIDGE_URL = 'http://127.0.0.1:8797/gpt/chat';
const AI_PROVIDER_DEFINITIONS = [
  {
    id: 'openai',
    label: 'ChatGPT / OpenAI',
    shortLabel: 'ChatGPT',
    badge: 'GPT',
    bridgePlaceholder: 'http://localhost:8787/openai/chat'
  },
  {
    id: 'gemini',
    label: 'Gemini / Google AI',
    shortLabel: 'Gemini',
    badge: 'G',
    bridgePlaceholder: 'http://localhost:8787/gemini/chat'
  },
  {
    id: 'claude',
    label: 'Claude / Anthropic',
    shortLabel: 'Claude',
    badge: 'C',
    bridgePlaceholder: 'http://localhost:8787/claude/chat'
  },
  {
    id: 'custom',
    label: 'Custom AI Bridge',
    shortLabel: 'Custom',
    badge: 'AI',
    bridgePlaceholder: 'http://localhost:8787/ai/chat'
  }
];

let aiDeskState = null;
let aiDeskStateKey = '';

function aiProjectStorageId() {
  const folderName = projectDirectoryHandle?.name || localStorage.getItem(PROJECT_FOLDER_KEY) || '';
  const manifestTitle = normalizeProjectManifest(projectManifest || createProjectManifest()).title;
  return uniqueNameKey(folderName || manifestTitle || 'workspace');
}

function aiDeskStorageKey() {
  return `${AI_DESK_STORAGE_PREFIX}${aiProjectStorageId()}`;
}

function aiProviderDefinition(providerId = 'openai') {
  return AI_PROVIDER_DEFINITIONS.find(provider => provider.id === providerId) || AI_PROVIDER_DEFINITIONS[0];
}

function defaultAIAccount(providerId) {
  return {
    providerId,
    connected: false,
    accountName: '',
    authMode: 'bridge',
    bridgeUrl: '',
    token: '',
    connectedAt: null,
    updatedAt: null
  };
}

function normalizeAIAccount(account = {}, providerId = 'openai') {
  const normalizedProviderId = aiProviderDefinition(account.providerId || providerId).id;
  return {
    providerId: normalizedProviderId,
    connected: Boolean(account.connected),
    accountName: String(account.accountName || account.name || '').trim(),
    authMode: ['bridge', 'oauth', 'manual'].includes(account.authMode) ? account.authMode : 'bridge',
    bridgeUrl: String(account.bridgeUrl || account.endpoint || '').trim(),
    token: String(account.token || account.apiKey || '').trim(),
    connectedAt: account.connectedAt || null,
    updatedAt: account.updatedAt || account.connectedAt || null
  };
}

function normalizeAIMessage(message = {}, index = 0) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  return {
    id: String(message.id || `ai-msg-${Date.now()}-${index}`),
    role,
    content: String(message.content || message.message || ''),
    providerId: aiProviderDefinition(message.providerId || 'openai').id,
    createdAt: message.createdAt || new Date().toISOString()
  };
}

function normalizeAINormalMessage(message = {}, index = 0) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  return {
    id: String(message.id || `ai-normal-msg-${Date.now()}-${index}`),
    role,
    content: String(message.content || message.message || ''),
    createdAt: message.createdAt || new Date().toISOString()
  };
}

function normalizeAIThread(thread = {}, index = 0) {
  const providerId = aiProviderDefinition(thread.providerId || 'openai').id;
  const createdAt = thread.createdAt || new Date().toISOString();
  return {
    id: String(thread.id || `ai-thread-${Date.now()}-${index}`),
    providerId,
    title: String(thread.title || text().aiChatUntitled || 'New chat').trim(),
    createdAt,
    updatedAt: thread.updatedAt || createdAt,
    messages: Array.isArray(thread.messages)
      ? thread.messages.map((message, messageIndex) => normalizeAIMessage({ ...message, providerId: message.providerId || providerId }, messageIndex))
      : []
  };
}

function defaultAIDeskState() {
  return {
    activeMode: 'normal',
    activeProviderId: 'openai',
    activeThreadId: '',
    connectionPanelOpen: false,
    manualBoard: '',
    manualBoardUpdatedAt: null,
    normalChatStarted: false,
    normalMessages: [],
    accounts: Object.fromEntries(AI_PROVIDER_DEFINITIONS.map(provider => [provider.id, defaultAIAccount(provider.id)])),
    threads: []
  };
}

function normalizeAIDeskState(rawState = {}) {
  const fallback = defaultAIDeskState();
  const activeProviderId = aiProviderDefinition(rawState.activeProviderId || fallback.activeProviderId).id;
  const rawAccounts = rawState.accounts && typeof rawState.accounts === 'object' ? rawState.accounts : {};
  const accounts = Object.fromEntries(AI_PROVIDER_DEFINITIONS.map(provider => [
    provider.id,
    normalizeAIAccount(rawAccounts[provider.id] || {}, provider.id)
  ]));
  const threads = Array.isArray(rawState.threads)
    ? rawState.threads.map(normalizeAIThread)
    : [];
  const activeThreadId = threads.some(thread => thread.id === rawState.activeThreadId)
    ? rawState.activeThreadId
    : '';

  return {
    activeMode: rawState.activeMode === 'tool' ? 'tool' : fallback.activeMode,
    activeProviderId,
    activeThreadId,
    connectionPanelOpen: Boolean(rawState.connectionPanelOpen),
    manualBoard: String(rawState.manualBoard || ''),
    manualBoardUpdatedAt: rawState.manualBoardUpdatedAt || null,
    normalChatStarted: Boolean(rawState.normalChatStarted),
    normalMessages: Array.isArray(rawState.normalMessages)
      ? rawState.normalMessages.map(normalizeAINormalMessage)
      : [],
    accounts,
    threads
  };
}

function loadAIDeskState() {
  const storageKey = aiDeskStorageKey();
  if (aiDeskState && aiDeskStateKey === storageKey) return aiDeskState;
  aiDeskStateKey = storageKey;
  try {
    aiDeskState = normalizeAIDeskState(JSON.parse(localStorage.getItem(storageKey) || 'null') || {});
  } catch (error) {
    aiDeskState = defaultAIDeskState();
  }
  ensureActiveAIThread(aiDeskState);
  return aiDeskState;
}

function saveAIDeskState() {
  const state = loadAIDeskState();
  localStorage.setItem(aiDeskStorageKey(), JSON.stringify(state));
}

function activeAIProvider(state = loadAIDeskState()) {
  return aiProviderDefinition(state.activeProviderId);
}

function activeAIAccount(state = loadAIDeskState()) {
  const provider = activeAIProvider(state);
  state.accounts[provider.id] = normalizeAIAccount(state.accounts[provider.id], provider.id);
  return state.accounts[provider.id];
}

function activeAIMode(state = loadAIDeskState()) {
  return state.activeMode === 'tool' ? 'tool' : 'normal';
}

function ensureActiveAIThread(state = loadAIDeskState()) {
  const provider = activeAIProvider(state);
  let thread = state.threads.find(item => item.id === state.activeThreadId && item.providerId === provider.id);
  if (thread) return thread;

  thread = state.threads
    .filter(item => item.providerId === provider.id)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))[0];
  if (thread) {
    state.activeThreadId = thread.id;
    return thread;
  }

  thread = normalizeAIThread({
    id: `ai-thread-${Date.now()}`,
    providerId: provider.id,
    title: text().aiChatUntitled || 'New chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  });
  state.threads.unshift(thread);
  state.activeThreadId = thread.id;
  return thread;
}

function aiThreadTitleFromMessage(message) {
  const cleaned = String(message || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return text().aiChatUntitled || 'New chat';
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}...` : cleaned;
}

function aiThreadLabel(thread) {
  const date = new Date(thread.updatedAt || thread.createdAt);
  const timeLabel = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(text().locale, { month: 'short', day: 'numeric' });
  return `${thread.title || text().aiChatUntitled}${timeLabel ? ` - ${timeLabel}` : ''}`;
}

function aiMessageHtml(message) {
  const provider = aiProviderDefinition(message.providerId);
  const roleLabel = message.role === 'user' ? 'You' : provider.shortLabel;
  return `
    <div class="ai-msg ai-${message.role === 'user' ? 'user' : 'bot'}">
      <div class="ai-msg-meta">${escapeHtml(roleLabel)}</div>
      <div class="ai-msg-text">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>
    </div>`;
}

function aiNormalMessageHtml(message) {
  const roleLabel = message.role === 'user' ? 'You' : 'ChatGPT';
  return `
    <div class="ai-msg ai-${message.role === 'user' ? 'user' : 'bot'}">
      <div class="ai-msg-meta">${escapeHtml(roleLabel)}</div>
      <div class="ai-msg-text">${escapeHtml(message.content).replace(/\n/g, '<br>')}</div>
    </div>`;
}

function renderAINormalMessages(state = loadAIDeskState()) {
  const messages = document.getElementById('ai-normal-messages');
  if (!messages) return;
  if (!state.normalMessages.length) {
    messages.innerHTML = `
      <div class="ai-msg ai-bot">
        <div class="ai-msg-meta">ChatGPT</div>
        <div class="ai-msg-text">${escapeHtml(text().aiNormalIntro || 'Send a message to the local ChatGPT app bridge.')}</div>
      </div>`;
    scrollAINormal();
    return;
  }
  messages.innerHTML = state.normalMessages.map(aiNormalMessageHtml).join('');
  scrollAINormal();
}

function renderAIModeShell(state = loadAIDeskState()) {
  const mode = activeAIMode(state);
  const panel = document.getElementById('ai-panel');
  const normalPanel = document.getElementById('ai-normal-mode-panel');
  const toolPanel = document.getElementById('ai-tool-mode-panel');
  const normalButton = document.getElementById('aiNormalModeBtn');
  const toolButton = document.getElementById('aiToolModeBtn');
  const manualInput = document.getElementById('ai-manual-board-input');

  if (panel) panel.dataset.aiMode = mode;
  if (normalPanel) normalPanel.hidden = mode !== 'normal';
  if (toolPanel) toolPanel.hidden = mode !== 'tool';
  if (normalButton) {
    normalButton.classList.toggle('is-active', mode === 'normal');
    normalButton.setAttribute('aria-selected', String(mode === 'normal'));
  }
  if (toolButton) {
    toolButton.classList.toggle('is-active', mode === 'tool');
    toolButton.setAttribute('aria-selected', String(mode === 'tool'));
  }
  if (manualInput && document.activeElement !== manualInput) {
    manualInput.value = state.manualBoard || '';
  }
  renderAINormalMessages(state);
}

function setAIMode(mode) {
  const state = loadAIDeskState();
  state.activeMode = mode === 'tool' ? 'tool' : 'normal';
  saveAIDeskState();
  renderAIDesk();
  if (state.activeMode === 'normal') {
    requestAnimationFrame(() => document.getElementById('ai-manual-board-input')?.focus());
  }
}

function saveAIManualBoard() {
  const state = loadAIDeskState();
  const manualInput = document.getElementById('ai-manual-board-input');
  state.manualBoard = manualInput?.value || '';
  state.manualBoardUpdatedAt = new Date().toISOString();
  saveAIDeskState();
  renderAIModeShell(state);
  showSidePanelSaveLine(text().aiManualBoardSaved || 'AI board saved');
}

function addAINormalMessage(message, role) {
  const state = loadAIDeskState();
  const timestamp = new Date().toISOString();
  state.normalMessages.push(normalizeAINormalMessage({
    id: `ai-normal-msg-${Date.now()}`,
    role,
    content: message,
    createdAt: timestamp
  }, state.normalMessages.length));
  saveAIDeskState();
  renderAINormalMessages(state);
}

function setAINormalThinking(visible = true) {
  const messages = document.getElementById('ai-normal-messages');
  if (!messages) return;
  document.getElementById('aiNormalThinkingMessage')?.remove();
  if (!visible) return;
  const div = document.createElement('div');
  div.id = 'aiNormalThinkingMessage';
  div.className = 'ai-msg ai-bot ai-typing';
  div.setAttribute('aria-label', text().aiNormalThinking || text().aiThinking || 'Thinking...');
  div.innerHTML = '<span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>';
  messages.appendChild(div);
  scrollAINormal();
}

function normalizeAINormalReplyPayload(payload) {
  const reply = normalizeAIReplyPayload(payload);
  if (reply) return reply;
  if (payload && typeof payload.error === 'string') return payload.error;
  return '';
}

async function requestAINormalReply(message, options = {}) {
  const response = await fetch(AI_NORMAL_BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      newChat: Boolean(options.newChat),
      story: typeof aiActiveStoryContext === 'function' ? aiActiveStoryContext() : null
    })
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const errorMessage = normalizeAINormalReplyPayload(payload) || text().aiNormalBridgeFailed || 'ChatGPT bridge request failed.';
    throw new Error(errorMessage);
  }
  return normalizeAINormalReplyPayload(payload) || text().aiNormalBridgeFailed || 'ChatGPT bridge returned an empty response.';
}

async function sendAINormalMessage() {
  const input = document.getElementById('ai-manual-board-input');
  const sendButton = document.getElementById('aiNormalSendBtn');
  if (!input) return;
  const message = input.value.trim();
  if (!message) return;
  const shouldOpenNewChat = !loadAIDeskState().normalChatStarted;

  addAINormalMessage(message, 'user');
  const state = loadAIDeskState();
  state.manualBoard = '';
  state.manualBoardUpdatedAt = new Date().toISOString();
  saveAIDeskState();
  input.value = '';
  input.disabled = true;
  sendButton?.setAttribute('disabled', 'disabled');
  setAINormalThinking(true);

  try {
    const reply = await requestAINormalReply(message, { newChat: shouldOpenNewChat });
    setAINormalThinking(false);
    const successState = loadAIDeskState();
    successState.normalChatStarted = true;
    saveAIDeskState();
    addAINormalMessage(reply, 'assistant');
  } catch (error) {
    console.warn('Normal AI bridge failed:', error);
    setAINormalThinking(false);
    addAINormalMessage(error?.message || text().aiNormalBridgeFailed || 'ChatGPT bridge request failed.', 'assistant');
  } finally {
    input.disabled = false;
    sendButton?.removeAttribute('disabled');
    requestAnimationFrame(() => input.focus());
  }
}

function handleAINormalInputKey(event) {
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  sendAINormalMessage();
}

function renderAIProviderOptions(state = loadAIDeskState()) {
  const select = document.getElementById('ai-provider-select');
  if (!select) return;
  select.innerHTML = AI_PROVIDER_DEFINITIONS
    .map(provider => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.label)}</option>`)
    .join('');
  select.value = activeAIProvider(state).id;
}

let aiConnectionPanelPositionFrame = null;

function aiConnectionPanelPositionConfig() {
  const fallback = {
    gap: 12,
    topOffset: -4,
    leftOffset: 0,
    rightOffset: 0,
    panelWidth: 360,
    viewportPadding: 12
  };
  return window.lmFloatingPanelPositionConfig?.('aiConnectionPanel', fallback) || fallback;
}

function positionAIConnectionPanel() {
  aiConnectionPanelPositionFrame = null;
  const panel = document.getElementById('ai-connection-panel');
  const anchor = document.getElementById('aiConnectionToggle');
  if (!panel || panel.hidden || !anchor) return;

  const config = aiConnectionPanelPositionConfig();
  const numberValue = window.lmPanelNumber || ((value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  });
  const viewportPadding = numberValue(config.viewportPadding, 12);
  const gap = numberValue(config.gap, 12);
  const leftOffset = numberValue(config.leftOffset, 0);
  const rightOffset = numberValue(config.rightOffset, 0);
  const topOffset = numberValue(config.topOffset, -4);
  const panelWidth = Math.min(numberValue(config.panelWidth, 360), Math.max(180, window.innerWidth - viewportPadding * 2));
  const anchorRect = anchor.getBoundingClientRect();

  panel.style.width = `${Math.round(panelWidth)}px`;
  panel.style.maxHeight = `${Math.max(160, Math.round(window.innerHeight - viewportPadding * 2))}px`;

  const panelHeight = Math.min(
    panel.offsetHeight || panel.getBoundingClientRect().height || 320,
    Math.max(160, window.innerHeight - viewportPadding * 2)
  );
  let left = anchorRect.right + gap + leftOffset - rightOffset;
  if (left + panelWidth > window.innerWidth - viewportPadding) {
    left = anchorRect.left - panelWidth - gap + leftOffset - rightOffset;
  }
  left = Math.max(viewportPadding, Math.min(left, window.innerWidth - panelWidth - viewportPadding));

  const maxTop = Math.max(viewportPadding, window.innerHeight - panelHeight - viewportPadding);
  const top = Math.max(viewportPadding, Math.min(anchorRect.top + topOffset, maxTop));
  panel.style.inset = `${Math.round(top)}px auto auto ${Math.round(left)}px`;
}

function scheduleAIConnectionPanelPosition() {
  const panel = document.getElementById('ai-connection-panel');
  if (!panel || panel.hidden || aiConnectionPanelPositionFrame) return;
  aiConnectionPanelPositionFrame = requestAnimationFrame(positionAIConnectionPanel);
}

function renderAIConnectionPanel(state = loadAIDeskState()) {
  const provider = activeAIProvider(state);
  const account = activeAIAccount(state);
  const summary = document.getElementById('ai-account-summary');
  const panel = document.getElementById('ai-connection-panel');
  const toggle = document.getElementById('aiConnectionToggle');
  const accountInput = document.getElementById('ai-account-name');
  const authModeSelect = document.getElementById('ai-auth-mode');
  const bridgeInput = document.getElementById('ai-bridge-url');
  const tokenInput = document.getElementById('ai-api-token');

  if (summary) {
    const statusText = account.connected
      ? `${text().aiConnectedAs}: ${account.accountName || provider.label}`
      : text().aiNotConnected;
    summary.innerHTML = `
      <span class="ai-provider-badge">${escapeHtml(provider.badge)}</span>
      <span>${escapeHtml(statusText)}</span>`;
    summary.classList.toggle('is-connected', account.connected);
  }

  if (toggle) {
    toggle.textContent = account.connected ? text().aiAccountName : text().aiConnect;
    toggle.setAttribute('aria-expanded', String(state.connectionPanelOpen));
  }
  if (panel) {
    panel.hidden = !state.connectionPanelOpen;
    if (state.connectionPanelOpen) scheduleAIConnectionPanelPosition();
  }
  if (accountInput) accountInput.value = account.accountName || '';
  if (authModeSelect) authModeSelect.value = account.authMode || 'bridge';
  if (bridgeInput) {
    bridgeInput.value = account.bridgeUrl || '';
    bridgeInput.placeholder = provider.bridgePlaceholder;
  }
  if (tokenInput) {
    tokenInput.value = '';
    tokenInput.placeholder = account.token ? 'Saved locally - enter a new value to replace' : 'Optional, stored locally';
  }
}

function renderAIThreadSelect(state = loadAIDeskState()) {
  const select = document.getElementById('ai-thread-select');
  if (!select) return;
  const activeThread = ensureActiveAIThread(state);
  const providerId = activeAIProvider(state).id;
  const threads = state.threads
    .filter(thread => thread.providerId === providerId)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  select.innerHTML = threads
    .map(thread => `<option value="${escapeHtml(thread.id)}">${escapeHtml(aiThreadLabel(thread))}</option>`)
    .join('');
  select.value = activeThread.id;
}

function renderAIMessages(state = loadAIDeskState()) {
  const messages = document.getElementById('ai-messages');
  if (!messages) return;
  const thread = ensureActiveAIThread(state);
  if (!thread.messages.length) {
    messages.innerHTML = `
      <div class="ai-msg ai-bot lm-id-aiIntro" id="aiIntro">
        <div class="ai-msg-meta">${escapeHtml(activeAIProvider(state).shortLabel)}</div>
        <div class="ai-msg-text">${escapeHtml(text().aiIntro)}</div>
      </div>`;
    scrollAI();
    return;
  }
  messages.innerHTML = thread.messages.map(aiMessageHtml).join('');
  scrollAI();
}

function renderAIDesk() {
  const state = loadAIDeskState();
  ensureActiveAIThread(state);
  renderAIModeShell(state);
  renderAIProviderOptions(state);
  renderAIConnectionPanel(state);
  renderAIThreadSelect(state);
  renderAIMessages(state);
  queueCustomSelectSync();
}

function selectAIProvider(providerId) {
  const state = loadAIDeskState();
  state.activeProviderId = aiProviderDefinition(providerId).id;
  ensureActiveAIThread(state);
  saveAIDeskState();
  renderAIDesk();
}

function toggleAIConnectionPanel() {
  const state = loadAIDeskState();
  state.connectionPanelOpen = !state.connectionPanelOpen;
  saveAIDeskState();
  renderAIConnectionPanel(state);
  queueCustomSelectSync();
}

window.addEventListener('resize', scheduleAIConnectionPanelPosition);
window.addEventListener('scroll', scheduleAIConnectionPanelPosition, { capture: true, passive: true });

function saveAIConnection() {
  const state = loadAIDeskState();
  const provider = activeAIProvider(state);
  const existingAccount = activeAIAccount(state);
  const accountName = document.getElementById('ai-account-name')?.value.trim() || provider.label;
  const authMode = document.getElementById('ai-auth-mode')?.value || 'bridge';
  const bridgeUrl = document.getElementById('ai-bridge-url')?.value.trim() || '';
  const tokenValue = document.getElementById('ai-api-token')?.value.trim() || existingAccount.token || '';
  const timestamp = new Date().toISOString();

  state.accounts[provider.id] = normalizeAIAccount({
    providerId: provider.id,
    connected: true,
    accountName,
    authMode,
    bridgeUrl,
    token: tokenValue,
    connectedAt: existingAccount.connectedAt || timestamp,
    updatedAt: timestamp
  }, provider.id);
  state.connectionPanelOpen = false;
  saveAIDeskState();
  renderAIDesk();
  showSidePanelSaveLine(text().aiConnectionSaved);
}

function disconnectAIProvider() {
  const state = loadAIDeskState();
  const provider = activeAIProvider(state);
  state.accounts[provider.id] = defaultAIAccount(provider.id);
  state.connectionPanelOpen = false;
  saveAIDeskState();
  renderAIDesk();
  showSidePanelSaveLine(text().aiDisconnected);
}

function createAIThread() {
  const state = loadAIDeskState();
  const provider = activeAIProvider(state);
  const thread = normalizeAIThread({
    id: `ai-thread-${Date.now()}`,
    providerId: provider.id,
    title: text().aiChatUntitled || 'New chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: []
  });
  state.threads.unshift(thread);
  state.activeThreadId = thread.id;
  saveAIDeskState();
  renderAIDesk();
  requestAnimationFrame(() => document.getElementById('ai-input')?.focus());
}

function selectAIThread(threadId) {
  const state = loadAIDeskState();
  if (state.threads.some(thread => thread.id === threadId)) {
    state.activeThreadId = threadId;
    saveAIDeskState();
    renderAIDesk();
  }
}

function deleteActiveAIThread() {
  const state = loadAIDeskState();
  const thread = ensureActiveAIThread(state);
  state.threads = state.threads.filter(item => item.id !== thread.id);
  state.activeThreadId = '';
  ensureActiveAIThread(state);
  saveAIDeskState();
  renderAIDesk();
  showSidePanelSaveLine(text().aiChatDeleted);
}

function openAIAgentsDashboard() {
  window.open('ai-agents.html', '_blank');
}

function aiActiveStoryContext() {
  const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
  const activeDocument = activeEditorDocument?.() || {};
  const activeText = typeof getCleanEditorText === 'function' ? getCleanEditorText() : '';
  const namesSummary = Array.isArray(typeof namingData !== 'undefined' && namingData?.entries)
    ? namingData.entries.slice(0, 30).map(e => ({ name: e.name, category: e.categoryId, info: e.info || '' }))
    : [];
  const factsSummary = Array.isArray(typeof storyFacts !== 'undefined' && storyFacts)
    ? storyFacts.slice(0, 30).map(f => ({ text: f.text || f.title || '', pinned: Boolean(f.pinned) }))
    : [];

  return {
    storyTitle: manifest.title,
    storyType: manifest.type,
    language: manifest.language,
    activeDocumentTitle: typeof activeEditorDisplayTitle === 'function' ? activeEditorDisplayTitle() : activeDocument.title || '',
    activeDocumentMode: activeEditorMode,
    activeDocumentText: activeText.length > 6000 ? activeText.slice(-6000) : activeText,
    namingEntries: namesSummary,
    storyFacts: factsSummary
  };
}

function normalizeAIReplyPayload(payload) {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.reply === 'string') return payload.reply;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.content === 'string') return payload.content;
  if (typeof payload.output === 'string') return payload.output;
  const openAIReply = payload.choices?.[0]?.message?.content;
  if (typeof openAIReply === 'string') return openAIReply;
  const geminiParts = payload.candidates?.[0]?.content?.parts;
  if (Array.isArray(geminiParts)) {
    return geminiParts.map(part => part.text || '').filter(Boolean).join('\n');
  }
  return '';
}

async function requestAIReply(message, state = loadAIDeskState()) {
  const provider = activeAIProvider(state);
  const account = activeAIAccount(state);
  const thread = ensureActiveAIThread(state);
  if (!account.connected) return text().aiUnavailable;
  if (!account.bridgeUrl) {
    return account.authMode === 'manual'
      ? text().aiManualMode
      : text().aiNoBridge;
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Lekhak-AI-Provider': provider.id
  };
  if (account.token) headers.Authorization = `Bearer ${account.token}`;

  const response = await fetch(account.bridgeUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      provider: provider.id,
      providerLabel: provider.label,
      account: {
        name: account.accountName,
        authMode: account.authMode
      },
      story: aiActiveStoryContext(),
      thread: {
        id: thread.id,
        title: thread.title
      },
      messages: thread.messages.map(item => ({
        role: item.role === 'user' ? 'user' : 'assistant',
        content: item.content
      })),
      input: message
    })
  });

  if (!response.ok) throw new Error(`AI bridge returned ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  return normalizeAIReplyPayload(payload) || text().aiBridgeFailed;
}

function setAIThinking(visible = true) {
  const messages = document.getElementById('ai-messages');
  if (!messages) return;
  document.getElementById('aiThinkingMessage')?.remove();
  if (!visible) return;
  const div = document.createElement('div');
  div.id = 'aiThinkingMessage';
  div.className = 'ai-msg ai-bot ai-typing';
  div.setAttribute('aria-label', text().aiThinking);
  div.innerHTML = '<span class="ai-dot"></span><span class="ai-dot"></span><span class="ai-dot"></span>';
  messages.appendChild(div);
  scrollAI();
}

async function sendAI() {
  const input = document.getElementById('ai-input');
  if (!input) return;
  const message = input.value.trim();
  if (!message) return;
  addAIMsg(message, 'user');
  input.value = '';
  input.disabled = true;
  document.getElementById('ai-send')?.setAttribute('disabled', 'disabled');
  setAIThinking(true);

  try {
    const reply = await requestAIReply(message);
    setAIThinking(false);
    addAIMsg(reply, 'bot');
  } catch (error) {
    console.warn('AI bridge failed:', error);
    setAIThinking(false);
    addAIMsg(text().aiBridgeFailed, 'bot');
  } finally {
    input.disabled = false;
    document.getElementById('ai-send')?.removeAttribute('disabled');
    requestAnimationFrame(() => input.focus());
  }
}

function addAIMsg(message, who) {
  const state = loadAIDeskState();
  const provider = activeAIProvider(state);
  const thread = ensureActiveAIThread(state);
  const role = who === 'user' ? 'user' : 'assistant';
  const timestamp = new Date().toISOString();
  thread.messages.push(normalizeAIMessage({
    id: `ai-msg-${Date.now()}`,
    role,
    content: message,
    providerId: provider.id,
    createdAt: timestamp
  }, thread.messages.length));
  if (role === 'user' && (!thread.title || thread.title === (text().aiChatUntitled || 'New chat'))) {
    thread.title = aiThreadTitleFromMessage(message);
  }
  thread.updatedAt = timestamp;
  saveAIDeskState();
  renderAIThreadSelect(state);
  renderAIMessages(state);
  queueCustomSelectSync();
}

function scrollAI() {
  const messages = document.getElementById('ai-messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function scrollAINormal() {
  const messages = document.getElementById('ai-normal-messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

let focusModeHistoryActive = false;
let suppressNextFocusHistoryPop = false;

function focusModeHistoryState() {
  const currentState = history.state;
  const baseState = currentState && typeof currentState === 'object' && !Array.isArray(currentState)
    ? { ...currentState }
    : {};
  return { ...baseState, lmFocusMode: true };
}

function pushFocusModeHistoryState() {
  if (focusModeHistoryActive) return;
  try {
    history.pushState(focusModeHistoryState(), '', window.location.href);
    focusModeHistoryActive = true;
  } catch (error) {
    focusModeHistoryActive = false;
  }
}

function releaseFocusModeHistoryEntry() {
  if (!focusModeHistoryActive || suppressNextFocusHistoryPop) return;
  suppressNextFocusHistoryPop = true;
  focusModeHistoryActive = false;
  try {
    history.back();
  } catch (error) {
    suppressNextFocusHistoryPop = false;
  }
  setTimeout(() => {
    suppressNextFocusHistoryPop = false;
  }, 400);
}

window.addEventListener('popstate', () => {
  if (suppressNextFocusHistoryPop) {
    suppressNextFocusHistoryPop = false;
    return;
  }
  if (!isFocus || !focusModeHistoryActive) {
    focusModeHistoryActive = false;
    return;
  }
  focusModeHistoryActive = false;
  toggleFocus({ fromHistory: true });
});

function toggleFocus(options = {}) {
  if (!options.fromHistory && isFocus && typeof navigateOutOfStandaloneFocusEditor === 'function' && navigateOutOfStandaloneFocusEditor()) {
    return;
  }
  const nextFocus = !isFocus;
  if (nextFocus) pushFocusModeHistoryState();
  else if (!options.fromHistory) releaseFocusModeHistoryEntry();
  isFocus = nextFocus;
  const editor = document.getElementById('editor');
  document.body.classList.toggle('focus-mode', isFocus);
  document.getElementById('focBtn')?.classList.toggle('active', isFocus);
  syncFocusScrollStatsBaseline(editor);
  hideFocusScrollStats();
  syncFocusSaveStatusIndicator();
  if (isFocus) {
    setFocusEditorWidthPercent(storedFocusEditorWidthPercent(), { persist: false });
    setFindPanel(false);
    setToolDock(false);
    editor?.focus();
    updateStats();
    syncFocusSaveStatusIndicator();
  } else {
    if (typeof clearFocusWidthControlTransientState === 'function') {
      clearFocusWidthControlTransientState();
    } else {
      document.body.classList.remove(
        'is-focus-editor-active',
        'is-focus-editor-active-idle',
        'is-focus-editor-pointer-inside',
        'is-focus-center-panel-pointer-inside'
      );
    }
    if (typeof hideFocusNamingCategoryPanel === 'function') hideFocusNamingCategoryPanel();
    if (typeof hideFocusChapterContextPanel === 'function') hideFocusChapterContextPanel();
    if (typeof hideFocusFactsPanel === 'function') hideFocusFactsPanel();
    if (typeof hideFocusTopControls === 'function') hideFocusTopControls();
    if (typeof restoreDraftDetailsPanelHomePosition === 'function') restoreDraftDetailsPanelHomePosition();
    if (typeof restoreNamingEntryPanelHome === 'function') restoreNamingEntryPanelHome();
    if (typeof restoreFactComposerPanelHome === 'function') restoreFactComposerPanelHome();
  }
  if (typeof scheduleEditorAutoScrollDepthMarkerReposition === 'function') {
    scheduleEditorAutoScrollDepthMarkerReposition();
  } else if (typeof positionEditorAutoScrollDepthMarker === 'function') {
    requestAnimationFrame(positionEditorAutoScrollDepthMarker);
  }
}
