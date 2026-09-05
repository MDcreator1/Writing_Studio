# Story Naming Source, Promotion, Deep Refresh और Description History

## पूर्ण Implementation Note

यह document Story Naming के नए metadata system का authoritative implementation specification है। इसका उद्देश्य naming entries को छोटा, स्पष्ट और सुरक्षित रखना है; draft promotion और Advanced Promote में source को सही document से जोड़ना है; description के वास्तविक edits की history रखना है; और पुराने projects को बिना data loss नए schema में migrate करना है।

---

## 1. अंतिम निर्णय

नए system में प्रत्येक नाम के लिए केवल वर्तमान valid source रखा जाएगा। पुराना/deleted draft, source history या error history entry के साथ persist नहीं होगी।

नए entry model में ये नहीं होंगे:

- `originSource`
- per-name `sourceHistory`
- `orphanedAt`, `orphanedFromDraft`
- `missingDocumentAt`, `missingDocumentMeta`
- `missingNameMentionAt`, `missingNameMentionMeta`
- `sourceState`, `namingSourceState`
- `resolvedAt`, `resolvedFromDraft`
- duplicated flat chapter/draft source fields
- description के अंदर duplicated `descriptionMeta`

नियम बहुत सरल रहेगा:

- Valid document attachment है तो `source` object होगा।
- Valid attachment नहीं है तो `source: null` होगा।
- Deleted/promoted पुराने document की stale reference नहीं रखी जाएगी।
- Missing/orphan जैसी स्थिति जरूरत पर runtime में derive होगी, persist नहीं होगी।
- Description history केवल वास्तविक description edit पर बनेगी।
- Deep Refresh केवल `source` update करेगा; पूरे name record को नहीं।

---

## 2. Story Naming JSON का root schema

Existing category visibility और detection maps को नहीं हटाया या बदला जाएगा। Root data का recommended shape:

```json
{
  "schemaVersion": 2,
  "categories": [],
  "removedCategoryIds": [],
  "hiddenByChapter": {},
  "visibleByChapter": {},
  "detectedByChapter": {},
  "entries": [],
  "invalidEntries": [],
  "invalidDescriptionHistory": []
}
```

इन maps की वर्तमान जिम्मेदारी बनी रहेगी:

- `hiddenByChapter`: document-wise manually hidden categories।
- `visibleByChapter`: document-wise manually shown categories।
- `detectedByChapter`: document में scan से मिले existing name IDs का index/cache।

Migration, promotion और Deep Refresh इन maps को अनावश्यक रूप से reset नहीं करेंगे। Document rename/delete जैसी अलग lifecycle operation को जरूरत होने पर उनकी keys साफ/remap करनी होंगी।

---

## 3. नए name entry का schema

```json
{
  "id": "name-1787754042559",
  "categoryId": "characters",
  "name": "अरुन आजी",
  "similarNames": ["अरुन"],
  "description": "वर्तमान विवरण",
  "descriptionHistory": [],
  "source": {
    "documentType": "chapter",
    "documentId": "chapter-173",
    "documentKey": "Chapters/chapter_173.txt",
    "documentIndex": 172,
    "documentNo": 58,
    "documentTitle": "निलसन यूनियन",
    "attachedAt": "2026-08-26T15:48:10.863Z",
    "checkedAt": "2026-09-05T10:30:00.000Z"
  },
  "createdAt": "2026-08-26T14:20:42.556Z",
  "updatedAt": "2026-09-05T09:00:00.000Z"
}
```

नाम किसी live document से attach नहीं है तो:

```json
{
  "source": null
}
```

### Top-level fields

| Field | Required | उद्देश्य |
|---|---:|---|
| `id` | हाँ | Entry की stable unique identity |
| `categoryId` | हाँ | Character/place/object जैसी category |
| `name` | हाँ | मुख्य saved name |
| `similarNames` | हाँ | Aliases/alternate spellings; खाली array मान्य |
| `description` | हाँ | Current description; खाली string मान्य |
| `descriptionHistory` | हाँ | पुराने description snapshots; खाली array मान्य |
| `source` | हाँ | Current source object या `null` |
| `createdAt` | हाँ | Entry creation time |
| `updatedAt` | हाँ | User द्वारा name/alias/category/description में अंतिम वास्तविक edit |

इस प्रकार सामान्य entry में 9 top-level properties पर्याप्त हैं।

### Source fields

| Field | Required | उद्देश्य |
|---|---:|---|
| `documentType` | हाँ | `chapter` या `draft` |
| `documentId` | संभव हो तो | Manifest/document model की stable ID |
| `documentKey` | हाँ | Current storage path/key |
| `documentIndex` | नहीं | Current list position; cache/display सुविधा |
| `documentNo` | नहीं | User-visible chapter/draft number |
| `documentTitle` | नहीं | UI display title |
| `attachedAt` | हाँ | यह current source कब attach हुआ |
| `checkedAt` | नहीं | Source को आखिरी बार scan/verify कब किया गया |

`documentId` primary identity होगा जहाँ stable ID उपलब्ध है। `documentKey` operational fallback और file access के लिए रहेगा। `documentIndex` identity नहीं है; reorder/delete के बाद बदल सकता है।

---

## 4. Timestamp semantics

अलग प्रकार के बदलावों के timestamps अलग रहें:

- `createdAt`: entry पहली बार बनी।
- `updatedAt`: user-visible naming content बदला—name, aliases, category या description।
- `source.attachedAt`: current source attachment बना/बदला।
- `source.checkedAt`: Deep Refresh ने current source को आखिरी बार verify/update किया।

Promotion या Deep Refresh के कारण top-level `updatedAt` नहीं बदलेगा। इससे UI source maintenance को user edit नहीं मानेगी।

---

## 5. Description history

### 5.1 History कब बनेगी

नई history केवल तभी जोड़ें जब पहले से मौजूद description का वास्तविक text बदला हो। पूरे entry object का `changed` boolean history का आधार नहीं होगा।

इन बदलावों पर description history नहीं बनेगी:

- केवल `name` बदला।
- केवल `similarNames` बदले।
- केवल `categoryId` बदला।
- केवल `source` बदला।
- केवल leading/trailing whitespace बदली।
- केवल CRLF और LF line-ending का अंतर आया।

Initial entry creation भी edit नहीं है, इसलिए creation पर history खाली रहेगी।

### 5.2 Comparison normalization

```js
function normalizeDescriptionForComparison(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

function hasDescriptionActuallyChanged(previousValue, nextValue) {
  return normalizeDescriptionForComparison(previousValue) !==
    normalizeDescriptionForComparison(nextValue);
}
```

यह normalization केवल comparison के लिए है। History snapshot में पुरानी raw description रखें ताकि user का वास्तविक formatting सुरक्षित रहे।

### 5.3 प्रत्येक history item का metadata

न्यूनतम और recommended shape:

```json
{
  "description": "edit से पहले वाला पुराना विवरण",
  "editedAt": "2026-09-05T10:30:00.000Z"
}
```

Multi-user या AI edit tracking चाहिए तो केवल एक optional field जोड़ें:

```json
{
  "description": "पुराना विवरण",
  "editedAt": "2026-09-05T10:30:00.000Z",
  "editedBy": "user"
}
```

हर history item में:

- `description` required है: replace होने वाला पुराना snapshot।
- `editedAt` required है: पुराना snapshot किस समय replace हुआ।
- `editedBy` optional है: `user`, `ai`, `system` या user ID।

सामान्यतः ये न रखें:

- `versionId`: local ordered array में index और timestamp पर्याप्त हैं।
- `previousDescription`: `description` स्वयं previous snapshot है।
- `newDescription`: current description top-level पर है।
- `chapterMeta`/`sourceDocumentId`: description audit में document provenance requirement न होने पर stale references बनेंगे।

### 5.4 Edit count और retention

- Initial creation को edit न मानने पर `descriptionHistory.length` ही edit count है।
- अधिकतम 50 inline history items रखें।
- 51वाँ item आने पर सबसे पुराना item हटे या अलग audit archive में जाए।
- बिना retention cap के per-name metadata की कोई अधिकतम सीमा नहीं होगी।

यदि औसत पुराना description 500 UTF-8 bytes है तो 50 snapshots लगभग 25 KB text लेंगे; JSON overhead अतिरिक्त होगा। Fixed entry metadata इसकी तुलना में बहुत छोटा रहेगा।

### 5.5 Save implementation

```js
function appendPreviousDescriptionSnapshot(entry, editedAt, editedBy = null) {
  const item = {
    description: String(entry.description ?? ''),
    editedAt,
    ...(editedBy ? { editedBy } : {})
  };

  entry.descriptionHistory = [
    ...(Array.isArray(entry.descriptionHistory) ? entry.descriptionHistory : []),
    item
  ].slice(-50);
}

function applyNamingEntryEdit(entry, nextValues, editedBy = null) {
  const editedAt = new Date().toISOString();
  const nextDescription = String(nextValues.description ?? '').trim();
  const descriptionChanged = hasDescriptionActuallyChanged(
    entry.description,
    nextDescription
  );

  const aliasesChanged = !sameNormalizedAliases(
    entry.similarNames,
    nextValues.similarNames
  );
  const anyUserFieldChanged =
    entry.name !== nextValues.name ||
    entry.categoryId !== nextValues.categoryId ||
    aliasesChanged ||
    descriptionChanged;

  if (!anyUserFieldChanged) return false;

  if (descriptionChanged) {
    appendPreviousDescriptionSnapshot(entry, editedAt, editedBy);
  }

  entry.name = nextValues.name;
  entry.categoryId = nextValues.categoryId;
  entry.similarNames = normalizeAliases(nextValues.similarNames, nextValues.name);
  entry.description = nextDescription;
  entry.updatedAt = editedAt;
  return true;
}
```

मौजूदा editor में पूरे entry का `changed` true होने पर नई description history में डालने वाला व्यवहार बदलेगा। History में पुरानी description तभी append होगी जब `descriptionChanged` true हो।

---

## 6. Source helper functions

सभी promotion, migration और refresh paths एक ही source builder इस्तेमाल करें:

```js
function createNamingSource(document, documentType, index, timestamp) {
  const isDraft = documentType === 'draft';
  return {
    documentType,
    documentId: document.id != null ? String(document.id) : null,
    documentKey: document.contentPath || (
      isDraft ? draftFilePath(index) : chapterFilePath(index)
    ),
    documentIndex: index,
    documentNo: isDraft
      ? document.draftNo || index + 1
      : document.chapterNo || index + 1,
    documentTitle: document.title || '',
    attachedAt: timestamp,
    checkedAt: timestamp
  };
}
```

किसी source को compare करते समय प्राथमिकता:

1. दोनों में valid `documentId` हो तो ID compare करें।
2. अन्यथा normalized `documentKey` compare करें।
3. `documentIndex`, number या title को अकेले identity न मानें।

---

## 7. सामान्य Draft Promote

### 7.1 आवश्यक input

Promotion शुरू होने से पहले यह snapshot लें:

```js
const promotedDraftIdentity = {
  documentId: draft.id != null ? String(draft.id) : null,
  documentKey: draft.contentPath || draftFilePath(draftIndex)
};
```

Draft हटने के बाद identity खोजने का प्रयास न करें। उसे transaction के आरंभ में capture करना जरूरी है।

### 7.2 Candidate selection

केवल वे entries candidates होंगी जिनका current source उसी promoted draft से जुड़ा है:

```js
function namingEntryBelongsToDraft(entry, draftIdentity) {
  const source = entry.source;
  if (!source || source.documentType !== 'draft') return false;

  if (source.documentId && draftIdentity.documentId) {
    return source.documentId === draftIdentity.documentId;
  }

  return normalizeDocumentKey(source.documentKey) ===
    normalizeDocumentKey(draftIdentity.documentKey);
}
```

केवल name text match के आधार पर सभी draft entries promote नहीं होंगी। इससे दूसरे draft में मौजूद समान नाम गलत chapter से attach नहीं होगा।

### 7.3 Promotion result

```js
function remapNamesForNormalPromotion({
  draftIdentity,
  chapter,
  chapterIndex,
  chapterText,
  promotedAt
}) {
  for (const entry of namingData.entries) {
    if (!namingEntryBelongsToDraft(entry, draftIdentity)) continue;

    if (isNamingEntryUsedInText(entry, chapterText)) {
      entry.source = createNamingSource(
        chapter,
        'chapter',
        chapterIndex,
        promotedAt
      );
    } else {
      entry.source = null;
    }
  }
}
```

नाम chapter में न मिलने पर entry delete नहीं होगी। केवल current source `null` होगा। कोई orphan/missing/error metadata नहीं बनेगा।

---

## 8. Advanced Promote

Advanced Promote में एक draft से कई chapters और optional remainder draft बन सकता है। Source remap chapters बनने के बाद batch में चलेगा।

### 8.1 सही operation order

1. Promoted draft identity capture करें।
2. सभी proposed chapter texts final करें।
3. सभी chapters create/write करें।
4. Optional remainder draft create/write करें।
5. उसी promoted draft से संबंधित naming candidates लें।
6. हर candidate को बनाए गए हर chapter में check करें।
7. Chapter match न मिले तो remainder में check करें।
8. Source remap batch save करें।
9. सफल durable save के बाद original draft हटाएं।

### 8.2 Batch remap

```js
function remapNamesForAdvancedPromotion({
  draftIdentity,
  createdChapters,
  remainderDraft,
  promotedAt
}) {
  const candidates = namingData.entries.filter(entry =>
    namingEntryBelongsToDraft(entry, draftIdentity)
  );

  for (const entry of candidates) {
    const firstChapterMatch = createdChapters.find(item =>
      isNamingEntryUsedInText(entry, item.text)
    );

    if (firstChapterMatch) {
      entry.source = createNamingSource(
        firstChapterMatch.chapter,
        'chapter',
        firstChapterMatch.index,
        promotedAt
      );
      continue;
    }

    if (
      remainderDraft &&
      isNamingEntryUsedInText(entry, remainderDraft.text)
    ) {
      entry.source = createNamingSource(
        remainderDraft.draft,
        'draft',
        remainderDraft.index,
        promotedAt
      );
      continue;
    }

    entry.source = null;
  }
}
```

कई created chapters में नाम मिलने पर earliest created matching chapter primary `source` बनेगा। अन्य occurrences मौजूदा `detectedByChapter`/snapshot mechanism से track होंगी; per-name `mentions` जोड़कर वही data duplicate नहीं किया जाएगा।

Remainder में नाम होने पर entry draft state में रहेगी, लेकिन उसका source original draft के बजाय live remainder draft होगा।

### 8.3 Idempotency

Promotion transaction में stable `promotionId` रखें, लेकिन उसे प्रत्येक name entry में persist करना जरूरी नहीं है। Transaction/journal duplicate apply को रोके। दोबारा remap होने पर वही current source बने और description/history प्रभावित न हों।

---

## 9. Deep Refresh

### 9.1 जिम्मेदारी

Deep Refresh documents scan करके प्रत्येक entry का current source verify/remap करेगा। यह naming content editor या description generator नहीं है।

यह केवल बदल सकता है:

- `entry.source`
- `source.documentType`
- `source.documentId`
- `source.documentKey`
- `source.documentIndex`
- `source.documentNo`
- `source.documentTitle`
- `source.attachedAt`
- `source.checkedAt`

यह कभी नहीं बदलेगा:

- `id`
- `categoryId`
- `name`
- `similarNames`
- `description`
- `descriptionHistory`
- `createdAt`
- top-level `updatedAt`
- unknown/custom user metadata
- `hiddenByChapter`
- `visibleByChapter`

`detectedByChapter` existing detection/cache flow की जिम्मेदारी रहेगा। Source refresh के बहाने इसे reset नहीं किया जाएगा। यदि current rendering architecture इसे rebuild करती है तो वह अलग, explicit cache operation होगा।

### 9.2 Matching policy

नई entry का valid current source हो तो पहले उसी source को verify करें। यदि वहाँ नाम नहीं मिलता या source मौजूद नहीं है, तभी पूरी story में deterministic fallback scan करें।

Fallback order:

1. Chapters, earliest से latest।
2. किसी chapter में न मिले तो drafts, earliest से latest।
3. कहीं न मिले तो `source: null`।

यह policy बिना जरूरत valid source को किसी earlier incidental mention पर नहीं ले जाएगी।

### 9.3 Source-only patch

```js
function applyDeepRefreshSource(entry, matchedDocument, checkedAt) {
  if (!matchedDocument) {
    entry.source = null;
    return entry;
  }

  const previousSource = entry.source;
  const sameDocument = sourcesIdentifySameDocument(
    previousSource,
    matchedDocument.source
  );

  entry.source = {
    ...createNamingSource(
      matchedDocument.document,
      matchedDocument.documentType,
      matchedDocument.index,
      checkedAt
    ),
    attachedAt: sameDocument && previousSource?.attachedAt
      ? previousSource.attachedAt
      : checkedAt,
    checkedAt
  };

  return entry;
}
```

Deep Refresh में यह pattern निषिद्ध है:

```js
Object.assign(entry, scanResult);
entry = { ...entry, ...scanResult };
```

क्योंकि scan result गलती से name, description, history या timestamps overwrite कर सकता है। केवल `entry.source` assign करें।

### 9.4 Runtime missing/orphan status

Persistent error fields के स्थान पर UI जरूरत पर स्थिति derive कर सकती है:

```js
function deriveNamingSourceStatus(entry, documentRegistry) {
  if (!entry.source) return 'unattached';
  if (!documentRegistry.has(entry.source.documentKey)) return 'detached';
  return 'attached';
}
```

यह status entry में save नहीं होगा। Scan progress/report में temporary counts दिखाए जा सकते हैं, लेकिन per-name missing/error history नहीं बनेगी।

---

## 10. Safe Migration

पुराने project या Story Naming authoritative file को नया schema पढ़ने से पहले safe migration से गुजरना होगा। Migration versioned, idempotent, non-destructive और rollback-safe होगी।

### 10.1 Migration कब चलेगी

Migration तब चले जब:

- Root `schemaVersion` missing हो।
- `schemaVersion < 2` हो।
- Entries legacy flat fields इस्तेमाल करती हों।
- पुराना `descriptionHistory` shape हो।
- Story Naming file authoritative source हो और project उसी से entries load करता हो।

`schemaVersion: 2` data को दोबारा migrate नहीं किया जाएगा।

### 10.2 Authoritative source selection

Migration से पहले यह तय करें कि authoritative naming dataset कौन-सा है:

1. Valid project Story Naming file उपलब्ध है तो वही primary source।
2. वह unavailable है और project embedded naming data valid है तो embedded data fallback।
3. LocalStorage केवल recovery fallback हो; valid project file को silently overwrite न करे।

दो datasets को अलग-अलग migrate करके दोनों को authoritative save न करें। पहले source precedence तय करें।

Story Naming projection/category subset पर migration persist नहीं होगी। पहले complete authoritative dataset load करना अनिवार्य है।

### 10.3 Legacy source conversion

पुराने source fields:

```text
chapterStatus, documentType,
chapterKey, chapterIndex, chapterNo, chapterTitle,
draftKey, draftIndex, draftNo, draftTitle,
contentPath, descriptionMeta
```

इनसे एक नया `source` बनाया जाएगा। Priority:

1. Valid existing new `source` हो तो उसे preserve करें।
2. अन्यथा legacy status के अनुसार chapter/draft document registry में match करें।
3. Stable ID मिले तो `documentId` रखें।
4. Live document match न मिले तो `source: null` रखें।
5. नकली `documentId` न बनाएं।

### 10.4 Legacy entry migration

```js
function migrateLegacyNamingEntry(rawEntry, context) {
  const entry = structuredClone(rawEntry);

  const source = isValidNamingSource(entry.source)
    ? normalizeNamingSource(entry.source, context)
    : buildSourceFromLegacyFields(entry, context);

  const invalidHistory = [];
  const descriptionHistory = (
    Array.isArray(entry.descriptionHistory)
      ? entry.descriptionHistory
      : []
  ).flatMap(item => {
    if (!item || typeof item.description !== 'string') {
      invalidHistory.push(item);
      return [];
    }

    return [{
      description: item.description,
      editedAt: item.editedAt || item.updatedAt || entry.createdAt,
      ...(item.editedBy ? { editedBy: item.editedBy } : {})
    }];
  }).slice(-50);

  const migrated = {
    ...entry,
    id: entry.id,
    categoryId: entry.categoryId,
    name: entry.name,
    similarNames: normalizeAliases(entry.similarNames, entry.name),
    description: String(entry.description ?? ''),
    descriptionHistory,
    source,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt || entry.createdAt
  };

  deleteLegacySourceFields(migrated);

  return {
    entry: migrated,
    invalidHistory
  };
}
```

### 10.5 Legacy fields cleanup

नया `source` सफलतापूर्वक बन जाने या `source: null` तय होने के बाद ही obsolete fields हटाएं:

```js
function deleteLegacySourceFields(entry) {
  [
    'chapterStatus', 'documentType',
    'chapterKey', 'chapterIndex', 'chapterNo', 'chapterTitle',
    'draftKey', 'draftIndex', 'draftNo', 'draftTitle',
    'contentPath', 'descriptionMeta',
    'resolvedAt', 'resolvedFromDraft',
    'orphanedAt', 'orphanedFromDraft',
    'missingDocumentAt', 'missingDocumentMeta',
    'missingNameMentionAt', 'missingNameMentionMeta',
    'sourceState', 'namingSourceState',
    'originSource', 'sourceHistory'
  ].forEach(key => delete entry[key]);
}
```

Unknown/custom user fields न हटाएं। केवल ज्ञात obsolete fields delete करें।

### 10.6 Invalid data quarantine

- बिना valid name वाली entries को silently delete न करें; `invalidEntries` में रखें।
- Invalid description history items को root या migration report के `invalidDescriptionHistory` में रखें।
- Invalid source का अर्थ entry invalid नहीं है; उस entry का `source: null` किया जा सकता है।
- Migration report में migrated, unattached और quarantined counts रखें।

### 10.7 Dataset migration

```js
async function safelyMigrateNamingDataset(rawDataset, storage, context) {
  if ((rawDataset.schemaVersion ?? 1) >= 2) {
    return rawDataset;
  }

  const original = structuredClone(rawDataset);
  const migrated = structuredClone(rawDataset);
  const invalidDescriptionHistory = [];

  migrated.entries = (rawDataset.entries || []).flatMap(rawEntry => {
    if (!rawEntry || !String(rawEntry.name || '').trim()) {
      migrated.invalidEntries = [
        ...(migrated.invalidEntries || []),
        rawEntry
      ];
      return [];
    }

    const result = migrateLegacyNamingEntry(rawEntry, context);
    invalidDescriptionHistory.push(...result.invalidHistory);
    return [result.entry];
  });

  migrated.invalidDescriptionHistory = [
    ...(migrated.invalidDescriptionHistory || []),
    ...invalidDescriptionHistory
  ];
  migrated.schemaVersion = 2;

  assertSafeNamingMigration(original, migrated, {
    preserveValidEntryIds: true,
    preserveCategories: true,
    preserveDescriptions: true,
    preserveVisibilityMaps: true,
    preserveDetectedMap: true
  });

  await storage.writeMigrationBackup(original);
  await storage.atomicWriteAndVerify(migrated);
  return migrated;
}
```

### 10.8 Atomic persistence

Safe save order:

1. Complete original dataset read करें।
2. In-memory clone migrate करें।
3. Schema और preservation assertions चलाएं।
4. Original का recovery snapshot/backup लिखें।
5. New temporary snapshot/file लिखें।
6. उसे दोबारा read, parse और validate करें।
7. Validation के बाद authoritative file/pointer replace करें।
8. Failure पर original authoritative data untouched रखें।

Migration failure पर project legacy compatibility/read-only recovery mode में खुल सकता है, लेकिन invalid partial migration save नहीं होगी।

---

## 11. Normalization और migration का अंतर

Runtime normalization और persisted migration को एक operation न मानें।

- Normalization: data पढ़ने योग्य बनाती है; ideally memory में non-destructive defaults।
- Migration: schema बदलती है और explicit validation/backup के बाद persist करती है।

Deep Refresh के कारण पूरा normalized entry object अनजाने में save नहीं होना चाहिए। Source change save करते समय authoritative full dataset रखें, लेकिन mutation boundary केवल `source` हो।

---

## 12. Existing maps की preservation

नए source system में इन maps से छेड़छाड़ नहीं होगी:

```json
{
  "hiddenByChapter": {},
  "visibleByChapter": {},
  "detectedByChapter": {}
}
```

Rules:

- Description edit maps को नहीं बदलेगा।
- Source promotion maps को reset नहीं करेगा।
- Deep Refresh `hiddenByChapter` और `visibleByChapter` को byte-for-byte preserve करेगा।
- `detectedByChapter` केवल existing detection/snapshot subsystem update करेगा।
- Migration maps की keys और arrays preserve/normalize करेगी, delete नहीं।
- Entry delete होने पर existing cleanup logic उसकी ID को `detectedByChapter` से हटा सकती है।

---

## 13. Atomic promotion save

Normal और Advanced Promote दोनों में persistence order:

1. Draft identity और current naming dataset capture करें।
2. Target chapter/remainder documents तैयार करें।
3. Target documents durable storage में लिखें।
4. Naming source remap in-memory करें।
5. Updated Story Naming dataset atomic save करें।
6. Manifest/project state save करें।
7. सब सफल होने के बाद original draft delete/replace करें।

यदि step 3–6 में failure हो तो original draft और original naming metadata recoverable रहना चाहिए। आधा promote हुआ source स्वीकार नहीं किया जाएगा।

---

## 14. मौजूदा code में integration points

### `assets/shared/js/04a-state-defaults-normalization.js`

- `schemaVersion: 2` support जोड़ें।
- New `source` normalize करें।
- `descriptionHistory` को `{description, editedAt, editedBy?}` में normalize और 50 पर cap करें।
- Legacy fields को ordinary normalization में destructively delete न करें; persisted migration path अलग रखें।

### `assets/pages/story-novel-project-editor/js/03b-naming-categories-search.js`

- `saveNamingEntry` में पूरे entry का `changed` description history का trigger न हो।
- अलग `descriptionChanged` निकालें।
- History में नई नहीं, पुरानी description append करें।
- Initial creation पर history खाली रखें।

### `assets/pages/story-novel-project-editor/js/01b-history-auto-scroll.js`

- Draft resolution को promoted `draftId`/`draftKey` guard दें।
- केवल text match के आधार पर अन्य drafts की entries update न करें।
- Legacy flat fields के स्थान पर केवल `entry.source` update करें।

### `assets/pages/story-novel-project-editor/js/05-advanced-draft-promote.js`

- हर chapter scan से independent source remap करने के बजाय सभी chapters बनने के बाद batch remap चलाएं।
- हर candidate को हर generated chapter में check करें।
- Chapter match न हो तो remainder check करें।
- कहीं match न हो तो `source: null` करें।

### `assets/pages/story-novel-project-editor/js/03c-naming-deep-scan-facts.js`

- Flat source fields और `descriptionMeta` overwrite हटाएं।
- Existing source पहले verify करें।
- जरूरत पर deterministic story fallback scan करें।
- केवल `entry.source` assign करें।
- Name, description, history और top-level timestamps preserve करें।

### `assets/pages/story-novel-project-editor/js/00e-initial-rendering-store.js`

- Story Naming source/projection mode में migration से पहले complete authoritative dataset load करें।
- Projected category subset को migrated authoritative source के रूप में persist न करें।
- Existing snapshot और `detectedByChapter` behavior preserve करें।

### `assets/shared/js/06a-project-storage-foundation.js`

- Project open पर schema version check और safe migration orchestrate करें।
- Migration backup तथा atomic write/verify path उपयोग करें।
- नए schema में old missing/orphan setters को entry persistence पर लागू न करें।

---

## 15. आवश्यक tests

### Description history

1. Initial description creation history item न बनाए।
2. वास्तविक description edit पुरानी value और सही timestamp store करे।
3. Name-only edit history न बढ़ाए।
4. Alias-only edit history न बढ़ाए।
5. Category-only edit history न बढ़ाए।
6. Source-only update history न बढ़ाए।
7. केवल outer whitespace/line-ending change history न बढ़ाए।
8. History 50 items से अधिक न हो।

### Normal promotion

9. उसी promoted draft की matching entry chapter source प्राप्त करे।
10. दूसरे draft की समान नाम वाली entry update न हो।
11. Chapter में नाम न मिलने पर entry रहे और `source: null` हो।
12. Promotion top-level `updatedAt` और description data न बदले।

### Advanced Promote

13. हर generated chapter check हो।
14. Earliest generated matching chapter primary source बने।
15. केवल remainder में मिला नाम remainder draft source प्राप्त करे।
16. कहीं न मिला नाम `source: null` प्राप्त करे।
17. Existing `detectedByChapter` flow अन्य occurrences track कर सके।
18. Retry description/source history जैसी duplicate per-name data न बनाए।

### Deep Refresh

19. Valid current source पहले verify हो और incidental earlier mention पर न बदले।
20. Invalid source fallback scan से सही live source पाए।
21. कहीं match न मिलने पर केवल `source: null` हो।
22. `id`, category, name, aliases, description, history, `createdAt` और `updatedAt` byte-for-byte सुरक्षित रहें।
23. `hiddenByChapter` और `visibleByChapter` सुरक्षित रहें।
24. Scan result से पूरा entry spread/assign न हो।

### Migration

25. Legacy chapter entry सही chapter source में migrate हो।
26. Legacy draft entry सही draft source में migrate हो।
27. Missing live document वाली entry `source: null` पाए।
28. Existing valid new source legacy fields से overwrite न हो।
29. Old description history सही minimal shape में बदले।
30. Invalid history quarantine हो, silently lost न हो।
31. Valid entry IDs, categories, names और descriptions preserve हों।
32. Visibility और detected maps preserve हों।
33. Projection subset पर persisted migration न चले।
34. Interrupted migration original data से recover हो।
35. `schemaVersion: 2` dataset दोबारा migrate करने पर output न बदले।

---

## 16. Rollout plan

### चरण 1: Read compatibility

- New `source` पढ़ें।
- Legacy flat metadata पढ़ना जारी रखें।
- UI को दोनों shapes से चलने दें।

### चरण 2: Safe migration

- Complete authoritative dataset पर schema-v2 migration चलाएं।
- Backup, validation और atomic replace लागू करें।

### चरण 3: New writes

- New entries केवल नया schema लिखें।
- Description edits minimal history लिखें।
- Promotion/Deep Refresh केवल `source` लिखें।

### चरण 4: Legacy cleanup

- Migration validation और compatibility tests पास होने के बाद old write paths हटाएं।
- Old orphan/missing/error persistence बंद करें।

---

## 17. Definition of Done

Implementation पूर्ण मानी जाएगी जब:

- हर new entry केवल 9 required top-level properties वाले model पर बने।
- Source valid document object या `null` हो।
- Deleted/promoted draft की stale per-name reference न बचे।
- Description history केवल वास्तविक description edit पर बने।
- हर history item में केवल `description`, `editedAt` और optional `editedBy` हो।
- Normal तथा Advanced Promote draft identity guard के साथ सही source remap करें।
- Advanced Promote हर generated chapter और remainder check करे।
- Deep Refresh केवल source metadata बदले।
- Orphan/missing/error metadata persist न हो।
- Existing `hiddenByChapter`, `visibleByChapter` और `detectedByChapter` behavior सुरक्षित रहे।
- पुराने project और Story Naming file backup तथा atomic validation के साथ migrate हों।
- सभी migration, promotion, history और refresh tests पास हों।

यह specification नए Story Naming metadata system का अंतिम implementation contract है।
