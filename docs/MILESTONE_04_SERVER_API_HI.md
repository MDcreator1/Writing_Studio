# माइलस्टोन 4: PostgreSQL schema और API

तारीख: 5 नवंबर 2026। स्थिति: core implementation और embedded PostgreSQL integration tests तैयार। अलग PostgreSQL server/Docker engine पर verification लंबित; production deployment नहीं किया गया है।

## तैयार backend

`server/` में स्वतंत्र Node.js backend है। पुराने static app को इसे install/run करने की आवश्यकता नहीं है। Plain JavaScript ESM का उपयोग किया गया है; frontend classic scripts यथावत हैं।

- Versioned SQL migration: projects, memberships, parts, documents, paragraphs, metadata records, receipts और change log.
- Chapter/draft/recovery/article text अलग paragraph rows में रहता है। `documents` में body/text/content column नहीं है.
- IDs UUID हैं। Order keys non-negative integers हैं; caller gaps रख सकता है। Automatic order-key rebalance अभी client/sync layer का आगे का काम है.
- Project-scoped authorization; owner/editor write, viewer read. Membership provisioning अभी server administrator का काम है; user-management UI नहीं है.
- Single-client SQL transactions; per-project write lock. Paragraph changes, metadata, project revision, change log और receipt साथ commit/rollback होते हैं.
- Stable operation UUID + canonical request hash; retry पर वही receipt, बदले payload पर conflict.
- Conservative document revision checks: एक ही document के concurrent changes conflict हो सकते हैं, भले अलग paragraphs हों। आगे sync/conflict layer इसका rebase करेगी; silent overwrite नहीं होता.
- Revision-coherent paragraph ranges और paragraph ID के आसपास loading. Document बदले तो continuation को restart करना होगा.
- Paragraph/document tombstones, metadata updates, project rename और part metadata updates batch operations हैं.
- Request-size/batch/query limits, CORS allowlist, bearer authentication, account rate limit और sanitized errors.

## HTTP contract

API prefix `/api/v1`। `GET /capabilities` public है; अन्य endpoints को `Authorization: Bearer <token>` चाहिए। Mutation bodies `application/json` हों।

| Method / path | व्यवहार |
|---|---|
| GET `/capabilities` | protocol/schema versions, instance ID, supported features और limits |
| GET `/me` | authenticated user ID |
| GET `/projects?after=<uuid>&limit=50` | membership-filtered project library |
| POST `/projects` | `{id,title,type,language}` से project और owner membership |
| GET `/projects/:id/manifest` | consistent project, parts, document metadata और metadata records |
| POST `/projects/:id/operations` | atomic batch |
| GET `/projects/:id/operations/:operationId` | uncertain request outcome की receipt |
| GET `/projects/:id/changes?after=0&limit=50` | complete transaction records; revision cursor |
| GET `/documents/:id/paragraphs?limit=50` | पहला range और document revision |
| GET `/documents/:id/paragraphs?revision=1&after=1024` | उसी revision का अगला range |
| GET `/documents/:id/paragraphs/around/:paragraphId` | anchor paragraph के आसपास का range |

Batch envelope:

```json
{
  "protocolVersion": 1,
  "operationId": "<UUID>",
  "operations": [
    {"type":"document.create","id":"<UUID>","title":"अध्याय 1","kind":"chapter"},
    {
      "type":"document.patch","id":"<same document UUID>","baseRevision":0,
      "upserts":[{"id":"<paragraph UUID>","orderKey":1024,"text":"टेक्स्ट","separator":""}],
      "deletedIds":[]
    }
  ]
}
```

Supported operations: `project.update`, `part.put`, `document.create`, `document.patch`, `metadata.put`।

- `document.patch` में paragraph upserts/deletedIds के साथ optional title, kind, partId, settings और deleted boolean दिए जा सकते हैं.
- Each changed entity में expected baseRevision दें। Server response का project revision इस transaction के बदले entities की revision होता है.
- Split/join/move caller एक document patch में express करता है। Deleted row का restore upsert से और deleted document का restore `deleted:false` से होता है.
- Metadata kinds: naming-category, naming-entry, fact, dictionary-rule, project-settings, note. इनके payload validators को feature integration में मौजूदा client normalizers से और सख्त करना होगा.
- Paragraph order unique और intermediate separators nonempty होने चाहिए; final paragraph separator खाली होना चाहिए। Empty line/final newline के लिए अलग empty final paragraph दें.
- Hard paragraph purge, permanent project deletion, change-log compaction और automated retention अभी नहीं हैं.

Errors `{error:{code,message}}` रूप में हैं: authentication 401, access/origin 403, validation 400, revision/protocol/operation conflicts 409, deleted document 410, body limit 413, content type 415, rate limit 429, sanitized internal 500.

## Server configuration

Node >=22। `server` directory में `npm ci` करें। Environment:

- `DATABASE_URL`: PostgreSQL connection URI, केवल backend environment में.
- `LEKHAK_INSTANCE_ID`: इस server installation का स्थायी UUID; restart पर न बदलें.
- `LEKHAK_AUTH_TOKENS`: JSON array of `{tokenSha256,userId}`; userId UUID और digest 64-char SHA-256 hex. Raw tokens config में नहीं रखे जाते.
- `LEKHAK_ALLOWED_ORIGINS`: comma-separated exact frontend origins, जैसे `http://localhost:8000`.
- `HOST`: default `127.0.0.1`; `PORT`: default 8788.

Tokens cryptographically random, कम से कम 32 random bytes हों; admin उन्हें अलग सुरक्षित माध्यम से user को दे। कोई default/test credential startup में enabled नहीं है। Test tokens केवल test files के isolated server में हैं। Token revoke/rotate करने पर server config और process reload करें। OAuth/signup/session management अभी इस core backend में नहीं है।

पहले `npm run migrate`, फिर `npm start`। Startup schema version verify करता है। Migration अपने transaction/lock से serial होती है और दूसरी बार चलाना सुरक्षित है। Credentials को frontend localStorage या committed files में न रखें। Production में HTTPS reverse proxy, trusted origin और dedicated restricted DB role configure करें।

`server/compose.yaml` optional local PostgreSQL 17 service है। `server/.env` में POSTGRES_PASSWORD सेट करके `docker compose up -d` किया जा सकता है। DB port केवल 127.0.0.1 पर bind है। Existing port conflict हो तो explicit configuration बदलें। Database volume को सामान्य shutdown/test cleanup में delete न करें।

## Tests और evidence

`cd server; npm test` embedded PostgreSQL (PGlite) पर actual schema/queries और actual local HTTP requests चलाता है। Test data synthetic है। Tests में auth, CORS, role isolation, batch atomicity, retry receipt, conflicting edits, pagination, metadata, tombstones, limits और error sanitization शामिल हैं। Embedded database dump/load में paragraphs, deletion tombstone और receipts साथ restore हुए।

अंतिम run: **11 backend tests पास**, **7 frontend test files पास**, **79 frontend scripts parse सफल**। Dependency install audit ने कोई vulnerability report नहीं की। PostgreSQL migration के multi-statement execution को PGlite test adapter में उसके `exec` API पर route किया गया; production driver सामान्य PostgreSQL query path उपयोग करता है।

Live PostgreSQL integration के लिए `LEKHAK_TEST_DATABASE_URL` को dedicated test database पर सेट करके वही command चलाएँ। Test unique `lekhak_test_<random>` schema बनाकर केवल उसी generated schema को अंत में हटाता है। अलग clients पर actual concurrency test इस mode में सक्रिय होता है। Embedded mode serialized single-engine adapter उपयोग करता है; इसे production multi-connection concurrency proof न मानें।

Production backup में `pg_dump`/`pg_restore` से पूरे schema सहित memberships, revisions, tombstones, receipts और change log साथ रखें। Restore से पहले target database और application pause की समीक्षा आवश्यक है। वास्तविक production restore drill इस सत्र में नहीं हुई है।

## Remaining gates / next milestone

Docker engine इस सत्र में उपलब्ध नहीं हुआ; live PostgreSQL run और production restore rehearsal pending हैं। API core frontend से अभी connected नहीं है। अगला माइलस्टोन remote adapter, authenticated connection profile और Database only create/open/save/reopen है। Resumable import/export jobs, full project scans, relationship-source validation और complete feature adapters बाद के integration माइलस्टोन में आएँगे; `/capabilities` इन्हें supported घोषित नहीं करता।

Reference: [node-postgres transactions](https://node-postgres.com/features/transactions) और [parameterized queries](https://node-postgres.com/features/queries)। Implementation एक transaction में वही checked-out client उपयोग करती है और user values SQL parameters में देती है।
