# Database और Local Sync: माइलस्टोन और पहला baseline

## माइलस्टोन

| क्रम | काम | पूरा होने की जाँच |
|---|---|---|
| 1 | मौजूदा storage paths, settings और व्यवहार की inventory | owner map, test baseline, जोखिम सूची |
| 2 | storage facade; Local only संगतता | पुराने flows और tests पास |
| 3 | IDs, paragraph model, browser working store | crash और text round trip tests |
| 4 | server schema, API, auth | API contract और concurrency tests |
| 5 | Database only basic workflow | बिना folder create/edit/reopen/offline recovery |
| 6 | सभी editor और project features तथा paged loading | पूर्ण feature regression |
| 7 | Hybrid folder/database sync | दोनों दिशाओं में edit, failure, conflict recovery |
| 8 | settings, migration और mode switching | सभी mode transitions verified |
| 9 | performance, security, release/rollback | load, browser E2E और restore drill |

## माइलस्टोन 1: वर्तमान स्थिति

मुख्य source of truth project folder की JSON metadata और TXT bodies हैं। Browser IndexedDB file handles याद रखता है; localStorage preferences और projections रखता है।

| काम | वर्तमान owner | आगे का खतरा |
|---|---|---|
| Workspace/project handle restore | `06a-project-storage-foundation.js`, `06b-workspace-restore-autosave.js`, Home controller | Database only में handle अनिवार्य नहीं रह सकता |
| Manifest/parts/chapter paths | `06a-project-storage-foundation.js`, `06ab-chapter-folder-layout.js` | ID को folder path या index से नहीं बाँधना |
| Chapter/draft/recovery body read | `06c-workspace-library-settings.js` | Unloaded body को empty समझकर overwrite रोकना |
| Autosave/manual save | `06b-workspace-restore-autosave.js` | Network acknowledgement को local save से अलग रखना |
| Naming verified writer | `06aa-naming-file-safety.js` | Projection से full dataset overwrite रोकना |
| Facts/dictionary | `00c-facts-panel-data.js`, `05b-advanced-word-editing.js` | Lazy load और project switch isolation |
| Virtual editor | `01h-virtual-editor-pipeline.js`, workers | Index-based paragraph patches को stable IDs चाहिए |
| Settings | `05a-editor-advanced-config.js` | Developer category में connection UI जोड़ना |
| News | `00-news-editor.js` | Page-local controller को अलग adapter चाहिए |

पहले से मौजूद user changes को इस milestone में नहीं छुआ गया है। अगला implementation चरण facade से शुरू होगा।

## Baseline और जोखिम

पिछली repository जाँच में 31 JavaScript test files और 75 JavaScript files का syntax check सफल था। यह browser E2E का विकल्प नहीं है। माइलस्टोन 1 का शेष gate: representative project पर Local only create/open/edit/autosave/Ctrl+S/reopen, recovery, draft और News workflow की browser recording। उसके बाद माइलस्टोन 2 में behavioral comparison होगा।

पहले ठीक किए जाने वाले design contracts: project session identity; canonical बनाम derived data; save acknowledgement; complete बनाम lazy document; folder permission; project switch पर stale async work।

विस्तृत तकनीकी specification: [DATABASE_LOCAL_SYNC_IMPLEMENTATION_PLAN_HI.md](./DATABASE_LOCAL_SYNC_IMPLEMENTATION_PLAN_HI.md)।
