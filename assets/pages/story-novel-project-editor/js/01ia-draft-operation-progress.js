'use strict';

(function initializeDraftProgress() {
  let current = null;
  async function step(message, completed, total) {
    if (!current) return;
    current.status.textContent = message;
    // Counts describe the current phase, never an estimated percentage of a
    // transaction whose disk/database work has not acknowledged completion.
    if (Number.isFinite(completed) && Number.isFinite(total) && total > 0) {
      current.bar.max = total;
      current.bar.value = completed;
      current.count.textContent = `${completed} of ${total} drafts · current step`;
    } else {
      current.bar.removeAttribute('value');
      current.count.textContent = `${current.total} drafts · processing`;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  async function run(title, total, execute) {
    // The modal owns the batch: ignore repeated clicks rather than run two
    // destructive operations against the same draft indexes.
    if (current) return;
    const previousFocus = document.activeElement;
    const panel = document.createElement('dialog');
    panel.className = 'text-import-progress draft-operation-progress';
    panel.setAttribute('aria-label', title);
    panel.innerHTML = '<div class="text-import-progress-heading"><span class="text-import-progress-spinner" aria-hidden="true"></span><h2></h2></div><p class="text-import-progress-status" role="status" aria-live="polite"></p><progress aria-label="Current step progress"></progress><div class="text-import-progress-count"><span></span></div><p>कृपया प्रक्रिया पूरी होने तक प्रतीक्षा करें।</p>';
    panel.querySelector('h2').textContent = title;
    const operation = { panel, total, status: panel.querySelector('[role="status"]'), bar: panel.querySelector('progress'), count: panel.querySelector('.text-import-progress-count span') };
    const preventClose = event => event.preventDefault();
    const beforeUnload = event => { event.preventDefault(); event.returnValue = ''; };
    panel.addEventListener('cancel', preventClose);
    panel.addEventListener('keydown', event => event.stopPropagation());
    document.body.appendChild(panel);
    current = operation;
    try {
      panel.showModal();
      window.addEventListener('beforeunload', beforeUnload);
      await step('Preparing drafts…');
      return await execute();
    } finally {
      current = null;
      window.removeEventListener('beforeunload', beforeUnload);
      if (panel.open) panel.close();
      panel.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }
  }
  window.LmDraftProgress = Object.freeze({ run, step, active: () => Boolean(current) });
})();
