# माइलस्टोन 5: Database only का शुरुआती editor workflow

तारीख: 5 नवंबर 2026। स्थिति: basic draft-text vertical slice implement और automated Chrome acceptance पास। यह full-feature Database mode या Hybrid completion नहीं है।

## उपलब्ध UI

- Home पर **Database** button.
- Editor → Advanced settings → Developer → **Storage & Database** → Open storage connections.
- Connection profile, API server URL और memory-only session token; Connect/Test.
- Database project list और Create database project; cached project reopen.
- Connection panel से Local folder picker का पुराना रास्ता.
- Main editor में Database banner: नया draft, Sync, Connection और per-destination status.

Database project के लिए external local folder आवश्यक नहीं है। API server PostgreSQL setup और account token अलग तैयार होना चाहिए; कोई production account/server स्वतः configure नहीं होता।

## मुख्य implementation

`06o-database-editor.js` main editor globals को explicit remote session से materialize करता है। Existing draft editor, keyboard shortcut और document navigation वही text surface उपयोग करते हैं। `06p-database-panel.js` reusable connection UI देता है। Local only में ये opt-in हैं।

- Draft save पहले account/project-scoped IndexedDB cache/queue में durable होता है; network बाद में चलती है.
- Autosave और manual save server response की प्रतीक्षा नहीं करते। UI में device-safe और server-synced status अलग हैं.
- Server acknowledgement नए unsaved input को saved mark नहीं करती.
- Draft switch/create के दौरान पुराने draft का text stage होता है, भले autosave बंद हो.
- Reload/startup पर non-secret profile/project IDs से cached project खुलता है। Token persist नहीं होता, इसलिए server sync के लिए reconnect करें.
- Reconnect पर exact queued operations सुरक्षित retry होती हैं; payload/operation ID stable रहते हैं.
- Local folder पर वापस आने पर Database URL route हटती है; pending remote edits cache में सुरक्षित रहती हैं.
- Uncertain create request की project UUID intent रखी जाती है, ताकि सामान्य retry नया duplicate project न बनाए.
- Stale refresh, newer committed cache को overwrite नहीं करती.

## इस चरण की सीमाएँ

Database mode में अभी draft plain-text editing और chapter review उपलब्ध हैं। Chapter unlock/recovery commit, titles/parts, Naming/Facts/dictionary, rich formatting, advanced import/promote और News editing का पूरा server integration अगले feature milestone में होगा। Unsupported controls disabled हैं और right-side tools छिपे हैं; Local only में वे सामान्य रहते हैं।

Hybrid sync, folder-server linking और external TXT reconciliation अभी उपलब्ध नहीं हैं। First project load documents पूरी तरह hydrate करता है; viewport-based download अभी बाकी है। Missing/conflicting remote changes की UI resolution भी आगे है; conflict पर local queue/text retain होता है।

यह restriction UI और entry-point guards का combination है; production rollout से पहले सभी feature mutation paths का अगला audit आवश्यक है। Profile token केवल page memory में रहता है। Signup/OAuth और cross-page credential handoff नहीं जोड़े गए।

## Browser acceptance

`node tests/build-storage-browser-harness.cjs`

`node tests/run-storage-browser-test.cjs --database`

यह command isolated embedded PostgreSQL API और अलग Chrome profile चलाती है; static test server localhost:8766 पर चाहिए। Test credentials synthetic हैं। User manuscript नहीं छुई जाती।

Actual Chrome में:

1. Developer settings का नया storage section खोला; native dialog से authenticated connection.
2. Database project/draft बनाया; main editor active और projectDirectoryHandle null रहा.
3. Hindi draft save; API से paragraph text वापस पढ़कर पुष्टि.
4. Disconnect के बाद offline edit; native IndexedDB में pending operation.
5. सामान्य editor `init()` और Database route से cached startup restore.
6. Chrome input subsystem/CDP से **Ctrl+S**, autosave बंद; text durable queue में पहुँचा.
7. Reconnect और queued edit server पर पहुँचा.
8. नया draft, sidebar के वास्तविक clicks से switch; previous unsaved draft सुरक्षित.
9. Desktop screenshot inspect किया गया; unsupported controls grey/disabled और connection banner visible.

Legacy Local only helper fallback और native file read/write/reopen regression भी चला। Physical user folder-picker permission और large real manuscript performance gate अभी पिछली रिपोर्ट के अनुसार लंबित हैं। CDP keyboard test को OS-level interactive desktop control के बराबर नहीं माना गया है।

Final सामान्य checks: 8 frontend test files पास, 12 backend/API tests पास और 84 frontend JavaScript sources parse हुए। Whitespace check सफल; Git ने HTML line-ending normalization की सूचना दी।

## अगले काम

Milestone 6 में editor के बाकी फीचर्स, metadata/recovery semantic adapters और paged source integration जोड़ने हैं। Milestone 7 में Hybrid sync और external edits reconciliation आएँगे। पहले के live PostgreSQL/Docker तथा interactive folder/performance gates इस basic acceptance से पूर्ण नहीं माने गए हैं।

नवीन प्रगति और बाकी gates: [माइलस्टोन 6 — editor, metadata और cache](./MILESTONE_06_EDITOR_METADATA_CACHE_HI.md)। Recovery, promotion और metadata की ऊपर लिखी पुरानी pending स्थिति को इस नई रिपोर्ट में अपडेट किया गया है; पूरा milestone अभी पूर्ण नहीं है।
