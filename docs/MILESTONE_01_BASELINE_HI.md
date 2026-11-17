# Database और Local Sync: माइलस्टोन और पहला baseline

नवीनतम: माइलस्टोन 5 का basic Database draft/editor vertical slice Chrome में connection UI, startup restore, Ctrl+S, offline और reconnect सहित पास है। [Editor acceptance](./MILESTONE_05_EDITOR_ACCEPTANCE_HI.md) में feature scope और शेष gates स्पष्ट हैं। अगला feature milestone metadata/recovery और editor की बाकी क्षमताएँ हैं।

माइलस्टोन 5 प्रगति: remote transport/profile/cache/queue service तथा वास्तविक HTTP integration tests तैयार। [माइलस्टोन 5 रिपोर्ट](./MILESTONE_05_REMOTE_CLIENT_HI.md) में user-facing editor/UI integration की बची शर्तें दर्ज हैं।

5 नवंबर की स्थिति: server core schema/API implementation तथा embedded PostgreSQL/HTTP integration tests तैयार हैं। [माइलस्टोन 4 रिपोर्ट](./MILESTONE_04_SERVER_API_HI.md) में contract, setup और live-PostgreSQL acceptance की लंबित शर्त दर्ज है।

नवीनतम प्रगति: माइलस्टोन 3 का foundation और automated acceptance पूरा हुआ है; [माइलस्टोन 3 रिपोर्ट](./MILESTONE_03_WORKING_STORE_HI.md) में implementation, browser results और सीमाएँ हैं। अगला development माइलस्टोन server schema/API है। माइलस्टोन 2 की external-folder/interactive/performance acceptance अलग लंबित रहती है।

वर्तमान स्थिति: माइलस्टोन 2 का implementation और automated browser compatibility परीक्षण तैयार है। विवरण [MILESTONE_02_VERIFICATION_HI.md](./MILESTONE_02_VERIFICATION_HI.md) में है। पुराने नीचे दिए browser-unavailable विवरण historical हैं: headless Chrome का वैकल्पिक रास्ता काम करता है, जबकि interactive computer-use runtime अब भी unavailable है। External folder-picker और performance acceptance लंबित हैं।

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

2 नवंबर 2026 को नए commit `78cda1f` पर baseline दोबारा मापी गई: repository में अब **एक** JavaScript test file है; वह पास हुई। Assets की **72** JavaScript files का syntax check पास हुआ। पुराने 31-test/75-file आँकड़े अब लागू नहीं हैं। पिछले commit में 19 focused tests हटे हैं; इसलिए पुरानी behavioral coverage को वर्तमान जाँच मानना गलत होगा। नया `draft-merge-safety.test.js` chapter/draft conversion और rollback सुरक्षा जाँचता है।

नए commit में mobile editor presentation, floating panels, responsive home, advanced settings, editor save/status और find controls बदले हैं। माइलस्टोन 1 के browser gate में इन्हें desktop तथा narrow viewport दोनों पर शामिल करना होगा। अभी browser E2E नहीं हुई है। Representative project पर Local only create/open/edit/autosave/Ctrl+S/reopen, recovery, draft merge, News और mobile settings workflow record करना बाकी है। उसके बाद माइलस्टोन 2 में behavioral comparison होगा।

### Browser gate की वर्तमान स्थिति

2 नवंबर को interactive browser check का प्रयास किया गया। Computer-use और in-app browser दोनों runtime ने `failed to write kernel assets: The system cannot find the path specified` लौटाया। अलग Chrome headless प्रयास में local HTTP server तक पहुँच नहीं हुई; इस execution environment ने `localhost:8765` socket access रोका। इसलिए UI interactions, File System Access permission, actual disk writes, reopen और narrow viewport व्यवहार का pass/fail दावा नहीं किया जा सकता। यह gate **pending** है, fail नहीं। Browser control उपलब्ध होने पर isolated test workspace में ऊपर दिए flows चलाने हैं; वास्तविक manuscript project को test target नहीं बनाना है।

पहले ठीक किए जाने वाले design contracts: project session identity; canonical बनाम derived data; save acknowledgement; complete बनाम lazy document; folder permission; project switch पर stale async work।

### Browser gate लंबित रहते हुए स्वतंत्र काम

Static call-site audit में `06a-project-storage-foundation.js` में 41 file-operation references, `06b-workspace-restore-autosave.js` में 19, draft promotion और management में 14-14, तथा workspace library में 13 मिले। Browser-storage references shared foundation में 35 और News controller में 21 हैं। ये केवल text-search counts हैं, runtime coverage नहीं। इससे Phase 1 में केवल central writer wrap करना अपर्याप्त होगा; promotion, draft conversion, derived snapshots और News के direct access भी सूचीबद्ध करने होंगे।

निर्णय: Browser gate को pending रखकर repository mapping, contracts और isolated tests पर काम आगे बढ़ सकता है। User-visible save path या mode switch सक्रिय करने से पहले browser baseline और Local only comparison पास करना आवश्यक रहेगा।

### माइलस्टोन 2 की सुरक्षित शुरुआत

`assets/shared/js/06e-storage-contracts.js` में storage mode, आवश्यक destination, project/account/profile/folder binding, project-session identity और प्रति-destination revision acknowledgement के छोटे contracts जोड़े गए हैं। यह script अभी किसी HTML page में load नहीं होती और वर्तमान save path को नहीं बदलती। `tests/storage-contracts.test.js` और मौजूदा draft merge safety test पास हुए; नए script का syntax तथा `git diff --check` सफल रहे। अगला कदम repository adapter का interface और existing folder writer के साथ तुलना है।

अब `assets/shared/js/06f-local-folder-adapter.js` भी स्वतंत्र रूप से जोड़ा गया है। यह injected folder handle पर project-relative path validation, TXT/JSON read-write, verified JSON read-back और write-failure propagation देता है। Existing global storage writer, HTML script order और live save path अभी नहीं बदले हैं। `tests/local-folder-adapter.test.js` में Hindi/blank-line round trip, path rejection, corrupt read-back तथा failed write के बाद original content सुरक्षित रहने के cases पास हुए। वर्तमान तीन JavaScript tests और सभी assets JavaScript syntax checks पास हुए। अगला major step इस adapter को existing save/read contracts से जोड़ना है; उसके पहले browser baseline gate लंबित है।

दस्तावेज़ व्यवस्था: project root की सभी Markdown files `docs/` में चली गई हैं; केवल `README.md` root में है। आगे की project Markdown documentation भी `docs/` में बनेगी। README के चार संबंधित links ठीक किए और अस्तित्व जाँचा गया; तीनों वर्तमान JavaScript tests फिर से पास हुए।

### Local I/O integration

अब चारों entry pages (Home, Story/Novel, Project Details, News) contracts और local adapter को storage foundation से पहले load करती हैं। Foundation के `readFileText` और `writeFileText` adapter के handle-based transport को delegate करते हैं; adapter unavailable होने पर पुराना fallback सुरक्षित है। Existing callers और serializers यथावत हैं। नया integration test दोनों paths में text preservation, failure propagation और page load order जाँचता है। चारों focused test files तथा बदली हुई JS files की syntax जाँच सफल है।

माइलस्टोन 2 **अधूरा**: यह integration केवल shared file I/O boundary का है। Provider-independent project repository/session routing, direct handle paths की पूर्ण coverage, browser Local only comparison और performance gate बाकी हैं। पहले के 'script अभी load नहीं होती' विवरण इस नए integration से supersede होते हैं।

### Repository integration और compatibility regression

`06g-project-repository.js` अब folder handle पर स्थायी रूप से bound adapter cache देता है। Shared foundation के file lookup, directory lookup और delete helpers इससे route होते हैं। Legacy slash normalization callers पर कायम है; adapter में paths validate होते हैं। Read/write fallback उपलब्ध है। Session controller में activation epoch, captured identity और stale-result rejection है; यह controller अभी application-wide lifecycle से नहीं जुड़ा है और high-level autosave को stale-session protection देने का दावा नहीं करता।

पाँच test files पास हुईं। Expanded integration suite actual shared helper definitions को adapter enabled/disabled दोनों स्थितियों में चलाकर lookup/create/delete call sequence और text/write failures की तुलना करती है। पहले test run में mock ने optional directory options नहीं संभाले; mock सुधारा, फिर पूरी suite पास हुई।

शेष release gate: वास्तविक browser Local only workflow/performance comparison और direct handle paths की समीक्षा। Naming safety writers तथा workspace directory operations अपने specialized APIs पर रहते हैं; database mode लागू होने से पहले उन्हें उनके अलग adapter contracts में लाना होगा। माइलस्टोन 2 पूर्ण घोषित नहीं है।

### Lifecycle wiring

सभी runtime `projectDirectoryHandle` assignments (restore, clear, rename, project library, Project Details और News) अब `setActiveProjectFolder` से होते हैं। यह existing handle update के साथ repository active local session बदलता/clear करता है। Repository local IDs केवल session identity हैं, durable migration IDs नहीं। Lifecycle test activation, switch और clear जाँचता है। कोई global asynchronous autosave transaction इस session controller से guarded मानना अभी उचित नहीं; वह आगे immutable save-operation work का भाग है।

Direct-access review: Naming backup/migration/promotion writers specialized रहते हैं; workspace enumeration/copy और explicit target-directory reads active project lookup नहीं हैं। News body I/O पहले से shared read/write helpers को delegate करती है। पूरे assets syntax parse और पाँच tests फिर सफल हुए। Browser runtime की पुनः कोशिश में वही kernel-assets error आया; UI/performance gate अब भी pending है। माइलस्टोन 2 के runtime बदलाव तैयार हैं लेकिन final acceptance इस gate के बिना पूर्ण नहीं है।

विस्तृत तकनीकी specification: [DATABASE_LOCAL_SYNC_IMPLEMENTATION_PLAN_HI.md](./DATABASE_LOCAL_SYNC_IMPLEMENTATION_PLAN_HI.md)।
