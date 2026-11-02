# लेखक मंच: Database और Local Folder Sync — विस्तृत implementation plan

स्थिति: प्रस्तावित implementation specification; इस दस्तावेज़ से application behavior नहीं बदला है।
तारीख: 2 नवंबर 2026

## 1. लक्ष्य और अपरिवर्तनीय शर्तें

मौजूदा HTML/CSS/classic JavaScript application में server-backed paragraph storage जोड़ना है। पुराने local-folder workflow, editor interactions, shortcuts, settings defaults, project layout और data safety को सुरक्षित रखना है।

तीन समर्थित project modes:

| Mode | आवश्यक connection | लेखन और recovery | अंतिम durable destinations |
|---|---|---|---|
| Local only | चुना हुआ local workspace | वर्तमान local save व्यवहार | वही JSON/TXT files; database आवश्यक नहीं |
| Database only | configured API/account; पहली download के लिए connection | स्थानीय working data और pending operations | server database; folder आवश्यक नहीं |
| Local + Database | दोनों destinations की initial linking | स्थानीय working data और स्वतंत्र sync queues | server database और वही JSON/TXT layout |

Database only का अर्थ browser में कोई local data नहीं होना नहीं है। Offline edits, retry और recovery के लिए IndexedDB आवश्यक है। Browser site data को user मिटा दे तो unsynced browser-only edits खो सकती हैं; उन्हें server/folder में saved दिखाना गलत होगा।

मुख्य invariants:

1. पुराने projects स्वतः Local only रहेंगे; कोई upload, login या schema conversion केवल app खोलने पर नहीं होगा।
2. Typing, caret, selection, Hindi IME, undo/redo और scrolling किसी network request का इंतजार नहीं करेंगे।
3. Local only में existing successful folder write ही save acknowledgement रहेगा; IndexedDB में लिखना उसका विकल्प नहीं बनेगा।
4. Database/Hybrid में local durable staging, server acknowledgement और folder acknowledgement अलग facts होंगे।
5. Replacement content durable होने से पहले source delete नहीं होगा।
6. Pending edits, unresolved conflicts और operation receipts सामान्य cache नहीं हैं।
7. Partial document या Naming projection कभी full authoritative dataset नहीं बनेगी।
8. IDs project/chapter title, index, path और folder name से स्वतंत्र होंगी।
9. किसी destination को हटाना दूसरे destination का data delete नहीं करेगा।
10. HTTP success, timeout, retry और actual commit को स्पष्ट अलग संभालना होगा।

## 2. वर्तमान code से प्राप्त आधार

| वर्तमान हिस्सा | मौजूदा ownership | आवश्यक implementation दिशा |
|---|---|---|
| `04a-state-defaults-normalization.js` | defaults, shared state, `hasActiveStory()` | project session identity और versioned model |
| `04b-editor-document-state.js` | active document और recovery | stable document ID और staged/committed revision |
| `06a-project-storage-foundation.js` | file handles, JSON/TXT writers, manifest, drafts | existing public functions के पीछे storage facade |
| `06aa-naming-file-safety.js` | Naming serialization, backup, verification, migration | वही safety guarantees server adapter पर भी |
| `06ab-chapter-folder-layout.js` | chapter paths और folder migration/recovery | folder-specific concern; DB identity से अलग |
| `06b-workspace-restore-autosave.js` | restore, autosave, manual save, rename/move | immutable save snapshots और destination acknowledgements |
| `06c-workspace-library-settings.js` | project library, lazy content loading, settings | provider-independent library और content repository |
| `00b-workspace-section-loader.js` | lazy section loading, generation reset | project/account/profile scoped cancellation |
| `00e-initial-rendering-store.js` | derived snapshots और projections | revision-keyed caches; full data से अलग |
| `00ea-naming-part-memory.js` | part-scoped Naming memory | server document revisions और content hashes |
| `01h-virtual-editor-pipeline.js` | paragraph windows, Worker, patch batches | permanent paragraph IDs और paged source |
| `editor-processing-worker.js` / HTML bridge worker | text processing | partial completeness और range-aware operations |
| `05a-editor-advanced-config.js` | advanced/developer settings | नई Storage & Database category |
| Home page controller | workspace restore और project creation | configured DB library, mode-aware creation |
| News controller | `NewsDesk_Articles.json` और page-local state | समान modes; article-specific model adapter |

विशेष observations:

- File handles पर निर्भर checks कई modules में हैं; केवल एक save function बदलना पर्याप्त नहीं है।
- Current virtual paragraph patches index-based हैं; वे stable paragraph identity या distributed sync protocol नहीं हैं।
- Current TXT writer पूरे text को write करता है। DB paragraph updates के बावजूद folder file writes full-file रह सकती हैं।
- Current autosave editor HTML flush और save baseline पर निर्भर है; network latency को उसी critical path में जोड़ना नहीं है।
- Settings में `Deep Scan & Snapshots` तथा `Project Cache & Storage` special categories हैं। नया section existing numeric category state को invalidate न करे।
- AI bridge frontend में मौजूद है; storage connection और AI connection profiles अलग रहेंगी।

## 3. Scope और design defaults

पहले release में single-user, multi-device asynchronous editing समर्थित होगी। एक ही paragraph पर simultaneous character-level live collaboration का दावा नहीं होगा; उसके लिए अलग CRDT/OT design चाहिए।

प्रस्तावित backend reference: TypeScript HTTP API + PostgreSQL। यह implementation default है, frontend contract किसी एक hosting vendor से न बँधे। अंतिम provider चुनते समय current deployment, backup और account requirements जाँचें।

यूजर अपने compatible server का API URL और account चुन सकेगा। किसी arbitrary MySQL/PostgreSQL/MongoDB URL से browser सीधे connect नहीं करेगा। अलग database engine के लिए backend adapter चाहिए।

Database password, connection string और privileged keys server deployment configuration में रहें। Developer UI में API endpoint, workspace/tenant और authenticated account आएँगे।

JSON metadata की existing semantics रखनी हैं; server में relational records और versioned JSON payloads दोनों का मिश्रण स्वीकार्य है। Chapter/draft/recovery text paragraph records में रहेगा; canonical full chapter body column नहीं होगा।

## 4. Architecture और source-of-truth नियम

```text
मौजूदा UI / editor / settings / project workflows
                       |
                 ProjectRepository
                       |
       immutable operation + revision + project identity
                       |
          +------------+-------------------+
          |                                |
     Local only                      DB / Hybrid
  existing folder adapter         IndexedDB transaction
  + existing recovery         paragraphs + metadata + outbox
          |                                |
   JSON/TXT verified          +------------+-------------+
                              |                          |
                       remote sync worker         folder sync worker
                              |                          |
                      HTTP API + database         JSON/TXT adapter
```

Local only के current saving path को पहले adapter में wrap करें। इस mode को नए local cache या server की availability पर निर्भर न करें। Hybrid/DB में working copy + outbox atomic local transaction में जाएँ।

Server accepted revisions का shared committed history रखेगा। Unsynced local edits को उससे स्वतंत्र preserve करना है। Folder external edits को import operations की तरह treat करें। दो स्वतंत्र mutable copies को हर बार overwrite करके sync करने की कोशिश न करें।

Database और disk पर एक distributed atomic transaction संभव मानकर design न करें। प्रत्येक destination का checkpoint अलग हो; interruption के बाद convergence/recovery हो।

## 5. Storage facade और compatibility layer

प्रस्तावित logical interfaces:

| Service | मुख्य operations |
|---|---|
| ProjectRepository | list/create/open/update/archive projects, get capabilities |
| DocumentRepository | metadata, paragraph ranges, full-text streaming, edit batches |
| MetadataRepository | Naming, Facts, dictionary, parts, project settings |
| RecoveryRepository | chapter edit session, checkpoints, commit/discard |
| SyncCoordinator | enqueue, push, pull, retry, pause, resume, status |
| FolderAdapter | JSON/TXT mapping, handle permission, safe writes, reconcile |
| RemoteAdapter | authentication, API transport, cursor sync, error translation |
| WorkingStore | IndexedDB model, outbox, receipts, base snapshots, conflicts |
| StorageSettings | profiles, project bindings, validation, mode transitions |

Existing function names को प्रारंभ में wrappers बनाएँ; inline handlers और classic script globals बने रहें। FileSystemHandle जैसे fake remote handles बनाकर पुराने code को भ्रमित न करें।

`hasActiveStory()` को valid project session से जोड़ें। अलग predicates रखें: `hasFolderBinding`, `hasRemoteBinding`, `canEdit`, `canWriteFolder`, `canSyncRemote`, `isDocumentComplete`। Offline remote project फिर भी active project है।

हर async operation में captured `{projectId, sessionEpoch, accountId, profileId, bindingEpoch}` हो। Await के बाद identity जाँचें; editor work में document ID और input generation भी जाँचें। AbortController के साथ stale result guard भी जरूरी है।

## 6. Stable identity और versioning

- Project, part, document, paragraph, Naming entry, fact, operation और client/device के stable IDs हों।
- Document kind: chapter, draft, recovery, trashed draft; permanent deletion अलग operation हो।
- Chapter index/number/path display और folder mapping fields हैं, primary identity नहीं।
- Project rename, part reorder और chapter move IDs नहीं बदलेंगे।
- Binding identity में account + server instance + remote project + local project ID रहें। समान project title को auto-link न करें।
- Local sync sidecar में format version, project ID, paths-to-document IDs, paragraph IDs/base hashes और last verified checkpoints रहें। इसमें passwords/tokens न हों।
- Linked project की copied folder में वही identity मिले तो silent merge न हो: original से relink या independent fork का विकल्प मिले।
- User द्वारा केवल folder rename होने पर ID/hash के आधार पर rebind हो; गलत folder पर writes रोकी जाएँ।

Sidecar का exact नाम format review में तय करें, जैसे `.lekhak-sync/identity.json` और bounded checkpoints। इसे existing canonical files का विकल्प न बनाएँ। पुराने Local only projects में linking से पहले sidecar बनाना अनिवार्य नहीं।

## 7. Server schema

हर table में आवश्यक ownership/project keys, server-issued revisions और timestamps हों। Client timestamps conflict ordering का authority नहीं होंगे।

| Entity | आवश्यक fields / constraints |
|---|---|
| users / memberships | owner/account, tenant, project permissions |
| projects | ID, title, type, language, metadata JSON, schema version, revision, archived/deleted state |
| parts | ID, project ID, title, order key, revision |
| documents | ID, project ID, part ID nullable, kind, title, logical number, settings JSON, revision, paragraph count, aggregate word count |
| paragraphs | ID, document ID, order key, text, optional supported formatting, revision, deleted revision |
| naming_categories / naming_entries | existing schema-v2 semantics, source document ID, payload revision |
| facts | ID, project ID, normalized payload, revision |
| dictionary_rules | stable rule IDs, explicit priority/order, aliases, replacement, mode, revision |
| project_settings | settings scope, version, normalized payload |
| recovery_sessions | base document revision, recovery document ID, status, owner/device |
| operations / receipts | project ID + unique operation ID, request hash, actor, result revision, bounded result |
| change_log | ordered project cursor, transaction ID, changed entities/tombstones |
| sync_clients | device checkpoint, compatibility version, last contact |
| migration_jobs | source fingerprint, status, resumable checkpoint, verification report |

Indexes: project/document lookup; `(document_id, order_key, id)` paragraph ranges; project change cursor; operation uniqueness; active category/name lookup; dictionary priority; deletion retention. Queries पर tenant/owner filtering हो। Row-level policies अतिरिक्त protection हो सकती हैं।

Order keys fractional/lexicographic हो सकती हैं; बीच में insert करने पर बाकी हर paragraph update न हो। Rebalance server transaction में हो, stable IDs सुरक्षित रहें। Key length limits और concurrent same-gap insertion का deterministic tie-breaker तय हो।

Text rules:

- Paragraph text Unicode-lossless रहे; Hindi combining marks, ZWJ/ZWNJ, emoji और punctuation न बदलें।
- Searching के लिए normalized representation अलग हो; canonical text पर NFC/whitespace cleanup अपने-आप न हो।
- Empty paragraphs, exact newline separators और final newline की representation स्पष्ट हो।
- Legacy source import में existing file-to-editor conversion और byte-preserving original backup अलग रखें। Original bytes बनाम normalized editing text के hashes अलग हो सकते हैं।
- Chapter formatting और per-paragraph formatting का existing supported subset map करें; arbitrary pasted HTML को executable रूप में store/render न करें।
- Chapters/drafts/recovery का पूरा canonical body metadata JSON या change-log payload में छिपाकर duplicate न रखें। Optional generated exports canonical नहीं होंगे।

## 8. API contract

Versioned `/api/v1` contract, machine-readable schema और generated validation fixtures बनाएँ।

| Endpoint | उद्देश्य |
|---|---|
| `GET /capabilities` | server instance ID, API/schema versions, limits, supported features |
| `GET /me` | current account और permissions |
| `GET/POST /projects` | paged library / create |
| `GET/PATCH /projects/:id` | project metadata with expected revision |
| `GET /projects/:id/manifest` | lightweight parts/documents metadata snapshot |
| `GET /documents/:id/paragraphs` | cursor-based range at a stated document revision |
| `GET /documents/:id/paragraphs/around/:paragraphId` | resume, search hit या source jump |
| `POST /projects/:id/operations` | atomic batch of paragraph + structure + metadata operations |
| `GET /projects/:id/changes` | cursor pull, including deletions and transaction boundaries |
| `GET /projects/:id/operations/:operationId` | uncertain request outcome की जाँच |
| `POST /projects/:id/import-jobs` | resumable verified migration |
| `GET /projects/:id/export` | consistent revision export stream/archive |
| `POST /projects/:id/scans` | full-scope Naming/search jobs when needed |

Paragraph operations: insert, update, split, join, move, soft-delete, restore। Structure operations: create/move/reorder documents, promote, convert, trash, restore। Scoped entity revisions से independent edits merge हों।

हर mutation envelope में operation ID, client ID, protocol version, expected entity/base revisions, dependencies और payload hash हों। Same ID/same payload retry पर previous result लौटे; same ID/different payload reject हो। Receipt उसी DB transaction में commit हो जिसमें mutation होती है।

Responses: accepted operation IDs, new revisions, entity remapping if any, change cursor और conflict details। Request body/paragraph count/byte limits तय हों; batching सिर्फ paragraph count पर आधारित न हो।

Error classes अलग रखें: auth expired, forbidden, not found, revision conflict, schema mismatch, validation, quota, rate limited, unavailable, uncertain transport outcome। `navigator.onLine` या generic network failure को server success/failure का प्रमाण न मानें।

Cursor pages एक coherent snapshot से आएँ। Snapshot expire हो तो mixed revisions assemble करने की जगह restart/rebase हो। Change cursor तभी advance हो जब पूरा transaction locally applied हो।

## 9. Paragraph editing और virtual editor integration

1. Initial load: sidebar metadata और active document का first/last-used range लें।
2. Range response में IDs, order keys, text, revisions, next/previous cursors और total/estimated metrics हों।
3. Logical document model memory/IndexedDB में रहे; DOM केवल materialized viewport हो।
4. Existing Worker paragraph index को stable IDs से map करें। Window start बदलने पर ID नहीं बदलनी चाहिए।
5. Normal editor और virtual editor दोनों समान edit-operation builder उपयोग करें।
6. IME composition के दौरान transient text को final paragraph operation न मानें; composition end पर consistent batch बने।
7. Enter/split, Backspace/join, multi-paragraph selection delete, paste, replace, formatting और undo/redo के explicit cases हों।
8. Paragraph boundary पर caret को `(paragraphId, textOffset, affinity)` से पहचानें; loaded range index से नहीं।
9. Unicode offset convention स्पष्ट हो। Browser UTF-16 offsets और backend string indexing का conversion tested हो।
10. Remote changes active paragraph/caret को disrupt न करें; conflicting edits stage हों। Undo दूसरे device का बदलाव चुपचाप erase न करे।
11. Adjacent prefetch bounded रहे। Missing range पर loading state हो; उसे empty paragraph बनाकर save न करें।
12. Huge single paragraph के लिए display-level segmentation हो सकती है; केवल viewport सुविधा के लिए canonical paragraph split न करें।

Initial compatibility stage में full documents load करके facade validate की जा सकती है। इसे final paged-loading completion न माना जाए। Paged mode feature flag पर तभी release हो जब full-document tools नीचे बताए तरीके से काम करें।

## 10. Autosave, Ctrl+S और acknowledgement

प्रत्येक save के लिए immutable `{projectId, documentId, inputGeneration, baseRevision, content/patches}` capture करें। Async flush के बाद current globals पर गलत document save न हो।

Local only: वर्तमान editor flush → verified file write → metadata/save baseline का observable behavior रखें।

DB/Hybrid: editor flush → working model और outbox एक IndexedDB transaction → local-stage acknowledgement → independent destination queues।

Manual save existing meaning रखे: chapter edit/recovery को permanent chapter में commit करने की policy autosave से अलग बनी रहे। केवल transport बदलने के कारण locked chapter, recovery या draft semantics न बदलें।

Save status matrix:

| अवस्था | UI अर्थ |
|---|---|
| Dirty | editor changes अभी local staging तक नहीं पहुँचे |
| Staged locally | device पर recovery योग्य; remote/folder pending हो सकते हैं |
| Server synced | server ने इस exact revision को acknowledge किया |
| Folder saved | folder में इस exact revision का verified representation है |
| Fully synced | selected mode के सभी destinations acknowledged |
| Needs attention | conflict, permission, auth, quota या validation issue |

पुराने Local only save indicator के text/स्थान/व्यवहार न बदलें। नए modes में उसी existing status affordance के tooltip/detail में destination status जोड़ें; pending server को पूर्ण synced न दिखाएँ।

Ctrl+S debounce को bypass करके latest local transaction करे और configured destinations flush शुरू करे। Offline/timeout में UI hang न हो और false success न हो। Await करने वाला code destination-aware result पाए।

Background network completion कभी newer input को saved mark न करे। Per-destination revision/generation baselines हों। Local storage failure होने पर unsaved state और recover/export action रहे; failed enqueue को saved न दिखाएँ।

Unload पर synchronous network success की अपेक्षा नहीं रखें। पहले से committed outbox recovery का आधार हो। Unsaved runtime edits पर existing navigation warning policy सुरक्षित रहे।

## 11. Sync engine और conflict resolution

Outbox lifecycle: staged → queued → sending → acknowledged; transport uncertainty, retry, blocked/conflict और superseded अलग states। In-flight payload immutable रहे। Unsent consecutive updates safely coalesce हो सकते हैं, undo/recovery semantics और dependencies सुरक्षित रहें।

- Push/Pull per-project ordered हों; independent destination queues अलग चलें।
- Retries exponential backoff + jitter, bounded concurrency और `Retry-After` support के साथ हों।
- One project failure बाकी projects को block न करे। Repeated invalid payload automatic retry storm न बनाए।
- Push acknowledgement मिलने पर भी newer local edits preserve रहें। Pull application dirty working copy को overwrite न करे।
- Different paragraph updates entity revisions से merge हो सकती हैं; document delete/move/split जैसी dependencies भी validate हों।
- Same paragraph concurrent edits पर base/local/remote तीन versions रखें। Safe text merge verified हो तो ही apply करें; otherwise दोनों versions बचाकर user resolution दें।
- Edit-vs-delete में text preserve हो; deleted paragraph silently resurrect न हो।
- Order conflict, part delete के दौरान chapter move, Naming source deletion और recovery commit के dedicated rules हों।
- Project permission revoke या account switch पर queued edits erase न हों और नए account को upload न हों।
- Cursor compaction से बहुत पुराने client का token invalid हो तो full resnapshot + preserved local operations rebase हो। Tombstones केवल defined retention/resync policy के बाद compact हों।

Multi-tab: browser lock/cross-tab coordination से प्रति project एक queue leader; DB revision checks अंतिम safety हों। Supported coordination API उपलब्ध न हो तो explicit single-writer/read-only fallback रखें। केवल localStorage boolean lock पर्याप्त नहीं।

## 12. Local folder sync और external edits

Folder writes existing JSON/TXT layout में रहें। Paragraph database से TXT generation ordered snapshot पर हो, active DOM fragment से नहीं। Per-file writes coalesce करें; last pending revision सुरक्षित रहे।

Read permission, write permission और missing/replaced handle अलग handle करें। Permission request user gesture पर हो; background popup loop न बने।

हर exported file के लिए base revision, hash, size और last verified mapping sidecar में हो। केवल modification time पर्याप्त नहीं।

External reconciliation:

1. Project open, app focus, explicit sync और bounded periodic scan पर changed candidates देखें।
2. Source base hash, disk hash और current server/local hash compare करें।
3. केवल disk बदला है तो file parse करके stable paragraph mapping पर import operations बनाएँ।
4. केवल app/server बदला है तो folder export करें।
5. दोनों बदले हैं तो three-way merge या conflict preserve करें।
6. Duplicate identical paragraphs में matching ambiguous हो सकती है; अनुमान से गलत paragraph identity न दें।
7. Missing file को तत्काल intentional deletion न मानें; incomplete copy, unavailable drive और metadata mismatch पहचानें।

File watching optional optimization होगा। Experimental FileSystemObserver correctness का आधार नहीं होगा। Folder में ऐप द्वारा किए export को external edit मानकर sync loop न चलाएँ।

Browser file APIs को universal atomic multi-file commit न मानें। Structural folder changes के लिए journal, backup/staging, write verification और recovery checkpoints चाहिए। Browser/API द्वारा unsupported atomic rename की गारंटी न दें।

## 13. Existing subsystems की पूर्ण compatibility checklist

| Feature | आवश्यक काम / acceptance |
|---|---|
| Home / library | Local listing वही; configured remote library additive; DB only बिना handle restore |
| Project creation | default mode Local only; configured workspace default optional; ID generated once |
| Project reopen | mode/account/profile restore; unavailable destination पर false empty project न बने |
| Rename/type/folder move | server identity स्थिर; folder migration journal; completed/failed destinations अलग |
| Parts/raw chapters | current numbering, selection scopes, expansion और move behavior समान |
| Chapter/draft switch | pending snapshot identity सुरक्षित; stale responses discard |
| Draft conversion / merge | replacement durable, metadata consistent, source cleanup last |
| Recovery/locked chapter | autosave recovery में; manual commit permanent chapter में; crash resumable |
| Trash/restore/delete | existing actions समान; tombstones remote; explicit permanent delete semantics |
| Naming schema v2 | aliases, description history max policy, timestamps/source semantics सुरक्षित |
| Naming projections | full dataset से अलग; category/active-document subset से destructive save नहीं |
| Naming deep scan | actual durable revisions scan; current/draft fallback policy और source links सुरक्षित |
| Promotion | source IDs remap; generated chapters/remainder/Naming journal recoverable |
| Facts | legacy embedded facts migration से पहले manifest stripping नहीं |
| Dictionary | exact alias precedence, modes, rule order और single-pass behavior समान |
| Find/replace | complete scope; lazy pages पर silently partial results नहीं |
| Smart copy | full-document/selection exact text; unloaded ranges streamed/fetched |
| Paste/import | TXT/DOCX, progress, split/remainder/title guards समान |
| Undo/redo | local session history और committed sync operations की ownership स्पष्ट |
| Word counts/stats | per-paragraph aggregate; pending edits overlay; partial data को full count न कहें |
| Notes/details/graphs | complete metadata datasets, scoped mention caches, guarded edits |
| News Desk | article bodies/settings/sources/tags/checklist/status preserved; DB only supported |
| AI Desk / Agents | current context semantics preserved; storage sync से AI sending trigger न हो |
| Focus iframe | shared session binding; duplicate queue leader नहीं; existing shortcuts/layout समान |
| Mobile/tablet | current floating panels, tabs, header hide, save status और keyboard behavior समान |
| Themes/language | existing six themes, Hindi/English copy, keyboard focus और ARIA states |
| Cache rebuild/reset | only reconstructible data clear; outbox/recovery/conflicts सुरक्षित |

Full-scope operations या तो complete data stream करें या server job चलाएँ। Server job में preview revision और apply revision verify हों। Bulk replace/import limits पार हों तो resumable chunks + visible job state हो; source पहले delete न हो।

## 14. Advanced Settings → Developer → Storage & Database

Existing developer category list में नई dedicated category जोड़ें। Existing editor tuning schema में API tokens जैसे fields न मिलाएँ। Category पहचान stable key से हो; पुराने saved numeric indexes को compatible map करें।

### A. Current project storage

- Mode selector: Local folder / Database / Local + Database.
- Effective project mode, workspace default और pending changes count.
- Current project identity का friendly summary; technical IDs optional details में.
- Mode change पहले review/test करे, फिर Apply; selector बदलते ही migration शुरू न हो.

### B. Local folder connection

- Current workspace और project folder का browser-available display name.
- Choose/reconnect folder, permission status, last verified write.
- Existing local selection function reuse; duplicate incompatible picker न बने.
- Folder linked/not linked, writable/read-only/unavailable status.
- DB only में folder selection आवश्यक नहीं.

### C. Database connection profiles

- Profile display name; compatible API base URL; workspace/tenant selector.
- Sign in / sign out / reconnect; current authenticated account.
- Test connection: network + auth + permissions + capabilities + schema compatibility.
- Read-only vs read/write capability स्पष्ट.
- Existing remote projects chooser; Create project; Link selected project.
- Save profile, rename profile, set workspace default, disconnect.
- Password/privileged DB key fields नहीं. Tokens export/logs में नहीं.
- Profile editing live queue को silently नए server पर route नहीं करेगी.

### D. Linking and initial sync

- Local → server upload; server → new folder download; existing pair reconcile.
- Preview: project/document counts, conflicts, estimated bytes, source authority.
- Same title auto-link नहीं; explicit selected identity और dry-run report.
- Empty destination को accidental authoritative empty source न बनाएँ.
- Existing data रखने/independent copy बनाने के स्पष्ट विकल्प.

### E. Sync controls

- Sync now; pause/resume automatic sync; retry failed; resolve conflicts.
- Last local/server/folder checkpoint; queued changes; destination errors.
- Optional offline availability: active document / recent documents / full project.
- Debounce, batch byte limit, concurrency और prefetch advanced controls validated bounds के साथ; defaults server limits से negotiate हों.
- Folder write cadence editor autosave preference से समझदारी से map हो; Local only timings न बदलें.
- Offline pause, logout और disconnect pending edits का disposal नहीं हैं.

### F. Diagnostics and recovery

- Connection health, storage usage/quota, account permissions, protocol version.
- Sanitized diagnostics export; project text/tokens default report में न हों.
- Failed operations, blocked migrations, restore backup और retry queue views.
- Cache reset outbox/base snapshots/recovery journals को exclude करे.
- Pending browser-only changes हों तो unsafe clear action block हो और sync/export route मिले.
- Global Reset settings connection credentials, pending edits या linked projects delete न करे.

Home पर configured DB users के लिए additive connection/library access देना होगा, क्योंकि Database only user अभी editor developer settings तक नहीं पहुँच सकता। वह उसी reusable settings controller को खोले; पुराने Choose Folder workflow का default स्थान/व्यवहार सुरक्षित रहे।

## 15. Settings scope और security

| Setting kind | कहाँ रहे / sync policy |
|---|---|
| Theme, viewport/panel position, device performance tuning | current device-local policy सुरक्षित |
| Project editor defaults और document formatting | current project/document semantics अनुसार sync |
| Find history, selection, caret, active tab | device/session scoped; दूसरे device की caret overwrite नहीं |
| Storage mode और project binding | local binding registry; server identity references; portable metadata अलग |
| API profiles | device/account scope; secret-free export |
| Auth credentials | secure auth/session mechanism; no plaintext localStorage secrets |
| Sync limits | validated device/profile controls; server hard limits authoritative |

Backend authentication, per-project authorization और tenant isolation हर read/write/export/change stream में लागू हों। Cookie auth में CSRF protection; cross-origin deployment में explicit CORS allowlist और credential rules। HTTPS production default हो। Logs में Authorization headers, full text और credentials redact हों।

Backend DB connection का arbitrary URL browser endpoint से accept न हो। User-supplied remote API के लिए scheme/URL validation और clear connection identity हो। Server outbound import features हों तो अलग SSRF controls चाहिए। Parameterized queries, payload validation, paragraph size limits और safe text rendering आवश्यक हैं।

Logout पर पुराने account का outbox नए account से isolate हो। Device data removal अलग explicit action हो, pending work की स्थिति बताए। Server backup/restore में memberships, operation receipts और revision continuity की योजना हो।

## 16. Migration और mode transition matrix

| Transition | आवश्यक क्रम |
|---|---|
| Existing local → Local only | कोई migration जरूरी नहीं; old behavior regression pass |
| Local → Hybrid | backup → assign IDs → inventory/parse → upload staging → verify → enable sync |
| Local → DB only | ऊपर जैसा verified upload; local folder retain; folder sync केवल explicit detach पर रुके |
| DB only → Hybrid | consistent snapshot → new/selected folder preview → safe write → hash verify → bind |
| DB only → Local only | full materialization + verified folder export; pending local/server changes resolve; फिर detach remote |
| Hybrid → Local only | latest desired state folder में verified; remote copy retain; remote sync detach |
| Hybrid → DB only | queue safety और server checkpoint verify; folder retain; folder sync detach |
| Server/account/profile change | old queue isolate; migrate/relink/fork explicitly; stale callbacks cancel |

Offline destination की initial completeness verify नहीं हो सकती तो transition pending रहे; user work existing mode में जारी रख सके। UI mode label पहले न बदले। Mode changes recoverable journal से हों; failure पर old binding सक्रिय रहे।

Migration details:

1. Dry inventory: schema versions, document paths, missing files, duplicate IDs/titles और malformed JSON.
2. Original project backup; no source cleanup during upload.
3. Body-load completeness और recovery/trash inventory.
4. Deterministic parser specification; text/newline/formatting round-trip fixtures.
5. Assign IDs once और resumable mapping persist.
6. Remote staging project/job में bounded uploads; partial upload normal library में complete न दिखे.
7. Verify counts, ordered text hashes, metadata semantics, Naming references और recovery state.
8. Publish remote project और binding checkpoint; फिर selected mode activate.
9. Cancellation पर original untouched; staging cleanup tracked, retry duplicate records न बनाए.

पुराने folder format में IDs लिखने से पहले पुराने readers की compatibility test करें। Unsupported extra fields sidecar में रखें। Migration cache snapshot से नहीं, canonical full files से हो।

## 17. Browser persistence और offline boundaries

IndexedDB schema upgrade versioned हो; working entities, outbox और matching base revision एक transaction में commit हों। Upgrade blocked हो तो open tabs का actionable state हो; destructive database reset नहीं।

`navigator.storage.estimate()` से usage और `persist()` से persistence request support करें। Request deny हो सकती है; persistent storage user द्वारा site data deletion से सुरक्षा नहीं देती। Quota errors पर staged-success न दिखाएँ। Clean downloaded pages evict हो सकती हैं; dirty entities, base snapshots और pending operations नहीं।

Offline reopening के लिए app shell भी उपलब्ध चाहिए। यदि बंद browser से offline app launch release requirement है, तो scoped service worker/cache plan जोड़ें: versioned shell, authenticated API responses का blind cache नहीं, update पर pending work preserve। केवल IndexedDB रखने को पूर्ण offline launch न कहें।

Static hosting origin/port बदलने से browser storage/handles अलग हो सकते हैं। Deployment migration में export/rebind और previous-origin recovery instructions हों।

## 18. Performance plan

Measured baseline पहले लें: representative small/medium/large novels; many chapters; many Naming entries; huge single paragraph; low-memory mobile। Existing local branch और नए Local only का same dataset/device पर comparison हो।

प्रारंभिक tuning hypotheses, अंतिम guarantees नहीं:

- Range batches लगभग 50–100 paragraphs; byte cap और device tuning के साथ.
- Adjacent one/two range prefetch; distant full project auto-download नहीं.
- Autosave debounce existing preference से; network batches अलग bounded cadence.
- Folder export coalescing per document; each keystroke full TXT export नहीं.
- Heavy parse/hash/serialization Worker में; main-thread work measured.
- Aggregate stats changed paragraphs से update; हर edit पर full project scan नहीं.

Metrics: input-to-paint p50/p95, long tasks, warm/cold project open, switch latency, bytes per changed paragraph, request count, queue age, folder write duration, memory peak, IndexedDB commit latency।

Acceptance targets baseline के बाद numeric budget में freeze करें। विशेष gate: remote unavailable होने पर Local only timing regression नहीं; Hybrid typing server/folder latency से proportional न हो; one-paragraph edit पर full chapter upload न हो।

## 19. Test plan

वर्तमान baseline: main `tests/` के 31 JavaScript test files पास; assets की 75 JavaScript files syntax-check पास। यह browser E2E या future implementation correctness का प्रमाण नहीं है।

नई meaningful suites:

1. Repository contract: same fixture Local/DB/Hybrid में identical observable document/state.
2. Paragraph round-trip: blank lines, CRLF, final newline, Hindi marks, emoji, huge text, repeated paragraphs.
3. Operation semantics: insert/update/delete/split/join/move/undo, cross-window edits और IME.
4. Local transaction fault: crash before/after enqueue; model+outbox consistency.
5. Server transactions: concurrent revision checks, duplicate operation, unauthorized reads/writes, receipt atomicity.
6. Transport faults: request lost, response lost after commit, timeout, retry, 401/403/409/429/5xx.
7. Pull/push races: incoming remote update plus dirty local; stale project/account switch.
8. Pagination: coherent snapshot, expired cursor, insert/delete while paging, range around saved caret.
9. Folder reconciliation: external edit, repeated paragraphs, missing source, permission revoke, disk full, failed write verification.
10. Structural recovery: promote, merge, convert, rename, move, trash, permanent delete interruption at each checkpoint.
11. Naming/Facts/dictionary regressions: source links, history, precedence, projections, full-scope scan.
12. Settings: three modes, profile changes, safe cache reset, logout, secret-free diagnostics, mobile navigation.
13. Multi-tab/multi-device: two independent edits, same paragraph conflict, edit/delete/order conflicts, leader handoff.
14. Migration: old schemas, malformed files, missing TXT, interrupted/resumed import, duplicate project copy, rollback.
15. Browser E2E: create/open/edit/save/reopen, offline reload, focus iframe, shortcuts, narrow viewports और themes.
16. Load: chapter/paragraph/names scale, large clipboard, API pagination bounds, DB query plans.

Test fixtures synthetic हों; user's actual manuscripts को integration test mutations का target न बनाएँ। Live AI/translation automation test के नाम पर prompts send न हों।

## 20. Implementation phases और completion gates

### Phase 0 — inventory और baseline

सभी direct file/handle/localStorage access की owner list; persisted settings scope register; save/load/delete graph; old schema fixtures; browser behavior recording। Source contracts और runtime tests का अंतर दर्ज करें।

Gate: प्रत्येक user action का storage owner और expected acknowledgement स्पष्ट।

### Phase 1 — facade, Local only unchanged

Repository contracts और FolderAdapter; existing globals wrappers; stable project-session capabilities। No server traffic। Existing paths/layout और defaults वही।

Gate: all baseline tests + browser local workflows pass; no mandatory DB setup; performance baseline within agreed budget।

### Phase 2 — identity और local working store

Linked projects के IDs, IndexedDB schema, durable outbox, operation builder, crash recovery, safe cache reset। Local only default untouched।

Gate: model/outbox atomicity, IDs, Unicode round trip और recovery failure injection pass।

### Phase 3 — backend और API

Schema migrations, auth/authorization, paragraph CRUD batches, idempotent receipts, coherent ranges, change feed, backup/restore tooling।

Gate: contract/security/concurrency/retry tests pass; server में canonical full chapter body नहीं।

### Phase 4 — Database only vertical slice

Home access, profile setup, library/create/open, paragraph edits, autosave/manual save, recovery और reopen बिना folder। Initial full-load compatibility flag स्वीकार्य।

Gate: folder API unavailable होने पर भी DB project basic workflow चलता है; unavailable network में staged edits safe।

### Phase 5 — full feature coverage और paged editor

Stable paragraph windows, Worker integration, full-text tools, Naming, Facts, dictionary, import/promote, details और News adapters।

Gate: no silent partial copy/search/replace; all existing feature matrix rows pass in DB mode।

### Phase 6 — Hybrid और folder reconciliation

Initial linking, migration jobs, per-destination checkpoints, safe TXT/JSON materialization, external change detection, conflict preservation।

Gate: real two-way changes, disconnect/reconnect और interrupted multi-file operations verified; source never lost।

### Phase 7 — settings और transitions completion

Developer category, shared Home entry, mode matrix, diagnostics, bounds, accessibility, translations और cache controls।

Gate: every transition succeeds or safely remains pending; profile change cannot route old queue to wrong server।

### Phase 8 — hardening और staged release

Representative load runs, browser/mobile regression, offline shell if included, deployment rehearsal, backup restore drill, feature flags और rollback rehearsals।

Gate: acceptance checklist signed off; no unverified migration auto-enable।

हर phase में संबंधित tests साथ लिखें। पूरी implementation के अंत तक testing स्थगित न करें। Backend और settings preview अलग बन सकते हैं, लेकिन release gates dependencies का पालन करें।

## 21. प्रस्तावित files और load-order integration

नई file paths final implementation में dependency review के बाद freeze हों:

```text
assets/shared/js/storage/
  storage-contracts.js
  project-session.js
  folder-adapter.js
  working-store.js
  paragraph-model.js
  operation-builder.js
  remote-adapter.js
  sync-coordinator.js
  folder-reconciler.js
  storage-settings.js
  storage-diagnostics.js
server/
  api/
  auth/
  repositories/
  migrations/
  jobs/
  tests/
tests/storage/
tests/fixtures/storage/
docs/storage/
```

Classic script load-order explicit रहे: contracts → session/store/paragraph primitives → adapters → repository/coordinator → page controllers/settings hooks। Existing HTML pages में required scripts सही जगह जोड़ें; pages में unused heavy services lazy instantiate हों। Backend dependencies अलग package में रहें; पुराने static local app को backend installation आवश्यक न हो।

## 22. Deployment, observability और rollback

- Environment-specific API URLs; explicit production HTTPS; DB migrations backward-compatible expand/contract क्रम में.
- App/API schema compatibility capabilities handshake; incompatible old client write block, export/recovery संभव.
- Monitoring: queue age, conflict rate, rejected revisions, retry rate, DB latency, folder failures; manuscript-free logs.
- Database backups, restore point, change-log/receipts consistency और documented restore rehearsal.
- Feature flags: facade, DB profiles, DB mode, hybrid, paragraph paging, server jobs; per project enablement.
- Rollback केवल पुराने frontend deploy करने से पूरा नहीं होगा: new-format projects और outbox compatible reader चाहिए.
- Emergency DB disable remote queue pause करे; pending work preserve; verified folder export उपलब्ध हो.
- Local rollback copy migration से पहले मौजूद हो; server/project delete को rollback का default तरीका न बनाएँ.

## 23. Final acceptance checklist

- [ ] Existing user बिना नई configuration पुराने folder से पहले की तरह काम कर सकता है.
- [ ] Local only कोई background project upload या DB dependency नहीं बनाता.
- [ ] Database only किसी folder handle या picker पर निर्भर नहीं है.
- [ ] Hybrid में destinations independently fail/recover कर सकती हैं.
- [ ] Server chapter/draft/recovery text paragraph records में रखता है.
- [ ] Stable IDs, exact text mapping, blank lines और ordering verified हैं.
- [ ] Partial pages पूर्ण content बनकर save नहीं होतीं.
- [ ] Offline/pending/conflict/cache reset/logout में edits सुरक्षित हैं.
- [ ] Repeated/uncertain requests duplicate content नहीं बनातीं.
- [ ] Chapter recovery और manual commit का पुराना व्यवहार सुरक्षित है.
- [ ] Naming/Facts/dictionary/import/promote/News और full-document tools तीनों modes में verified हैं.
- [ ] Existing JSON/TXT compatibility और safe source-last deletion कायम है.
- [ ] Modes/profiles बदलने पर old queue गलत destination में नहीं जाती.
- [ ] API credentials और DB secrets browser settings/logs/export में leak नहीं होते.
- [ ] Local performance regression और realistic network/load behavior मापा गया है.
- [ ] Backup, interrupted migration और rollback practically tested हैं.

## 24. Reference constraints

यह योजना current repository के निरीक्षण और निम्न primary documentation से पुष्ट platform constraints पर आधारित है:

- IndexedDB transactions और asynchronous storage: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Browser persistent storage request और quota inspection: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager
- FileSystemObserver experimental/non-standard status: https://developer.mozilla.org/en-US/docs/Web/API/FileSystemObserver
- PostgreSQL transaction isolation और concurrent writes: https://www.postgresql.org/docs/current/transaction-iso.html
- PostgreSQL row security: https://www.postgresql.org/docs/17/ddl-rowsecurity.html

इन sources से proposed performance guarantees या implementation completeness सिद्ध नहीं होती। वे संबंधित API/database constraints का आधार हैं; actual correctness और गति ऊपर दिए tests और measurements से तय होंगी।
