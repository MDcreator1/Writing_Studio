'use strict';

let textImportState = null;

function ensureTextImportModal() {
  let modal = document.getElementById('textImportModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'textImportModal';
  modal.className = 'text-import-modal lm-id-textImportModal';
  modal.hidden = true;
  modal.addEventListener('click', event => {
    if (event.target === modal) closeTextImportPanel();
  });
  document.body.appendChild(modal);
  return modal;
}

function textImportWordCount(value = '') {
  return typeof countWordsFromText === 'function'
    ? countWordsFromText(String(value || ''))
    : String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

function textImportDefaultTitle() {
  const fileTitle = String(textImportState?.fileName || '').replace(/\.(?:txt|text|md|docx|doc)$/i, '').trim();
  return fileTitle || `Imported ${text()?.draftPrefix || 'Draft'}`;
}

function renderTextImportPanel() {
  const modal = ensureTextImportModal();
  const state = textImportState || { mode: '', value: '', fileName: '', error: '', loading: false };
  const hasMode = Boolean(state.mode);
  const words = textImportWordCount(state.value);
  const paragraphs = String(state.value || '').split(/\n+/).filter(value => value.trim()).length;
  modal.innerHTML = `
    <section class="text-import-panel" role="dialog" aria-modal="true" aria-labelledby="textImportTitle">
      <header class="text-import-head">
        <div>
          <p class="text-import-kicker">Draft Import</p>
          <h2 id="textImportTitle">Import your text</h2>
          <p>Paste writing directly or choose a text/Word file. Nothing is saved until you select an import action.</p>
        </div>
        <button class="text-import-close" type="button" onclick="closeTextImportPanel()" aria-label="Close">×</button>
      </header>
      <div class="text-import-body">
        <div class="text-import-options ${hasMode ? 'has-mode' : ''}">
          <button class="text-import-option ${state.mode === 'paste' ? 'is-active' : ''}" type="button" onclick="selectTextImportMode('paste')">
            <span class="text-import-option-icon">✎</span>
            <strong>Paste text</strong>
            <small>Paste or type content, then review it before importing.</small>
          </button>
          <button class="text-import-option ${state.mode === 'file' ? 'is-active' : ''}" type="button" onclick="selectTextImportMode('file')">
            <span class="text-import-option-icon">⇩</span>
            <strong>${state.loading ? 'Reading file…' : 'Import file'}</strong>
            <small>Choose a .txt, .md or .docx document from this device.</small>
          </button>
        </div>
        <div class="text-import-workspace" ${hasMode ? '' : 'hidden'}>
          <div class="text-import-meta">
            <span>${state.fileName ? escapeHtml(state.fileName) : 'Imported text preview'}</span>
            <span>${words} words · ${paragraphs} paragraphs</span>
          </div>
          <textarea id="textImportPreview" class="text-import-preview" placeholder="Paste your text here…" oninput="updateTextImportPreview(this.value)">${escapeHtml(state.value)}</textarea>
          ${state.error ? `<p class="text-import-error">${escapeHtml(state.error)}</p>` : ''}
        </div>
      </div>
      ${hasMode ? `<footer class="text-import-footer">
        <button type="button" onclick="runRawTextImport()" ${state.value.trim() && !state.loading ? '' : 'disabled'}>Raw Import</button>
        <button class="is-primary" type="button" onclick="runAdvancedTextImport()" ${state.value.trim() && !state.loading ? '' : 'disabled'}>Advanced Import</button>
      </footer>` : ''}
      <input id="textImportFileInput" type="file" accept=".txt,.text,.md,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onchange="handleTextImportFile(this.files?.[0])">
    </section>`;
  modal.hidden = false;
  document.body.classList.add('is-text-import-open');
}

function openTextImportPanel() {
  if (typeof hasActiveStory === 'function' && !hasActiveStory()) return;
  textImportState = { mode: '', value: '', fileName: '', error: '', loading: false };
  renderTextImportPanel();
}

function closeTextImportPanel() {
  const modal = document.getElementById('textImportModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('is-text-import-open');
  textImportState = null;
}

function selectTextImportMode(mode) {
  if (!textImportState) return;
  if (mode === 'file') {
    document.getElementById('textImportFileInput')?.click();
    return;
  }
  textImportState.mode = 'paste';
  textImportState.error = '';
  renderTextImportPanel();
  requestAnimationFrame(() => document.getElementById('textImportPreview')?.focus());
}

function updateTextImportPreview(value) {
  if (!textImportState) return;
  textImportState.value = String(value || '').replace(/\r\n?/g, '\n');
  textImportState.error = '';
  const workspace = document.querySelector('.text-import-workspace');
  const metrics = workspace?.querySelector('.text-import-meta span:last-child');
  const paragraphs = textImportState.value.split(/\n+/).filter(item => item.trim()).length;
  if (metrics) metrics.textContent = `${textImportWordCount(textImportState.value)} words · ${paragraphs} paragraphs`;
  document.querySelectorAll('.text-import-footer button').forEach(button => { button.disabled = !textImportState.value.trim(); });
}

function textImportFindZipEntry(bytes, targetName) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65558); offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const directoryOffset = view.getUint32(offset + 16, true);
    const entryCount = view.getUint16(offset + 10, true);
    let cursor = directoryOffset;
    for (let index = 0; index < entryCount && cursor + 46 <= bytes.length; index += 1) {
      if (view.getUint32(cursor, true) !== 0x02014b50) break;
      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = new TextDecoder().decode(bytes.slice(cursor + 46, cursor + 46 + nameLength));
      if (name === targetName) {
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
        return { method, data: bytes.slice(dataOffset, dataOffset + compressedSize) };
      }
      cursor += 46 + nameLength + extraLength + commentLength;
    }
    break;
  }
  return null;
}

async function textImportInflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot open compressed Word files.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function textImportReadDocx(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entry = textImportFindZipEntry(bytes, 'word/document.xml');
  if (!entry) throw new Error('This Word document does not contain readable document text.');
  const xmlBytes = entry.method === 0 ? entry.data : entry.method === 8 ? await textImportInflateRaw(entry.data) : null;
  if (!xmlBytes) throw new Error('This Word document uses an unsupported compression format.');
  const xml = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(xmlBytes), 'application/xml');
  const paragraphs = Array.from(xml.getElementsByTagNameNS('*', 'p')).map(paragraph => {
    let value = '';
    paragraph.querySelectorAll('*').forEach(node => {
      if (node.localName === 't') value += node.textContent || '';
      else if (node.localName === 'tab') value += '\t';
      else if (node.localName === 'br' || node.localName === 'cr') value += '\n';
    });
    return value.trimEnd();
  });
  return paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function handleTextImportFile(file) {
  if (!file || !textImportState) return;
  if (textImportState.loading) return;
  textImportState.loading = true;
  try {
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (extension === 'doc') throw new Error('Old .doc files are not supported yet. Save it as .docx or .txt and try again.');
    const importedValue = extension === 'docx' ? await textImportReadDocx(file) : await file.text();
    if (!importedValue.trim()) throw new Error('No readable text was found in this file.');
    textImportState.mode = 'file';
    textImportState.value = importedValue.replace(/\r\n?/g, '\n');
    textImportState.fileName = file.name || '';
    textImportState.error = '';
  } catch (error) {
    if (typeof showMiniReminder === 'function') {
      showMiniReminder(error?.message || 'The selected file could not be read.');
    } else {
      console.warn('Text import file rejected:', error);
    }
  } finally {
    textImportState.loading = false;
    if (textImportState.mode === 'file') {
      renderTextImportPanel();
      requestAnimationFrame(() => document.getElementById('textImportPreview')?.focus());
    }
  }
}

async function createTextImportDraft() {
  if (!textImportState?.value.trim()) return -1;
  chapterDrafts = normalizeDrafts(chapterDrafts);
  const index = chapterDrafts.length;
  const sourceText = textImportState.value.replace(/\r\n?/g, '\n').trimEnd();
  const draft = normalizeDraft({
    ...createDefaultDraft(index),
    title: textImportDefaultTitle(),
    content: textToEditorHTML(sourceText),
    contentPath: nextDraftFilePath(),
    _wordCount: textImportWordCount(sourceText),
    wordCount: textImportWordCount(sourceText)
  }, index);
  chapterDrafts.push(draft);
  saveToStorage(false);
  renderChapters();
  setDraftBoxSaveIndicator('busy');
  if (projectDirectoryHandle) {
    try {
      await writeDraftToLocalFile(index, sourceText);
      setDraftBoxSaveIndicator('saved');
    } catch (error) {
      console.warn('Imported draft save failed:', error);
      if (chapterDrafts[index] === draft) chapterDrafts.splice(index, 1);
      saveToStorage(false);
      renderChapters();
      setDraftBoxSaveIndicator('idle');
      throw error;
    }
  } else {
    setDraftBoxSaveIndicator('saved');
  }
  return index;
}

async function runRawTextImport() {
  if (textImportState?.loading) return;
  try {
    const index = await createTextImportDraft();
    if (index < 0) return;
    closeTextImportPanel();
    await switchDraft(index);
  } catch (error) {
    if (textImportState) {
      textImportState.error = error?.message || 'The imported draft could not be saved.';
      renderTextImportPanel();
    }
  }
}

async function runAdvancedTextImport() {
  if (textImportState?.loading || !textImportState?.value.trim()) return;
  const sourceText = textImportState.value.replace(/\r\n?/g, '\n').trimEnd();
  const sourceTitle = textImportDefaultTitle();
  closeTextImportPanel();
  openAdvancedTextImportPanel(sourceText, sourceTitle);
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && textImportState) closeTextImportPanel();
});
