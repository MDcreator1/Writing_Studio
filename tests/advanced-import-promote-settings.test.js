const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const settingsSource = fs.readFileSync(path.join(root, 'assets/shared/js/05aa-advanced-import-promote-settings.js'), 'utf8');
const promoteSource = fs.readFileSync(path.join(root, 'assets/pages/story-novel-project-editor/js/05-advanced-draft-promote.js'), 'utf8');
const importSplittingSource = fs.readFileSync(path.join(root, 'assets/pages/story-novel-project-editor/js/05a-advanced-import-splitting.js'), 'utf8');
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
assert(promoteSource.includes('importedRemainderDraft'), 'direct chapter imports should persist remaining text as a draft');
assert(importSplittingSource.includes("state.importTarget === 'chapters'"), 'only direct chapter imports should separate the final remainder');
assert(promoteSource.includes('advanced-promote-full-reading'), 'generated content should open in a unified reading view');
assert(promoteSource.includes('updateAdvancedPromoteChapterFullText'), 'body and conclusion should be edited through one full-document update path');
assert(promoteSource.includes("advancedPromoteIcon('edit'"), 'preview edit action should use the icon registry');
assert(promoteSource.includes("advancedPromoteIcon('smartCopyDefault'"), 'preview copy action should use the icon registry');
assert(promoteSource.includes("advancedPromoteIcon('delete'"), 'preview delete action should use the icon registry');
assert(promoteSource.includes('data-advanced-promote-full-word-state'), 'preview should expose conditional full-word metrics');
assert(promoteSource.includes('id="advancedImportTarget"'), 'Import target control should be rendered');
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

console.log('advanced-import-promote-settings: 56 assertions passed');
