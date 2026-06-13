(function () {
  const registry = new Map();

  function overviewEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function overviewAttrs(attrs = {}) {
    return Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== false)
      .map(([key, value]) => value === true ? key : `${key}="${overviewEscape(value)}"`)
      .join(' ');
  }

  function homeOverviewAction(label, onclick, tone = 'primary') {
    return `<button class="home-overview-action ${tone}" type="button" onclick="${overviewEscape(onclick)}">${overviewEscape(label)}</button>`;
  }

  function homeOverviewPills(items = []) {
    return `<div class="home-overview-pill-row">${items.map(item => `<span>${overviewEscape(item)}</span>`).join('')}</div>`;
  }

  function homeOverviewFeatureCards(items = []) {
    return `
      <div class="home-scenario-card-grid">
        ${items.map((item, index) => `
          <article class="home-scenario-card ${overviewEscape(item.tone || '')}">
            <span class="home-scenario-card-index">${String(index + 1).padStart(2, '0')}</span>
            <h3>${overviewEscape(item.title)}</h3>
            <p>${overviewEscape(item.body)}</p>
          </article>`).join('')}
      </div>`;
  }

  function homeOverviewWorkflow(items = []) {
    return `
      <div class="home-workflow-strip">
        ${items.map((item, index) => `
          <article class="home-workflow-step">
            <span>${String(index + 1).padStart(2, '0')}</span>
            <strong>${overviewEscape(item.title)}</strong>
            <p>${overviewEscape(item.body)}</p>
          </article>`).join('')}
      </div>`;
  }

  function homeOverviewLane(title, items = []) {
    return `
      <article class="home-overview-lane">
        <h3>${overviewEscape(title)}</h3>
        <ul>
          ${items.map(item => `<li>${overviewEscape(item)}</li>`).join('')}
        </ul>
      </article>`;
  }

  function registerHomeOverview(id, renderer) {
    if (!id || typeof renderer !== 'function') return;
    registry.set(id, renderer);
  }

  function setActiveHomeOverviewButton(id) {
    document.querySelectorAll('.home-menu-action[data-home-overview]').forEach(button => {
      const isActive = button.dataset.homeOverview === id;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function selectHomeOverview(id, options = {}) {
    const panel = document.getElementById('homeOverviewPanel');
    if (!panel) return false;
    const renderer = registry.get(id) || registry.get('story');
    if (!renderer) return false;

    panel.dataset.homeOverview = id;
    panel.innerHTML = renderer({
      action: homeOverviewAction,
      attrs: overviewAttrs,
      escape: overviewEscape,
      featureCards: homeOverviewFeatureCards,
      lane: homeOverviewLane,
      pills: homeOverviewPills,
      workflow: homeOverviewWorkflow
    });
    setActiveHomeOverviewButton(id);
    if (options.resetScroll !== false) panel.scrollTo({ top: 0 });
    if (typeof setHomeMenuStatus === 'function') setHomeMenuStatus('');
    return true;
  }

  function openHomeProjectComposer(type = 'novel') {
    if (typeof openNewStoryPanel === 'function') openNewStoryPanel('homeOverviewPanel');
    setTimeout(() => {
      const select = document.getElementById('storyTypeInp');
      if (!select) return;
      select.value = type === 'story' ? 'story' : 'novel';
      if (typeof markStoryInfoEdited === 'function') markStoryInfoEdited();
      if (typeof queueCustomSelectSync === 'function') queueCustomSelectSync();
    }, 0);
  }

  function openHomeRecentProjects() {
    if (typeof renderHomeRecentProjectsList === 'function') renderHomeRecentProjectsList();
  }

  window.LM_HOME_OVERVIEWS = registry;
  window.registerHomeOverview = registerHomeOverview;
  window.selectHomeOverview = selectHomeOverview;
  window.openHomeProjectComposer = openHomeProjectComposer;
  window.openHomeRecentProjects = openHomeRecentProjects;
})();
