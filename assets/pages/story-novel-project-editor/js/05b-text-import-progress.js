(function initializeTextImportProgress() {
  let activeImport = null;

  function openProgress(target, total, promoting = false) {
    const action = promoting ? 'promotion' : 'import';
    const completedLabel = promoting ? 'chapters promoted' : 'documents saved';
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'text-import-progress';
    dialog.setAttribute('aria-labelledby', 'textImportProgressTitle');
    dialog.innerHTML = `
      <div class="text-import-progress-heading"><span class="text-import-progress-spinner" aria-hidden="true"></span>
        <h2 id="textImportProgressTitle">${promoting ? 'Promoting' : 'Importing'} ${target}…</h2></div>
      <p class="text-import-progress-status" role="status" aria-live="polite">Preparing ${action}…</p>
      <progress aria-label="${promoting ? 'Promotion' : 'Import'} progress" max="100" value="0"></progress>
      <div class="text-import-progress-count"><span>0 of ${total} ${completedLabel}</span><strong>0%</strong></div>
      <div class="text-import-progress-actions"><button type="button">Cancel ${action}</button></div>`;
    document.body.appendChild(dialog);
    const status = dialog.querySelector('.text-import-progress-status');
    const bar = dialog.querySelector('progress');
    const count = dialog.querySelector('.text-import-progress-count span');
    const percent = dialog.querySelector('.text-import-progress-count strong');
    const button = dialog.querySelector('button');
    const operation = {
      project: projectDirectoryHandle, cancelled: false, committed: false, rollingBack: false,
      update(message, value, saved = 0) {
        if (operation.cancelled || operation.rollingBack) return;
        status.textContent = message;
        bar.value = value;
        percent.textContent = `${Math.round(value)}%`;
        count.textContent = `${saved} of ${total} ${completedLabel}`;
      },
      rollback() {
        operation.rollingBack = true;
        status.textContent = operation.cancelled ? `Cancelling ${action}…` : `Undoing incomplete ${action}…`;
        bar.removeAttribute('value');
        count.textContent = promoting ? 'Restoring the original draft and project' : 'Undoing all documents from this import';
        percent.textContent = '';
        button.disabled = true;
        button.textContent = 'Restoring…';
      },
      async checkpoint() {
        // Let the progress paint and handle Cancel between preparation/file steps.
        await new Promise(resolve => setTimeout(resolve, 0));
        if (operation.project !== projectDirectoryHandle) throw new Error(`Project changed during ${action}.`);
        if (operation.cancelled) throw Object.assign(new Error(`${promoting ? 'Promotion' : 'Import'} cancelled.`), { name: 'AbortError' });
      },
      commit() {
        operation.committed = true;
        operation.update(`${promoting ? 'Promotion' : 'Import'} saved. Updating the editor…`, 98, total);
        button.disabled = true;
        button.textContent = 'Finishing…';
      },
      close() {
        window.removeEventListener('beforeunload', beforeUnload);
        dialog.close();
        dialog.remove();
        if (previousFocus?.isConnected) previousFocus.focus();
      },
      async retryRecovery(error) {
        status.textContent = 'Cleanup needs attention';
        button.title = `${error.message} Retry cleanup after restoring access to the folder.`;
        button.textContent = 'Retry cleanup';
        button.disabled = false;
        await new Promise(resolve => button.addEventListener('click', resolve, { once: true }));
        operation.rollback();
      }
    };
    const cancel = () => {
      if (operation.committed || operation.cancelled || operation.rollingBack) return;
      operation.cancelled = true;
      operation.rollback();
    };
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    button.addEventListener('click', cancel);
    dialog.addEventListener('keydown', event => event.stopPropagation());
    dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
    window.addEventListener('beforeunload', beforeUnload);
    dialog.showModal();
    button.focus();
    return operation;
  }

  async function apply(state, proposedDocuments, options = {}) {
    if (activeImport || !state || !proposedDocuments.length) return;
    const promoting = Boolean(options.promoting);
    const action = promoting ? 'promotion' : 'import';
    const actionTitle = promoting ? 'Promotion' : 'Import';
    const asChapters = promoting || state.importTarget === 'chapters';
    const remainder = asChapters ? advancedPromoteNormalizedText(state.remainderText) : '';
    const total = proposedDocuments.length + (remainder && !promoting ? 1 : 0);
    const operation = openProgress(asChapters ? 'chapters' : 'drafts', total, promoting);
    activeImport = operation;
    let snapshot = null;
    let editorState = null;
    try {
      await operation.checkpoint();
      // Finish any autosave already in flight before taking the rollback baseline.
      while (typeof isAutoSaveRunning !== 'undefined' && isAutoSaveRunning) await operation.checkpoint();
      if (typeof flushEditorHTMLMemoryCommit === 'function') await flushEditorHTMLMemoryCommit();
      syncActiveEditorDocumentFromEditor();
      const fullNaming = await window.LmInitialRendering?.ensureFullNamingData?.();
      if (fullNaming) namingData = normalizeNamingData(fullNaming);
      await operation.checkpoint();
      await window.LmInitialRendering?.serializeNamingWrite?.(operation.project, async () => {});
      window.LmInitialRendering?.reset?.();
      snapshot = captureNamingPromotionState();
      let importNaming = normalizeNamingData(snapshot.naming);
      const sourceDraft = promoting ? chapterDrafts[state.draftIndex] : null;
      if (promoting && (!sourceDraft || sourceDraft.id !== options.draft?.id || sourceDraft.contentPath !== options.draft?.contentPath)) {
        throw new Error('The source draft changed. Reopen Advanced Promote and try again.');
      }
      const draftIdentity = promoting ? createNamingSource(sourceDraft, 'draft', state.draftIndex) : null;
      editorState = {
        isChapterEditUnlocked, activeChapterEditKey, expandedPartIndex,
        isRawChapterSectionExpanded, isPartsListCollapsedByRaw, isPartsListForceExpanded,
        chapterListOverflowMode,
        selectedDrafts: [...selectedDraftIndexes], lastSelectedDraftIndex
      };
      const files = [];
      const sourceIndex = asChapters ? await window.LmNamingDeepScanSource?.buildTextIndex?.({
        includeDrafts: false, tolerateReadErrors: true, checkpoint: operation.checkpoint,
        onProgress: ({ loaded, total: sourceTotal }) => operation.update('Reading existing chapters…', sourceTotal ? loaded / sourceTotal * 5 : 5)
      }) : null;
      const firstChapter = chapters.length;
      const firstDraft = chapterDrafts.length;
      const manifest = normalizeProjectManifest(projectManifest || createProjectManifest());
      const raw = asChapters && state.destination === 'raw' && state.showDestination && hasRawChaptersInPanel(manifest);
      const partIndex = raw ? -1 : manifest.parts.length ? latestPartIndex(manifest) : -1;
      const partChapterCount = manifest.parts.length
        ? chapters.filter(chapter => partIndex < 0
          ? !Number.isInteger(chapter.partIndex) || chapter.partIndex < 0 || chapter.partIndex >= manifest.parts.length
          : chapter.partIndex === partIndex).length
        : chapters.length;
      const usedTitles = new Set();
      const createdAt = new Date().toISOString();
      const addDraft = (title, value, offset) => {
        const index = chapterDrafts.length;
        const draft = normalizeDraft({
          ...createDefaultDraft(index), id: Date.now() + offset, title,
          content: textToEditorHTML(value), contentPath: nextDraftFilePath(),
          createdAt, updatedAt: createdAt,
          _wordCount: advancedPromoteWordCount(value), wordCount: advancedPromoteWordCount(value)
        }, index);
        chapterDrafts.push(draft);
        files.push({ path: draft.contentPath, text: value, title, document: true, kind: 'draft' });
      };
      for (let offset = 0; offset < proposedDocuments.length; offset++) {
        await operation.checkpoint();
        const item = proposedDocuments[offset];
        const value = advancedPromoteNormalizedText(item.text);
        operation.update(`Preparing ${asChapters ? 'chapter' : 'draft'} ${offset + 1} of ${proposedDocuments.length}…`,
          5 + offset / total * 15, 0);
        if (asChapters) {
          const index = chapters.length;
          const title = advancedPromoteUniqueChapterTitle(item.title || (promoting
            ? advancedPromoteGeneratedTitle(state, offset) : advancedImportDocumentTitle(state, offset)), usedTitles);
          const chapter = normalizeChapter({
            ...(promoting ? {
              notes: sourceDraft.notes || [], alignment: sourceDraft.alignment, lineHeight: sourceDraft.lineHeight,
              paragraphGap: sourceDraft.paragraphGap, paragraphMargin: sourceDraft.paragraphMargin,
              fontFamily: sourceDraft.fontFamily, fontSize: sourceDraft.fontSize
            } : { notes: [] }),
            id: Date.now() + offset, title, content: textToEditorHTML(value),
            contentPath: chapterFilePath(index), partIndex, chapterNo: partChapterCount + offset + 1,
            createdAt, _wordCount: advancedPromoteWordCount(value)
          }, index, partIndex, partChapterCount + offset);
          chapters.push(chapter);
          if (sourceIndex) sourceIndex.chapterTexts[index] = value;
          namingData = importNaming;
          if (!promoting) scanNamingUsesForDocument(chapter.contentPath, value, null, createdAt, { resolveUnattached: false });
          importNaming = namingData;
          files.push({ path: chapter.contentPath, text: value, title, document: true, kind: 'chapter' });
        } else {
          addDraft(String(item.title || advancedImportDocumentTitle(state, offset, 'drafts')).trim(), value, offset);
        }
      }
      if (remainder) {
        await operation.checkpoint();
        if (promoting) {
          const remainderDraft = normalizeDraft({
            ...sourceDraft, id: Date.now() + proposedDocuments.length + 1,
            contentPath: nextDraftFilePath(), contentHandle: null,
            content: textToEditorHTML(remainder), updatedAt: createdAt,
            _wordCount: advancedPromoteWordCount(remainder), wordCount: advancedPromoteWordCount(remainder)
          }, state.draftIndex);
          chapterDrafts.splice(state.draftIndex, 1, remainderDraft);
          files.push({ path: remainderDraft.contentPath, text: remainder, title: remainderDraft.title, kind: 'draft' });
        } else {
          addDraft(advancedImportDocumentTitle(state, 0, 'drafts'), remainder, proposedDocuments.length);
        }
      } else if (promoting) {
        chapterDrafts.splice(state.draftIndex, 1);
      }
      if (promoting) {
        namingData = importNaming;
        remapNamesForAdvancedPromotion({
          draftIdentity,
          createdChapters: chapters.slice(firstChapter).map((chapter, offset) => ({
            chapter, index: firstChapter + offset, text: proposedDocuments[offset].text
          })),
          remainderDraft: remainder ? { draft: chapterDrafts[state.draftIndex], index: state.draftIndex, text: remainder } : null,
          promotedAt: createdAt
        });
        for (let offset = 0; offset < proposedDocuments.length; offset++) {
          await operation.checkpoint();
          scanNamingUsesForDocument(chapters[firstChapter + offset].contentPath, proposedDocuments[offset].text, null, createdAt, { resolveUnattached: false });
        }
        if (remainder) scanNamingUsesForDocument(chapterDrafts[state.draftIndex].contentPath, remainder, null, createdAt, { resolveUnattached: false });
        importNaming = namingData;
      }
      chapterDrafts = normalizeDrafts(chapterDrafts);
      if (sourceIndex) {
        await operation.checkpoint();
        await window.LmNamingDeepScanSource.repairDraftSourcesSeenInChapters({
          entries: importNaming.entries, sourceIndex, triggerTexts: proposedDocuments.map(item => item.text)
        });
      }
      namingData = importNaming;
      // Keep legacy facts in the manifest until the normal facts migration runs.
      const nextManifest = normalizeProjectManifest({ ...manifest, ...chaptersToManifest(), updatedAt: createdAt });
      files.push(
        { path: PROJECT_NAMING_FILE, text: JSON.stringify(normalizeNamingData(namingData), null, 2), title: 'Naming data' },
        { path: PROJECT_DRAFTS_FILE, text: JSON.stringify({ drafts: draftsForStorage(!projectDirectoryHandle) }, null, 2), title: 'Draft list' },
        { path: PROJECT_MANIFEST_FILE, text: JSON.stringify(nextManifest, null, 2), title: 'Project structure' }
      );
      // Deleting the consumed source belongs to the same reversible file batch.
      if (promoting && sourceDraft.contentPath) files.push({ path: sourceDraft.contentPath, text: null, title: 'Original draft' });
      let savedDocuments = 0;
      operation.update(`Preparing safe ${action}…`, 20, 0);
      await window.LmNamingFileSafety.commitTextImport(operation.project, {
        files, checkpoint: operation.checkpoint,
        onProgress: ({ written, total: fileCount, file }) => {
          savedDocuments = Math.min(written, total);
          operation.update(file.document ? `${promoting ? 'Promoting' : 'Importing'} ${file.kind} ${files.indexOf(file) + 1} of ${total}…` : 'Saving project details…',
            20 + written / fileCount * 76, savedDocuments);
        },
        onRollback: operation.rollback, onCommitted: operation.commit
      });
      projectManifest = nextManifest;
      namingData = importNaming;
      activeEditorMode = asChapters ? 'chapter' : 'draft';
      isChapterEditUnlocked = false;
      activeChapterEditKey = null;
      selectedDraftIndexes.clear();
      lastSelectedDraftIndex = null;
      if (asChapters) {
        curChap = firstChapter;
        if (promoting) curDraft = chapterDrafts.length ? Math.min(state.draftIndex, chapterDrafts.length - 1) : -1;
        curPart = partIndex;
        expandedPartIndex = partIndex;
        isRawChapterSectionExpanded = raw;
        isPartsListCollapsedByRaw = raw;
        isPartsListForceExpanded = !raw && partIndex >= 0;
        if (!raw && partIndex >= 0 && chapterListOverflowMode === 'collapsed') chapterListOverflowMode = 'expanded';
      } else {
        curDraft = firstDraft;
        collapseChapterListsForDraftEditor();
      }
      cacheProjectManifest(projectManifest);
      saveToStorage(false);
      closeAdvancedDraftPromotePanel();
      await loadEditor();
      await window.LmInitialRendering?.syncLeftPanelData?.();
      await window.LmInitialRendering?.syncNamingIndex?.(importNaming);
      renderChapters();
      renderActiveWorkspaceSidePanel();
      updateChapterStatus();
      if (asChapters) rememberCurrentChapterSaved();
      setDraftBoxSaveIndicator('saved');
      setSaveStatusDot('saved', promoting ? 'Chapters promoted' : asChapters ? 'Chapters imported' : 'Drafts imported');
      operation.update(`${actionTitle} complete`, 100, total);
    } catch (error) {
      console.warn(`${actionTitle} did not finish:`, error);
      if (!operation.committed) {
        operation.rollback();
        while (error.rollbackIncomplete) {
          await operation.retryRecovery(error);
          const retryRollback = error.retryRollback;
          try {
            if (retryRollback) await retryRollback();
            else await window.LmNamingFileSafety.recoverTextImport(operation.project);
            error = operation.cancelled ? Object.assign(new Error(`${actionTitle} cancelled.`), { name: 'AbortError' }) : new Error(`${actionTitle} failed.`);
          } catch (recoveryError) {
            error = Object.assign(recoveryError, { rollbackIncomplete: true, retryRollback });
          }
        }
        if (snapshot && editorState && operation.project === projectDirectoryHandle) {
          isChapterEditUnlocked = editorState.isChapterEditUnlocked;
          activeChapterEditKey = editorState.activeChapterEditKey;
          expandedPartIndex = editorState.expandedPartIndex;
          isRawChapterSectionExpanded = editorState.isRawChapterSectionExpanded;
          isPartsListCollapsedByRaw = editorState.isPartsListCollapsedByRaw;
          isPartsListForceExpanded = editorState.isPartsListForceExpanded;
          chapterListOverflowMode = editorState.chapterListOverflowMode;
          selectedDraftIndexes.clear();
          editorState.selectedDrafts.forEach(index => selectedDraftIndexes.add(index));
          lastSelectedDraftIndex = editorState.lastSelectedDraftIndex;
          restoreNamingPromotionState(snapshot);
        }
        showMiniReminder(error.name === 'AbortError'
          ? `${actionTitle} cancelled. All changes from this ${action} were undone.`
          : `${actionTitle} failed; its changes were undone. ${error.message || ''}`);
      } else {
        showMiniReminder(`${actionTitle} saved. Reload this project to refresh the editor.`);
      }
    } finally {
      operation.close();
      activeImport = null;
    }
  }

  window.LmTextImportProgress = Object.freeze({ apply, promote: (state, documents, draft) => apply(state, documents, { promoting: true, draft }) });
})();
