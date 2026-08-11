# लेखक मंच (Lekhak Manch): प्रोजेक्ट आर्किटेक्चर और वर्किंग नोट्स

> स्रोत-आधारित तकनीकी दस्तावेज़। यह नोट वर्तमान repository के HTML, CSS और JavaScript को पढ़कर बनाया गया है। इसका उद्देश्य नए developer को system समझाना, debugging आसान करना और आगे refactor/feature work के लिए reference देना है।

## 1. Executive summary

लेखक मंच browser में चलने वाला **local-first, multi-page writing studio** है। इसमें framework, bundler, backend server या package manager नहीं है। UI plain HTML/CSS/JavaScript में है और modules `<script>` tags के क्रम से global browser scope में जुड़ते हैं।

मुख्य design:

- `home.html` workspace चुनने, नया project बनाने और recent projects खोलने का प्रवेश-द्वार है।
- `story-novel-project-editor.html` story/novel का मुख्य editor है।
- `story-novel-focus-editor.html` उसी editor को focus-mode query parameter के साथ iframe में खोलने वाला shell है।
- `news-article-editor.html` news projects के लिए अलग newsroom/editor है।
- `project-details.html` पूरे project का read/analysis dashboard है।
- `ai-agents.html` अभी वास्तविक AI backend नहीं, बल्कि local project state पर आधारित agent-monitor prototype है।
- File System Access API project के JSON/TXT files पढ़ती-लिखती है।
- IndexedDB browser को चुने हुए workspace/project directory handles याद रखने देता है।
- localStorage theme, UI settings, editor state, recovery/cache और news fallback data रखता है।

यह application मुख्यतः Chrome/Edge जैसे File System Access API समर्थित browser पर निर्भर है।

## 2. High-level architecture

```text
User
  │
  ├── home.html ── workspace/project चयन और creation
  │       │
  │       ├── Story/Novel ──> story-novel-project-editor.html
  │       └── News ─────────> news-article-editor.html
  │
  ├── story-novel-project-editor.html
  │       ├── editor core, drafts, chapters, parts
  │       ├── naming database, facts, notes
  │       ├── find/replace, focus mode, Unicode input
  │       └── project details / AI desk navigation
  │
  ├── project-details.html ── aggregate read + analytics + edits
  └── ai-agents.html ──────── local-state monitor/prototype

Browser persistence
  ├── IndexedDB: FileSystemDirectoryHandle
  ├── localStorage: preferences, active state, caches/fallback
  └── selected local folder: canonical JSON and TXT project files
```

### Architectural style

यह ES modules वाला architecture नहीं है। हर script global names export करता है और बाद में load हुई script पहले की globals इस्तेमाल करती है। इसलिए HTML में script order dependency graph का हिस्सा है। Shared scripts का सामान्य क्रम है:

1. icon registry
2. shortcut tooltips
3. floating-panel focus return
4. theme controller
5. state normalization और global constants/state
6. floating-panel position policy
7. project storage
8. page-specific controller

Story editor में इसके बाद Hindi input, editor core, find/replace tools, side-panel systems, boot और advanced draft promotion modules जुड़ते हैं।

## 3. Repository map

### Entry pages

| File | भूमिका |
|---|---|
| `home.html` | Workspace gate, writing-type overview, project creation/recent-project UI |
| `story-novel-project-editor.html` | मुख्य story/novel authoring workspace और अधिकांश modal/panel DOM |
| `story-novel-focus-editor.html` | Focus editor shell; iframe URL में `lmFocusPage=1` जोड़ता है |
| `news-article-editor.html` | Newsroom layout: article list, paper editor, inspector, sources/checklist |
| `project-details.html` | Project metadata, documents, names, facts, changes और graphs dashboard |
| `ai-agents.html` | आठ predefined AI-agent cards, inspector और diagnostic console |
| `temp.html` | Temporary standalone experiment; production navigation का हिस्सा नहीं दिखता |

### Shared JavaScript

| File | जिम्मेदारी |
|---|---|
| `00-icon-registry.js` | SVG icon dictionary, icon HTML generation और `[data-lm-icon]` hydration |
| `01-shortcut-tooltips.js` | Delayed keyboard-shortcut tooltip, viewport positioning, native title suppression |
| `02-floating-panel-focus-return.js` | Floating panels बंद होने पर editor/input focus और selection restore करना; focus slots enforce करना |
| `03-theme-controller.js` | छह themes, localStorage persistence, body classes, theme menu positioning |
| `04-state-normalize.js` | Translations, constants, global runtime state, normalizers, default objects और recovery comparison |
| `05-floating-panel-positions.js` | Panel-id/context के आधार पर shared position configuration और offsets |
| `06-project-storage.js` | File System API, IndexedDB, manifests, drafts, naming, autosave, project library और settings persistence |

### Story/novel editor JavaScript

| File | जिम्मेदारी |
|---|---|
| `00-hindi-unicode-input.js` | Devanagari logical units, virama/matra-aware caret और deletion/input handling |
| `01-editor-core.js` | Main editor behavior: rendering, history, find/replace, focus mode, auto-scroll, parts/chapters/drafts, panels, naming/facts/notes |
| `02-find-replace-ai-tools.js` | Find/replace और AI-tool related auxiliary UI |
| `03-side-panels-naming-facts.js` | Naming/facts side-panel extensions |
| `04-editor-boot.js` | केवल `DOMContentLoaded -> init()` boot hook |
| `05-advanced-draft-promote.js` | Draft text को sentence-safe chunks/chapters में split, preview, edit और promote करना |

### CSS layers

- `assets/shared/css/00-base.css`: design primitives और common components।
- `01-find-modals.css`: shared modal/find UI।
- Page-specific CSS folders: layout और feature-specific styles।
- `99-theme-overrides.css`: सबसे अंत में load होकर theme-specific overrides लागू करता है।
- Numeric prefix cascade/load order को जानबूझकर स्पष्ट करता है।

## 4. Runtime state model

Application centralized store इस्तेमाल नहीं करता। State shared global variables, DOM, localStorage और project files में बंटी है। मुख्य runtime entities हैं:

- `workspaceDirectoryHandle`: user द्वारा चुना root workspace।
- `projectDirectoryHandle`: वर्तमान project folder।
- `activeProjectTypeFolderName`: `Stories`, `Novels` या `News Articles` parent folder।
- `projectManifest`: normalized current manifest।
- `chapters`, `drafts`, `trashDrafts`, `chapterEditDrafts`, `parts`।
- `namingData`: categories और saved name entries।
- `storyFacts`: continuity facts।
- `curChap`, `curDraft` और active-mode flags।
- `editorSettings`, theme और floating-panel state।

### Source of truth priority

1. चुने हुए project folder की files canonical durable data हैं।
2. IndexedDB से handles restore होते हैं; permission फिर verify हो सकती है।
3. localStorage fast restore, fallback, settings और cache देता है।
4. Normalizers missing/legacy fields भरते हैं, इसलिए पुरानी files भी load हो सकती हैं।
5. DOM active edit buffer है; save से पहले इसे active object में capture किया जाता है।

## 5. Workspace और project folder structure

Workspace का अपेक्षित logical layout:

```text
Chosen Workspace/
├── Novels/
│   └── Project Folder/
├── Stories/
│   └── Project Folder/
└── News Articles/
    └── Project Folder/
```

Story/novel project में प्रयुक्त files/directories:

```text
Project Folder/
├── Chapters_info.json          # manifest, metadata, parts और chapter records
├── Story_Naming.json           # naming categories और entries
├── Story_Drafts.json           # active draft metadata
├── Temp_Chapter_Draft.json     # chapter-edit recovery metadata
├── Chapters/.../*.txt          # chapter body text
├── Drafts/.../*.txt            # draft body text
├── Edited_Chapter/.../*.txt    # temporary chapter edits
├── Trash/
│   ├── Trash_Drafts.json
│   └── ...                     # trashed draft text
└── .lekhak-manch/
    ├── total-mentions.json     # details-page mention cache
    └── ...                     # derived project-detail caches
```

News project में `Chapters_info.json` के साथ `NewsDesk_Articles.json` लिखा जाता है।

### Manifest schema

`normalizeProjectManifest()` के बाद conceptual shape:

```js
{
  title: string,
  type: 'story' | 'novel' | 'news',
  author: string,
  language: 'en' | 'hi',
  synopsis: string,
  createdAt: ISODateString,
  updatedAt: ISODateString,
  facts: Fact[],
  chapters: Chapter[],
  parts: Part[]
}
```

Normalizers legacy aliases जैसे `updated_at`, `created_at`, `description`, `storyFacts` स्वीकार करते हैं।

### Chapter, draft और part

Chapter/draft objects metadata रखते हैं; बड़ा text अलग TXT file में जा सकता है। Common fields में `id`, `title`, `contentPath`, timestamps, word count, formatting/settings और part relation आते हैं। Part में title/number/summary और chapter membership रहता है। `normalizeChapter`, `normalizeDraft`, `normalizePart` defaults और type safety लागू करते हैं।

### Naming data

Conceptual schema:

```js
{
  categories: [{ id, title, color, shortcut, ... }],
  entries: [{
    id, categoryId, name, description,
    status, documentPath, documentTitle,
    sourcePaths, mentions, history,
    createdAt, updatedAt
  }]
}
```

Entry document-linked, undefined/missing-document या orphan-style हो सकती है। Project open और document mutation के समय link/mention validation चलती है। Name history edits और previous values सुरक्षित रख सकती है।

### Facts

Fact record keyword/title, description/value, chapter/document attachment, pinned state, timestamps और chapter edits/mention-derived metadata रखता है। Duplicate keyword रोकने और attachment consistency के helpers मौजूद हैं।

## 6. Persistence layers

### IndexedDB

- Database: `lekhak-manch-project`
- Object store: `handles`
- Keys: `active-folder`, `workspace-folder`

यह content database नहीं है; केवल `FileSystemDirectoryHandle` persist करता है। `openProjectDB`, `readStoredDirectoryHandle`, `saveStoredDirectoryHandle`, `deleteStoredDirectoryHandle` इसका API हैं।

### localStorage

प्रमुख स्थिर keys:

- `lm_project_mode`
- `lm_workspace_folder_name`
- `lm_project_folder_name`
- `lm_project_type_folder_name`
- `lm_project_manifest`
- active editor state के project-scoped keys
- `lm_theme` और backward-compatible `lm_dark`
- editor settings, autosave, find/replace, smart paste/copy और panel positions के scoped keys
- news desk का workspace/project scoped fallback state
- `lm_ai_desk_state:*` AI desk prototype state

Project-scoped key बनाते समय folder/type slug शामिल किया जाता है, ताकि अलग projects की UI/recovery state टकराए नहीं।

### File System Access API

- `showDirectoryPicker()` user gesture से workspace चुनता है।
- `queryPermission`/`requestPermission` read-write access verify करते हैं।
- `getDirectoryHandle` और `getFileHandle` nested paths resolve/create करते हैं।
- `createWritable()` file को replace-write करता है।
- Directory rename native operation न होने के कारण project rename/type move copy-then-remove strategy इस्तेमाल करता है।

## 7. End-to-end flows

### App/home boot

1. Scripts global helpers load करते हैं।
2. `DOMContentLoaded` पर `initHome()` theme apply करता है।
3. Story type options और custom selects render होते हैं।
4. Home overview default `story` पर जाता है।
5. `restoreHomeWorkspaceHandle()` IndexedDB handle पढ़ता और permission देखता है।
6. Handle न मिले तो workspace gate/choose-folder path उपलब्ध रहता है।

### नया project बनाना

1. User workspace चुनता है।
2. New Project modal title, author, type, language और synopsis लेता है।
3. `workspaceStoryTitleExists()` duplicate title खोजता है।
4. Title sanitize होकर unique directory name बनता है।
5. Story/novel के लिए default manifest/draft files; news के लिए default article state लिखा जाता है।
6. Project और type-folder identity localStorage/IndexedDB में active होती है।
7. Type के अनुसार story editor या news editor navigate होता है।

### Existing project खोलना

1. `workspaceProjectManifestSummaries()` type folders scan करता है।
2. Manifest से title/type/time निकाले जाते हैं।
3. Recent projects update time से sort होते हैं।
4. Selected directory permission verify और handle persist होता है।
5. `loadLocalProject()` manifest, drafts, trash, edit recovery और naming पढ़कर normalize करता है।
6. Missing content lazy-loaded रहता है; active document पहले ensure होता है।

### Editing और save

1. Chapter/draft चुनते समय पिछला editor buffer model में sync होता है।
2. Content selected mode के अनुसार plain/review HTML में render होता है।
3. Input से stats, dirty/save status, history और naming scans schedule होते हैं।
4. Autosave enabled हो तो idle/timed `runAutoSave()` चलता है।
5. `manualSave()` active document capture करके corresponding TXT, JSON metadata और manifest लिखता है।
6. Successful save पर saved snapshot/history/status refresh होता है।

### Chapter edit recovery

Saved chapter सामान्यतः locked/review रूप में रह सकता है। Edit खोलने पर temporary chapter-edit draft बनाया जाता है। App restart/open पर:

- draft और saved chapter title/content/formatting compare होते हैं;
- mismatch keys user-friendly reminder बनाते हैं;
- user recent changes use या discard कर सकता है;
- commit होने पर temporary draft chapter में merge और recovery file cleanup होता है।

### Draft lifecycle

- नया draft default metadata/path से बनता है।
- Delete पहले Trash में move करता है; restore और delete-forever दोनों उपलब्ध हैं।
- Draft से बने naming entries के लिए cleanup decision पूछा जा सकता है।
- Raw Promote पूरे draft को एक chapter बनाता है।
- Advanced Promote sentence-aware splitting, word limit, chapter count, conclusions, remainder और destination support करता है।

### Advanced promote algorithm

1. Source whitespace normalize होता है।
2. Sentence boundaries खोजे जाते हैं; hard word boundary के पास safe split चुना जाता है।
3. Requested word limit/chapter count के आधार पर proposed chapters बनते हैं।
4. हर chapter को unique title मिलता है।
5. Permanent या per-chapter conclusion जोड़ी जा सकती है।
6. Below-limit/empty/stale splits promotion रोकते हैं।
7. User chapter edit/copy/clear/delete/reverse कर सकता है।
8. Apply पर chapter objects और TXT files बनते हैं; remainder उसी draft में रहता है या empty draft हटता है।

### Naming और fact continuity

- Editor text से saved names के occurrences scan होते हैं।
- Entries active chapter/draft metadata से attached होती हैं।
- Deleted/moved document पर link undefined/missing state में जाता है, silent data loss नहीं होता।
- Deep scan सभी story documents पढ़कर counts recompute करता है।
- Facts attach, pin, edit, filter और chapter relationship के साथ render होते हैं।
- Project Details इन्हीं records को documents से cross-reference कर analytics बनाता है।

### News desk

1. IIFE private scope में `newsDeskState` बनता है।
2. Local fallback state पहले पढ़कर immediate render होता है।
3. Workspace/project handle restore होने पर `NewsDesk_Articles.json` canonical state load करता है।
4. Article selection current editor inputs capture करती है।
5. Headline, deck, byline, body sections, sources, tags, checklist और status model में sync होते हैं।
6. Debounced save localStorage और उपलब्ध होने पर project file दोनों लिखता है।
7. Publish status/checklist update करता है; कोई remote CMS publish नहीं होता।
8. AI buttons केवल prompt text तैयार करते हैं; network model invocation नहीं करते।

### Project details dashboard

यह page project data को mutate करने वाले छोटे metadata operations के अलावा मुख्यतः derived/read model है:

- manifest, drafts, naming, facts और document TXT पढ़ता है;
- word counts, name/fact mentions और changes बनाता है;
- Documents, Names, Facts, Notes, Changes और Graphical View render करता है;
- name/fact filters, sorting, chapter range और occurrence filters देता है;
- mention preview mark navigation करता है;
- metadata edit वापस manifest में persist करता है;
- cache files performance के लिए derived results रखती हैं।

### AI Agents Studio

आठ hard-coded agent definitions हैं: world builder, character, plot, continuity/RAG, style, editor quality, timeline/lore और idea/scene। Controller localStorage से project-like data पढ़ता, cards/metrics/JSON inspector render करता और simulated diagnostics/console messages देता है। कोई API call, embeddings, RAG index, background worker या LLM execution source में नहीं है; इसलिए इसे operational AI subsystem नहीं बल्कि UI prototype/monitor समझना चाहिए।

## 8. Editor subsystems और function families

नीचे function-level map दिया गया है। एक family में साथ लिखे functions एक ही invariant/state पर काम करते हैं। Exact implementation संबंधित source file में है।

### Shared icon और tooltip functions

- `withSvgClass`, `lmIcon`, `svgNodeFromHtml`, `hydrateLmIcons`: registry lookup, SVG class injection, DOM node creation और icon slots hydrate करते हैं।
- `shortcutTooltipElement`, `shortcutTooltipTargetFromEvent`: singleton tooltip और event target resolve करते हैं।
- `suppressShortcutNativeTitle`, `restoreShortcutNativeTitle`: duplicate browser tooltip रोकते/वापस करते हैं।
- `positionShortcutTooltip`, `showShortcutTooltip`, `hideShortcutTooltip`, `scheduleShortcutTooltip`, `initShortcutTooltips`: delay, placement और global events संभालते हैं।

### Theme functions

- `normalizeThemeMode`, `getStoredThemeMode`, `getCurrentThemeMode`, `setStoredThemeMode`: theme validation और persistence।
- `syncThemeClass`, `applyLekhakThemeClasses`, `setGlobalDarkState`: body/document classes और legacy dark flag sync।
- `getThemePanelElements`, `positionThemePanel`, `syncThemePanelState`, `setThemePanel`, `toggleMoreThemeOptions`, `toggleThemePanel`, `selectThemeMode`: theme chooser UI।
- `idToAliasClass`, `syncElementIdClasses`, `syncIdClasses`, `observeThemeTargets`, `initLekhakThemeClasses`: id-based CSS aliases और dynamically inserted DOM observe करते हैं।

### Floating panel functions

- `focusPanelNumber`, `focusPanelPositionKey`, `focusPanelPositionConfig` और `panelNumber`, `resolvePanelPositionKey`, `floatingPanelPositionConfig`, `applyFloatingPanelPositionOffsets`: shared positioning policy।
- `floatingFocusPanelElements`, `isFloatingFocusPanelOpen`, `focusPanelSlotForPanel`, `focusPanelSlotElements`: panel discovery/state।
- `closeFocusPanelSlotGroup`, `closeFocusPanelSlotPanel`, `enforceFocusPanelSlot`, `claimFocusPanelSlot`, `closeFocusModePanels`: mutually exclusive left/center/right slots।
- `editorSelectionSnapshotForFocus`, `captureFloatingFocusSnapshotFrom`, `prepareFloatingPanelFocusReturn`, `restoreFloatingPanelFocusSnapshot`, `restoreFloatingPanelFocusReturn`: selection/caret round-trip।
- `syncFloatingPanelFocusState`, `initFloatingPanelFocusReturnSystem`: MutationObserver और pointer/focus event binding।

### State/default/normalization functions

- `createDefaultChapter`, `createDefaultDraft`, `createDefaultPart`: valid new entities।
- `normalizeChapter`, `normalizeDraft`, `normalizeDrafts`, `normalizeTrashDraft`, `normalizeTrashDrafts`, `normalizePart`: stored/legacy data normalization।
- `chapterFilePath`, `draftFilePath`, `trashDraftFilePath`, `chapterEditDraftFilePath`, `nextDraftFilePath`: deterministic paths।
- `normalizeStoryFacts`, `defaultNamingCategories`, `normalizeNamingData`, `migrateLegacyTagsToNaming`: continuity database migration।
- `activeEditorDocument`, `activeEditorDisplayTitle`, `activeEditorStorageKey`, `isDraftActive`, `isTrashDraftActive`: current-document abstraction।
- `normalizeChapterEditDraft`, `ensureChapterEditDraft`, `activateChapterEditDraft` और `chapterEdit*Matches*` functions: recovery snapshot और comparisons।
- `canEditActiveDocument`, `syncActiveEditorDocumentFromEditor`: edit permission और DOM-to-model sync।

### Storage और workspace functions

- `normalizeProjectManifest`, `createProjectManifest`, `chaptersToManifest`, `chapterManifestEntry`: manifest model।
- `projectTypeFolderName`, `projectWorkspacePath`, `workspaceProjectParentDirectory`, `workspaceProjectDirectoryHandle`: workspace routing।
- `openProjectDB`, `readStoredDirectoryHandle`, `saveStoredDirectoryHandle`, `readProjectHandle`, `readWorkspaceHandle`: handles।
- `verifyProjectPermission`, `splitProjectPath`, `getProjectFileHandle`, `getProjectDirectoryHandle`, `readFileText`, `writeFileText`: low-level filesystem boundary।
- `readProjectManifest`, `writeProjectManifest`, `readNamingDataFromProject`, `writeNamingDataToProject`, `readDraftsDataFromProject`, `writeDraftsDataToProject`, trash/edit-draft read/write functions: typed repositories।
- `loadLocalProject`, `restoreProjectFromWorkspaceFolder`, `restoreLocalProject`, `loadWorkspaceFolder`, `clearActiveStoryState`: project session lifecycle।
- `saveCurrentProject`, `runAutoSave`, `manualSave`, `writeCurrentChapterToLocalFile`, `writeCurrentDraftToLocalFile`: save orchestration।
- `createUniqueStoryDirectory`, `copyProjectDirectoryContents`, `removeWorkspaceProjectDirectory`, `renameActiveStoryFolderIfNeeded`: create/rename/move operations।
- `workspaceProjectManifestSummaries`, `listWorkspaceStories`, `listWorkspaceRecentProjects`, `resolveWorkspaceStoryHandle`, `openWorkspaceStory`: project library/query operations।

### Paste/copy और settings functions

- `pastedTextToParagraphs`, `pastedHtmlToParagraphs`, `editorPasteEntriesFromClipboard`: clipboard को paragraph/gap entries में बदलते हैं।
- `smartPasteEntriesToEditorHTML`, `smartPasteEntriesToPlainText`, `editorHTMLFromPaste`, `editorTextFromPaste`: configured formatting output।
- `normalizeEditorSettings`, `currentEditorSettingsSnapshot`, `applyEditorSettingsSnapshot`, `persistEditorSettingsToActiveDocument`: global/document settings।
- `togglePasteSettings`, `setSmartPasteLineSpacing`, `setSmartPasteParagraphGap`, `setSmartPasteFontSize`, `applySmartPasteStylesGlobally`: smart paste controls।
- `toggleCopySettings`, `setCopyParaMode`: smart copy enable/mode policy; custom paragraph-gap value अब Advanced Settings से persisted state में आती है।
- `setEditorFindMode`, `setEditorReplaceScope`, `setEditorAutoScrollMode`, `toggleAutoSaveSetting`: behavior switches।

### Core editor rendering/history

- `renderEditorDocumentContent`, `setEditorRenderMode`, `setPlainTextEditorValue`, `setReviewEditorValue`: active content render।
- `getCleanEditorHTML`, `getCleanEditorText`, `editorHTMLToText`, `editorContentExportText`: sanitized content/export conversion।
- `countWordsFromText`, `htmlToCountableText`: stats।
- `createEditorHistorySnapshot`, `captureEditorHistorySnapshot`, `persistEditorHistory`, `restoreEditorHistorySnapshot`: undo snapshot pipeline।
- `undoEditorHistory`, `redoEditorHistory`, `handleEditorHistoryShortcut`: undo/redo behavior।
- Selection helper family `editorHistoryNodePath`, `editorHistoryNodeFromPath`, `editorHistoryTextOffset`, `editorHistoryPositionForTextOffset`: caret restore।

### Find/replace

- `isEditorFindWordChar`, `isEditorFindBoundary` और normalization helpers: Unicode-aware token boundaries।
- Deep/safe/raw modes क्रमशः normalized flexible match, safer token match और near-literal Hindi-aware match देते हैं।
- Highlight helpers editor DOM में temporary `<mark>` nodes लगाते हैं और `unwrapHighlights` save/export से पहले हटाता है।
- Replace scope current occurrence/document या configured broader scope पर लागू होता है; operation के बाद model/save state refresh होता है।
- Project Details में समान logic `projectDetailsCountDeepTerm`, `projectDetailsCountSafeTerm`, `projectDetailsCountRawTerm`, `projectDetailsTermRanges`, `projectDetailsPreviewMentionHtml` के रूप में read-only analytics के लिए दोहराया गया है।

### Auto-scroll और focus mode

- `currentEditorAutoScrollMode`, depth/band normalizers और CSS depth helpers setting पढ़ते/लागू करते हैं।
- `runEditorCaretAutoScroll`, `runEditorEmptyParagraphCaretAutoScroll`, `runEditorCaretBandAutoScroll`, `runEditorCaretTextStartAutoScroll`: mode-specific movement।
- `markEditorManualScrollOverride`, `scheduleEditorManualScrollResume`, `cancelEditorCaretAutoScroll`: user scroll को animation से बचाते हैं।
- Depth/band marker drag, click और keyboard helper families interactive scroll targets बदलती हैं।
- `toggleFocus` और `focus*Panel` families distraction-free layout, hover-intent controls और side/center panel slots संभालती हैं।
- Standalone focus helpers query parameters और outer shell navigation संभालते हैं।

### Hindi Unicode input

- Character classifier family (`isDevanagari*`, `classifyHindiCodePoint`) code points को consonant, vowel, matra, virama और combining mark मानती है।
- `logicalInputSequence`, `editorLogicalState`, refresh/schedule functions DOM text को logical units में map करते हैं।
- `logicalDeletionPlan`, `handleLogicalDelete` grapheme के बजाय Hindi logical composition के अनुसार Backspace/Delete करते हैं।
- Pending virama state/marker/caret overlay functions half-consonant sequence को visually और logically stable रखते हैं।
- Matra cluster functions सही base consonant खोजकर primary matra replace/compose करते हैं।
- Text-offset/Range helpers contenteditable DOM और logical offset में conversion करते हैं।
- `handleLogicalBeforeInput` browser `beforeinput` intercept करता है; `initHindiUnicodeEditing` listeners bind करता है।

### Parts, chapters, drafts, trash

- Add/render/select/edit/delete function families sidebar और manifest दोनों sync करती हैं।
- Part deletion केवल empty part या chapters को raw रखने वाले controlled path से होती है।
- Chapter deletion/move-to-draft operations files, indices, naming links और active target update करती हैं।
- Draft range selection Shift-click support करती है; bulk trash/restore/permanent-delete available है।
- `isNewDraftState` unsaved/new draft branching में उपयोग होता है।

### Naming, facts और notes

- Naming category functions create/edit/delete, visibility-per-chapter, keyboard shortcut और sort/search panels संभालती हैं।
- Naming entry functions save/edit/delete, description popover, attachment, mention count, deep scan और history संभालती हैं।
- `scanNamingUsesForDocument`, `scanCurrentChapterForNamingUses`, `deepScanAllNamingEntries`: occurrence engines।
- Fact functions composer/detail, add/edit/delete, search, pin, chapter options और rendering संभालती हैं।
- Note rendering active document descriptions/facts/names को side-panel summary में जोड़ती है।

### Project Details function families

- `projectDetailsLoadState`, file readers और `projectDetailsBuildDocuments`: aggregate model।
- `projectDetailsDocumentStats`, `projectDetailsNameViewModels`, `projectDetailsFactViewModels`, `projectDetailsBuildChanges`: derived analytics।
- `projectDetailsRenderHero`, `projectDetailsRenderStats`, `projectDetailsRenderDocuments`, `projectDetailsRenderNameDetail`, `projectDetailsRenderFactDetail`, `projectDetailsRenderNotes`, `projectDetailsRenderChanges`: main views।
- `projectDetailsGraph*`: document/entity filters, bar/line SVG और chapter relationship charts।
- `projectDetailsEnsureDocumentPreviewModal`, preview mention helpers और name history modal helpers: drill-down UI।
- `projectDetailsApplyNameSort`, name filter/range helpers और fact sort helpers: list controls।
- `projectDetailsPersistNameTitle`, `projectDetailsPersistNameDescription`, `projectDetailsPersistFactTitle`, pin/delete helpers: controlled mutations।
- Custom-scroll-thumb family native scroll state से visual thumb बनाती और pointer drag map करती है।
- Story-library family dashboard छोड़े बिना workspace के दूसरे project पर switch करती है।

### News function families

- `createArticle`, `normalizeArticle`, `normalizeState`, `currentArticle`: domain model।
- `readLocalNewsState`, `writeLocalNewsState`, workspace file functions: dual persistence।
- `renderSidebar`, `renderArticleList`, `renderPaper`, `renderInspector`, `renderSources`, `renderTags`, `renderChecklist`: view renderers।
- `captureCurrentArticle`, `scheduleNewsSave`, `saveNewsArticle`: DOM-to-model/save pipeline।
- `newNewsArticle`, `loadNewsTemplate`, section/source/tag/checklist add/remove functions: editing commands।
- `formatNews`, `formatNewsBlockquote`, `insertNewsLink`, font/focus helpers: contenteditable commands।
- `newsAiAction`, `showNewsStyleGuide`, `showNewsSeoTips`: prompt-only assistance।

### Home और overview functions

- `registerHomeOverview`, `selectHomeOverview`, `setActiveHomeOverviewButton`: overview registry/router।
- `homeOverviewAction`, `homeOverviewPills`, `homeOverviewFeatureCards`, `homeOverviewWorkflow`, `homeOverviewLane`: safe HTML builders।
- Six overview files renderer callbacks register करते हैं; उनमें standalone named functions नहीं हैं।
- `restoreHomeWorkspaceHandle`, `renderStoryTypeOptions`, `syncHomeLabels`, `bindHomeEvents`, `initHome`: home lifecycle।

## 9. Initialization order और event strategy

- Pages `DOMContentLoaded` listeners से boot होती हैं।
- Story editor का final boot `init()` को call करता है; इसलिए `init` उससे पहले core script में परिभाषित होना चाहिए।
- बहुत से HTML buttons inline `onclick` use करते हैं, इसलिए called functions global scope/window पर उपलब्ध होने चाहिए।
- News controller IIFE में private functions रखता है और केवल HTML handlers के लिए चुने हुए functions `window` पर export करता है।
- MutationObserver dynamic icons/theme aliases/floating panel state/custom controls sync करते हैं।
- Pointer/keyboard global listeners Escape close, drag, click-outside, Ctrl/Cmd+S और selection recovery handle करते हैं।

## 10. Security, privacy और reliability

- Project content local machine पर रहता है; source में project text भेजने वाला backend/network API नहीं मिला।
- Folder permission browser-controlled है और explicit user action/permission पर निर्भर है।
- HTML strings बनाते समय `escapeHtml` families उपयोग होती हैं, फिर भी inline handlers और template HTML के कारण हर नया user-controlled interpolation escape होना चाहिए।
- `document.execCommand` formatting/copy/link के लिए उपयोग होता है; यह deprecated API है और long-term replacement चाहिए।
- File writes replace-style हैं; crash के बीच atomic temp-file/rename transaction नहीं है। Recovery drafts इस risk को कुछ हद तक कम करते हैं।
- Copy-then-delete rename interrupted हो तो duplicate folders रह सकते हैं।
- Global namespace और load-order coupling regression risk बढ़ाते हैं।
- localStorage quota और JSON parse failures catch/fallback किए जाते हैं, पर centralized error telemetry नहीं है।

## 11. वर्तमान सीमाएँ और technical debt

1. **No build/test system:** automated unit/integration tests, lint config और package metadata नहीं हैं।
2. **Large controllers:** `01-editor-core.js` और project-details controller बहुत बड़े हैं; bounded modules में विभाजन उपयोगी होगा।
3. **Global coupling:** state और functions implicit globals पर निर्भर हैं। ES modules/service layers से contracts स्पष्ट हो सकते हैं।
4. **Duplicate utilities:** escape, normalization, find/count और file helpers कई pages में दोहरते हैं।
5. **Browser limitation:** Safari/Firefox में folder workflow उपलब्ध/समान नहीं हो सकता।
6. **AI naming vs reality:** AI Agents और news AI actions UI/prompt simulation हैं, actual AI integration नहीं।
7. **No schema version:** files normalized तो होती हैं, पर explicit `schemaVersion` और migrations registry नहीं है।
8. **Concurrency:** एक project दो tabs में खुला हो तो last-write-wins; locking/conflict detection नहीं दिखती।
9. **Backups:** automatic snapshot/versioned backup नहीं; history मुख्यतः browser-local/editor-oriented है।
10. **Accessibility:** focus-return और ARIA पर अच्छा काम है, पर inline dynamic panels का full keyboard/screen-reader audit अभी आवश्यक है।

## 12. Developer change guide

### नया manifest field जोड़ना

1. `normalizeProjectManifest` में default/legacy mapping जोड़ें।
2. `createProjectManifest` और save serialization update करें।
3. Story info/project details forms और renderers update करें।
4. News project हो तो उसके manifest compatibility path की जाँच करें।
5. Existing old manifest से open/save/open regression test करें।

### नया editor setting जोड़ना

1. default और normalizer जोड़ें।
2. localStorage scoped key/read-write path जोड़ें।
3. document-level override चाहिए तो active document serialization जोड़ें।
4. settings UI sync और toggle/set function जोड़ें।
5. chapter, draft, trash, recovery और focus modes में behavior verify करें।

### नया floating panel जोड़ना

1. Unique id और open/hidden/ARIA state दें।
2. position config में key/default जोड़ें।
3. focus-return system में panel discoverable बनाएँ।
4. focus mode slot चाहिए तो `data-focus-panel-slot` और close callback दें।
5. Escape, click-outside, resize और editor selection restoration test करें।

### नया project type जोड़ना

1. type-folder mapping और label/translation जोड़ें।
2. creation/manifest defaults और supported-type guard update करें।
3. home overview और routing तय करें।
4. dedicated editor या existing editor compatibility implement करें।
5. project library scan, recent list, rename/type move और details dashboard update करें।

## 13. Suggested verification checklist

- Workspace first select, reload और permission restore।
- नया Story, Novel और News project creation।
- Duplicate title और sanitized folder collision।
- Chapter/draft save, reload, autosave और Ctrl+S।
- Chapter edit crash/reload recovery use/discard।
- Trash restore और permanent delete; अंतिम document guard।
- Raw और advanced promotion, remainder और conclusions।
- Hindi virama, matra replacement, Backspace/Delete और mixed Latin input।
- Find deep/safe/raw और replace scopes।
- Naming attachment, deleted document, deep scan और history।
- Fact pin/edit/delete और project-details analytics।
- Theme persistence और every floating panel focus return।
- News JSON reload, templates, sections, sources, checklist और publish state।
- Same project दो tabs में खोलकर overwrite risk का manual observation।

## 14. Important conclusion

इस codebase का core value इसका **local-file-first writing workflow**, rich story continuity tools और Hindi-aware editing behavior है। सबसे संवेदनशील invariants हैं: manifest/path consistency, active editor mode, chapter-edit recovery, naming document links और script loading order। किसी refactor में पहले persistence/service boundary और explicit state store बनाना चाहिए; UI को बाद में छोटे components/modules में बाँटना कम जोखिम वाला रहेगा।
