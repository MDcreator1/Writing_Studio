const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const importSource = fs.readFileSync(
  path.join(root, 'assets/pages/story-novel-project-editor/js/06-text-import.js'),
  'utf8'
);
const advancedConfigSource = fs.readFileSync(
  path.join(root, 'assets/shared/js/05a-editor-advanced-config.js'),
  'utf8'
);
const scrollThumbSource = fs.readFileSync(
  path.join(root, 'assets/pages/story-novel-project-editor/js/02d-side-info-scroll-thumbs.js'),
  'utf8'
);

const context = {
  console,
  document: { addEventListener() {} }
};
vm.createContext(context);
vm.runInContext(importSource, context);

const words = count => Array.from({ length: count }, (_, index) => `word${index + 1}`).join(' ');

assert.strictEqual(context.textImportActionMinimumWords(), 250, 'Import actions should default to 250 words');
assert.strictEqual(context.textImportActionsAvailable(words(249)), false, 'Import actions should stay hidden below the threshold');
assert.strictEqual(context.textImportActionsAvailable(words(250)), true, 'Import actions should appear when the threshold is reached');

context.lmEditorAdvancedNumber = (key, fallback) => key === 'importActionMinimumWords' ? 400 : fallback;
assert.strictEqual(context.textImportActionMinimumWords(), 400, 'Developer setting should control the import-action threshold');
assert.strictEqual(context.textImportActionsAvailable(words(399)), false, 'Configured threshold should gate shorter text');
assert.strictEqual(context.textImportActionsAvailable(words(400)), true, 'Configured threshold should allow enough text');
assert.strictEqual(context.textImportRawDraftTitle(3, { mode: 'file', fileName: 'My Story.docx' }, 'Draft 4'), 'My Story', 'Raw file import should use the source filename without its extension');
assert.strictEqual(context.textImportRawDraftTitle(3, { mode: 'paste', fileName: 'Ignored.txt' }, 'Draft 4'), 'Draft 4', 'Raw pasted text should retain the generated draft title');
assert.strictEqual(context.textImportDroppedFileIsSupported({ name: 'Novel.docx', type: '' }), true, 'Dropped Word documents should be accepted');
assert.strictEqual(context.textImportDroppedFileIsSupported({ name: 'Novel.markdown', type: '' }), true, 'Dropped text-like documents should be accepted');
assert.strictEqual(context.textImportDroppedFileIsSupported({ name: 'Novel.pdf', type: 'application/pdf' }), false, 'Unsupported dropped files should be rejected before reading');

assert(importSource.includes('is-text-entry-view'), 'Paste and file text should use the standalone entry view');
assert(importSource.includes('placeholder="Paste your story here"'), 'Standalone paste input should expose the requested placeholder');
assert(importSource.includes('data-text-import-actions'), 'Import actions should have a live visibility target');
assert(importSource.includes('class="text-import-editor-shell"') && importSource.includes('class="text-import-editor-actions"'), 'Import actions should float inside the editor shell');
assert(importSource.indexOf('text-import-entry-status') < importSource.indexOf('text-import-editor-shell'), 'Entry status should render above the editor box');
assert(!importSource.includes('<footer class="text-import-footer"'), 'Standalone text entry should not render a footer');
assert(scrollThumbSource.includes("'#textImportPreview'") && scrollThumbSource.includes("panel.addEventListener('input'"), 'Text import editor should use the live project custom scroll thumb');
assert(importSource.includes("document.addEventListener('drop'") && importSource.includes('openDroppedTextImportFile') && importSource.includes('openDroppedTextImportText'), 'External files and selected text should open directly in the import entry view');
assert(importSource.includes('textImportInternalDragActive'), 'Document-owned drag operations should not be intercepted as imports');
assert(importSource.includes("openImportPanel.classList.contains('is-source-choice-view')"), 'The open source-choice modal should continue accepting external drops');
assert(importSource.includes("const isFileMode = state.mode === 'file'"), 'File-loaded text should use the same entry flow');
assert(advancedConfigSource.includes("key: 'importActionMinimumWords'"), 'Developer import settings should expose the threshold');
assert(advancedConfigSource.includes("value: 250"), 'Developer threshold should default to 250 words');

console.log('text-import-entry-threshold: 24 assertions passed');
