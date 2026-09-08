'use strict';

(function initializeRenderingSnapshotTools() {
  const SETTINGS_KEY = 'lm_rendering_snapshot_scope_v1';
  const defaults = Object.freeze({ mode: 'all', days: 30, chapters: 50 });

  function clampInteger(value, fallback, max) {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) ? Math.max(1, Math.min(max, parsed)) : fallback;
  }

  function normalizedScope(value = {}) {
    const mode = ['all', 'recent-days', 'recent-chapters'].includes(value.mode) ? value.mode : defaults.mode;
    return {
      mode,
      days: clampInteger(value.days, defaults.days, 3650),
      chapters: clampInteger(value.chapters, defaults.chapters, 10000)
    };
  }

  function storedScope() {
    try {
      return normalizedScope(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch (_error) {
      return { ...defaults };
    }
  }

  function scopeFromControls() {
    return normalizedScope({
      mode: document.getElementById('renderSnapshotScopeMode')?.value,
      days: document.getElementById('renderSnapshotDays')?.value,
      chapters: document.getElementById('renderSnapshotChapters')?.value
    });
  }

  function saveScopeFromControls() {
    const scope = scopeFromControls();
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(scope)); } catch (error) { console.warn('Snapshot scope preference could not be cached:', error); }
    const daysRow = document.querySelector('[data-render-snapshot-condition="recent-days"]');
    const chaptersRow = document.querySelector('[data-render-snapshot-condition="recent-chapters"]');
    if (daysRow) daysRow.hidden = scope.mode !== 'recent-days';
    if (chaptersRow) chaptersRow.hidden = scope.mode !== 'recent-chapters';
    return scope;
  }

  function actionRow(kind, title, description, buttonLabel) {
    return `<div class="advanced-runtime-setting-row render-snapshot-action-row"><span><strong>${title}</strong><p>${description}</p></span><button class="render-snapshot-action" type="button" onclick="LmRenderingSnapshotTools.run('${kind}', this)">${buttonLabel}</button></div>`;
  }

  function developerSectionHtml(categoryIndex, isActive) {
    const scope = storedScope();
    return `<section class="advanced-developer-settings-section" data-advanced-developer-section="${categoryIndex}" ${isActive ? '' : 'hidden'}>
      <div class="advanced-developer-settings-copy"><h4>Initial Rendering Snapshot Builder</h4><p>Build panel-specific files inside Initial_Rendering. Scope applies to Facts Snapshot and Naming Deep Scan; All Document Naming Snapshots always processes every document, while Left Panel always keeps the complete chapter and draft structure.</p></div>
      <div class="advanced-runtime-settings-list render-snapshot-scope-list">
        <div class="advanced-runtime-setting-row"><span><strong>Snapshot scope</strong><p>Choose every document, documents changed within a day window, or the latest chapters in global chapter order.</p></span><select id="renderSnapshotScopeMode" onchange="LmRenderingSnapshotTools.saveScopeFromControls()"><option value="all" ${scope.mode === 'all' ? 'selected' : ''}>All documents</option><option value="recent-days" ${scope.mode === 'recent-days' ? 'selected' : ''}>Recent days</option><option value="recent-chapters" ${scope.mode === 'recent-chapters' ? 'selected' : ''}>Last N chapters</option></select></div>
        <div class="advanced-runtime-setting-row" data-render-snapshot-condition="recent-days" ${scope.mode === 'recent-days' ? '' : 'hidden'}><span><strong>Recent day window</strong><p>Use Naming documents whose source changed, and facts created or updated, within this many days.</p></span><label class="render-snapshot-number"><input id="renderSnapshotDays" type="number" min="1" max="3650" step="1" value="${scope.days}" onchange="LmRenderingSnapshotTools.saveScopeFromControls()"><em>days</em></label></div>
        <div class="advanced-runtime-setting-row" data-render-snapshot-condition="recent-chapters" ${scope.mode === 'recent-chapters' ? '' : 'hidden'}><span><strong>Latest chapter window</strong><p>Write Naming snapshots for only the last N chapters by global index. The active document is always included.</p></span><label class="render-snapshot-number"><input id="renderSnapshotChapters" type="number" min="1" max="10000" step="1" value="${scope.chapters}" onchange="LmRenderingSnapshotTools.saveScopeFromControls()"><em>chapters</em></label></div>
      </div>
      <div class="render-snapshot-actions">
        ${actionRow('chapter-properties', 'Chapter file properties', 'Windows helper saves chapter identity and order with each TXT file. Start tools/start-chapter-properties.cmd and select this project.', 'Check Properties Status')}
        ${actionRow('left', 'Left Panel rendering data', 'Refresh Left_Panel.json from chapter, part, draft, and trash metadata without loading document bodies.', 'Build Left Snapshot')}
        ${actionRow('facts', 'Facts Panel rendering data', 'Refresh Facts_Panel.json from authoritative Story_Facts.json using the selected snapshot scope.', 'Build Facts Snapshot')}
        ${actionRow('naming-snapshots', 'All Document Naming snapshots', 'Build initial-render snapshots for every chapter and draft from stored document text. Created/detected categories and six-category fallback state are included without changing first-appearance metadata.', 'Build All Naming Snapshots')}
        ${actionRow('naming', 'Naming Panel deep scan & snapshots', 'Run the full first-appearance Deep Scan, then write Naming_Documents snapshots selected by the scope above.', 'Deep Scan Naming')}
      </div>
      <p class="render-snapshot-status" id="renderSnapshotStatus" role="status" aria-live="polite"></p>
    </section>`;
  }

  function setStatus(message, state = '') {
    const status = document.getElementById('renderSnapshotStatus');
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  }

  function setDeepScanStatus(message = '', progress = null, done = false) {
    const status = document.getElementById('namingDeepScanStatus');
    const button = document.getElementById('namingDeepScanBtn');
    if (status) { status.hidden = !message; status.textContent = message; }
    if (button) {
      button.dataset.scanProgress = Number.isFinite(progress) ? String(Math.round(progress)) : '';
      button.title = message || "Deep scan story to update names' first appearance";
    }
    if (done && status) setTimeout(() => { status.hidden = true; status.textContent = ''; }, 2200);
  }

  async function run(kind, button) {
    if (kind === 'chapter-properties') {
      try { await window.LmChapterProperties?.showStatus?.(); }
      catch (error) { setStatus(`Chapter properties: ${error.message}`, 'error'); }
      return;
    }
    if (!projectDirectoryHandle) {
      setStatus('Open a project before building snapshots.', 'error');
      showMiniReminder('पहले कोई project खोलें।');
      return;
    }
    const scope = saveScopeFromControls();
    if (kind === 'naming') {
      setStatus('Naming Deep Scan और snapshot build चल रहा है…', 'working');
      Promise.resolve(deepScanAllNamingEntries(button, {
        snapshotScope: scope,
        onComplete: result => setStatus(result?.message || 'Naming snapshot task finished.', result?.error ? 'error' : 'success')
      })).catch(error => setStatus(`Naming Deep Scan failed: ${error?.message || error}`, 'error'));
      return;
    }
    if (kind === 'naming-snapshots') {
      button.disabled = true;
      button.classList.add('is-scanning');
      setStatus('सभी document Naming sources पढ़े जा रहे हैं…', 'working');
      try {
        const result = await window.LmInitialRendering?.rebuildAllNamingDocumentStates?.({
          scope: { mode: 'all' },
          onProgress: progress => {
            if (progress.phase === 'reading') setStatus(`Naming sources ${progress.loaded}/${progress.total} पढ़े गए…`, 'working');
            if (progress.phase === 'writing') setStatus(`Naming snapshots ${progress.written}/${progress.total} लिखे गए…`, 'working');
          }
        });
        renderTags?.();
        setStatus(`सभी Naming snapshots तैयार हैं: ${result?.writtenSnapshots ?? 0}/${result?.scannedDocuments ?? 0} documents।`, 'success');
      } catch (error) {
        console.warn('All Naming snapshots build failed:', error);
        setStatus(`Naming snapshots failed: ${error?.message || error}`, 'error');
      } finally {
        button.disabled = false;
        button.classList.remove('is-scanning');
      }
      return;
    }
    button.disabled = true;
    button.classList.add('is-scanning');
    setStatus(`${kind === 'left' ? 'Left Panel' : 'Facts Panel'} snapshot बन रहा है…`, 'working');
    try {
      if (kind === 'left') {
        await window.LmInitialRendering?.syncLeftPanelData?.();
        setStatus('Left Panel snapshot तैयार है। पूरी chapter/draft structure शामिल की गई है।', 'success');
      } else {
        await window.LmWorkspaceSectionLoader?.ensureFactsData?.();
        const result = await window.LmInitialRendering?.syncFactsPanelData?.(scope);
        setStatus(`Facts snapshot तैयार है: ${result?.includedFacts ?? 0}/${result?.totalFacts ?? 0} facts शामिल।`, 'success');
      }
    } catch (error) {
      console.warn('Rendering snapshot build failed:', kind, error);
      setStatus(`Snapshot build failed: ${error?.message || error}`, 'error');
    } finally {
      button.disabled = false;
      button.classList.remove('is-scanning');
    }
  }

  window.LmRenderingSnapshotTools = Object.freeze({
    developerSectionHtml,
    saveScopeFromControls,
    setDeepScanStatus,
    storedScope,
    run
  });
})();
