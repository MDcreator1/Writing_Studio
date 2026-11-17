# माइलस्टोन 5: remote client और offline project service

तारीख: 5 नवंबर 2026। स्थिति: transport/service के बाद basic draft-text workflow का main editor और connection UI integration भी पूरा हुआ है। [Editor acceptance रिपोर्ट](./MILESTONE_05_EDITOR_ACCEPTANCE_HI.md) में वर्तमान उपलब्धता और सीमाएँ हैं। Full-feature Database mode/Hybrid अभी पूर्ण नहीं हैं।

## तैयार हिस्से

- `06l-remote-adapter.js`: HTTPS/loopback URL validation, memory-only bearer token, capability/account/server identity checks, timeout/disconnect और coherent paged paragraph reads.
- `06m-database-profiles.js`: localStorage में secret-free profiles; token कभी persist नहीं होता। Profile URL बदलने के लिए नया profile जरूरी है, ताकि पुराना token अनजाने दूसरे server को न जाए। Reload/navigation के बाद authenticate दोबारा करना पड़ेगा, जब तक आगे सुरक्षित session mechanism नहीं जुड़ता.
- `06n-remote-workspace.js`: API-based create/open project, create/save document, cached reopen, pending batches और explicit flush.
- IndexedDB schema v3: account/profile/project-scoped remote cache और pending queue एक atomic cached state में। Compare-and-swap version checks concurrent changes को overwrite होने से रोकती हैं। Cache-reset pending detection remote batches भी देखती है.
- Request भेजने से पहले exact wire payload/operation ID persist होता है। Commit के बाद response खोने पर भी वही request retry होती है। Server acknowledgement newer local text को overwrite नहीं करता.
- Server conflicts queue और local text सुरक्षित रखते हैं; auto-resolution या silent overwrite नहीं किया जाता.
- Order-key gaps से सामान्य paragraph insert में बाद के सभी paragraphs renumber नहीं होते। Gaps समाप्त या reorder होने पर bounded API limits ध्यान में रखकर आगे chunk/rebalance workflow चाहिए.

## Verification

- **12 backend/HTTP integration tests पास**; इनमें frontend remote modules को actual local API और embedded PostgreSQL से जोड़ा गया.
- **8 frontend test files पास**; timeout, disconnect, malformed cursor और credential URL validation शामिल.
- Chrome native IndexedDB में remote cache compare-and-swap conflict, pending detection और close/reopen preservation पास.
- 151 paragraph download ने multiple API pages जाँचे.
- Simulated response loss after commit में retry body byte-for-byte identical मिली; duplicate edits नहीं बने.
- Network बंद रहने पर edit + cached reopen सुरक्षित; reconnect पर queue flush सफल.
- Response in-flight रहते नया text stage हुआ; acknowledgement ने उसे overwrite नहीं किया.
- दूसरे device से revision conflict होने पर unsynced text retained; refresh ने भी उसे replace नहीं किया.
- पिछले native-file/editor save/reopen browser regression tests पास.

## महत्वपूर्ण सीमाएँ

यह रिपोर्ट मूल API/client service की है। अब opt-in Database connection UI, main-editor draft save और cached startup restore भी इस service का उपयोग करते हैं। कोई automatic Local only upload या mode change नहीं होता।

पहली project hydration इस phase में documents को क्रम से पूरा पढ़ती है; viewport-driven partial download अगला editor integration काम है। किसी uncached project को offline नहीं खोला जा सकता। Large initial import/API patch limit और resumable jobs अभी नहीं हैं।

Project creation online operation है; UI retry-safe UUID intent रखती है। Cached project reading non-secret profile identity से scoped है; Disconnect उपलब्ध है, पूर्ण device-data removal UX अभी नहीं है।

Bearer credentials केवल memory में हैं। Basic profile editor उपलब्ध है; OAuth/session-cookie login और automatic refresh token नहीं हैं। Real PostgreSQL/Docker verification की पिछली gate लंबित है।

## अगला integration

Metadata/recovery semantic mapping, chapter editing, rich features और Hybrid integration आगे हैं। Basic text mode में unsupported controls बंद रखे गए हैं। Current acceptance को full-feature production readiness न मानें।
