const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const settingsSource = fs.readFileSync(path.join(root, 'assets/shared/js/05aa-advanced-import-promote-settings.js'), 'utf8');
const promoteSource = fs.readFileSync(path.join(root, 'assets/pages/story-novel-project-editor/js/05-advanced-draft-promote.js'), 'utf8');
const importSplittingSource = fs.readFileSync(path.join(root, 'assets/pages/story-novel-project-editor/js/05a-advanced-import-splitting.js'), 'utf8');
const importCssSource = fs.readFileSync(path.join(root, 'assets/pages/story-novel-project-editor/css/05-text-import.css'), 'utf8');
const customSelectSource = fs.readFileSync(path.join(root, 'assets/shared/js/06d-editor-paste-settings.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'story-novel-project-editor.html'), 'utf8');
const values = new Map();
const localStorage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); }
};
const document = {};
const window = { localStorage, lmEditorAdvancedNumber: (_, fallback) => fallback };
window.window = window;
vm.runInNewContext(settingsSource, { window, localStorage, console, document, Event: class Event { constructor(type) { this.type = type; } } });

const api = window.LmAdvancedImportPromoteSettings;
assert(api, 'workflow settings API should be available');
assert.strictEqual(api.read().importTarget, 'drafts');
assert.strictEqual(api.read().importSplitMode, 'auto');
assert.strictEqual(api.read().promoteAutoOpenAboveLimit, true);
assert.strictEqual(api.read().importFontSize, 14, 'Import panel should have its own text-size default');
assert.strictEqual(api.read().promoteFontSize, 14, 'Promote panel should have its own text-size default');
assert.strictEqual(api.read().importDraftPrefix, 'I Draft');
assert.strictEqual(api.read().importChapterPrefix, 'I Chapter');
assert.strictEqual(api.read().promoteChapterPrefix, 'I Chapter');
assert.strictEqual(api.promoteDocumentTitle(1), 'I Chapter 2');
assert.strictEqual(api.importDocumentTitle('drafts', 0), 'I Draft 1');
assert.strictEqual(api.importDocumentTitle('chapters', 7), 'I Chapter 8');
localStorage.setItem('lm_advanced_import_promote_settings_v1', JSON.stringify({ importWordCount: 3000 }));
assert.strictEqual(api.read().importDraftPrefix, 'I Draft', 'older saved settings receive the new naming defaults');
localStorage.setItem('lm_advanced_import_promote_settings_v1', JSON.stringify({ importDraftPrefix: '  नया   ड्राफ्ट  ', importChapterPrefix: '' }));
assert.strictEqual(api.importDocumentTitle('drafts', 2), 'नया ड्राफ्ट 3', 'prefix whitespace is normalized and numbering stays automatic');
assert.strictEqual(api.importDocumentTitle('chapters', 0), 'I Chapter 1', 'blank prefixes fall back to the default');
localStorage.removeItem('lm_advanced_import_promote_settings_v1');

const titleContext = { window };
vm.createContext(titleContext);
vm.runInContext(promoteSource.slice(promoteSource.indexOf('function advancedPromoteDefaultTitle('), promoteSource.indexOf('function advancedPromoteUniqueChapterTitle(')), titleContext);
assert.strictEqual(titleContext.advancedImportDocumentTitle({ draftTitle: 'Imported Draft', importTarget: 'drafts' }, 0), 'I Draft 1', 'source filenames are not prepended to generated draft names');
assert.strictEqual(titleContext.advancedImportDocumentTitle({ draftTitle: 'My Novel', importTarget: 'chapters', importChapterPrefix: 'अध्याय' }, 3), 'अध्याय 4');
assert.strictEqual(titleContext.advancedImportDocumentTitle({ importTarget: 'chapters', importDraftPrefix: 'बाकी ड्राफ्ट' }, 0, 'drafts'), 'बाकी ड्राफ्ट 1', 'remainder drafts use the draft prefix');
assert.strictEqual(titleContext.advancedPromoteGeneratedTitle({ mode: 'draft', draftTitle: 'Original draft', promoteChapterPrefix: 'भाग' }, 2), 'भाग 3');

Object.assign(titleContext, {
  clampNumber: (value, min, max) => Math.max(min, Math.min(max, value)),
  advancedPromoteNormalizedText: value => String(value || '').trim(),
  advancedPromoteWordCount: value => String(value || '').trim().split(/\s+/).filter(Boolean).length,
  advancedPromoteFixSplitForChapter: (value, limit) => {
    const words = value.split(/\s+/);
    return [words.slice(0, limit).join(' '), words.slice(limit).join(' ')];
  },
  advancedPromoteLastSentence: () => ''
});
vm.runInContext(promoteSource.slice(promoteSource.indexOf('function advancedPromoteGenerateChapters('), promoteSource.indexOf('function advancedImportUsesRawMode(')), titleContext);
const promoteSample = Array.from({ length: 220 }, (_, index) => `word${index}`).join(' ');
const defaultPromotion = titleContext.advancedPromoteGenerateChapters(promoteSample, { wordLimit: 100, chapterCount: 2 });
assert.strictEqual(defaultPromotion.chapters[0].title, 'I Chapter 1');
assert.strictEqual(defaultPromotion.chapters[1].title, 'I Chapter 2');
const customPromotion = titleContext.advancedPromoteGenerateChapters(promoteSample, { wordLimit: 100, chapterCount: 2, titleBase: 'अध्याय' });
assert.strictEqual(customPromotion.chapters[0].title, 'अध्याय 1');
assert.strictEqual(customPromotion.chapters[1].title, 'अध्याय 2');

localStorage.setItem('lm_advanced_promote_conclusion_v1:default', 'पुराना साझा conclusion');
assert.strictEqual(api.readPermanentConclusion('import'), 'पुराना साझा conclusion', 'legacy conclusion should migrate into the import key');
api.savePermanentConclusion('import', 'केवल import');
assert.strictEqual(api.readPermanentConclusion('import'), 'केवल import');
assert.strictEqual(api.readPermanentConclusion('promote'), 'पुराना साझा conclusion', 'import edits must not overwrite promote conclusion');
localStorage.setItem('lm_project_folder_name', 'Veer - The True Emperor');
api.savePermanentConclusion('promote', 'वीर project conclusion');
assert.strictEqual(localStorage.getItem('lm_advanced_promote_conclusion_v1:Veer%20-%20The%20True%20Emperor'), 'वीर project conclusion');

assert(promoteSource.includes("state.importTarget !== 'chapters'"), 'import apply path should support direct chapters');
assert(promoteSource.includes('sourceWords > wordLimit'), 'large drafts should be able to bypass the promote-mode chooser');
assert(promoteSource.includes("advancedPromoteReadPermanentConclusion('import')"), 'import should read its own permanent conclusion');
assert(promoteSource.includes("advancedPromoteReadPermanentConclusion('promote')"), 'promote should read its own permanent conclusion');
assert(promoteSource.includes('advanced-promote-chapter-list-btn is-imported-source'), 'Imported Text should be the first item in the import index');
assert(promoteSource.includes('advanced-import-index-separator'), 'Imported Text and created documents should have a labelled separator');
assert(promoteSource.includes('Remainder Text · As Draft'), 'direct chapter imports should expose their remainder draft in the left index');
assert(promoteSource.includes("setAdvancedPromoteView('remainder')"), 'remainder text should have a selectable preview action');
const progressSource = fs.readFileSync(path.join(root, 'assets/pages/story-novel-project-editor/js/05b-text-import-progress.js'), 'utf8');
assert(progressSource.includes('addDraft(advancedImportDocumentTitle') && progressSource.includes('remainder'), 'direct chapter imports should persist remaining text as a draft');
assert(promoteSource.includes('LmTextImportProgress.promote(state, proposedChapters, draft)'), 'Advanced Promote should use the shared processing panel');
assert(importSplittingSource.includes("state.importTarget === 'chapters'"), 'only direct chapter imports should separate the final remainder');
assert(promoteSource.includes('advanced-promote-full-reading'), 'generated content should open in a unified reading view');
assert(promoteSource.includes('updateAdvancedPromoteChapterFullText'), 'body and conclusion should be edited through one full-document update path');
assert(promoteSource.includes("advancedPromoteIcon('edit'"), 'preview edit action should use the icon registry');
assert(promoteSource.includes("advancedPromoteIcon('smartCopyDefault'"), 'preview copy action should use the icon registry');
assert(promoteSource.includes("advancedPromoteIcon('delete'"), 'preview delete action should use the icon registry');
assert(promoteSource.includes('data-advanced-promote-full-word-state'), 'preview should expose conditional full-word metrics');
assert(promoteSource.includes('id="advancedImportTarget"'), 'Import target control should be rendered');
assert(importCssSource.includes('.advanced-import-target-field .lm-custom-select-option') && importCssSource.includes('white-space: nowrap'), 'Import target options should stay on one line');
assert(customSelectSource.includes("select.closest('.advanced-import-target-field')") && customSelectSource.includes('const relativeLeft = viewportLeft - shellRect.left;'), 'Import target menu should size to its widest option and remain centered below its trigger');
assert(promoteSource.indexOf('id="advancedImportTarget"') < promoteSource.indexOf('id="advancedPromoteWordLimitInp"'), 'Import target should precede Words per chapter');
assert(promoteSource.indexOf('id="advancedImportSplitMode"') < promoteSource.indexOf('id="advancedPromoteWordLimitInp"'), 'Split method should precede Words per chapter');
assert(promoteSource.includes('advanced-import-word-limit-control advanced-number-stepper dock-fsize-control'), 'Words per chapter should use the Advanced Settings number stepper');
assert(promoteSource.includes("stepAdvancedNumberInput(event, 'advanced-promote-word-limit', 1)"), 'word-limit stepper should expose its increment action');
assert(promoteSource.includes('advanced-promote-index-footer'), 'Reverse Creation should be anchored in the chapter index');
assert(promoteSource.includes('advanced-promote-settings-actions'), 'create and final actions should share the settings toolbar');
assert(promoteSource.includes('advanced-promote-action-field is-create-action'), 'create action should have a labelled toolbar field');
assert(promoteSource.includes('advanced-promote-action-field is-apply-action'), 'final action should have a labelled toolbar field');
assert(promoteSource.includes('advancedPromoteChapterTitleConflict'), 'chapter promotion should block existing and repeated generated titles');
assert(promoteSource.includes('advancedPromoteApplyBlockReason'), 'final action should expose a reason for every blocked state');
assert(promoteSource.includes('handleAdvancedPromoteApplyClick(event)'), 'blocked final action should remain clickable for its validation popup');
assert(promoteSource.includes('data-advanced-promote-apply-validation'), 'final action should render a floating validation message');
assert(promoteSource.includes('advanced-promote-action-field advanced-promote-number-field'), 'promote number controls should use the action-field card style');
assert(promoteSource.includes("stepAdvancedNumberInput(event, 'advanced-promote-chapter-count', 1)"), 'promote chapter count should use the custom number stepper');
assert(promoteSource.includes('data-advanced-runtime-key="advanced-promote-chapter-count"'), 'promote chapter count should expose a runtime stepper key');
assert(!promoteSource.includes('advanced-promote-apply-btn is-floating'), 'final action should not float inside the chapter preview');
assert(!promoteSource.includes('advanced-promote-footer'), 'legacy modal footer should be removed');
assert(importSplittingSource.includes('advancedImportDocumentTitle(state, index)'), 'generated document titles should follow the selected import target');
assert(!promoteSource.includes('onclick="clearAdvancedPromoteChapter'), 'preview should not render a Clear action');
assert(!promoteSource.includes('advanced-promote-last-line'), 'legacy last-line preview should be removed');
assert(!promoteSource.includes('advanced-promote-chapter-conclusion'), 'separate chapter-conclusion panel should be removed');
assert(!promoteSource.includes('usePermanentAdvancedPromoteConclusion'), 'per-chapter Use permanent action should be removed');
assert(promoteSource.includes('advancedPromoteSourceDetailHTML'), 'Promote source should render inside the indexed detail pane');
assert(promoteSource.includes('<textarea id="advancedPromoteSourceText" aria-label='), 'Promote source detail should contain the full-size source textarea directly');
assert(promoteSource.includes('<span class="advanced-promote-chapter-number">SR</span>'), 'Promote source should be the first item in the left index');
assert(promoteSource.includes('Remainder Text · In Draft'), 'Promote remainder should have an in-draft separator in the left index');
assert(promoteSource.includes('advancedPromoteRemainderViewHTML'), 'Promote remainder should open in its own detail view');
assert(promoteSource.includes("state.draftTitle || copy.advancedPromoteSource"), 'Promote remainder entry should use the source draft title');
assert(promoteSource.includes('advanced-promote-chapter-preview is-remainder-preview'), 'Promote remainder should use the chapter preview shell');
assert(promoteSource.includes('data-advanced-promote-remainder-words'), 'Promote remainder preview head should expose its word count');
assert(!promoteSource.includes('advanced-promote-summary'), 'legacy source/chapter summary panel should be removed');
assert(!promoteSource.includes('advanced-promote-kicker'), 'legacy header kicker should be removed');
assert(!promoteSource.includes('advanced-promote-remainder-status'), 'legacy remainder status card should be removed');
assert(promoteSource.includes('workflowDefaults.importFontSize'), 'Import panel should read the saved Import text size');
assert(promoteSource.includes('workflowDefaults.promoteFontSize'), 'Promote panel should read the saved Promote text size');
assert(htmlSource.indexOf('05aa-advanced-import-promote-settings.js') < htmlSource.indexOf('05a-editor-advanced-config.js'), 'workflow settings must load before Advanced Settings UI');
assert(settingsSource.includes('data-workflow-view-tab="import"') && settingsSource.includes('data-workflow-view-tab="promote"'), 'Import and Promote settings should use a switchable workspace');
assert(settingsSource.includes('advanced-number-stepper dock-fsize-control'), 'workflow word counts should use the standard Advanced Settings stepper');
assert(settingsSource.includes('advanced-workflow-conclusion-reading'), 'permanent conclusions should have a clean reading mode');

const splitContext = {
  ADVANCED_IMPORT_CUSTOM_MINIMUM_OCCURRENCES: 2,
  ADVANCED_IMPORT_SMART_LOOK_AHEAD: 0,
  advancedPromoteNormalizedText: value => String(value || '').trim(),
  advancedPromoteWordCount: value => String(value || '').trim().split(/\s+/u).filter(Boolean).length,
  advancedImportDocumentTitle: (state, index) => `${state.importTarget} ${index + 1}`
};
vm.runInNewContext(importSplittingSource, splitContext);
const splitSample = Array.from({ length: 25 }, (_, index) => `word${index + 1}`).join(' ');
const draftSplit = splitContext.advancedImportAutoSplit(splitSample, 10, false);
const chapterSplit = splitContext.advancedImportAutoSplit(splitSample, 10, true);
assert.strictEqual(draftSplit.remainderText, '', 'draft imports should merge the short remainder into their last draft');
assert.strictEqual(splitContext.advancedPromoteWordCount(draftSplit.parts.at(-1)), 15, 'draft import last item should retain the merged remainder');
assert.strictEqual(chapterSplit.parts.length, 2, 'direct chapter import should keep only full chapters');
assert.strictEqual(splitContext.advancedPromoteWordCount(chapterSplit.remainderText), 5, 'direct chapter import should return the short remainder separately');

const controls = {
  importWordCount: { value: '2500' }, promoteWordCount: { value: '2500' },
  importFontSize: { value: '14' }, promoteFontSize: { value: '14' },
  importDraftPrefix: { value: '  Custom Draft  ' }, importChapterPrefix: { value: 'Custom Chapter' },
  promoteChapterPrefix: { value: '  Promoted Chapter  ' },
  importTarget: { value: 'chapters' },
  importConclusion: { value: 'मूल draft conclusion', dispatchEvent() {} },
  promoteConclusion: { value: 'promote conclusion' }
};
const syncButton = { textContent: '', hidden: true };
document.querySelector = selector => {
  const match = selector.match(/workflow-([^"\]]+)/);
  if (match) return controls[match[1]] || null;
  if (selector === '[data-import-conclusion-sync]') return syncButton;
  return null;
};
api.handleImportTargetChange();
assert.strictEqual(syncButton.textContent, 'Sync Promote Conclusion');
assert.strictEqual(syncButton.hidden, false);
api.syncImportConclusion();
assert.strictEqual(controls.importConclusion.value, 'promote conclusion');
controls.importTarget.value = 'drafts';
api.handleImportTargetChange();
assert.strictEqual(syncButton.textContent, 'Sync Draft Conclusion');
api.syncImportConclusion();
assert.strictEqual(controls.importConclusion.value, 'मूल draft conclusion');

assert.strictEqual(api.saveFromPanel(), true);
assert.strictEqual(api.read().importDraftPrefix, 'Custom Draft');
assert.strictEqual(api.read().importChapterPrefix, 'Custom Chapter');
assert.strictEqual(api.read().promoteChapterPrefix, 'Promoted Chapter');
assert.strictEqual(api.promoteDocumentTitle(2), 'Promoted Chapter 3');
assert.strictEqual(api.importDocumentTitle('chapters', 0), 'Custom Chapter 1', 'promote naming is independent of import naming');
assert.strictEqual(api.importDocumentTitle('drafts', 1), 'Custom Draft 2');
assert.strictEqual(api.importDocumentTitle('chapters', 1), 'Custom Chapter 2');
const draftPreview = { textContent: '' }, chapterPreview = { textContent: '' }, promotePreview = { textContent: '' };
const originalQuery = document.querySelector;
document.querySelector = selector => selector === '[data-workflow-name-preview="drafts"]' ? draftPreview
  : selector === '[data-workflow-name-preview="chapters"]' ? chapterPreview
  : selector === '[data-workflow-name-preview="promote"]' ? promotePreview : originalQuery(selector);
controls.importDraftPrefix.value = 'नया मसौदा';
controls.importChapterPrefix.value = '';
controls.promoteChapterPrefix.value = 'प्रमोट अध्याय';
api.syncImportNamePreviews();
assert.strictEqual(draftPreview.textContent, 'नया मसौदा 1', 'the example updates while typing');
assert.strictEqual(chapterPreview.textContent, 'I Chapter 1');
assert.strictEqual(promotePreview.textContent, 'प्रमोट अध्याय 1');
controls.importDraftPrefix.value = api.defaults.importDraftPrefix;
controls.importChapterPrefix.value = api.defaults.importChapterPrefix;
controls.promoteChapterPrefix.value = api.defaults.promoteChapterPrefix;
api.saveFromPanel();
assert.strictEqual(api.importDocumentTitle('drafts', 0), 'I Draft 1', 'resetting defaults restores generated names');
assert.strictEqual(api.promoteDocumentTitle(0), 'I Chapter 1');

console.log('advanced-import-promote-settings: workflow, naming defaults, prefix persistence and previews passed');
