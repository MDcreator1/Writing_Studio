const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const coreDirectory = path.join(__dirname, '..', 'assets', 'pages', 'story-novel-project-editor', 'js');
const coreFiles = [
  '01a-editor-foundation-history.js',
  '01b-history-auto-scroll.js',
  '01c-auto-scroll-find.js',
  '01d-editor-init-chapters.js',
  '01e-chapter-parts.js',
  '01f-drafts-management.js',
  '01g-trash-drafts-virtualization.js',
  '01h-virtual-editor-pipeline.js',
  '01i-draft-promote-smart-clipboard.js'
];
const source = coreFiles
  .map(fileName => fs.readFileSync(path.join(coreDirectory, fileName), 'utf8'))
  .join('\n');
const hindiInputPath = path.join(__dirname, '..', 'assets', 'pages', 'story-novel-project-editor', 'js', '00-hindi-unicode-input.js');
const hindiInputSource = fs.readFileSync(hindiInputPath, 'utf8');
const match = source.match(/function editorHistoryShouldMerge\([\s\S]*?\n\}/);
assert.ok(match, 'editorHistoryShouldMerge must remain available for deterministic policy tests');
const patchMatch = source.match(/function editorHistoryContentPatch\([\s\S]*?\n\}/);
assert.ok(patchMatch, 'editorHistoryContentPatch must remain available for deterministic patch tests');
const segmentMatch = source.match(/function editorHistoryInsertedWordSegments\([\s\S]*?\n\}/);
assert.ok(segmentMatch, 'editorHistoryInsertedWordSegments must remain available for IME phrase tests');
const pendingTypingMatch = source.match(/function editorHistoryPendingTypingContinues\([\s\S]*?\n\}/);
assert.ok(pendingTypingMatch, 'editorHistoryPendingTypingContinues must remain available for word-boundary tests');
const historyTextMatch = source.match(/function editorHistoryHTMLToText\([\s\S]*?\n\}/);
assert.ok(historyTextMatch, 'editorHistoryHTMLToText must remain available for lossless history restore tests');

const context = { EDITOR_HISTORY_INPUT_GROUP_MS: 4500 };
vm.runInNewContext(`${match[0]}; ${patchMatch[0]}; ${segmentMatch[0]}; ${pendingTypingMatch[0]}; this.shouldMerge = editorHistoryShouldMerge; this.contentPatch = editorHistoryContentPatch; this.wordSegments = editorHistoryInsertedWordSegments; this.pendingTypingContinues = editorHistoryPendingTypingContinues;`, context);
const merge = context.shouldMerge;
const contentPatch = context.contentPatch;
const wordSegments = value => Array.from(context.wordSegments(value));
const pendingTypingContinues = context.pendingTypingContinues;

assert.equal(merge({ type: 'typing' }, { type: 'typing' }, 50, true), true, 'letters in one word coalesce');
assert.equal(merge({ type: 'typing', endsWordBoundary: true }, { type: 'typing' }, 50, true), false, 'typing after a trailing space starts a word');
assert.equal(merge({ type: 'typing' }, { type: 'backspace' }, 50, true), true, 'a correction stays in the active word');
assert.equal(merge({ type: 'backspace' }, { type: 'backspace' }, 50, true), true, 'continuous Backspace is atomic');
assert.equal(merge({ type: 'backspace' }, { type: 'backspace', crossesWhitespace: true }, 50, true), false, 'Backspace crossing whitespace starts a transaction');
assert.equal(merge({ type: 'backspace', crossesWhitespace: true }, { type: 'backspace' }, 50, true), false, 'Backspace after crossing whitespace starts a new burst');
assert.equal(merge({ type: 'typing' }, { type: 'typing' }, 50, false), false, 'caret relocation starts a transaction');
assert.equal(merge({ type: 'typing' }, { type: 'typing' }, 5000, true), false, 'idle timeout ends a transaction');
assert.equal(merge({ type: 'paste' }, { type: 'typing' }, 50, true), false, 'paste remains atomic');
assert.equal(merge({ type: 'forward-delete' }, { type: 'backspace' }, 50, true), false, 'Forward Delete never joins Backspace');

assert.deepEqual(
  JSON.parse(JSON.stringify(contentPatch('<p>वह कमरा</p>', '<p>वह क</p>'))),
  { range: { start: 7, end: 10 }, removedContent: 'मरा', insertedContent: '' },
  'Hindi deletion patch is reversible'
);
assert.deepEqual(
  JSON.parse(JSON.stringify(contentPatch('<p>राम राम</p>', '<p>मोहन मोहन</p>'))),
  { range: { start: 3, end: 10 }, removedContent: 'राम राम', insertedContent: 'मोहन मोहन' },
  'Replace All is represented by one reversible patch'
);
assert.deepEqual(wordSegments('एक दो तीन चार'), ['एक ', 'दो ', 'तीन ', 'चार'], 'each IME word owns its following space');
assert.deepEqual(wordSegments(' पहला दूसरा'), [' पहला ', 'दूसरा'], 'leading whitespace is preserved without becoming its own entry');
assert.deepEqual(wordSegments('एक   दो'), ['एक   ', 'दो'], 'multiple spaces remain lossless in the preceding word entry');
assert.deepEqual(wordSegments('एक\nदो'), ['एक\n', 'दो'], 'a paragraph boundary does not become a standalone history entry');
assert.deepEqual(wordSegments('एक '), ['एक '], 'a trailing space remains in the completed word transaction');
assert.equal(pendingTypingContinues({ family: 'typing', endsWordBoundary: false }, 'typing', true), true, 'space completes the active word transaction');
assert.equal(pendingTypingContinues({ family: 'typing', endsWordBoundary: true }, 'typing', true), true, 'consecutive spaces remain in one transaction');
assert.equal(pendingTypingContinues({ family: 'typing', endsWordBoundary: true }, 'typing', false), false, 'the next non-space starts a new word transaction');

assert.match(source, /function flushPendingEditorHistoryInput\(\)[\s\S]*?captureEditorHistorySnapshot\('input', \{ force: true, context \}\);/, 'history traversal commits pending input with its original typing context');
assert.match(source, /function redoEditorHistory\(\)[\s\S]*?flushPendingEditorHistoryInput\(\)/, 'Redo settles pending input before moving its index');
assert.match(source, /restoreSequence !== editorHistoryRestoreSequence/, 'stale asynchronous caret restores cannot overwrite a newer Redo position');
assert.match(source, /function prepareVirtualEditorHistoryRestore\(\)[\s\S]*?isRestrictedInputRenderingActive = false;[\s\S]*?virtualEditorPendingPatchBatch = null;/, 'virtual history restore cancels the old restricted-input render transaction');
assert.match(source, /startVirtualEditorDocument\(documentItem, restoreDocumentSequence, html, null, \{[\s\S]*?preservePaintedDOM: preserveMaterializedDOM/, 'virtual Undo explicitly preserves a materialized editing surface');
assert.match(source, /if \(!isRestrictedInputRenderingActive\) return Promise\.resolve\(false\);/, 'an inactive restricted-input close cannot clear a restored virtual document');
assert.match(source, /activeVirtualEditorDocument\?\.temporarilyMaterialized[\s\S]*?cleanPlainTextEditorValue\(editor\)/, 'materialized virtual history snapshots read the full live editor text');
assert.match(source, /event\.preventDefault\(\);[\s\S]*?caretPositionFromPoint\?\.\(event\.clientX, event\.clientY\)/, 'pointer materialization restores the caret from its screen position');
assert.match(source, /preserveMaterializedDOM[\s\S]*?state\.sessionParagraphs = paragraphs;[\s\S]*?restoreVirtualEditorGlobalSelection\(editor, targetSelection\)/, 'virtual Undo preserves full DOM and logical selection while editing');
assert.match(source, /virtualEditorHistoryInputSuppressionUntil = performance\.now\(\) \+ 2000;/, 'history traversal suppresses delayed synthetic editor callbacks');
assert.match(source, /scopeIndexes\.slice\(selectionStart, selectionEnd \+ 1\)/, 'Shift chapter selection stops at the clicked chapter instead of selecting the rest of the part');
assert.match(source, /function partChapterBoundarySelection\(partIndex\)[\s\S]*?moveUp: firstSelected && partIndex > 0,[\s\S]*?moveDown: lastSelected/, 'part transfer controls are derived from selected first and last chapter boundaries');
assert.match(source, /moveToTemporary: lastSelected[\s\S]*?moveToDraft: lastSelected/, 'the last part chooses Temporary Chapters or Drafts without dropping the selection');
assert.match(source, /function moveSelectedPartBoundaryChapters[\s\S]*?previousChapterMeta[\s\S]*?catch \(error\)[\s\S]*?Object\.assign\(chapter, previousChapterMeta\[index\]\)/, 'failed part metadata moves roll chapter structure back in memory');
const draftWriteAt = source.indexOf('await writeDraftsDataToProject();', source.indexOf('async function moveChaptersToDraft'));
const convertedSourceDeleteAt = source.indexOf('payload.oldChapterPath,', draftWriteAt);
assert.ok(draftWriteAt >= 0 && convertedSourceDeleteAt > draftWriteAt, 'chapter source files are deleted only after converted draft metadata is durable');
assert.match(source, /function captureVirtualEditorGlobalSelection[\s\S]*?startTextOffset: absoluteOffset\(start\)[\s\S]*?endTextOffset: absoluteOffset\(end\)/, 'virtual selection snapshots retain absolute offsets for a later full-DOM restore');
assert.match(source, /function prepareVirtualEditorHistoryRestore\(\) \{[\s\S]*?restrictedInputCloseSequence \+= 1;/, 'history restore invalidates an already-running restricted-input close');
assert.match(source, /closeSequence === restrictedInputCloseSequence/, 'stale autosave cleanup cannot clear the virtual state restored by Undo');
assert.match(hindiInputSource, /event\.type === 'keydown'[\s\S]*?options\.onBeforeLogicalEdit\?\.\([\s\S]*?deleteContentBackward/, 'logical Hindi Backspace supplies the missing pre-mutation history boundary');
assert.match(source, /onBeforeLogicalEdit\(\{ inputType \}[\s\S]*?editorHistoryBeforeInput/, 'the editor journal consumes Hindi logical deletion before it mutates the DOM');
assert.match(source, /function restoreVirtualEditorGlobalSelection[\s\S]*?localParagraph = Number\(endpoint\.paragraph\) - paragraphBase[\s\S]*?renderedParagraphs\[localParagraph\]\.length/, 'virtual caret restore uses the rendered window base and clamps within its intended paragraph');
assert.match(source, /editorHistorySelectionAtTextOffset\(plan\.start \+ accumulated\.length, nextText\)/, 'synthetic word snapshots retain virtual paragraph identity');
assert.doesNotMatch(historyTextMatch[0], /trimEnd\(/, 'history text conversion must preserve a trailing space before a paragraph boundary');
assert.match(source, /virtualEditorLogicalParagraphs\(editorHistoryHTMLToText\(html\)\)/, 'virtual Undo restores snapshots through the lossless history converter');
assert.match(source, /setPlainTextEditorValue\(editor, editorHistoryHTMLToText\(snapshot\.html \|\| ''\)\)/, 'full-DOM Undo and Redo preserve paragraph-end spaces');

console.log('editor-history-policy: 42 assertions passed');
