(() => {
  const status = document.getElementById('save-status');
  const header = document.getElementById('editor-info-panel');
  const promote = document.getElementById('promoteDraftBtn');
  if (!status || !header || !promote) return;
  const originalParent = status.parentNode;
  const originalNext = status.nextSibling;
  const mobile = window.matchMedia('(max-width: 940px)');
  function placeStatus() {
    if (mobile.matches) header.insertBefore(status, promote);
    else originalParent.insertBefore(status, originalNext);
  }
  mobile.addEventListener('change', placeStatus);
  placeStatus();
})();
