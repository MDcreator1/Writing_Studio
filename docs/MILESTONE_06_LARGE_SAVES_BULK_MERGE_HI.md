# माइलस्टोन 6: बड़े saves, bulk replacement और draft merge

दिनांक: 10 नवंबर 2026। यह पहले चरण की प्रगति है; पूरा database feature parity, Hybrid, migration और release rehearsal अभी पूर्ण नहीं हैं। उपयोगकर्ता के निर्देशानुसार पहले database features/large-data handling, फिर Hybrid/migration, फिर backup/restore/deployment rehearsal का क्रम जारी है।

## बड़े saves का नया रास्ता

सामान्य छोटे saves पहले वाले operations endpoint से जाते हैं। Paragraph patch, JSON structure, byte-size या operation-count बड़ा होने पर client अपने durable wire batch को छोटे upload chunks में भेजता है। Server upload digest, कुल bytes, chunk count और immutable chunk identity सत्यापित करता है। Upload अधूरा हो तो project manifest और canonical paragraphs नहीं बदलते। Commit पर authorization, revisions और paragraph validation के बाद पूरा बदलाव एक transaction में लागू होता है।

Network interruption पर client received indexes पढ़कर केवल बचे chunks भेजता है। Commit का उत्तर खो जाए तो वही operation ID और durable wire batch retry होते हैं; receipt के कारण duplicate revision नहीं बनती। Committed chunk payload हटता है; छोटा upload header और operation receipt retry identity सुरक्षित रखते हैं। Temporary upload payload paragraph mutations का transport है; canonical text अब भी paragraph rows में रहता है।

सीमाएँ:

- Upload अधिकतम 64 MiB; अधिकतम 512 chunks, chunk पर अधिकतम 512 KiB UTF-8 और 262,144 UTF-16 units। Client surrogate pairs के बीच विभाजन नहीं करता।
- सामान्य patch पर 1,000 paragraph changes की सीमा बनी है। Staged patch अधिकतम 100,000 upserts/deletes और staged batch अधिकतम 10,000 operations स्वीकार करता है। एक paragraph पर पहले वाली text सीमा लागू है।
- एक actor/project में अधिकतम चार unfinished uploads। 24 घंटे से पुराने abandoned uploads उस project/actor के अगले begin पर साफ होते हैं। Global scheduled cleanup और quota hardening release से पहले बाकी हैं।
- सामान्य authentication rate limit लागू रहती है; बहुत अधिक chunks पर rate limit मिलने के बाद pending batch सुरक्षित रहती है और बाद में retry चाहिए।
- Commit अभी synchronous bounded transaction है, background job service नहीं। अधिकतम सीमा वाले payload का sustained load benchmark अभी नहीं हुआ।

## Server schema v2 और compatibility

`002_staged_batches.sql` additive migration है। `001_storage.sql` नहीं बदली गई। Migration runner versions 1 और 2 क्रम से लागू करता है और दोबारा चलाने पर दोहराता नहीं। Startup v2 schema माँगता है। Client schema 1 तथा 2 पहचानता है; बड़े saves के लिए `staged-batches` capability चाहिए। नए server के साथ संबंधित frontend भी अपडेट करना होगा; पुराने strict schema-v1 frontend को इसी release का compatible frontend देना आवश्यक है।

मौजूदा database पर server शुरू करने से पहले configured environment में `server` से `npm run migrate` चलाना है। वास्तविक user database पर इस development session में migration नहीं चलाई गई; tests अपने अलग database/schema पर हुए। यह schema upgrade, local-folder project migration से अलग काम है।

## Paragraph database performance

Validated upserts अब एक parameterized JSON recordset insert/update में जाते हैं। Deleted IDs भी एक parameterized UUID-array update से जाते हैं। हर paragraph के लिए अलग round trip नहीं होता। Final ordering/separator checks और transaction rollback कायम हैं। Body-size rejection में streaming connection reset की समस्या भी सुधारी गई, ताकि स्पष्ट 413 response मिले।

## Database editor के जुड़े features

- मौजूदा dictionary के “all project drafts” action का Database adapter जोड़ा है। यह drafts, saved chapters और recovery documents पर वही text replacement engine चलाता है। Scan विफल हो या project बदल जाए तो partial replacements stage नहीं होते। Chapter/recovery दोनों बदलने पर recovery source hash अपडेट होता है; पहले से conflicting recovery पर action रुकता है।
- मौजूदा Merge panel से Merge और Copy & Merge काम करते हैं। Sidebar order और text joining का पहले वाला व्यवहार रखा गया है। Copy originals रखता है; Merge originals को transaction में tombstone करता है। Naming source relinking/index maintenance उसी batch में होती है। UUID identities और ordering gaps इस्तेमाल होते हैं; gap न रहने पर guarded draft-order rebalance होता है।
- Explicit Sync action save/flush के बाद manifest refresh करता है और selected document को फिर खोलता है। Project open भी online होने पर fresh manifest लेता है; offline cached fallback बना है। Autosave हर बार पूरा manifest fetch नहीं करता।
- Local only handlers अपने पुराने रास्ते पर हैं; Database branches जल्दी delegate करती हैं।

## सत्यापन

- Backend/client suite: 13/13 pass। इसमें 2,101-paragraph client save, interrupted chunk, lost commit response, receipt retry, 1,001 metadata records, bulk failure rollback और recovery hash, merge order/source relinking शामिल हैं।
- वास्तविक PostgreSQL 17: 10 pass, 0 fail, 1 embedded-backup-format skip। Populated v1 schema से v2 upgrade, पुराना Hindi paragraph, large staged upload, incomplete visibility, chunk identity, account isolation, atomic commit और payload cleanup जाँचे गए।
- Chrome: 1,501-paragraph editor workflow, dictionary action, Merge panel, Copy & Merge, source preservation, cached/offline navigation तथा पहले के recovery/metadata workflows पास। Explicit remote refresh वाला अंतिम result नीचे दर्ज है।
- Local-only draft merge के 24 scenarios पहले जैसे सफल। Frontend की 9 suites सफल रहीं; अंतिम source checks नीचे दर्ज हैं।

## अगले database कार्य, Hybrid से पहले

Trash/restore/permanent-delete UI semantics और Naming cleanup decisions; chapter/part management तथा ordering; import/export और remaining settings; News/Project Details database coverage; rich-format data mapping जहाँ लागू हो; selected chapter के भीतर paragraph-window editing; बड़े वास्तविक manuscripts/mobile/external-folder regression और staged upload stress/cleanup hardening अभी शेष हैं। इस report को complete milestone या production readiness न माना जाए।

अंतिम verification: Explicit Sync button से दूसरे device का title refresh हुआ और selected text नहीं बदला; Chrome suite पूर्णतः सफल। Frontend की 9 suites, 84 frontend source syntax parses, server source syntax checks और `git diff --check` सफल। Backend/client suite 13/13 तथा वास्तविक PostgreSQL suite 10 pass/1 embedded-only skip रही। कोई production deploy या वास्तविक user-folder migration नहीं की गई।
