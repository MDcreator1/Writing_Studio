# लेखक मंच: Architecture

यह दस्तावेज़ current repository की source scan पर आधारित canonical architecture reference है। यह बताता है कि pages, classic scripts, runtime state, local files, rendering projections और major subsystems एक-दूसरे से कैसे जुड़े हैं। Operational और change instructions के लिए `WORKING.md` देखें।

## 1. System summary

लेखक मंच browser में चलने वाला local-first multi-page application है। Story/Novel data user के चुने local folder में JSON metadata और TXT document bodies के रूप में रहती है। Application में backend service, framework, bundler या ES-module graph नहीं है।

```text
User interface
  │
  ├── Home / project library
  ├── Story & Novel editor
  ├── Focus editor shell
  ├── Project Details dashboard
  ├── News Desk
  └── AI Agents prototype
  │
Browser runtime
  ├── classic-script global state
  ├── Web Workers for large editor processing
  ├── IndexedDB directory handles
  └── localStorage preferences and fallback caches
  │
Local workspace (durable source of truth)
  ├── JSON metadata
  ├── TXT document bodies
  └── derived rendering/detail caches
```

## 2. Architectural constraints

- JavaScript files classic scripts हैं; top-level functions और variables shared global scope में रहते हैं।
- Numeric filenames और HTML `<script>` order dependency graph का हिस्सा हैं।
- DOM event handlers कई जगह inline `onclick` attributes से global functions call करते हैं।
- Normalizers schema compatibility layer का काम करते हैं; explicit migration framework नहीं है।
- File System Access API primary persistence mechanism है।
- Canonical data, derived caches और transient UI state को अलग रखना अनिवार्य है।

## 3. Pages और navigation boundaries

| Page | Ownership |
|---|---|
| `home.html` | Workspace permission, project discovery, creation और routing |
| `story-novel-project-editor.html` | Story/Novel authoring, organization, continuity और editor tools |
| `story-novel-focus-editor.html` | Focus-mode shell; main editor को focus context में प्रस्तुत करता है |
| `project-details.html` | Project-wide document/name/fact/notes analysis और selected metadata edits |
| `news-article-editor.html` | News-specific article list, editor, sources और publishing state |
| `ai-agents.html` | Local monitor/prototype; production AI service integration नहीं |

Story/Novel और Project Details shared persistence scripts उपयोग करते हैं। News Desk shared foundation load करती है, लेकिन article state का controller page-local IIFE में है।

## 4. Source tree

```text
assets/
├── shared/
│   ├── css/
│   │   ├── 00-base.css
│   │   ├── 01-find-modals.css
│   │   └── 99-theme-overrides.css
│   └── js/
│       ├── 00-icon-registry.js
│       ├── 01-shortcut-tooltips.js
│       ├── 02-floating-panel-focus-return.js
│       ├── 03-theme-controller.js
│       ├── 04a-state-defaults-normalization.js
│       ├── 04b-editor-document-state.js
│       ├── 05-floating-panel-positions.js
│       ├── 05a-editor-advanced-config.js
│       ├── 05aa-advanced-import-promote-settings.js
│       ├── 05b-advanced-word-editing.js
│       ├── 06a-project-storage-foundation.js
│       ├── 06aa-naming-file-safety.js
│       ├── 06b-workspace-restore-autosave.js
│       ├── 06c-workspace-library-settings.js
│       └── 06d-editor-paste-settings.js
└── pages/
    ├── home/
    ├── story-novel-project-editor/
    ├── project-details/
    ├── news-article-editor/
    └── ai-agents/
```

## 5. Shared runtime layers

### 5.1 Presentation foundation

- `00-icon-registry.js`: SVG registry, `lmIcon()` और icon hydration।
- `01-shortcut-tooltips.js`: delayed shortcut tooltips और viewport positioning।
- `02-floating-panel-focus-return.js`: floating panel close होने पर focus/selection restoration।
- `03-theme-controller.js`: theme state, body classes और persisted mode।
- `05-floating-panel-positions.js`: panel-specific positioning policy।

### 5.2 State और normalization

`04a-state-defaults-normalization.js` application का broad contract layer है। इसमें translations, constants, default factories, normalizers और shared runtime variables हैं—जैसे `chapters`, `chapterDrafts`, `namingData`, `projectManifest`, active indexes और selection state।

`04b-editor-document-state.js` active document identity, chapter/draft normalization और recovery comparisons संभालता है।

किसी persisted model में field जोड़ते समय reader और writer दोनों से पहले normalizer update होना चाहिए।

### 5.3 Settings और editing services

- `05a-editor-advanced-config.js`: advanced tuning values और settings modal।
- `05aa-advanced-import-promote-settings.js`: Import/Promote workflow defaults और validation।
- `05b-advanced-word-editing.js`: replacement dictionary, import/export, preview और multi-document application।
- `06d-editor-paste-settings.js`: smart paste/copy, custom selects, formatting settings और common loader UI।

### 5.4 Persistence services

- `06a-project-storage-foundation.js`: path helpers, file handles, JSON/TXT readers-writers, manifest serialization, drafts, naming और dictionary storage।
- `06aa-naming-file-safety.js`: serialized Naming writes, backup, verification, rollback और stale-project guard।
- `06b-workspace-restore-autosave.js`: handle restoration, active document saves, autosave और project folder rename/move flows।
- `06c-workspace-library-settings.js`: project library, project switching, settings और lazy document reads।

## 6. Story/Novel editor module map

### Bootstrap और staged loading

| File | जिम्मेदारी |
|---|---|
| `00a-chapter-sidebar-data.js` | Manifest/draft/trash metadata load; body content lazy रखकर left panel जल्दी render करना |
| `00b-workspace-section-loader.js` | Editor, recovery, status, Naming, Facts, AI और Word Editing readiness को deduplicate करना |
| `00c-facts-panel-data.js` | `Story_Facts.json` ownership और legacy manifest facts migration |
| `00d-first-project-open-repair.js` | Fresh session के first project open पर word-count mismatch repair |
| `00e-initial-rendering-store.js` | Left/status/active/facts projections और per-document Naming snapshots |
| `00f-rendering-snapshot-tools.js` | Developer settings से rendering caches rebuild करना |
| `04-editor-boot.js` | `DOMContentLoaded` पर `init()` call |

### Editor core: `01a`–`01i`

| File | जिम्मेदारी |
|---|---|
| `01a-editor-foundation-history.js` | Editor primitives, history transactions, selection और base icons/helpers |
| `01b-history-auto-scroll.js` | History integration, document naming-use scan और auto-scroll helpers |
| `01c-auto-scroll-find.js` | Auto-scroll behavior और find integration |
| `01d-editor-init-chapters.js` | Main `init()`, events, chapter switching और localization wiring |
| `01e-chapter-parts.js` | Parts, chapter selection scopes, boundary moves और structural reindexing |
| `01f-drafts-management.js` | Drafts, conversion, details panels और part/chapter management |
| `01g-trash-drafts-virtualization.js` | Trash, sidebar rendering, custom scroll thumbs और overflow layout |
| `01h-virtual-editor-pipeline.js` | Large-document virtual rendering, Worker coordination और patch batching |
| `01i-draft-promote-smart-clipboard.js` | Draft promotion, chapter creation और smart-copy payload |

### Find, formatting और side information

- `02a-find-replace-core.js`: match construction, selection और replace policy।
- `02b-editor-formatting-ai.js`: formatting tool dock और auxiliary AI UI।
- `02c-find-results-word-editing.js`: result refresh और word-dictionary bridge।
- `02d-side-info-scroll-thumbs.js`: details popovers के custom scroll controls।

### Naming subsystem

- `03a-naming-panel-core.js`: category/name creation, active panel state और visibility।
- `03b-naming-categories-search.js`: document grouping, detail views, first appearance और search।
- `03c-naming-deep-scan-facts.js`: authoritative deep scan और metadata repair orchestration।
- `03aa-naming-deep-scan-source.js`: chapter/draft source files का normalized text index।
- `03d-naming-category-sort.js`: status/count/time/document ordering।
- `03e-name-detail-aliases.js`: aliases/similar names का measured detail layout।

### Import और Promote

- `05-advanced-draft-promote.js`: shared Advanced Promote/Advanced Import UI, preview, validation और commit flows।
- `05a-advanced-import-splitting.js`: automatic/custom split algorithms और remainder calculation।
- `06-text-import.js`: paste/TXT/DOCX entry panel और basic import handoff।

## 7. Runtime state model

कोई centralized immutable store नहीं है। State चार layers में बंटी है:

1. Global JavaScript variables: current session का normalized working state।
2. DOM/Worker buffers: active editor presentation और uncommitted input।
3. localStorage/IndexedDB: handles, preferences, active target और fallback caches।
4. Project files: durable source of truth।

मुख्य globals:

- Handles: `workspaceDirectoryHandle`, `projectDirectoryHandle`, `activeProjectTypeFolderName`
- Structure: `projectManifest`, `chapters`, `curPart`, `expandedPartIndex`
- Drafts: `chapterDrafts`, `chapterTrashDrafts`, `chapterEditDrafts`
- Active editor: `activeEditorMode`, `curChap`, `curDraft`, `curTrashDraft`
- Continuity: `namingData`, `storyFacts`
- Selection: `selectedChapterIndexes`, `selectedChapterScope`, draft/trash selection sets
- UI: active side panel, focus state, tool docks, find state और autosave flags

Async operations को project handle/generation verify करना चाहिए। पुराने project की delayed read/write को नए active project में merge नहीं किया जाना चाहिए।

## 8. Durable project model

### Files और ownership

| Path | Source of truth for |
|---|---|
| `Chapters_info.json` | Project metadata, part order, chapter metadata और content paths |
| `Chapters/**/*.txt` | Chapter bodies |
| `Story_Drafts.json` | Active draft metadata |
| `Drafts/**/*.txt` | Draft bodies |
| `Temp_Chapter_Draft.json` | Chapter-edit recovery metadata |
| `Edited_Chapter/**/*.txt` | Recovery/edit-draft bodies |
| `Trash/Trash_Drafts.json` | Trashed draft metadata |
| `Trash/**/*.txt` | Trashed draft bodies |
| `Story_Naming.json` | Naming categories, names, aliases और first-appearance links |
| `Story_Facts.json` | Story facts |
| `Story_Word_Editing.json` | Project replacement dictionary |
| `NewsDesk_Articles.json` | News Desk state |

Chapter/draft bodies manifest में embed नहीं होने चाहिए जब local project handle मौजूद हो। Manifest serialization body fields strip करती है और metadata-only cache localStorage में रखती है।

### Derived data

```text
Initial_Rendering/
├── Left_Panel.json
├── Active_Document.json
├── Status_Panel.json
├── Facts_Panel.json
└── Naming_Documents/<document-hash>.json

project-details/
└── derived mention/detail caches
```

Derived caches delete/rebuild किए जा सकते हैं। इनमें मौजूद projection को authoritative dataset के रूप में save नहीं करना चाहिए।

### Browser persistence

IndexedDB database `lekhak-manch-project` के `handles` store में active project और workspace directory handles रखे जाते हैं। localStorage keys `lm_*` namespace में project identity, manifest projection, drafts fallback, theme, editor settings और active UI state रखती हैं।

## 9. Project-open data flow

```text
DOMContentLoaded
  -> init()
  -> restore IndexedDB handles / permissions
  -> identify project and type folder
  -> reset project-scoped lazy modules
  -> load metadata-only sidebar state
  -> render left panel
  -> load active document body on demand
  -> load only visible/required right-panel datasets
  -> restore recovery/editor target/settings
  -> start autosave and UI observers
```

`00b-workspace-section-loader.js` duplicate concurrent loads को एक promise में collapse करता है। Project switch पर generation reset stale completions को reject करता है।

## 10. Editor pipeline

छोटे documents normal editable DOM path उपयोग करते हैं। Configured word threshold से बड़े documents virtual pipeline में जाते हैं:

```text
TXT source / normalized document
  -> processing Worker
  -> paragraph/session model
  -> viewport materialization
  -> DOM input patch
  -> Worker/global text synchronization
  -> history transaction
  -> autosave / explicit save
```

`editor-processing-worker.js` text segmentation/processing और `editor-html-bridge-worker.js` HTML bridge work off-main-thread करते हैं। Restore sequences और document identity checks delayed Worker responses को नए document पर paint होने से रोकते हैं।

History contiguous typing को word-oriented transactions में merge करती है; paste, replace, caret relocation और whitespace boundary अलग transactions बना सकते हैं। Hindi input logical Devanagari units को raw UTF-16 character deletion से अलग संभालता है।

## 11. Chapters, parts, temporary chapters और drafts

- `chapters` flat runtime array है; प्रत्येक chapter का `partIndex` उसे part से जोड़ता है।
- Invalid/`-1` part index वाला chapter Temporary/Raw Chapters section में दिखता है।
- `reindexProjectStructure()` हर part और temporary scope में local `chapterNo` दोबारा बनाता है।
- Multi-chapter selection एक scope तक सीमित रहती है। Shift selection anchor से clicked chapter तक bounded range बनाती है।
- Part header boundary actions तभी दिखते हैं जब selection first और/or last chapter को छूती है।
- Part-to-part move केवल structure metadata बदलता है; chapter TXT file delete नहीं होती। Failure पर memory rollback होती है।
- Chapter-to-draft conversion पहले replacement draft bodies और metadata durable करती है; पुराने chapter sources अंत में हटते हैं।

Draft promotion chapter बनाते समय target part/raw destination, title conflicts, source remainder और Naming scans को coordinate करता है।

## 12. Naming architecture

`Story_Naming.json` full authoritative dataset है। UI performance के लिए active document पर केवल relevant entries का projection load हो सकता है।

```text
Story_Naming.json
  -> fullNamingData / namingIndex
  -> active document projection
  -> Initial_Rendering/Naming_Documents/*.json
  -> Naming panel rendering
```

महत्वपूर्ण invariants:

- Projection को सीधे full file का replacement नहीं बनाया जा सकता।
- Full write से पहले `ensureFullNamingData()` projected edits को authoritative data में merge करता है।
- `06aa-naming-file-safety.js` writes serialize करता है, previous backup बनाता है, output verify करता है और failure पर rollback करता है।
- Project handle बदलने पर stale write cancel होना चाहिए।
- Deep scan actual chapter/draft TXT sources पढ़ता है, earliest matching document चुनता है और chapter title/no/path सहित incomplete metadata repair करता है।
- Deep scan asynchronous source read के बाद full data दोबारा hydrate करता है, जिससे document-switch projection race authoritative file को truncate न करे।
- Per-document snapshots content hash और Naming source fingerprint से validate होती हैं।

## 13. Facts और Project Details

Facts का canonical dataset `Story_Facts.json` है। पुराने projects में manifest-embedded facts को `00c-facts-panel-data.js` पहली जरूरत पर migrate करता है। Manifest overwrite से पहले migration guard legacy facts सुरक्षित करता है।

Project Details page chapters/drafts/names/facts को aggregate करती है, mention counts और graphs बनाती है तथा selected metadata edits वापस guarded project writers से save करती है। Description edit first-appearance chapter links नहीं बदलनी चाहिए।

## 14. Advanced Import और Promote

दो workflows common panel और persisted defaults साझा करते हैं:

- Advanced Import: pasted/imported source को drafts या chapters में बाँटता है। Automatic split sentence/newline boundaries खोजता है; custom split repeated separator word उपयोग करता है। Chapter mode का remainder अलग draft बन सकता है।
- Advanced Promote: एक source draft से proposed chapters बनाता है; remainder source draft में रहता है। Preview title/body/conclusion edit की जा सकती है।

Commit से पहले generated state fresh, body valid और chapter titles existing/generated titles से conflict-free होने चाहिए। Disabled primary action click करने पर block reason popup दिखना चाहिए।

## 15. CSS architecture

Shared base पहले, page feature styles उसके बाद और `99-theme-overrides.css` अंत में load होती है। Story editor styles जिम्मेदारी के अनुसार split हैं:

- `00-editor-layout.css`: shell, chapter sidebar, parts/drafts और base editor layout
- `01-floating-tools.css`: tool docks और floating controls
- `02-side-panels.css`: Naming/Facts/AI side panels
- `03-focus-responsive.css`: focus mode और responsive behavior
- `04-advanced-draft-promote.css`: Advanced Promote/Import workspace
- `05-text-import.css`: basic import panel
- `06-advanced-editor-settings.css`: advanced settings
- `07-advanced-word-editing.css`: word dictionary UI

Theme colors direct hard-coded values के बजाय CSS variables से आने चाहिए। Dynamic lists custom scroll-thumb controllers उपयोग कर सकती हैं; native scrollbar hidden होने पर container को bounded `min-height: 0` और `overflow-y: auto` देना आवश्यक है।

## 16. Reliability और security boundaries

- User-controlled text को template HTML में रखने से पहले `escapeHtml`/attribute-safe escape उपयोग करें।
- Paths helpers से बनें; destructive delete को exact stored content path तक सीमित रखें।
- Replacement data durable होने से पहले original chapter/draft source delete न करें।
- In-memory mutation के साथ rollback snapshot रखें यदि disk write fail हो सकती है।
- localStorage quota failure को canonical file save failure न समझें।
- Async callbacks में active project/document identity verify करें।
- Worker response के sequence token की जाँच किए बिना DOM update न करें।
- Naming/Facts derived snapshots को canonical data न मानें।

## 17. Known limitations

- Classic global namespace और implicit dependencies refactoring risk बढ़ाते हैं।
- Browser E2E automation और production build pipeline उपलब्ध नहीं हैं।
- Multi-tab project locking/conflict resolution नहीं है।
- File writes हर dataset के लिए एक समान atomic temp-file/rename transaction उपयोग नहीं करतीं। Naming में dedicated backup/verify guard है।
- File System Access API support browser-dependent है।
- AI interfaces production LLM backend से connected नहीं हैं।
- `document.execCommand` आधारित formatting/copy fallbacks long-term modernization चाहते हैं।

## 18. Architecture change rule

नई feature जोड़ते समय पहले तय करें कि उसका data canonical project file, derived cache, browser preference या transient UI state में से किस category में आता है। Writer, normalizer, lazy loader, project-switch reset और tests को उसी ownership boundary के अनुसार update करें।
