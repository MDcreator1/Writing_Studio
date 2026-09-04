'use strict';

function renderNameDetailSimilarNames(entry = {}) {
  const box = document.getElementById('nameDetailAliasesBox');
  const values = document.getElementById('nameDetailAliasesValues');
  if (!box || !values) return;
  const aliases = [...new Set((Array.isArray(entry.similarNames) ? entry.similarNames : [])
    .map(value => String(value || '').trim())
    .filter(value => value && value.toLocaleLowerCase() !== String(entry.name || '').trim().toLocaleLowerCase()))];
  const renderVersion = String((Number(values.dataset.renderVersion) || 0) + 1);
  values.dataset.renderVersion = renderVersion;
  box.hidden = aliases.length === 0;
  values.replaceChildren();
  values.title = aliases.join(', ');
  if (!aliases.length) return;

  const paint = visibleCount => {
    const fragment = document.createDocumentFragment();
    aliases.slice(0, visibleCount).forEach((alias, index) => {
      if (index) fragment.append(document.createTextNode(' • '));
      const name = document.createElement('span');
      name.className = 'name-detail-alias-name';
      name.textContent = alias;
      fragment.append(name);
    });
    const remaining = aliases.length - visibleCount;
    if (remaining) {
      if (visibleCount) fragment.append(document.createTextNode(' '));
      const counter = document.createElement('strong');
      counter.className = 'name-detail-alias-overflow';
      counter.textContent = `+(${remaining})`;
      fragment.append(counter);
    }
    values.replaceChildren(fragment);
  };

  requestAnimationFrame(() => {
    if (values.dataset.renderVersion !== renderVersion) return;
    let visibleCount = aliases.length;
    paint(visibleCount);
    while (visibleCount > 0 && values.scrollWidth > values.clientWidth + 1) {
      visibleCount -= 1;
      paint(visibleCount);
    }
  });
}
