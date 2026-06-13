const SHORTCUT_TOOLTIP_DELAY_MS = 1000;

let shortcutTooltip = null;
let shortcutTooltipTimer = null;
let shortcutTooltipTarget = null;
let pendingShortcutTooltipTarget = null;

function shortcutTooltipElement() {
  if (shortcutTooltip) return shortcutTooltip;
  shortcutTooltip = document.createElement('div');
  shortcutTooltip.id = 'lmShortcutTooltip';
  shortcutTooltip.className = 'lm-shortcut-tooltip lm-id-shortcutTooltip';
  shortcutTooltip.setAttribute('role', 'tooltip');
  shortcutTooltip.hidden = true;
  document.body.appendChild(shortcutTooltip);
  return shortcutTooltip;
}

function shortcutTooltipTargetFromEvent(event) {
  const target = event.target?.closest?.('[data-lm-shortcut]');
  if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return null;
  return target.dataset.lmShortcut?.trim() ? target : null;
}

function suppressShortcutNativeTitle(target) {
  if (!target || !target.hasAttribute('title') || target.dataset.lmNativeTitle !== undefined) return;
  target.dataset.lmNativeTitle = target.getAttribute('title') || '';
  target.removeAttribute('title');
}

function restoreShortcutNativeTitle(target) {
  if (!target || target.dataset.lmNativeTitle === undefined) return;
  if (target.dataset.lmNativeTitle) target.setAttribute('title', target.dataset.lmNativeTitle);
  delete target.dataset.lmNativeTitle;
}

function positionShortcutTooltip(target) {
  const tooltip = shortcutTooltipElement();
  if (!target || tooltip.hidden) return;

  const gap = 8;
  const padding = 8;
  const targetRect = target.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  const tooltipWidth = tooltipRect.width || 80;
  const tooltipHeight = tooltipRect.height || 28;
  const left = Math.max(
    padding,
    Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding)
  );
  const top = targetRect.top - tooltipHeight - gap >= padding
    ? targetRect.top - tooltipHeight - gap
    : Math.min(targetRect.bottom + gap, window.innerHeight - tooltipHeight - padding);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(padding, top)}px`;
}

function hideShortcutTooltip() {
  clearTimeout(shortcutTooltipTimer);
  shortcutTooltipTimer = null;
  shortcutTooltipTarget?.removeAttribute('aria-describedby');
  restoreShortcutNativeTitle(shortcutTooltipTarget);
  restoreShortcutNativeTitle(pendingShortcutTooltipTarget);
  shortcutTooltipTarget = null;
  pendingShortcutTooltipTarget = null;
  if (!shortcutTooltip) return;
  shortcutTooltip.classList.remove('is-visible');
  shortcutTooltip.hidden = true;
}

function showShortcutTooltip(target) {
  const shortcut = target?.dataset?.lmShortcut?.trim();
  if (!shortcut) return;

  const tooltip = shortcutTooltipElement();
  shortcutTooltipTarget?.removeAttribute('aria-describedby');
  shortcutTooltipTarget = target;
  pendingShortcutTooltipTarget = null;
  tooltip.textContent = shortcut;
  tooltip.hidden = false;
  target.setAttribute('aria-describedby', tooltip.id);
  positionShortcutTooltip(target);
  requestAnimationFrame(() => {
    tooltip.classList.add('is-visible');
    positionShortcutTooltip(target);
  });
}

function scheduleShortcutTooltip(target) {
  clearTimeout(shortcutTooltipTimer);
  if (!target) {
    hideShortcutTooltip();
    return;
  }

  suppressShortcutNativeTitle(target);
  pendingShortcutTooltipTarget = target;
  shortcutTooltipTimer = setTimeout(() => {
    if (pendingShortcutTooltipTarget !== target) return;
    showShortcutTooltip(target);
  }, SHORTCUT_TOOLTIP_DELAY_MS);
}

function initShortcutTooltips() {
  if (document.documentElement.dataset.shortcutTooltipsBound === 'true') return;
  document.documentElement.dataset.shortcutTooltipsBound = 'true';

  document.addEventListener('pointerover', event => {
    const target = shortcutTooltipTargetFromEvent(event);
    if (!target || target === shortcutTooltipTarget || target === pendingShortcutTooltipTarget) return;
    scheduleShortcutTooltip(target);
  });

  document.addEventListener('pointerout', event => {
    const target = shortcutTooltipTargetFromEvent(event);
    if (!target) return;
    if (event.relatedTarget && target.contains(event.relatedTarget)) return;
    hideShortcutTooltip();
  });

  document.addEventListener('focusin', event => {
    const target = shortcutTooltipTargetFromEvent(event);
    if (target) scheduleShortcutTooltip(target);
  });

  document.addEventListener('focusout', event => {
    const target = shortcutTooltipTargetFromEvent(event);
    if (target) hideShortcutTooltip();
  });

  ['click', 'keydown', 'scroll'].forEach(eventName => {
    document.addEventListener(eventName, hideShortcutTooltip, true);
  });
  window.addEventListener('resize', hideShortcutTooltip);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initShortcutTooltips);
} else {
  initShortcutTooltips();
}
