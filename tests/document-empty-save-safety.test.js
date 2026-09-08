'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const savePath = path.join(__dirname, '..', 'assets', 'shared', 'js', '06b-workspace-restore-autosave.js');
const editorPath = path.join(__dirname, '..', 'assets', 'pages', 'story-novel-project-editor', 'js', '01i-draft-promote-smart-clipboard.js');
const saveSource = fs.readFileSync(savePath, 'utf8');
const editorSource = fs.readFileSync(editorPath, 'utf8');
const safetyMatch = saveSource.match(/function documentTextWriteIsSafe\([\s\S]*?\n\}/);

assert.ok(safetyMatch, 'blank document write safety function must remain available');

const explicitlyEdited = new WeakSet();
const context = vm.createContext({
  hasExplicitEditorDocumentEdit: documentItem => explicitlyEdited.has(documentItem)
});
vm.runInContext(`${safetyMatch[0]}; this.isSafe = documentTextWriteIsSafe;`, context);

const staleLoadedDocument = { _contentLoadState: 'unloaded', _contentPresented: false, _wordCount: 12 };
assert.equal(context.isSafe(staleLoadedDocument, ''), false, 'untouched unloaded content cannot be overwritten with blank text');
assert.equal(context.isSafe(staleLoadedDocument, 'नया पाठ'), true, 'non-empty saves keep their existing behavior');

explicitlyEdited.add(staleLoadedDocument);
assert.equal(context.isSafe(staleLoadedDocument, ''), true, 'an explicit editor edit may intentionally save an empty document');
explicitlyEdited.delete(staleLoadedDocument);
assert.equal(context.isSafe(staleLoadedDocument, ''), false, 'the blank-write permission is one-save state, not a permanent bypass');

const normallyLoadedDocument = { _contentLoadState: 'loaded', _contentPresented: true, _wordCount: 12 };
assert.equal(context.isSafe(normallyLoadedDocument, ''), true, 'the established loaded-and-presented blank save remains supported');

assert.match(editorSource, /function handleEditorContentInput\(event = null\) \{[\s\S]*?markActiveDocumentExplicitEditorEdit\(\)/, 'the real editor input path records explicit edit intent');
assert.match(saveSource, /await writeProjectManifest\(\);\s*clearExplicitEditorDocumentEdit\(chapter\);/, 'chapter intent clears only after its durable save completes');
assert.match(saveSource, /await writeDraftsDataToProject\(\);\s*clearExplicitEditorDocumentEdit\(draft\);/, 'draft intent clears only after its durable save completes');

console.log('document-empty-save-safety: intentional blank saves and unloaded-document protection passed');
