# Docker startup repair और PostgreSQL acceptance

दिनांक: 10 नवंबर 2026।

## निदान

शुरुआती missing Docker engine pipe को WSL/virtualization समस्या माना गया था। वास्तविक जाँच में WSL 2.7.10.0 का `docker-desktop` distribution सफलतापूर्वक शुरू हुआ और Linux kernel 6.18.33.2-microsoft-standard-WSL2 ने उत्तर दिया। इसलिए BIOS/Windows feature बदलाव नहीं किए गए।

Docker Desktop 4.80.0 के startup logs में दो Windows runtime endpoints पर ERROR_CANT_ACCESS_FILE मिला:

- `%LOCALAPPDATA%/Docker/run/dockerInference`
- `%LOCALAPPDATA%/docker-secrets-engine/engine.sock`

इसी दूसरी त्रुटि की उपयोगकर्ता के screenshot में पुष्टि हुई। Socket files reparse entries थीं और सामान्य remove operation विफल हुआ। Docker ने इसी कारण engine ready होने से पहले startup रोका।

## सीमित सुधार

असफल Docker Desktop/backend बंद किए गए। सत्यापित absolute paths पर runtime directories को backup नाम दिया गया और उनकी जगह खाली directories बनाई गईं। Secrets runtime में केवल `engine.sock` मिला; कोई persistent secret record नहीं था। दोनों directories एक साथ बदलने पर अगला startup सफल हुआ। एक को बदलकर दूसरे को छोड़ने से अगली startup failure के बाद पहली socket फिर अटक गई थी।

Backups:

- `C:/Users/mande/AppData/Local/Docker/run-before-repair-20261110-125334`
- `C:/Users/mande/AppData/Local/Docker/run-before-repair-20261110-125457`
- `C:/Users/mande/AppData/Local/docker-secrets-engine-before-repair-20261110-125424`
- `C:/Users/mande/AppData/Local/docker-secrets-engine-before-repair-20261110-125457`

Docker का factory reset, distro unregister, VHDX deletion, containers/volumes का global cleanup, BIOS बदलाव या Windows restart नहीं किया गया। Engine ने version 29.6.1 लौटाया। Backup runtime directories फिलहाल सुरक्षित रखी गई हैं; active folders से उन्हें बदलना स्वस्थ startup के बाद आवश्यक नहीं है।

यह वर्तमान startup repair है, Docker के upstream socket-handling bug का स्थायी code fix नहीं। भविष्य के crash/unclean shutdown के बाद पुनरावृत्ति की संभावना का परीक्षण नहीं हुआ है।

## PostgreSQL सत्यापन

`server` में `npm run test:postgres` isolated PostgreSQL 17 container, random loopback port, memory-only generated password और random test schema इस्तेमाल करता है। केवल अपना test container cleanup करता है। इस रिपोर्ट में अंतिम परीक्षण परिणाम नीचे दर्ज होंगे।

संदर्भ: [Docker startup socket issue](https://github.com/docker/desktop-feedback/issues/554), [Docker startup troubleshooting](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/topics/), [Microsoft WSL troubleshooting](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting)।

### अंतिम परिणाम

Docker engine 29.6.1 और वास्तविक PostgreSQL 17 container सफलतापूर्वक चले। प्रथम live run ने `change_log.changes` में JS array को SQL array की तरह encode करने की node-postgres compatibility त्रुटि पकड़ी। `server/src/storage.js` में JSON array स्पष्ट रूप से serialize की गई। Regression assertion अब stored change-log array को original operations से compare करता है। Schema बदलने की आवश्यकता नहीं हुई।

सुधार के बाद live suite: **9 pass, 0 fail, 1 skip**। Skip केवल PGlite backup-format test है; live production backup/restore का परीक्षण अभी अलग gate है। Auth/CORS, account isolation, atomic paragraph rows, retry receipt, pagination consistency, rollback, competing connections/revision conflict, metadata/delete/restore, input limits और tombstones सफल हुए। नए JSON regression assertion के साथ live suite दोबारा सफल हुई।

Embedded/backend/remote-client suite भी **12/12 pass** रही। अंतिम JSON assertion के बाद embedded suite फिर चलाकर नीचे स्थिति जोड़ी जाएगी। सभी verification-labelled containers cleanup हो चुके हैं; Docker engine चालू और responsive रहा। PostgreSQL 17 image स्थानीय cache में है; persistent project database या सामान्य compose service शुरू नहीं की गई।

यह पहले लंबित वास्तविक PostgreSQL API verification gate पूरा करता है। Full UI को live PostgreSQL से जोड़कर end-to-end acceptance, production backup/restore और पूरे storage migration milestone के बाकी development gates इससे पूर्ण नहीं माने जाते।

अंतिम JSON regression assertion के साथ embedded/server/client suite फिर **12/12 pass** रही।
