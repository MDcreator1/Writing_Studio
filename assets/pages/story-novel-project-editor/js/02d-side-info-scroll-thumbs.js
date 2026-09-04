'use strict';

(function initializeSideInformationScrollThumbs() {
  const PANEL_SELECTOR = [
    '.fact-detail-popover',
    '.name-detail-popover',
    '.category-info-popover',
    '.part-details-panel',
    '.chapter-details-panel',
    '.draft-details-panel',
    '.advanced-editor-setting-info-popover',
    '.advanced-promote-chapter-index-list',
    '#advancedPromoteSourceText',
    '.advanced-import-source-only.is-remainder-draft textarea',
    '.advanced-promote-full-reading',
    '.advanced-promote-full-editor'
  ].join(',');
  const bindings = new Set();
  const byPanel = new WeakMap();

  function clearHideTimer(binding) {
    clearTimeout(binding.hideTimer);
    binding.hideTimer = 0;
  }

  function panelCanScroll(panel) {
    return panel.isConnected && !panel.hidden && panel.getClientRects().length > 0 &&
      panel.scrollHeight > panel.clientHeight + 1;
  }

  function panelStackingLevel(panel) {
    let level = 90;
    let node = panel;
    while (node instanceof HTMLElement) {
      const zIndex = Number.parseInt(getComputedStyle(node).zIndex, 10);
      if (Number.isFinite(zIndex)) level = Math.max(level, zIndex + 1);
      node = node.parentElement;
    }
    return level;
  }

  function update(binding, visible = binding.hovered || Boolean(binding.drag)) {
    const { panel, thumb } = binding;
    if (!panelCanScroll(panel)) {
      thumb.hidden = true;
      thumb.classList.remove('is-visible', 'is-dragging');
      return false;
    }
    const rect = panel.getBoundingClientRect();
    const trackTop = rect.top + 9;
    const trackHeight = Math.max(1, rect.height - 18);
    const maximumScroll = panel.scrollHeight - panel.clientHeight;
    const thumbHeight = Math.min(trackHeight, Math.max(30, panel.clientHeight / panel.scrollHeight * trackHeight));
    const movableTrack = Math.max(1, trackHeight - thumbHeight);
    const thumbTop = trackTop + panel.scrollTop / maximumScroll * movableTrack;
    thumb.style.top = `${thumbTop}px`;
    thumb.style.left = `${Math.max(2, rect.right - 9)}px`;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.zIndex = String(panelStackingLevel(panel));
    binding.metrics = { maximumScroll, movableTrack };
    thumb.hidden = !visible;
    thumb.classList.toggle('is-visible', visible);
    return true;
  }

  function scheduleHide(binding) {
    clearHideTimer(binding);
    binding.hideTimer = setTimeout(() => {
      if (binding.hovered || binding.drag) return;
      update(binding, false);
    }, 650);
  }

  function showTemporarily(binding) {
    clearHideTimer(binding);
    update(binding, true);
    scheduleHide(binding);
  }

  function startDrag(binding, event) {
    if (!update(binding, true) || !binding.metrics) return;
    event.preventDefault();
    event.stopPropagation();
    clearHideTimer(binding);
    binding.drag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: binding.panel.scrollTop,
      ...binding.metrics
    };
    binding.thumb.classList.add('is-dragging');
    binding.thumb.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(binding, event) {
    const drag = binding.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaY = event.clientY - drag.startY;
    binding.panel.scrollTop = drag.startScrollTop + deltaY / drag.movableTrack * drag.maximumScroll;
    update(binding, true);
  }

  function endDrag(binding, event) {
    const drag = binding.drag;
    if (!drag || (event?.pointerId !== undefined && drag.pointerId !== event.pointerId)) return;
    binding.thumb.releasePointerCapture?.(drag.pointerId);
    binding.thumb.classList.remove('is-dragging');
    binding.drag = null;
    update(binding, binding.hovered);
    scheduleHide(binding);
  }

  function bindPanel(panel) {
    if (!(panel instanceof HTMLElement) || byPanel.has(panel)) return;
    panel.classList.add('lm-side-info-custom-scroll');
    const thumb = document.createElement('div');
    thumb.className = 'side-info-scroll-thumb';
    thumb.hidden = true;
    thumb.setAttribute('aria-hidden', 'true');
    document.body.appendChild(thumb);
    const binding = { panel, thumb, hovered: false, drag: null, hideTimer: 0, metrics: null, resizeObserver: null };
    byPanel.set(panel, binding);
    bindings.add(binding);

    panel.addEventListener('scroll', () => showTemporarily(binding), { passive: true });
    panel.addEventListener('pointerenter', () => {
      binding.hovered = true;
      clearHideTimer(binding);
      update(binding, true);
    });
    panel.addEventListener('pointerleave', () => {
      binding.hovered = false;
      scheduleHide(binding);
    });
    thumb.addEventListener('pointerenter', () => {
      binding.hovered = true;
      clearHideTimer(binding);
      update(binding, true);
    });
    thumb.addEventListener('pointerleave', () => {
      binding.hovered = false;
      scheduleHide(binding);
    });
    thumb.addEventListener('pointerdown', event => startDrag(binding, event));
    thumb.addEventListener('pointermove', event => moveDrag(binding, event));
    thumb.addEventListener('pointerup', event => endDrag(binding, event));
    thumb.addEventListener('pointercancel', event => endDrag(binding, event));
    if (typeof ResizeObserver === 'function') {
      binding.resizeObserver = new ResizeObserver(() => update(binding));
      binding.resizeObserver.observe(panel);
    }
    requestAnimationFrame(() => update(binding));
  }

  function discover(root = document) {
    if (root instanceof HTMLElement && root.matches(PANEL_SELECTOR)) bindPanel(root);
    root.querySelectorAll?.(PANEL_SELECTOR).forEach(bindPanel);
  }

  function cleanDisconnectedBindings() {
    bindings.forEach(binding => {
      if (binding.panel.isConnected) return;
      clearHideTimer(binding);
      binding.resizeObserver?.disconnect();
      binding.thumb.remove();
      bindings.delete(binding);
    });
  }

  function updateAll() {
    cleanDisconnectedBindings();
    bindings.forEach(binding => update(binding));
  }

  function start() {
    discover();
    new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') mutation.addedNodes.forEach(node => discover(node));
        else if (mutation.target instanceof HTMLElement && mutation.target.matches(PANEL_SELECTOR)) {
          bindPanel(mutation.target);
          update(byPanel.get(mutation.target));
        }
      });
      cleanDisconnectedBindings();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    window.addEventListener('resize', updateAll, { passive: true });
    window.addEventListener('scroll', updateAll, { passive: true, capture: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
