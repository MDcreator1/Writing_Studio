# लेखक मंच: Working Guide

यह guide application चलाने, प्रमुख workflows समझने, सुरक्षित code changes करने, tests चलाने और failures debug करने के लिए है। System structure के लिए `ARCHITECTURE.md` देखें।

## 1. Local development

### Requirements

- Current Chrome या Microsoft Edge
- Local HTTP server
- Node.js केवल tests और syntax checks के लिए
- Workspace के रूप में user-selected writable folder

### Start

Repository root से:

```powershell
python -m http.server 8000
```

या:

```powershell
npx serve .
```

फिर `http://localhost:8000/home.html` खोलें। HTML file को सीधे `file://` से खोलने पर File System Access और secure-context behavior विश्वसनीय नहीं होगा।

## 2. First-run workflow

1. Home page पर **Choose Folder** चुनें।
2. Browser की read/write permission स्वीकार करें।
3. नया Story, Novel या News project बनाएँ।
4. Application type के अनुसार `Stories`, `Novels` या `News Articles` folder बनाती/उपयोग करती है।
5. Active workspace/project handles IndexedDB में और identity hints localStorage में save होते हैं।
6. Reload पर permission valid हो तो project restore होता है; अन्यथा browser दोबारा user gesture माँग सकता है।

Workspace root को स्वयं project folder न मानें। Canonical hierarchy type folder और उसके अंदर project folder है।

## 3. Story/Novel editor working model

### Active documents

Editor modes:

- `chapter`: saved chapter
- `draft`: active draft
- trash draft view
- chapter edit/recovery draft

Sidebar metadata पहले load होती है; body TXT केवल active/required document के लिए load हो सकती है। इसलिए unloaded `content` को empty document न समझें। किसी bulk operation से पहले संबंधित `ensure*ContentLoaded()` function call करें।

### Saving

- Active editor input runtime document object में synchronize होता है।
- Autosave configured interval/debounce पर document body, metadata और dependent state लिखता है।
- Manual save/Ctrl+S उसी persistence boundary को force करता है।
- Chapter edit unlock होने पर temporary recovery body `Edited_Chapter/` और metadata `Temp_Chapter_Draft.json` में रहती है।
- Successful permanent chapter save के बाद unchanged recovery artifact साफ किया जा सकता है।

Save UI indicator केवल feedback है; canonical success file write resolve होने पर मानी जाए।

## 4. Parts और chapter organization

`chapters` runtime में flat array है। `partIndex` membership और `chapterNo` part-local display क्रम बताता है। Parts से बाहर chapters Temporary/Raw Chapters section में दिखते हैं।

### Multi-selection

- Active chapter को anchor बनाकर Shift-click करें।
- Selection anchor से clicked chapter तक सीमित रहती है।
- Selection किसी एक part/raw scope को cross नहीं करती।
- First boundary selected होने पर previous part action उपलब्ध हो सकती है।
- Last boundary selected होने पर next part, Temporary Chapters या Draft action उपलब्ध हो सकती है।
- First part और Last part के special guards destructive whole-boundary action सीमित करते हैं।

### Safe movement

Part-to-part movement chapter TXT file का path/content नहीं बदलता। केवल `partIndex`, derived numbering और manifest structure बदलते हैं। Write failure पर in-memory metadata rollback होनी चाहिए।

Chapter-to-draft conversion का safe order:

1. Selected chapter bodies पूरी तरह load करें।
2. Draft payload और unique draft paths बनाएँ।
3. Replacement draft TXT files लिखें।
4. Draft और recovery metadata लिखें।
5. Updated manifest लिखें।
6. अंत में पुराने chapter/recovery files हटाएँ।

इस क्रम को उलटने से chapter sidebar से और disk से एक साथ गायब हो सकता है।

## 5. Drafts, trash और recovery

- Normal draft metadata `Story_Drafts.json`, bodies `Drafts/` में हैं।
- Trash metadata `Trash/Trash_Drafts.json`, bodies `Trash/` में हैं।
- Restore operation नया durable destination लिखने के बाद trash source हटाए।
- Permanent delete exact selected paths पर ही चले और last-document guards का सम्मान करे।
- Batch conversion/delete से पहले indexes normalize, deduplicate और ascending sort करें।
- Current active item mutate/delete हो तो reference या stable identity से अगला active target तय करें।

## 6. Basic और Advanced Import

### Basic import

Text Import panel paste, TXT और DOCX text स्वीकार करती है। Input केवल preview state में रहता है जब तक user import action confirm नहीं करता।

### Advanced Import

1. Source text चुनें।
2. Target Drafts या Chapters चुनें।
3. Automatic या custom separating-word split चुनें।
4. Word target और optional chapter count adjust करें।
5. Generated list और full text preview करें।
6. Titles edit करें और conflict validation देखें।
7. Apply करें।

Chapter import में short remainder configured behavior के अनुसार Draft बनता है। Draft import में remainder split policy के अनुसार merge या separate draft हो सकता है। Source/settings बदलने के बाद generated preview stale मानी जाती है और regenerate आवश्यक है।

## 7. Advanced Promote

Advanced Promote source draft से proposed chapters बनाता है।

- Words-per-chapter और chapter-count controls shared persisted defaults उपयोग करते हैं।
- Permanent conclusion Advanced Settings से आती है और generated chapter preview में जुड़ती है।
- Remainder source draft में रहता है और left index के source-draft entry से देखा जा सकता है।
- Apply से पहले every non-empty chapter body, minimum word policy, current generation और title uniqueness validate होती है।
- Existing chapter title या generated duplicate title मिलने पर Promote inactive रहता है और click reason popup दिखाता है।
- Commit failure में created artifacts rollback और source draft preservation प्राथमिकता है।

## 8. Naming workflow

### Normal use

- Names categories में save होते हैं।
- Entry primary name, aliases/similar names, description और first-appearance metadata रख सकती है।
- किसी rendered name पर double-click उसका displayed name clipboard में copy करता है।
- Active document snapshot added और detected states दिखाती है।
- Category “show more” full category data demand पर hydrate करती है।

### Deep scan

Deep Scan actual chapter/draft TXT files पढ़ती है, केवल currently loaded editor bodies नहीं। हर entry के primary और alias names earliest-to-latest search होते हैं। Found document chapter/draft status, key, title, number, path और description metadata repair करता है।

Safe flow:

1. Source text index बनाएँ।
2. Async read के बाद authoritative full Naming dataset दोबारा hydrate करें।
3. Local full object पर सभी entries scan करें।
4. Guarded writer से `Story_Naming.json` save करें।
5. Per-document snapshots rebuild करें।

`namingData` projection mode में हो सकती है। Full write/delete से पहले `LmInitialRendering.ensureFullNamingData()` आवश्यक है।

### Naming write safety

Guarded writer:

- project-handle scoped serialization करता है;
- current full entries preserve करता है;
- `Story_Naming.previous.json` backup रखता है;
- written payload read-back verify करता है;
- failure पर previous content restore करता है;
- project switch के बाद stale writer reject करता है।

इस path को bypass करके `Story_Naming.json` direct overwrite न करें।

## 9. Facts और Word Editing

Facts `Story_Facts.json` में रहती हैं। Legacy manifest facts migration complete हुए बिना manifest से facts strip न करें। Facts panel lazy loaded है; hidden panel का empty runtime array authoritative absence नहीं है।

Word dictionary `Story_Word_Editing.json` में project-scoped है। Project switch पर dictionary state reset करें और section open/editor demand पर load करें। Bulk replace से पहले all target bodies load, preview और reversible history/persistence policy verify करें।

## 10. Smart Copy और Smart Paste

Smart Paste clipboard HTML/text normalize करके paragraph entries बनाता है, unsafe tags हटाता है और configured spacing/font rules लगाता है।

Smart Copy को visible DOM fragment तक सीमित नहीं होना चाहिए। Virtual/large document में full authoritative text/HTML bridge से payload बनना चाहिए। Clipboard API fail होने पर fallback copy path उपलब्ध है। इन परिस्थितियों को test करें:

- normal DOM editor
- virtualized large document
- active draft
- chapter edit recovery
- selection और no-selection
- Clipboard API denied/unavailable

## 11. Project Details और News Desk

Project Details authoritative project files पढ़कर document/name/fact views और derived caches बनाती है। Metadata edits करते समय first-appearance links या document content अनजाने में overwrite नहीं होना चाहिए।

News Desk का primary state `NewsDesk_Articles.json` है। इसका controller page-local IIFE है और केवल HTML handlers के लिए selected APIs `window` पर expose करता है। News localStorage state fallback है, project file source of truth है।

## 12. CSS और UI change workflow

1. Element की owning page और feature stylesheet पहचानें।
2. Shared base में तभी बदलें जब सभी pages पर behavior चाहिए।
3. Existing CSS variables उपयोग करें; theme-specific hard-coded colors से बचें।
4. Flex/grid scroll region पर parent chain में `min-height: 0` सुनिश्चित करें।
5. Bounded region में `overflow-y: auto` और outer shell में appropriate `overflow: hidden` रखें।
6. Native scrollbar hidden हो तो custom thumb metrics और scroll listener भी verify करें।
7. Light, dark, grey, purple, sunset और forest themes में जाँचें।
8. Focus mode और narrow responsive layout में अलग से verify करें।

## 13. JavaScript change workflow

### नया persisted field

1. Default factory update करें।
2. Normalizer में old/missing values handle करें।
3. File serializer और localStorage projection update करें।
4. Lazy loader/project-switch reset देखें।
5. Old project fixture से open-save-reopen test करें।

### नया classic script

1. Lowest dependency layer पहचानें।
2. Numeric filename/order तय करें।
3. हर relevant HTML entry page में सही स्थान पर script tag जोड़ें।
4. Inline handlers के लिए required function global scope में रखें।
5. Syntax और load-order contract test जोड़ें।

### नया floating panel

1. Unique id, hidden/ARIA state और close function दें।
2. Shared position configuration में registration करें।
3. Focus-return controller से previous focus/selection restore करें।
4. Escape, backdrop, click-outside, resize और nested control behavior test करें।

### Async project operation

1. Starting `projectDirectoryHandle` capture करें।
2. Await के बाद वही handle active है या नहीं जाँचें।
3. Mutation से पहले rollback snapshot बनाएँ।
4. Replacement durable होने से पहले source delete न करें।
5. Failure पर UI status reset और actionable reminder दें।

## 14. Tests

Focused suites:

```powershell
node tests/editor-history-policy.test.js
node tests/workspace-section-loading.test.js
node tests/naming-file-safety.test.js
node tests/advanced-import-promote-settings.test.js
```

इनका coverage:

- Editor history grouping, Unicode/paste losslessness और structural safety contracts
- Lazy workspace sections, rendering snapshots, Naming projections और UI source contracts
- Naming backup, rollback, record preservation और project isolation
- Advanced Import/Promote defaults, split behavior और settings persistence

सभी JavaScript syntax:

```powershell
Get-ChildItem assets -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Whitespace errors:

```powershell
git diff --check
```

Tests source-contract heavy हैं; browser-level behavior के लिए manual checklist अभी आवश्यक है।

## 15. Manual regression checklist

- Workspace choose, permission restore, reload और project switch
- New Story/Novel/News creation और duplicate title guard
- Chapter/draft open, edit, autosave, Ctrl+S और reopen
- Large chapter virtual editor typing, scroll, copy, undo और redo
- Chapter edit recovery use/discard
- Part expansion, bounded Shift selection और boundary moves
- Temporary Chapters scrolling और conversion
- Draft trash, restore और permanent delete guards
- Basic import, advanced draft import और advanced chapter import remainder
- Advanced Promote generation, duplicate title block, apply और source remainder
- Naming add/edit/delete, alias, double-click copy, hover और deep scan
- Facts migration/edit/delete और Project Details aggregation
- Word dictionary preview/apply और project switch isolation
- All themes, focus mode, narrow viewport और floating-panel focus return

## 16. Debugging guide

### Project reload के बाद document missing

1. `Chapters_info.json` में content path जाँचें।
2. Path की TXT file मौजूद है या नहीं देखें।
3. Manifest में body embed होने की अपेक्षा न करें।
4. Browser console में lazy load/permission error देखें।
5. localStorage cache clear करने से पहले canonical files backup करें।

### Naming metadata गलत या गायब

1. `Story_Naming.json` full entry और flags देखें।
2. Actual chapter/draft TXT में primary/alias occurrence जाँचें।
3. Per-document snapshot fingerprint stale है या नहीं देखें।
4. Deep Scan चलाएँ।
5. `Story_Naming.previous.json` और guarded-writer errors देखें।

### Sidebar list बाहर निकल रही है

Parent chain में flex/grid sizing देखें: `min-height: 0`, bounded flex basis, grid `minmax(0, 1fr)`, inner `overflow-y: auto` और outer `overflow: hidden`। Custom thumb target का `clientHeight < scrollHeight` होना चाहिए।

### Save indicator अटका है

Pending autosave flags, loader safety timer, rejected write promise और stale-project guard console warnings देखें। Indicator को force “saved” करने से persistence ठीक नहीं होती।

### Virtual editor में partial copy/restore

Visible DOM की जगह full Worker/global text model उपयोग हो रहा है या नहीं जाँचें। Sequence token, materialized state और pending patch batch inspect करें।

## 17. Data-loss prevention checklist

किसी destructive या structural change से पहले:

- Exact target indexes और paths normalize किए?
- सभी source bodies load हुईं?
- Replacement path collision-free है?
- Replacement content पहले durable लिखा?
- Metadata और manifest consistent क्रम में लिखे?
- Old source सबसे अंत में हट रहा है?
- Failure rollback मौजूद है?
- Active document और selection valid target पर move होते हैं?
- Project switch/stale async operation guard है?
- Reload के बाद canonical files से वही state बनती है?

यदि इनमें से किसी प्रश्न का उत्तर “नहीं” है तो delete/move commit न करें।

## 18. Current engineering priorities

- Browser E2E tests और representative project fixtures
- Common atomic JSON writer/backup policy
- Multi-tab locking या conflict detection
- Classic globals से explicit module/service contracts की gradual migration
- Persisted schemas के लिए versioned migrations
- Deprecated `execCommand` paths का standards-based replacement

Refactor क्रम persistence boundaries और tests से शुरू होना चाहिए; UI decomposition बाद में करना अधिक सुरक्षित है।
