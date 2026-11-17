# माइलस्टोन 6: संपादन, metadata और cache सत्यापन

दिनांक: 10 नवंबर 2026। यह रिपोर्ट पिछले milestone reports के बाद की प्रगति दर्ज करती है। पूरा माइलस्टोन और production acceptance अभी लंबित हैं।

## लागू व्यवहार

- Database editor में draft से chapter promotion, locked chapter की recovery copy, autosave, resume, discard और manual commit जुड़े हैं। Source chapter और recovery cleanup एक server transaction में जाते हैं।
- Source बदल चुका हो तो recovery commit conflict दिखाता है। Server version सुरक्षित रखते हुए local text को अलग drafts में बचाने और recovery archive डाउनलोड करने का रास्ता है।
- Naming/Facts के add, description history, edit और explicit delete metadata records में जाते हैं। Document rename/promotion पर संबंधित source references उसी queued transaction में अपडेट होते हैं।
- Dictionary rules, aliases और rule priority metadata में सुरक्षित रहती हैं। Metadata save failure पर project छोड़ना/cache reset रुकता है; retry और backup उपलब्ध हैं।
- Database mode के unsupported controls निष्क्रिय हैं। Local only के लिए database editor interception सक्रिय नहीं होता।

## धीमेपन को कम करने वाले बदलाव

IndexedDB cache schema v4 में project header और documents, metadata, pending batches तथा conflict archives अलग records हैं। v3 project blobs का migration upgrade transaction में होता है। Header में chapter text नहीं रहता। Copy-on-write workspace mutation केवल पढ़े/बदले entities की प्रतिलिपि बनाती है और dirty document/metadata IDs writer को देती है। Unchanged queue records फिर नहीं लिखे जाते। Cached entity values immutable हैं; optimistic cache revision दूसरे tab के बदलाव को overwrite होने से रोकती है।

Paragraph ordering अब longest increasing subsequence पर आधारित है। 10,000 paragraphs वाले insertion/move में अधिकतर stable order keys बने रहते हैं; छोटे exhausted gaps का सीमित repair होता है। बहुत बड़े/dense changes के लिए server की batch limits अभी लागू हैं।

यह पूर्ण large-manuscript performance acceptance नहीं है। पहली बार database project खोलते समय सभी active documents अभी hydrate होते हैं। Viewport-driven paragraph loading, staged large imports और bounded bulk jobs आगे लागू करने हैं।

## 10 नवंबर की जाँच

- 9 frontend test files सफल; draft merge suite में 24 scenarios शामिल हैं।
- 12 backend/API tests सफल, embedded PostgreSQL-compatible engine पर वास्तविक HTTP requests के साथ।
- अलग headless Chrome में native IndexedDB v1 compatibility तथा v3→v4 migration सफल। पुराने पाठ, retry batch और recovery archive सुरक्षित मिले।
- Native IndexedDB put instrumentation से साबित हुआ कि एक document बदलने पर केवल उसी document entity का record लिखा गया। दूसरे document, queue और archive records दोबारा नहीं लिखे गए।
- Header में bodies न होने, immutable cached values, cross-tab CAS rejection तथा दूसरे tab से fresh read की जाँच सफल।
- Chrome editor tests: connect/create, server save, offline edit, startup restore, Ctrl+S, reconnect, promotion, recovery commit/discard/conflict, Naming/Facts, dictionary, title और injected metadata failure/retry सफल।
- Native OPFS local file write/read/reopen/delete और चार pages का script loading सफल। OPFS परीक्षण वास्तविक external folder picker acceptance का विकल्प नहीं है।
- HTML entry points में cache v4 वाले modules के version tags अपडेट किए गए। `git diff --check` सफल।

## बाकी acceptance और development

1. उपयोगकर्ता के चुने Docker/PostgreSQL पर वास्तविक engine verification। Docker executable मौजूद है; engine availability अलग से जाँची जा रही है। Embedded परिणाम को live PostgreSQL परिणाम नहीं माना गया है।
2. External local folder permissions, वास्तविक manuscript performance, mobile और शेष UI regression।
3. Viewport paragraph loading और staged large operations; rich editing तथा बाकी disabled features का semantic mapping।
4. Hybrid folder↔server reconciliation, external TXT changes, deletion/rename conflicts और mode transition/migration workflows।
5. Full device-data removal, auth/session deployment, release rollback और production hardening।

मुख्य implementation plan: [DATABASE_LOCAL_SYNC_IMPLEMENTATION_PLAN_HI.md](./DATABASE_LOCAL_SYNC_IMPLEMENTATION_PLAN_HI.md)।

### वास्तविक PostgreSQL परीक्षण चलाना

`server` directory से `npm run test:postgres` अलग random-name PostgreSQL 17 container और loopback पर random port इस्तेमाल करता है। Password memory/environment में बनता है; project configuration या existing database नहीं बदले जाते। API suite अपना अलग random schema बनाकर साफ करती है और runner अंत में अपना container हटाता है। पहली बार image download के लिए network चाहिए। Embedded-only backup-format test live engine पर skip होता है; यह production backup/restore acceptance नहीं है।

10 नवंबर को Docker के `desktop-linux` और `default` दोनों connections ने missing engine pipe लौटाई। इसलिए runner की live execution अभी blocked है; इसे passed न माना जाए।

उपयोगकर्ता ने पुष्टि की कि Docker Desktop में WSL/virtualization संबंधी त्रुटि दिख रही है। वास्तविक PostgreSQL acceptance के लिए पहले host का यह अवरोध दूर करना आवश्यक है। OS/BIOS settings इस implementation में नहीं बदली गई हैं।

## अगला विकास भाग: दस्तावेज़ चुनने पर पाठ लोड करना

10 नवंबर 2026 को लागू और परीक्षणित:

- Database editor नए project का manifest और metadata पहले लेता है। बाकी chapters/drafts के पाठ शुरुआत में download नहीं होते। ऊपर की initial full-hydration सीमा अब database editor के सामान्य open path पर लागू नहीं है; workspace का explicit eager path compatibility और conflict review में रहता है।
- चुने document का पूरा पाठ API के revision-pinned paragraph pages से आता है। Chapter के साथ उसकी recovery और recovery के साथ source भी आवश्यकतानुसार load होते हैं।
- अभी तक न लोड हुए documents में `paragraphs: null` स्पष्ट placeholder है। वे loaded/blank document नहीं माने जाते और save/edit guard उन्हें overwrite करने से रोकता है।
- एक ही document के साथ-साथ आए load requests एक download साझा करते हैं। वही server revision रहने पर cached body दोबारा download नहीं होती।
- Uncached document offline नहीं खुलता; पहले का active document और उसका पाठ सुरक्षित रहता है। Cached documents offline खुलते हैं।
- पुरानी manifest revision मिलने पर `snapshot_changed` के लिए एक bounded refresh/retry है। लगातार बदल रहे source पर coherent snapshot मिलने तक operation fail होता है; अलग revisions के pages नहीं मिलते।
- Database mode में adjacent-document का local-folder prefetch बंद है। Local only की पहले वाली prefetch व्यवस्था बनी है।
- धीमे load के बीच active document बदल जाए तो पुराना navigation परिणाम नया document replace नहीं करता।

जाँच: 9 frontend suites, 12 backend tests और विस्तारित Chrome acceptance सफल। Chrome में remote-only two-document fixture से first-load request count, unloaded sidebar state, offline failure पर previous text preservation और cached offline navigation सत्यापित हुए। HTTP client परीक्षण में unloaded blank-save rejection, shared request, revision reuse और stale manifest refresh भी सफल।

सीमा: चुने हुए एक chapter का पाठ अभी पूरा hydrate होता है। Viewport के केवल आसपास के paragraphs रखने वाला editor pipeline, staged large imports, dense-order/bulk operations और Hybrid sync अभी शेष हैं। वास्तविक PostgreSQL परीक्षण WSL/virtualization की त्रुटि के कारण लंबित है।

## Docker अवरोध और वास्तविक PostgreSQL: स्थिति अपडेट

10 नवंबर को विस्तृत जाँच में WSL startup स्वस्थ मिला। बाधा Docker की दो खराब Windows runtime sockets थीं। सीमित runtime-folder backup/recreation से Docker चालू हुआ। वास्तविक PostgreSQL 17 पर API suite 9 pass, 0 fail, 1 embedded-only skip रही। Live परीक्षण में मिले change-log JSON-array encoding bug को भी सुधारा गया। पिछली Docker-blocked टिप्पणियों की नवीन स्थिति यह है। विस्तृत प्रमाण और सीमाएँ: [Docker repair और PostgreSQL verification](./DOCKER_STARTUP_REPAIR_POSTGRES_VERIFICATION_HI.md)।

## बड़े saves और अगले Database features

Staged uploads, schema v2 upgrade, bulk dictionary replacement, Merge/Copy & Merge और explicit remote refresh की नवीन स्थिति: [बड़े saves, bulk और merge](./MILESTONE_06_LARGE_SAVES_BULK_MERGE_HI.md)। ऊपर की पुरानी bulk/staging pending स्थिति इस नई रिपोर्ट से अपडेट होती है। पूरा feature-parity और paragraph-window editor अभी शेष हैं।
