'use strict';

function getEntryTime(entry) {
  if (!entry) return 0;
  const timestamp = entry.updatedAt || entry.createdAt;
  const parsed = timestamp ? new Date(timestamp).getTime() : 0;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  const idTime = String(entry.id || '').match(/\d+/);
  return idTime ? parseInt(idTime[0], 10) : 0;
}

function namingEntryFirstAppearanceChapterNo(entry = {}) {
  const normalizePath = value => String(value || '').replace(/\\/g, '/').toLocaleLowerCase();
  const entryPaths = new Set([
    entry.chapterKey, entry.contentPath, entry.descriptionMeta?.chapterKey, entry.descriptionMeta?.contentPath
  ].map(normalizePath).filter(Boolean));
  if (typeof chapters !== 'undefined' && Array.isArray(chapters) && entryPaths.size) {
    const globalIndex = chapters.findIndex(chapter => entryPaths.has(normalizePath(chapter?.contentPath)));
    if (globalIndex >= 0) return globalIndex + 1;
  }
  const candidates = [
    Number.isInteger(entry.chapterIndex) ? entry.chapterIndex + 1 : null,
    Number.isInteger(entry.descriptionMeta?.chapterIndex) ? entry.descriptionMeta.chapterIndex + 1 : null,
    entry.chapterNo,
    entry.descriptionMeta?.chapterNo
  ];
  const chapterNo = candidates.map(Number).find(value => Number.isFinite(value) && value > 0);
  return chapterNo || 0;
}

function namingEntryCreationIsDraft(entry = {}) {
  const rawStatus = String(
    entry.chapterStatus || entry.documentType || entry.status ||
    entry.descriptionMeta?.chapterStatus || entry.descriptionMeta?.documentType || ''
  ).toLocaleLowerCase();
  if (['draft', 'chapter', 'orphan', 'undefined'].includes(rawStatus)) return rawStatus === 'draft';
  return Boolean(
    entry.draftKey || Number.isInteger(entry.draftIndex) || entry.draftNo || entry.descriptionMeta?.draftKey
  );
}

function namingEntryFirstAppearanceDraftIndex(entry = {}) {
  if (!namingEntryCreationIsDraft(entry)) return -1;
  const normalizePath = value => String(value || '').replace(/\\/g, '/').toLocaleLowerCase();
  const entryPaths = new Set([
    entry.draftKey, entry.contentPath, entry.chapterKey,
    entry.descriptionMeta?.draftKey, entry.descriptionMeta?.contentPath, entry.descriptionMeta?.chapterKey
  ].map(normalizePath).filter(Boolean));
  if (typeof chapterDrafts !== 'undefined' && Array.isArray(chapterDrafts) && entryPaths.size) {
    const globalIndex = chapterDrafts.findIndex(draft => entryPaths.has(normalizePath(draft?.contentPath)));
    if (globalIndex >= 0) return globalIndex;
  }
  const candidates = [
    entry.draftIndex,
    entry.descriptionMeta?.draftIndex,
    Number(entry.draftNo) - 1,
    Number(entry.descriptionMeta?.draftNo) - 1
  ];
  const draftIndex = candidates.map(Number).find(value => Number.isInteger(value) && value >= 0);
  return Number.isInteger(draftIndex) ? draftIndex : -1;
}

function compareNamingEntriesByCreationDocument(a, b, compareNames) {
  const aIsDraft = namingEntryCreationIsDraft(a);
  const bIsDraft = namingEntryCreationIsDraft(b);
  if (aIsDraft !== bIsDraft) return aIsDraft ? -1 : 1;
  if (aIsDraft) {
    return namingEntryFirstAppearanceDraftIndex(b) - namingEntryFirstAppearanceDraftIndex(a) ||
      getEntryTime(b) - getEntryTime(a) || compareNames(a, b);
  }
  return namingEntryFirstAppearanceChapterNo(b) - namingEntryFirstAppearanceChapterNo(a) ||
    getEntryTime(b) - getEntryTime(a) || compareNames(a, b);
}

function getCategoryFilteredSortedEntries(categoryId, entries) {
  const query = String(window.categorySearchQuery || '').trim().toLocaleLowerCase();
  const sortOption = window.categorySortOption || 'status';
  const filtered = query
    ? entries.filter(entry => String(entry.name || '').toLocaleLowerCase().includes(query))
    : [...entries];
  const compareNames = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
  if (sortOption === 'count') {
    const mentionCount = entry => window.LmInitialRendering?.namingStoryMentionCount?.(entry.id) ??
      (typeof namingEntryMentionCount === 'function' ? namingEntryMentionCount(entry) : 0);
    filtered.sort((a, b) => mentionCount(b) - mentionCount(a) || compareNames(a, b));
  } else if (sortOption === 'time') {
    filtered.sort((a, b) => getEntryTime(b) - getEntryTime(a) || compareNames(a, b));
  } else if (sortOption === 'chapter') {
    filtered.sort((a, b) => compareNamingEntriesByCreationDocument(a, b, compareNames));
  } else if (sortOption === 'status') {
    const activeText = activeNamingPanelText();
    const rank = entry => namingEntryMatchesActiveDocument(entry, activeText) ? 0
      : namingEntryNameInText(entry, activeText) ? 1 : namingEntryUsesOrphanStyle(entry) ? 3 : 2;
    filtered.sort((a, b) => rank(a) - rank(b) || compareNames(a, b));
  }
  return filtered;
}
