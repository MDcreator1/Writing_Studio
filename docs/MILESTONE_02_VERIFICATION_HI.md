# माइलस्टोन 2: implementation और verification

## स्थिति

Local storage facade, folder-bound repository, session lifecycle wiring और shared file helpers का integration तैयार है। Automated Node और वास्तविक headless Chrome verification पास हैं। चुने हुए बाहरी folder का permission dialog, keyboard Ctrl+S, mobile interaction और representative large-project performance की interactive acceptance बाकी है; इसलिए पूरे माइलस्टोन को unconditional complete नहीं माना गया है।

## बदलाव

- Contracts: local/database/hybrid destinations, bindings और revision acknowledgements.
- Folder adapter: native handle I/O, validated paths, JSON read-back, failure propagation.
- Repository: captured-folder identity, reusable adapters और stale session-result rejection.
- Lifecycle: Home/shared restore, Project Details, News, rename और clear shared setter उपयोग करते हैं.
- Shared helpers: file/directory lookup, delete, read और write repository/adapter से route होते हैं; legacy fallback उपलब्ध है.
- Naming transaction/backup writers और workspace copying के specialized contracts सुरक्षित रखे गए हैं.

Session controller current binding पहचानता है। यह सभी existing async high-level operations को अपने-आप cancel या roll back नहीं करता। Durable IDs, immutable save operations और remote transport आगामी माइलस्टोन के काम हैं।

## वास्तविक Chrome परीक्षण

अलग headless Chrome profile, localhost server और browser OPFS के native FileSystemDirectoryHandle उपयोग हुए। User manuscript या चुने workspace की files उपयोग नहीं हुईं।

दो runs: वर्तमान adapter enabled और editor के shared helpers के legacy fallback enabled। दोनों में:

- Native TXT write/read/reopen में हिंदी, combining characters, emoji और blank lines सुरक्षित.
- Verified JSON metadata और delete सफल.
- चारों entry pages के scripts लोड हुए.
- Editor project load, draft creation, InputEvent, saveCurrentProject और disk reload सफल.

Editor boot को harness में नियंत्रित किया गया, क्योंकि blank test profile editor से Home redirect करती थी। Blank manifest में active document safety guard ने अपेक्षा के अनुसार load रोका; valid chapter fixture बनाया गया। यह test user folder-picker/normal startup restore का विकल्प नहीं है।

## पुनः चलाना

1. Repository से localhost static server port 8766 पर चलाएँ.
2. `node tests/build-storage-browser-harness.cjs`
3. `node tests/run-storage-browser-test.cjs --legacy`
4. `node tests/run-storage-browser-test.cjs`

Runner Windows Chrome के standard install path का उपयोग करता है और केवल अपने headless test browser को बंद करता है। Generated harness `tmp/` में है।

पाँच focused Node tests पास; सभी 75 assets JavaScript sources parse हुए। `git diff --check` में whitespace error नहीं; Git ने HTML line-ending normalization की सूचना दी।

## अंतिम interactive gate

एक अलग खाली test folder में: Choose Folder permission → project create → typing → autosave → Ctrl+S → browser reload → text check → chapter recovery commit/discard → News save/reopen। Desktop/narrow layout और representative बड़े project के timing की legacy baseline से तुलना भी बाकी है। Computer-use runtime अभी भी kernel-assets error देता है; इस बाधा को headless test पास होने से resolved नहीं मानना चाहिए।
