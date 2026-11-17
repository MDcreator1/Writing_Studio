# माइलस्टोन 3: paragraph model और working store

स्थिति: माइलस्टोन 3 का foundation implementation और automated acceptance पूरा। Editor save hooks, explicit working-copy connection, persistent identity registry, recovery checkpoints और cache-reset protection जुड़े हैं। UI से Database/Hybrid activation आगामी connection-settings माइलस्टोन में होगी; पुराने Local only projects स्वतः activate नहीं होते।

## तैयार हिस्से

- Secure UUID generation; paragraph IDs indices और titles से स्वतंत्र.
- Lossless text/separator representation: CRLF, LF, CR, empty lines, final newline, Hindi और emoji.
- Pure update, split, join और delete operations; duplicate IDs, invalid separators और surrogate-pair split reject.
- Scoped IndexedDB documents और outbox; model और operation एक readwrite transaction में commit.
- Local optimistic version checks; same operation retry idempotent; reused ID with changed content reject.
- Pending operations account/profile scope और project से अलग; close/reopen पर सुरक्षित.
- Version-change पर connection close; blocked upgrade का actionable error और late-success connection cleanup.

## सत्यापन

`tests/paragraph-model.test.js` pure text/identity operations जाँचता है। Browser harness असली Chrome IndexedDB में staging, duplicate retry, failed version transaction rollback, account isolation और close/reopen के बाद text/outbox preservation जाँचता है। यह test पास है। इसके बाद native file और editor save/reopen regression भी पास है।

## पूरा किया गया शेष scope

- `06j-editor-working-copy.js`: editor text से paragraph changes, existing IDs का reconciliation, ordered staging, unchanged save पर no-op, immutable identity capture.
- `06k-sync-identity.js`: explicit linking पर `.lekhak-sync/identity.json` में project/document UUID mapping; verified writes; rename remap; reload पर वही IDs. समर्थित browser में Web Locks registry updates serialize करते हैं.
- `saveCurrentProject`: chapter, draft और recovery branches में opt-in staging hook. Explicit binding के बिना कोई working database write नहीं.
- IndexedDB v2: previous document recovery snapshots, project sequence और queued/acknowledged receipts. Snapshot, recovery और queue एक transaction में बदलते हैं.
- Pending queue क्रम से पढ़ना, acknowledgement के बाद queue से हटना और पुराने receipt से retry सुरक्षित रखना.
- Cache-reset actions pending edits की जाँच करती हैं; working store database को generic cache delete से स्पष्ट रोक है.
- Cancelled transaction में document/outbox दोनों absent; optimistic conflict में partial queue नहीं.
- Blocked upgrade error के बाद connection release और v1 data/receipt preservation tested.

## अंतिम acceptance evidence

सात Node test files पास। सभी 79 assets JavaScript files parse हुईं। Actual Chrome native IndexedDB और OPFS tests ने upgrade, rollback/cancellation, retry, recovery, ordered queue, acknowledgement, account isolation और reopen जाँचा। Actual editor functions से project open, draft input, save, durable queue, cache-reset guard और disk reload पास हुए। Current adapter और legacy helper fallback दोनों browser runs पास हैं।

एक legacy browser test में नया connector adapter disable होने के बाद configure होने से विफल हुआ; fixture setup connector को पहले configure करता है, फिर legacy I/O disable करता है। दोनों production file-helper paths इस तरह independently verify हुए।

## सीमाएँ और अगला scope

यह foundation release gate है। OS/browser process को crash कराकर recovery नहीं जाँची गई; real IndexedDB transaction abort और close/reopen परीक्षण हुआ है। External folder picker, actual keyboard Ctrl+S और representative large-project performance की interactive acceptance माइलस्टोन 2 रिपोर्ट के अनुसार अभी लंबित है।

Current browser store प्रति-document paragraphs का snapshot रखता है; queue में snapshot तथा changed-record payload दोनों हैं। Server का canonical paragraph schema/transport अगले माइलस्टोन का काम है। Server sync, conflict resolution UI, automatic interrupted-session recovery UI और settings-based activation अभी उपलब्ध नहीं हैं।

Full-text reconciliation unchanged और moved paragraphs की IDs बचाता है; identical repeated text की identity inference deterministic है, collaborative character-level merge नहीं। Structural project move/promotion के साथ registry remap को संबंधित migration/sync workflows में call करना होगा; पुरानी projects पर automatic sidecar migration नहीं होती। Recovery/receipts को इस चरण में auto-prune नहीं किया जाता; pending data को मिटाने वाली cleanup policy जोड़ी नहीं गई है।
