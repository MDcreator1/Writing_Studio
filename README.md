# लेखक मंच (Lekhak Manch)

लेखक मंच एक local-first browser writing studio है। यह Story, Novel और News Article projects को user के चुने हुए local workspace में रखता है। मुख्य application plain HTML, CSS और classic JavaScript पर बनी है; कोई framework, bundler, backend या package installation आवश्यक नहीं है।

## मुख्य क्षमताएँ

- Parts, chapters, temporary/raw chapters, drafts और trash management
- Autosave, manual save और chapter-edit recovery
- बड़े documents के लिए Worker-आधारित virtual editor pipeline
- Hindi/Devanagari-aware typing, caret और deletion behavior
- Find/replace, advanced word dictionary और bulk replacement
- Smart paste और full-document smart copy
- Basic तथा advanced text import
- Draft-to-chapter advanced promotion, remainder handling और title-conflict validation
- Naming database, aliases, first-appearance metadata और authoritative deep scan
- Story facts, notes, project details और relationship/usage views
- Focus mode, configurable auto-scroll और multiple themes
- अलग News Desk और local AI-agent UI prototype

## Repository entry points

| File | भूमिका |
|---|---|
| `home.html` | Workspace selection, project creation और recent-project library |
| `story-novel-project-editor.html` | Story/Novel का मुख्य editor |
| `story-novel-focus-editor.html` | मुख्य editor का distraction-free focus shell |
| `project-details.html` | Documents, names, facts, notes और graphs dashboard |
| `news-article-editor.html` | News Article workspace |
| `ai-agents.html` | Local AI-agent monitor/prototype |
| `temp.html` | Development experiment; canonical application flow का भाग नहीं |

## चलाना

File System Access API के कारण application को `localhost` या secure context पर चलाएँ। Chrome या Microsoft Edge recommended हैं।

Python के साथ:

```powershell
python -m http.server 8000
```

फिर खोलें:

```text
http://localhost:8000/home.html
```

Node.js static server भी उपयोग किया जा सकता है:

```powershell
npx serve .
```

पहली बार **Choose Folder** दबाने पर browser workspace की read/write permission माँगेगा।

## Workspace layout

```text
Workspace/
├── Novels/
│   └── <Project>/
├── Stories/
│   └── <Project>/
└── News Articles/
    └── <Project>/
```

Story/Novel project की मुख्य durable files:

```text
<Project>/
├── Chapters_info.json
├── Story_Drafts.json
├── Story_Naming.json
├── Story_Facts.json
├── Story_Word_Editing.json
├── Temp_Chapter_Draft.json
├── Chapters/
├── Drafts/
├── Edited_Chapter/
├── Trash/
├── Initial_Rendering/
└── project-details/
```

`Chapters_info.json` structure metadata रखती है; chapter और draft bodies अलग TXT files में रहते हैं। `Initial_Rendering/` और `project-details/` derived caches हैं, canonical content नहीं।

## Persistence model

1. Project folder की JSON/TXT files durable source of truth हैं।
2. IndexedDB workspace और active-project `FileSystemDirectoryHandle` याद रखता है।
3. `localStorage` preferences, active UI state और fallback/projection caches रखता है।
4. Editor DOM/Worker state केवल active editing buffer है; save flow इसे document object और project file में commit करता है।

Project text को remote backend पर भेजने वाला production integration इस repository में नहीं है। AI screens local prompt/monitor prototypes हैं।

## Source layout

```text
assets/
├── shared/
│   ├── css/        # Base components, shared modals और theme overrides
│   └── js/         # Icons, theme, normalization, settings और persistence
└── pages/
    ├── home/
    ├── story-novel-project-editor/
    ├── project-details/
    ├── news-article-editor/
    └── ai-agents/
tests/              # Node-based source contracts और focused behavior tests
```

Scripts ES modules नहीं हैं। HTML में उनका numeric load order dependency contract है; script tags या prefixes बदलने से पहले architecture document देखें।

## Tests

कोई `package.json` test runner नहीं है। Tests सीधे Node से चलती हैं:

```powershell
node tests/editor-history-policy.test.js
node tests/workspace-section-loading.test.js
node tests/naming-file-safety.test.js
node tests/advanced-import-promote-settings.test.js
```

सभी JavaScript files का syntax check PowerShell से:

```powershell
Get-ChildItem assets -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — modules, state, storage, data flow और subsystem boundaries
- [WORKING.md](./WORKING.md) — user workflows, development workflow, safety invariants, testing और debugging

## Browser support और सीमाएँ

- Chrome/Edge का current desktop version recommended है।
- File System Access API के बिना direct workspace workflow उपलब्ध नहीं होगा।
- Classic global scripts load-order sensitive हैं।
- एक ही project को कई tabs में बदलने पर locking नहीं है; last successful write प्रभावी हो सकती है।
- Production build/deploy pipeline और automated browser E2E suite अभी नहीं हैं।

## सबसे महत्वपूर्ण development rule

Chapter या draft content हटाने से पहले replacement content और उसकी metadata को durable storage में लिखना आवश्यक है। Rendering snapshots, localStorage और in-memory projections को canonical project files का विकल्प न समझें।
