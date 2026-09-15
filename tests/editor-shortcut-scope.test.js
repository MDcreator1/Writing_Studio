const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const editorSource = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'pages', 'story-novel-project-editor', 'js', '02a-find-replace-core.js'),
  'utf8'
);
const namingSource = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'pages', 'story-novel-project-editor', 'js', '03a-naming-panel-core.js'),
  'utf8'
);

const guardMatch = editorSource.match(/function handleEditorShortcutGuard\(event\) \{[\s\S]*?\n\}/);
assert.ok(guardMatch, 'editor shortcut guard must remain available');
const guard = guardMatch[0];
const localScopeGateAt = guard.lastIndexOf('if (!isEditorShortcutActive()) return false;');

assert.ok(localScopeGateAt >= 0, 'editor-only shortcuts retain their local scope gate');
assert.ok(
  guard.indexOf("key === 'f'") < localScopeGateAt && /key === 'f'[\s\S]*?openFindPanel\(\)/.test(guard),
  'Ctrl+F is page-global while continuing to open the editor find panel'
);
assert.match(
  guard,
  /key === 'h'[\s\S]*?if \(!isEditorEditingShortcutActive\(\)\) return false;/,
  'Ctrl+H requires editor focus or a retained editor selection'
);
assert.match(
  guard,
  /formatCommandByKey\[key\][\s\S]*?isEditorEditingShortcutActive\(\)/,
  'Ctrl+B, Ctrl+I and Ctrl+U require editor focus or a retained editor selection'
);
assert.ok(
  guard.indexOf("key === 'f10'") < localScopeGateAt,
  'F10 is handled before the editor-only scope gate'
);
assert.match(
  guard,
  /key === 's'[\s\S]*?if \(!isEditorShortcutActive\(\)\) return false;[\s\S]*?manualSave\(\)/,
  'Ctrl+S keeps its existing editor-local scope'
);

assert.match(
  editorSource,
  /function hasRetainedMainEditorSelection\(\)[\s\S]*?!selection\.isCollapsed[\s\S]*?!savedEditorRange\.collapsed/,
  'editing shortcuts recognize live and retained non-collapsed editor selections'
);
assert.match(
  editorSource,
  /function isEditorEditingShortcutActive\(\)[\s\S]*?canEditActiveDocument\(\)[\s\S]*?isMainEditorFocused\(\)[\s\S]*?hasRetainedMainEditorSelection\(\)/,
  'expanded editing shortcuts are available only for an editable draft or unlocked chapter'
);

assert.match(
  namingSource,
  /function isNamingCategoryShortcutContextActive\(\)[\s\S]*?canEditActiveDocument\(\)[\s\S]*?!isTrashDraftActive\(\)/,
  'Alt+Category accepts the whole page whenever the active document is editable'
);
assert.match(
  namingSource,
  /handleNamingCategoryShortcut\(event, key\)[\s\S]*?isNamingCategoryShortcutContextActive\(\)/,
  'Alt+Category no longer depends on the focused page element'
);

console.log('editor-shortcut-scope: 10 assertions passed');
