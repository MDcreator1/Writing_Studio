(function () {
  const NEWS_STORAGE_KEY = 'lm_newsdesk_state_v1';
  const NEWS_WORKSPACE_DIR = 'News Articles';
  const NEWS_WORKSPACE_FILE = 'NewsDesk_Articles.json';
  const NEWS_AUTOSAVE_DELAY = 450;
  const NEWS_TOOL_DOCK_POSITION_KEY = 'lm_newsdesk_tool_dock_position_v1';
  let newsToolDockOpen = false;
  let newsFontToolsOpen = false;
  let newsToolDockDragState = null;
  let newsAutoScrollSuspended = false;

  const statusLabels = {
    draft: 'Draft',
    review: 'In Review',
    approved: 'Approved',
    published: 'Published'
  };

  const checklistItems = [
    { id: 'headline', label: 'हेडलाइन फाइनल' },
    { id: 'subhead', label: 'सब-हेड लिखा' },
    { id: 'sources', label: 'सभी सोर्स वेरिफाइड' },
    { id: 'factcheck', label: 'फैक्ट-चेक हुआ' },
    { id: 'media', label: 'फोटो / मीडिया तैयार' },
    { id: 'seo', label: 'SEO टैग्स जोड़े' },
    { id: 'editor', label: 'एडिटर की मंज़ूरी' },
    { id: 'legal', label: 'लीगल रिव्यू' }
  ];

  const templates = {
    breaking: {
      title: 'Breaking News',
      headline: '[ब्रेकिंग] घटना का मुख्य शीर्षक',
      subhead: 'घटना की तात्कालिक और सत्यापित जानकारी',
      body: '[शहर/स्थान], [तारीख] — [घटना का संक्षिप्त विवरण]। अधिकारियों के अनुसार...\n\n[मुख्य तथ्य और आँकड़े]\n\n[प्रत्यक्षदर्शी / अधिकारी का बयान]\n\n[पृष्ठभूमि और अगला अपडेट]'
    },
    feature: {
      title: 'Feature Story',
      headline: 'फीचर: [विषय] की गहरी पड़ताल',
      subhead: 'एक विस्तृत रिपोर्ट जो सवाल उठाती है और संदर्भ देती है',
      body: '[आकर्षक opening अनुच्छेद]\n\n[पृष्ठभूमि और इतिहास]\n\n[ज़मीनी रिपोर्टिंग]\n\n[विशेषज्ञों की राय]\n\n[निष्कर्ष और आगे की राह]'
    },
    opinion: {
      title: 'Opinion Piece',
      headline: 'राय: [विषय] पर एक ज़रूरी बात',
      subhead: 'लेखक का परिचय और मुख्य तर्क',
      body: '[मुख्य तर्क]\n\n[तर्क 1: तथ्यों के साथ]\n\n[तर्क 2: उदाहरण के साथ]\n\n[प्रतिपक्ष का उत्तर]\n\n[निष्कर्ष]'
    },
    investigative: {
      title: 'Investigative',
      headline: 'खुलासा: [मुद्दे का नाम] की असली कहानी',
      subhead: 'दस्तावेज़ों, डेटा और स्रोतों पर आधारित पड़ताल',
      body: '[सबसे महत्वपूर्ण खुलासा]\n\n[पड़ताल की पद्धति]\n\n[मुख्य निष्कर्ष]\n\n[दस्तावेज़ी साक्ष्य]\n\n[आरोपी पक्ष का बयान]\n\n[निष्कर्ष]'
    },
    analysis: {
      title: 'Analysis',
      headline: 'विश्लेषण: [घटना/नीति] के मायने क्या हैं?',
      subhead: 'आँकड़ों और विशेषज्ञ मत के आधार पर विवेचना',
      body: '[संदर्भ और पृष्ठभूमि]\n\n[मुख्य निष्कर्ष]\n\n[डेटा और आँकड़े]\n\n[तुलनात्मक विश्लेषण]\n\n[भविष्य की संभावनाएँ]'
    }
  };

  const icons = {
    news: '<svg viewBox="0 0 24 24"><path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l6 6v8a2 2 0 0 1-2 2z"/><path d="M14 4v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 10-13h-7z"/></svg>',
    article: '<svg viewBox="0 0 24 24"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h11"/></svg>',
    message: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><path d="M5 20V10"/><path d="M12 20V4"/><path d="M19 20v-7"/></svg>',
    bold: '<svg viewBox="0 0 24 24"><path d="M7 4h7a4 4 0 0 1 0 8H7z"/><path d="M7 12h8a4 4 0 0 1 0 8H7z"/></svg>',
    italic: '<svg viewBox="0 0 24 24"><path d="M19 4h-9"/><path d="M14 20H5"/><path d="M15 4 9 20"/></svg>',
    underline: '<svg viewBox="0 0 24 24"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><path d="M4 21h16"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><path d="M4 6h.01"/><path d="M4 12h.01"/><path d="M4 18h.01"/></svg>',
    quote: '<svg viewBox="0 0 24 24"><path d="M9 11H5a4 4 0 0 0 4 4v3a7 7 0 0 1-7-7V5h7z"/><path d="M22 11h-4a4 4 0 0 0 4 4v3a7 7 0 0 1-7-7V5h7z"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.14 1.14"/><path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.14-1.14"/></svg>',
    focus: '<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    save: '<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>',
    tag: '<svg viewBox="0 0 24 24"><path d="M20.59 13.41 13.41 20.59a2 2 0 0 1-2.82 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/></svg>',
    source: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
    user: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    calendar: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    checklist: '<svg viewBox="0 0 24 24"><path d="M10 7h10"/><path d="M10 17h10"/><path d="m4 7 1 1 2-2"/><path d="m4 17 1 1 2-2"/></svg>',
    robot: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><path d="M8 15h.01"/><path d="M16 15h.01"/></svg>',
    wand: '<svg viewBox="0 0 24 24"><path d="m15 4 5 5L8 21l-5-5z"/><path d="m14 5 5 5"/><path d="M6 2v4"/><path d="M4 4h4"/></svg>',
    notes: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
  };

  const newsDeskState = {
    articles: [],
    currentArticleId: '',
    wordTarget: 800,
    saveTimer: null,
    toastTimer: null,
    isSaving: false,
    workspaceName: ''
  };

  function newsEscape(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function icon(name) {
    return icons[name] || '';
  }

  function makeId(prefix = 'article') {
    if (window.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function textToHtml(value) {
    const blocks = String(value || '')
      .replace(/\r\n?/g, '\n')
      .split(/\n{2,}/)
      .map(block => block.trim())
      .filter(Boolean);
    return blocks.map(block => `<p>${newsEscape(block).replace(/\n/g, '<br>')}</p>`).join('');
  }

  function htmlToPlainText(value) {
    const node = document.createElement('div');
    node.innerHTML = String(value || '');
    return node.textContent || '';
  }

  function formatDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('hi-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function statusLabel(status) {
    return statusLabels[status] || status || 'Draft';
  }

  function normalizeNewsSectionName(value = '') {
    const sectionMap = {
      'राष्ट्रीय': 'National',
      'अंतरराष्ट्रीय': 'International',
      'व्यापार': 'Business',
      'खेल': 'Sports',
      'टेक': 'Tech',
      'मनोरंजन': 'Entertainment',
      'स्वास्थ्य': 'Health',
      'शिक्षा': 'Education'
    };
    return sectionMap[value] || value || 'National';
  }

  function normalizeNewsSourceType(value = '') {
    const sourceTypeMap = {
      'आधिकारिक': 'Official',
      'विशेषज्ञ': 'Expert',
      'प्रत्यक्षदर्शी': 'Eyewitness',
      'दस्तावेज़': 'Document',
      'डेटा': 'Data',
      'वेबसाइट': 'Website'
    };
    return sourceTypeMap[value] || value || 'Official';
  }

  function defaultChecklist() {
    return checklistItems.reduce((memo, item) => {
      memo[item.id] = false;
      return memo;
    }, {});
  }

  function createArticle(overrides = {}) {
    const now = new Date().toISOString();
    return normalizeArticle({
      id: makeId('news'),
      headline: '',
      subhead: '',
      bodyHTML: '',
      sections: [],
      author: 'New Reporter',
      beat: 'General',
      status: 'draft',
      section: 'National',
      pubTime: '',
      tags: [],
      sources: [],
      checklist: defaultChecklist(),
      notes: '',
      createdAt: now,
      updatedAt: now,
      ...overrides
    });
  }

  function sampleArticles() {
    return [
      createArticle({
        headline: 'बजट 2026: मध्यम वर्ग पर क्या होगा असर, जानें विशेषज्ञों की राय',
        subhead: 'वित्त मंत्री के भाषण के बाद अर्थशास्त्रियों ने मिश्रित प्रतिक्रिया दी है',
        bodyHTML: textToHtml('वित्त मंत्री ने बुधवार को संसद में केंद्रीय बजट 2026-27 पेश किया, जिसमें मध्यम वर्ग के लिए कर राहत के साथ बुनियादी ढांचे पर निवेश का ऐलान किया गया। विशेषज्ञों का कहना है कि यह बजट विकास और राजकोषीय अनुशासन के बीच संतुलन बनाने की कोशिश है।'),
        author: 'अनुज शर्मा',
        beat: 'अर्थव्यवस्था',
        tags: ['बजट', 'अर्थव्यवस्था', 'मध्यम वर्ग'],
        sources: [
          { id: makeId('source'), text: 'वित्त मंत्रालय की प्रेस रिलीज़, 10 Jun 2026', type: 'आधिकारिक' },
          { id: makeId('source'), text: 'अर्थशास्त्री इंटरव्यू नोट्स', type: 'विशेषज्ञ' }
        ]
      }),
      createArticle({
        headline: 'मानसून 2026: कई राज्यों में भारी बारिश की चेतावनी',
        subhead: 'मौसम विभाग ने अगले 48 घंटे सतर्कता बरतने की सलाह दी',
        bodyHTML: textToHtml('भारत मौसम विज्ञान विभाग ने इस सप्ताह कई राज्यों में भारी वर्षा का पूर्वानुमान जारी किया है। भोपाल, इंदौर और जबलपुर समेत कई जिलों में प्रशासन ने आपदा प्रबंधन टीमों को अलर्ट पर रखा है।'),
        author: 'प्रिया वर्मा',
        beat: 'मौसम',
        status: 'review',
        tags: ['मानसून', 'मौसम', 'IMD'],
        sources: [{ id: makeId('source'), text: 'IMD मौसम बुलेटिन', type: 'आधिकारिक' }],
        notes: 'फोटो टीम से बारिश की तस्वीरें माँगें'
      })
    ];
  }

  function normalizeArticle(article = {}) {
    const now = new Date().toISOString();
    const id = String(article.id || makeId('news'));
    return {
      id,
      headline: String(article.headline || ''),
      subhead: String(article.subhead || ''),
      bodyHTML: String(article.bodyHTML || (article.body ? textToHtml(article.body) : '')),
      sections: Array.isArray(article.sections)
        ? article.sections.map(section => ({
          id: String(section.id || makeId('section')),
          title: String(section.title || 'सेक्शन'),
          bodyHTML: String(section.bodyHTML || (section.body ? textToHtml(section.body) : ''))
        }))
        : [],
      author: String(article.author || 'New Reporter'),
      beat: String(article.beat || 'सामान्य'),
      status: ['draft', 'review', 'approved', 'published'].includes(article.status) ? article.status : 'draft',
      section: normalizeNewsSectionName(String(article.section || 'National')),
      pubTime: String(article.pubTime || ''),
      tags: Array.isArray(article.tags) ? article.tags.map(String).filter(Boolean) : [],
      sources: Array.isArray(article.sources)
        ? article.sources.map(source => ({
          id: String(source.id || makeId('source')),
          text: String(source.text || ''),
          type: normalizeNewsSourceType(String(source.type || 'Official'))
        })).filter(source => source.text)
        : [],
      checklist: { ...defaultChecklist(), ...(article.checklist || {}) },
      notes: String(article.notes || ''),
      createdAt: article.createdAt || now,
      updatedAt: article.updatedAt || article.createdAt || now
    };
  }

  function normalizeState(data = {}) {
    const articles = Array.isArray(data.articles) && data.articles.length
      ? data.articles.map(normalizeArticle)
      : sampleArticles();
    const currentArticleId = articles.some(article => article.id === data.currentArticleId)
      ? data.currentArticleId
      : articles[0]?.id || '';
    return {
      articles,
      currentArticleId,
      wordTarget: Number(data.wordTarget) > 0 ? Number(data.wordTarget) : 800
    };
  }

  function currentArticle() {
    return newsDeskState.articles.find(article => article.id === newsDeskState.currentArticleId) || newsDeskState.articles[0];
  }

  function storedNewsProjectManifest() {
    if (projectManifest) return projectManifest;
    try {
      return JSON.parse(localStorage.getItem(PROJECT_MANIFEST_KEY) || 'null') || null;
    } catch {
      return null;
    }
  }

  function isNewsProjectManifest(manifest) {
    return String(manifest?.type || '').trim().toLowerCase() === 'news';
  }

  function hasActiveNewsProjectDirectory() {
    return Boolean(projectDirectoryHandle && isNewsProjectManifest(storedNewsProjectManifest()));
  }

  function newsStorageKeySlug(value = '') {
    if (typeof uniqueNameKey === 'function') return uniqueNameKey(value);
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function newsLocalStorageKey() {
    const manifest = storedNewsProjectManifest();
    if (!isNewsProjectManifest(manifest)) return NEWS_STORAGE_KEY;
    const folderName = projectDirectoryHandle?.name || localStorage.getItem(PROJECT_FOLDER_KEY) || manifest.title || '';
    const typeFolderName = typeof currentProjectTypeFolderName === 'function'
      ? currentProjectTypeFolderName()
      : localStorage.getItem(PROJECT_TYPE_FOLDER_KEY) || '';
    const projectKey = newsStorageKeySlug(typeFolderName ? `${typeFolderName}/${folderName}` : folderName);
    return projectKey ? `${NEWS_STORAGE_KEY}:${projectKey}` : NEWS_STORAGE_KEY;
  }

  function newsSaveTargetLabel(saved = false) {
    if (hasActiveNewsProjectDirectory()) return saved ? 'Saved to project' : 'Project ready';
    if (workspaceDirectoryHandle) return saved ? 'Saved to workspace' : 'Workspace ready';
    return saved ? 'Saved in browser' : 'Browser memory';
  }

  function serializedState() {
    const manifest = storedNewsProjectManifest();
    return {
      version: 1,
      projectType: 'newsdesk',
      projectTitle: manifest?.title || '',
      projectFolder: projectDirectoryHandle?.name || localStorage.getItem(PROJECT_FOLDER_KEY) || '',
      savedAt: new Date().toISOString(),
      wordTarget: newsDeskState.wordTarget,
      currentArticleId: newsDeskState.currentArticleId,
      articles: newsDeskState.articles
    };
  }

  function readLocalNewsState() {
    try {
      return normalizeState(JSON.parse(localStorage.getItem(newsLocalStorageKey()) || 'null') || {});
    } catch {
      return normalizeState();
    }
  }

  function writeLocalNewsState() {
    localStorage.setItem(newsLocalStorageKey(), JSON.stringify(serializedState()));
  }

  async function newsFileText(fileHandle) {
    if (typeof readFileText === 'function') return readFileText(fileHandle);
    return (await fileHandle.getFile()).text();
  }

  async function writeNewsFileText(fileHandle, value) {
    if (typeof writeFileText === 'function') return writeFileText(fileHandle, value);
    const writable = await fileHandle.createWritable();
    await writable.write(value);
    await writable.close();
  }

  async function newsWorkspaceFileHandle(options = {}) {
    if (hasActiveNewsProjectDirectory()) {
      return projectDirectoryHandle.getFileHandle(NEWS_WORKSPACE_FILE, { create: Boolean(options.create) });
    }
    if (!workspaceDirectoryHandle) return null;
    const directory = await workspaceDirectoryHandle.getDirectoryHandle(NEWS_WORKSPACE_DIR, { create: Boolean(options.create) });
    return directory.getFileHandle(NEWS_WORKSPACE_FILE, { create: Boolean(options.create) });
  }

  async function readWorkspaceNewsState() {
    if (!hasActiveNewsProjectDirectory() && !workspaceDirectoryHandle) return null;
    try {
      const handle = await newsWorkspaceFileHandle({ create: false });
      return normalizeState(JSON.parse(await newsFileText(handle)));
    } catch (error) {
      if (error?.name !== 'NotFoundError') console.warn('NewsDesk workspace read failed:', error);
      return null;
    }
  }

  async function writeWorkspaceNewsState() {
    if (!hasActiveNewsProjectDirectory() && !workspaceDirectoryHandle) return false;
    const handle = await newsWorkspaceFileHandle({ create: true });
    await writeNewsFileText(handle, JSON.stringify(serializedState(), null, 2));
    return true;
  }

  function applyNewsDeskState(state) {
    if (!state) return false;
    newsDeskState.articles = state.articles;
    newsDeskState.currentArticleId = state.currentArticleId;
    newsDeskState.wordTarget = state.wordTarget;
    return true;
  }

  async function readNewsProjectManifestFromHandle(handle) {
    if (!handle) return null;
    try {
      if (typeof readProjectManifestFromDirectory === 'function') {
        return readProjectManifestFromDirectory(handle);
      }
      const manifestHandle = await handle.getFileHandle(PROJECT_MANIFEST_FILE);
      return JSON.parse(await newsFileText(manifestHandle));
    } catch (error) {
      if (error?.name !== 'NotFoundError') console.warn('News project manifest read failed:', error);
      return null;
    }
  }

  async function loadNewsProjectHandle(handle, options = {}) {
    if (!handle) return false;
    const manifest = await readNewsProjectManifestFromHandle(handle);
    if (!isNewsProjectManifest(manifest)) return false;
    projectDirectoryHandle = handle;
    projectManifest = manifest;
    if (typeof setActiveProjectTypeFolderName === 'function') {
      setActiveProjectTypeFolderName(options.typeFolderName || localStorage.getItem(PROJECT_TYPE_FOLDER_KEY) || NEWS_WORKSPACE_DIR);
    }
    if (options.storeHandle !== false && typeof saveProjectHandle === 'function') await saveProjectHandle(handle);
    localStorage.setItem(PROJECT_MODE_KEY, 'local');
    localStorage.setItem(PROJECT_FOLDER_KEY, handle.name || '');
    localStorage.setItem(PROJECT_MANIFEST_KEY, JSON.stringify(manifest));
    newsDeskState.workspaceName = handle.name || '';
    const workspaceState = await readWorkspaceNewsState();
    if (workspaceState) {
      applyNewsDeskState(workspaceState);
      writeLocalNewsState();
    } else {
      await writeWorkspaceNewsState();
    }
    return true;
  }

  function setSaveState(state, label = '') {
    const dot = document.getElementById('newsSaveDot');
    const status = document.getElementById('newsSaveStatus');
    if (dot) {
      dot.classList.toggle('is-dirty', state === 'dirty');
      dot.classList.toggle('is-saved', state === 'saved');
      dot.classList.toggle('is-error', state === 'error');
    }
    if (status) status.textContent = label || (state === 'dirty' ? 'Saving...' : state === 'saved' ? 'Saved' : 'Local memory');
  }

  function showNewsToast(message) {
    const toast = document.getElementById('newsdeskToast');
    if (!toast) return;
    clearTimeout(newsDeskState.toastTimer);
    toast.textContent = message;
    toast.classList.add('is-visible');
    newsDeskState.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2200);
  }

  function showNewsWorkspaceNotice(message) {
    setSaveState('saved', 'Browser memory');
    showNewsToast(message);
  }

  function applyNewsTheme() {
    const mode = window.getStoredThemeMode?.() || (localStorage.getItem('lm_dark') === 'true' ? 'dark' : 'light');
    window.setStoredThemeMode?.(mode);
    window.applyLekhakThemeClasses?.(mode);
    window.syncThemePanelState?.();
  }

  function closeNewsdeskSidebarMenu() {
    const panel = document.getElementById('newsdeskSidebarMenuPanel');
    const button = document.getElementById('newsdeskSidebarMenuBtn');
    if (panel) panel.hidden = true;
    if (button) {
      button.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleNewsdeskSidebarMenu(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const panel = document.getElementById('newsdeskSidebarMenuPanel');
    const button = document.getElementById('newsdeskSidebarMenuBtn');
    if (!panel || !button) return;
    const nextOpen = panel.hidden;
    panel.hidden = !nextOpen;
    button.classList.toggle('is-open', nextOpen);
    button.setAttribute('aria-expanded', String(nextOpen));
  }

  function renderSidebar() {
    const sidebar = document.getElementById('newsdeskSidebar');
    if (!sidebar) return;
    sidebar.innerHTML = `
      <div class="newsdesk-sidebar-head">
        <button class="newsdesk-sidebar-menu-btn" id="newsdeskSidebarMenuBtn" type="button"
          aria-label="NewsDesk options" aria-expanded="false" aria-controls="newsdeskSidebarMenuPanel"
          onclick="toggleNewsdeskSidebarMenu(event)">
          <span></span><span></span><span></span>
        </button>
        <div class="newsdesk-sidebar-menu-panel" id="newsdeskSidebarMenuPanel" hidden>
          <button type="button" onclick="newNewsArticle(); closeNewsdeskSidebarMenu();">${icon('plus')} New Article</button>
          <button type="button" onclick="saveNewsArticle(true); closeNewsdeskSidebarMenu();">${icon('save')} Save</button>
          <button type="button" onclick="selectNewsWorkspaceFolder(); closeNewsdeskSidebarMenu();">${icon('file')} Workspace Folder</button>
          <button type="button" onclick="showNewsStyleGuide(); closeNewsdeskSidebarMenu();">${icon('article')} Style Guide</button>
        </div>
        <div class="newsdesk-summary-top">
          <span class="newsdesk-summary-dot" aria-hidden="true"></span>
          <div class="newsdesk-brand-subtitle">Article Workspace</div>
        </div>
        <div class="newsdesk-brand-title">NewsDesk</div>
        <p class="newsdesk-workspace-line" id="newsWorkspaceLine">${newsWorkspaceLabel()}</p>
      </div>
      <div class="newsdesk-sidebar-action-row">
        <button class="newsdesk-primary-btn" type="button" onclick="newNewsArticle()">${icon('plus')} New Article</button>
      </div>
      <div class="newsdesk-sidebar-scroll">
        <div class="newsdesk-article-draft-box lm-id-newsdeskArticleDraftBox lm-theme-purple">
        <div class="newsdesk-section-title">मेरे आर्टिकल्स</div>
          <span class="newsdesk-article-count-pill lm-id-newsArticleCountPill lm-theme-purple" id="newsArticleCountPill">${newsDeskState.articles.length}</span>
          <div class="newsdesk-article-list lm-id-newsArticleList lm-theme-purple" id="newsArticleList"></div>
        </div>
        <div class="newsdesk-section-title">टेम्पलेट्स</div>
        <div class="newsdesk-template-list">
          ${Object.entries(templates).map(([key, template]) => `
            <button class="newsdesk-template-btn" type="button" onclick="loadNewsTemplate('${key}')">
              <span class="newsdesk-icon">${templateIcon(key)}</span>
              <span class="newsdesk-template-title">${newsEscape(template.title)}</span>
            </button>
          `).join('')}
        </div>
        <div class="newsdesk-section-title">टूल्स</div>
        <button class="newsdesk-template-btn" type="button" onclick="showNewsStyleGuide()">${icon('article')}<span class="newsdesk-template-title">Style Guide</span></button>
        <button class="newsdesk-template-btn" type="button" onclick="showNewsSeoTips()">${icon('chart')}<span class="newsdesk-template-title">SEO Tips</span></button>
      </div>
    `;
    renderArticleList();
  }

  function newsWorkspaceLabel() {
    if (hasActiveNewsProjectDirectory()) {
      const manifest = storedNewsProjectManifest();
      return `News project: ${manifest?.title || projectDirectoryHandle.name || 'Untitled article project'}`;
    }
    if (newsDeskState.workspaceName) return `Workspace sync: ${newsDeskState.workspaceName}`;
    return 'Browser autosave active. Folder चुनने पर local file sync भी होगा।';
  }

  function templateIcon(key) {
    return {
      breaking: icon('bolt'),
      feature: icon('article'),
      opinion: icon('message'),
      investigative: icon('search'),
      analysis: icon('chart')
    }[key] || icon('file');
  }

  function renderArticleList() {
    const list = document.getElementById('newsArticleList');
    if (!list) return;
    const countPill = document.getElementById('newsArticleCountPill');
    if (countPill) countPill.textContent = String(newsDeskState.articles.length);
    list.innerHTML = newsDeskState.articles.map(article => `
      <button class="newsdesk-article-btn ${article.id === newsDeskState.currentArticleId ? 'is-active' : ''}" type="button"
        onclick="selectNewsArticle('${newsEscape(article.id)}')">
        ${icon('file')}
        <span>
          <span class="newsdesk-article-title">${newsEscape(article.headline || 'Untitled article')}</span>
          <span class="newsdesk-article-meta">${newsEscape(statusLabel(article.status))} · ${newsEscape(formatDate(article.updatedAt))}</span>
        </span>
        <span class="newsdesk-status-dot newsdesk-status-${newsEscape(article.status)}"></span>
      </button>
    `).join('');
  }

  function renderToolbar() {
    const toolbar = document.getElementById('newsdeskToolbar');
    if (!toolbar) return;
    const article = currentArticle();
    const headline = article?.headline?.trim() || 'Untitled article';
    const section = normalizeNewsSectionName(article?.section || 'National');
    const status = statusLabel(article?.status || 'draft');
    const updated = formatDate(article?.updatedAt || article?.createdAt);
    toolbar.classList.add('lm-id-newsdeskToolbar', 'lm-theme-purple');
    toolbar.innerHTML = `
      <div class="newsdesk-editor-info-title">
        <span class="newsdesk-editor-kicker lm-id-newsdeskArticleStatus" id="newsdeskArticleStatus">${newsEscape(status)}</span>
        <button class="newsdesk-current-title lm-id-newsdeskCurrentTitle" id="newsdeskCurrentTitle" type="button" onclick="focusNewsHeadline()" title="Edit headline">
          ${newsEscape(headline)}
        </button>
      </div>
      <div class="newsdesk-toolbar-meta">
        <span class="newsdesk-save-dot is-saved" id="newsSaveDot"></span>
        <span id="newsSaveStatus">Saved</span>
        <span class="newsdesk-stat-pill"><span id="newsWordCount">0 words</span></span>
        <span class="newsdesk-stat-pill"><span id="newsReadTime">1 min</span></span>
        <span class="newsdesk-stat-pill lm-id-newsdeskArticleSection" id="newsdeskArticleSection">${newsEscape(section)}</span>
        <span class="newsdesk-stat-pill lm-id-newsdeskArticleUpdated" id="newsdeskArticleUpdated">${newsEscape(updated)}</span>
      </div>
      <div class="newsdesk-toolbar-actions">
        <button class="newsdesk-editor-action-btn" type="button" onclick="saveNewsArticle(true)" title="Save">${icon('save')}</button>
        <button class="newsdesk-editor-action-btn" type="button" onclick="toggleNewsFocus()" title="Focus mode">${icon('focus')}</button>
        <button class="newsdesk-editor-action-btn" type="button" onclick="window.print()" title="Print">${icon('article')}</button>
      </div>
    `;
    renderNewsFloatingTools();
    return;
    toolbar.innerHTML = `
      <select class="newsdesk-select" id="newsFontFamily" onchange="applyNewsFontFamily(this.value)" aria-label="Font family">
        <option value="serif">Serif</option>
        <option value="sans">Sans</option>
        <option value="mono">Mono</option>
      </select>
      <select class="newsdesk-select" id="newsFontSize" onchange="applyNewsFontSize(this.value)" aria-label="Font size">
        <option value="15px">15</option>
        <option value="16px" selected>16</option>
        <option value="18px">18</option>
        <option value="20px">20</option>
      </select>
      <span class="newsdesk-toolbar-divider"></span>
      <button class="newsdesk-tool-btn" type="button" title="Bold" onclick="formatNews('bold')">${icon('bold')}</button>
      <button class="newsdesk-tool-btn" type="button" title="Italic" onclick="formatNews('italic')">${icon('italic')}</button>
      <button class="newsdesk-tool-btn" type="button" title="Underline" onclick="formatNews('underline')">${icon('underline')}</button>
      <button class="newsdesk-tool-btn" type="button" title="Bullet list" onclick="formatNews('insertUnorderedList')">${icon('list')}</button>
      <button class="newsdesk-tool-btn" type="button" title="Quote" onclick="formatNewsBlockquote()">${icon('quote')}</button>
      <button class="newsdesk-tool-btn" type="button" title="Link" onclick="insertNewsLink()">${icon('link')}</button>
      <span class="newsdesk-toolbar-divider"></span>
      <button class="newsdesk-tool-btn" type="button" id="newsFocusBtn" onclick="toggleNewsFocus()">${icon('focus')} <span>Focus</span></button>
      <button class="newsdesk-tool-btn" type="button" onclick="saveNewsArticle(true)">${icon('save')} <span>Save</span></button>
      <button class="newsdesk-tool-btn" type="button" onclick="window.print()">${icon('article')}</button>
      <div class="newsdesk-toolbar-meta">
        <span class="newsdesk-save-dot is-saved" id="newsSaveDot"></span>
        <span id="newsSaveStatus">Saved</span>
        <span id="newsWordCount">0 शब्द</span>
        <span id="newsReadTime">1 मिनट</span>
      </div>
    `;
  }

  function renderNewsFloatingTools() {
    const dock = document.getElementById('newsdeskFloatingTools');
    if (!dock) return;
    dock.classList.add('lm-id-newsdeskFloatingTools', 'lm-theme-purple');
    dock.classList.toggle('is-expanded', newsToolDockOpen);
    dock.classList.toggle('is-collapsed', !newsToolDockOpen);
    dock.innerHTML = `
      <div class="tool-dock-actions">
        <button class="dock-drag-handle lm-id-newsToolDockDragHandle" id="newsToolDockDragHandle" type="button" title="Drag tools" aria-label="Drag tools">
          <span></span><span></span><span></span>
        </button>
        <button class="dock-action-btn lm-id-newsToolDockToggle" id="newsToolDockToggle" type="button" onclick="toggleNewsToolDock()"
          aria-expanded="${newsToolDockOpen}" title="Writing tools">
          <span class="dock-action-icon">${icon('wand')}</span>
        </button>
      </div>
      <div class="tool-dock-panel" aria-label="News writing tools">
        <div class="tool-dock-main-row">
          <div class="tool-section">
            <button class="tool-btn lm-id-newsBoldBtn" type="button" onclick="formatNews('bold')" title="Bold">${icon('bold')}</button>
            <button class="tool-btn lm-id-newsItalicBtn" type="button" onclick="formatNews('italic')" title="Italic">${icon('italic')}</button>
            <button class="tool-btn lm-id-newsUnderlineBtn" type="button" onclick="formatNews('underline')" title="Underline">${icon('underline')}</button>
          </div>
          <div class="tool-section">
            <button class="tool-btn lm-id-newsListBtn" type="button" onclick="formatNews('insertUnorderedList')" title="Bullet list">${icon('list')}</button>
            <button class="tool-btn lm-id-newsQuoteBtn" type="button" onclick="formatNewsBlockquote()" title="Quote">${icon('quote')}</button>
            <button class="tool-btn lm-id-newsLinkBtn" type="button" onclick="insertNewsLink()" title="Link">${icon('link')}</button>
          </div>
          <div class="tool-section">
            <button class="tool-btn lm-id-newsDockSaveBtn" type="button" onclick="saveNewsArticle(true)" title="Save">${icon('save')}</button>
            <button class="tool-btn lm-id-newsFocusBtn" id="newsFocusBtn" type="button" onclick="toggleNewsFocus()" title="Focus mode">${icon('focus')}</button>
            <button class="tool-btn lm-id-newsPrintBtn" type="button" onclick="window.print()" title="Print">${icon('article')}</button>
          </div>
          <div class="tool-section tool-section-font-toggle">
            <button class="tool-btn font-tools-toggle lm-id-newsFontToolsToggle" id="newsFontToolsToggle" type="button" onclick="toggleNewsFontTools()"
              aria-expanded="${newsFontToolsOpen}" title="Font style and size">
              <span class="font-tools-icon">A</span>
            </button>
          </div>
        </div>
        <div class="tool-section tool-section-wide font-tools-section lm-id-newsFontToolsSection" id="newsFontToolsSection" ${newsFontToolsOpen ? '' : 'hidden'}>
          <select class="dock-font-select lm-id-newsFontFamily" id="newsFontFamily" onchange="applyNewsFontFamily(this.value)" aria-label="Font family">
            <option value="serif">Serif</option>
            <option value="sans">Sans</option>
            <option value="mono">Mono</option>
          </select>
          <select class="dock-fsize-inp lm-id-newsFontSize" id="newsFontSize" onchange="applyNewsFontSize(this.value)" aria-label="Font size">
            <option value="15px">15</option>
            <option value="16px" selected>16</option>
            <option value="18px">18</option>
            <option value="20px">20</option>
          </select>
        </div>
      </div>
    `;
    setupNewsToolDockDrag();
    restoreNewsToolDockPosition();
  }

  function clampNewsNumber(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function setNewsToolDock(open) {
    newsToolDockOpen = Boolean(open);
    const dock = document.getElementById('newsdeskFloatingTools');
    const toggle = document.getElementById('newsToolDockToggle');
    if (dock) {
      dock.classList.toggle('is-expanded', newsToolDockOpen);
      dock.classList.toggle('is-collapsed', !newsToolDockOpen);
    }
    if (toggle) toggle.setAttribute('aria-expanded', String(newsToolDockOpen));
    if (!newsToolDockOpen) setNewsFontTools(false);
  }

  function toggleNewsToolDock() {
    setNewsToolDock(!newsToolDockOpen);
  }

  function setNewsFontTools(open) {
    newsFontToolsOpen = Boolean(open);
    const panel = document.getElementById('newsFontToolsSection');
    const toggle = document.getElementById('newsFontToolsToggle');
    if (panel) panel.hidden = !newsFontToolsOpen;
    if (toggle) toggle.setAttribute('aria-expanded', String(newsFontToolsOpen));
  }

  function toggleNewsFontTools() {
    setNewsFontTools(!newsFontToolsOpen);
  }

  function focusNewsHeadline() {
    const headline = document.getElementById('newsHeadline');
    if (!headline) return;
    headline.focus();
    headline.setSelectionRange?.(headline.value.length, headline.value.length);
  }

  function syncNewsToolbarSummary(article = currentArticle()) {
    if (!article) return;
    const headline = article.headline?.trim() || 'Untitled article';
    const title = document.getElementById('newsdeskCurrentTitle');
    const status = document.getElementById('newsdeskArticleStatus');
    const section = document.getElementById('newsdeskArticleSection');
    const updated = document.getElementById('newsdeskArticleUpdated');
    if (title) title.textContent = headline;
    if (status) status.textContent = statusLabel(article.status || 'draft');
    if (section) section.textContent = normalizeNewsSectionName(article.section || 'National');
    if (updated) updated.textContent = formatDate(article.updatedAt || article.createdAt);
  }

  function newsToolDockBounds() {
    const shell = document.querySelector('.newsdesk-editor-shell');
    const dock = document.getElementById('newsdeskFloatingTools');
    const actions = dock?.querySelector('.tool-dock-actions');
    if (!shell || !dock) return null;
    const padding = 18;
    const topPadding = 74;
    const dragWidth = actions?.offsetWidth || dock.offsetWidth || 140;
    const dragHeight = actions?.offsetHeight || dock.offsetHeight || 54;
    return {
      shell,
      dock,
      actions,
      padding,
      topPadding,
      maxLeft: Math.max(padding, shell.clientWidth - dragWidth - padding),
      maxTop: Math.max(topPadding, shell.clientHeight - dragHeight - padding)
    };
  }

  function setNewsToolDockPosition(left, top, persist = false) {
    const bounds = newsToolDockBounds();
    if (!bounds) return;
    const safeLeft = clampNewsNumber(left, bounds.padding, bounds.maxLeft);
    const safeTop = clampNewsNumber(top, bounds.topPadding, bounds.maxTop);
    bounds.dock.classList.add('is-positioned');
    bounds.dock.style.left = `${Math.round(safeLeft)}px`;
    bounds.dock.style.top = `${Math.round(safeTop)}px`;
    bounds.dock.style.right = 'auto';
    bounds.dock.style.bottom = 'auto';
    bounds.dock.style.transform = 'none';
    if (persist) {
      localStorage.setItem(NEWS_TOOL_DOCK_POSITION_KEY, JSON.stringify({
        leftRatio: bounds.maxLeft > bounds.padding ? safeLeft / bounds.maxLeft : 0,
        topRatio: bounds.maxTop > bounds.topPadding ? safeTop / bounds.maxTop : 0
      }));
    }
  }

  function restoreNewsToolDockPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem(NEWS_TOOL_DOCK_POSITION_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return;
      requestAnimationFrame(() => {
        const bounds = newsToolDockBounds();
        if (!bounds) return;
        const left = Number(saved.leftRatio) * bounds.maxLeft;
        const top = Number(saved.topRatio) * bounds.maxTop;
        if (Number.isFinite(left) && Number.isFinite(top)) setNewsToolDockPosition(left, top, false);
      });
    } catch (error) {
      localStorage.removeItem(NEWS_TOOL_DOCK_POSITION_KEY);
    }
  }

  function setupNewsToolDockDrag() {
    const dock = document.getElementById('newsdeskFloatingTools');
    const handle = document.getElementById('newsToolDockDragHandle');
    if (!dock || !handle) return;
    handle.onpointerdown = event => {
      const bounds = newsToolDockBounds();
      if (!bounds) return;
      const dockRect = dock.getBoundingClientRect();
      const shellRect = bounds.shell.getBoundingClientRect();
      newsToolDockDragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: dockRect.left - shellRect.left,
        startTop: dockRect.top - shellRect.top,
        didDrag: false
      };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };
  }

  function handleNewsToolDockPointerMove(event) {
    if (!newsToolDockDragState || newsToolDockDragState.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - newsToolDockDragState.startX;
    const deltaY = event.clientY - newsToolDockDragState.startY;
    if (!newsToolDockDragState.didDrag && Math.hypot(deltaX, deltaY) < 5) return;
    newsToolDockDragState.didDrag = true;
    document.getElementById('newsdeskFloatingTools')?.classList.add('is-dragging');
    setNewsToolDockPosition(newsToolDockDragState.startLeft + deltaX, newsToolDockDragState.startTop + deltaY, false);
  }

  function handleNewsToolDockPointerUp(event) {
    if (!newsToolDockDragState || newsToolDockDragState.pointerId !== event.pointerId) return;
    const dock = document.getElementById('newsdeskFloatingTools');
    if (newsToolDockDragState.didDrag && dock) {
      const bounds = newsToolDockBounds();
      const dockRect = dock.getBoundingClientRect();
      const shellRect = bounds?.shell.getBoundingClientRect();
      if (bounds && shellRect) setNewsToolDockPosition(dockRect.left - shellRect.left, dockRect.top - shellRect.top, true);
    }
    dock?.classList.remove('is-dragging');
    newsToolDockDragState = null;
  }

  function renderPaper() {
    const paper = document.getElementById('newsdeskPaper');
    const article = currentArticle();
    if (!paper || !article) return;
    paper.innerHTML = `
      <textarea class="newsdesk-input newsdesk-headline" id="newsHeadline" rows="2" placeholder="हेडलाइन लिखें..."></textarea>
      <textarea class="newsdesk-input newsdesk-subhead" id="newsSubhead" rows="2" placeholder="सब-हेडलाइन / डेक लिखें..."></textarea>
      <div class="newsdesk-meta-strip" id="newsMetaStrip"></div>
      <div class="newsdesk-field-label">${icon('article')} लीड पैराग्राफ</div>
      <div class="newsdesk-contenteditable" id="newsBodyEditor" contenteditable="true" data-placeholder="मुख्य लेख यहाँ लिखें..."></div>
      <div class="newsdesk-section-stack" id="newsSections"></div>
      <button class="newsdesk-secondary-btn newsdesk-add-section" type="button" onclick="addNewsSection()">${icon('plus')} Add Section</button>
    `;
    document.getElementById('newsHeadline')?.classList.add('lm-id-newsHeadline', 'lm-theme-purple');
    const subhead = document.getElementById('newsSubhead');
    if (subhead) {
      subhead.classList.add('lm-id-newsSubhead', 'lm-theme-purple');
      subhead.setAttribute('rows', '5');
    }
    const metaStrip = document.getElementById('newsMetaStrip');
    if (metaStrip) {
      metaStrip.classList.add('lm-id-newsMetaStrip', 'lm-theme-purple');
      metaStrip.hidden = true;
    }
    loadArticleIntoEditor(article);
    bindEditorInputEvents(paper);
  }

  function renderInspector() {
    const inspector = document.getElementById('newsdeskInspector');
    if (!inspector) return;
    inspector.innerHTML = `
      <div class="newsdesk-inspector-scroll">
        <div class="newsdesk-card">
          <div class="newsdesk-card-title">${icon('send')} पब्लिशिंग</div>
          <label class="newsdesk-field"><span class="newsdesk-field-label">Status</span>
            <select class="newsdesk-control" id="newsStatus" onchange="updateNewsStatus(this.value)">
              <option value="draft">Draft</option>
              <option value="review">In Review</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label class="newsdesk-field"><span class="newsdesk-field-label">Section</span>
            <select class="newsdesk-control" id="newsSectionName">
              <option>National</option><option>International</option><option>Business</option>
              <option>Sports</option><option>Tech</option><option>Entertainment</option>
              <option>Health</option><option>Education</option>
            </select>
          </label>
          <label class="newsdesk-field"><span class="newsdesk-field-label">Reporter</span><input class="newsdesk-control" id="newsAuthor" type="text"></label>
          <label class="newsdesk-field"><span class="newsdesk-field-label">Beat</span><input class="newsdesk-control" id="newsBeat" type="text"></label>
          <label class="newsdesk-field"><span class="newsdesk-field-label">Publish Time</span><input class="newsdesk-control" id="newsPubTime" type="datetime-local"></label>
          <button class="newsdesk-primary-btn" type="button" onclick="publishNewsArticle()">${icon('send')} Publish</button>
        </div>

        <div class="newsdesk-card">
          <div class="newsdesk-card-title">${icon('source')} सोर्सेज़</div>
          <div class="newsdesk-source-list" id="newsSources"></div>
          <label class="newsdesk-field"><span class="newsdesk-field-label">Source</span><input class="newsdesk-control" id="newsSourceInput" type="text" placeholder="सोर्स लिखें + Enter"></label>
          <label class="newsdesk-field"><span class="newsdesk-field-label">Type</span>
            <select class="newsdesk-control" id="newsSourceType">
              <option>Official</option><option>Expert</option><option>Eyewitness</option>
              <option>Document</option><option>Data</option><option>Website</option>
            </select>
          </label>
        </div>

        <div class="newsdesk-card">
          <div class="newsdesk-card-title">${icon('tag')} टैग्स / कीवर्ड्स</div>
          <div class="newsdesk-tags" id="newsTags"></div>
          <label class="newsdesk-field"><span class="newsdesk-field-label">Tag</span><input class="newsdesk-control" id="newsTagInput" type="text" placeholder="टैग लिखें + Enter"></label>
        </div>

        <div class="newsdesk-card">
          <div class="newsdesk-card-title">${icon('chart')} आर्टिकल स्टैट्स</div>
          <div id="newsStats"></div>
        </div>

        <div class="newsdesk-card">
          <div class="newsdesk-card-title">${icon('robot')} AI असिस्टेंट</div>
          <div class="newsdesk-ai-grid">
            <button class="newsdesk-secondary-btn" type="button" onclick="newsAiAction('headline')">${icon('wand')} Improve Headline</button>
            <button class="newsdesk-secondary-btn" type="button" onclick="newsAiAction('seo')">${icon('chart')} SEO Headlines</button>
            <button class="newsdesk-secondary-btn" type="button" onclick="newsAiAction('factcheck')">${icon('checklist')} Fact-check</button>
          </div>
          <div class="newsdesk-ai-output" id="newsAiOutput">AI panel अभी prompt तैयार करता है। Provider bridge अगले चरण में जोड़ा जा सकता है।</div>
        </div>

        <div class="newsdesk-card">
          <div class="newsdesk-card-title">${icon('checklist')} पब्लिशिंग चेकलिस्ट</div>
          <div class="newsdesk-check-list" id="newsChecklist"></div>
        </div>

        <div class="newsdesk-card">
          <div class="newsdesk-card-title">${icon('notes')} एडिटोरियल नोट्स</div>
          <textarea class="newsdesk-notes" id="newsNotes" placeholder="एडिटर के लिए नोट्स..."></textarea>
        </div>
      </div>
    `;
    bindInspectorEvents();
  }

  function loadArticleIntoEditor(article) {
    document.getElementById('newsHeadline').value = article.headline;
    document.getElementById('newsSubhead').value = article.subhead;
    document.getElementById('newsBodyEditor').innerHTML = article.bodyHTML;
    renderNewsSections(article.sections);
    renderMetaStrip(article);
    syncInspectorValues(article);
    updateNewsStats();
  }

  function renderMetaStrip(article = currentArticle()) {
    const strip = document.getElementById('newsMetaStrip');
    if (!strip || !article) return;
    strip.innerHTML = `
      <span class="newsdesk-meta-pill">${icon('user')} ${newsEscape(article.author || 'Reporter')}</span>
      <span class="newsdesk-meta-pill">${icon('tag')} ${newsEscape(article.beat || 'General')}</span>
      <span class="newsdesk-meta-pill">${icon('calendar')} ${newsEscape(formatDate(article.updatedAt))}</span>
      <span class="newsdesk-meta-pill">${icon('clock')} ${newsEscape(statusLabel(article.status))}</span>
    `;
  }

  function renderNewsSections(sections = []) {
    const wrap = document.getElementById('newsSections');
    if (!wrap) return;
    wrap.innerHTML = sections.map(section => `
      <section class="newsdesk-section-card" data-section-id="${newsEscape(section.id)}">
        <div class="newsdesk-section-card-head">
          <input class="newsdesk-section-title-input" value="${newsEscape(section.title)}" aria-label="Section title">
          <button class="newsdesk-mini-btn" type="button" onclick="removeNewsSection('${newsEscape(section.id)}')" title="Delete section">${icon('trash')}</button>
        </div>
        <div class="newsdesk-contenteditable newsdesk-section-body" contenteditable="true" data-placeholder="यहाँ लिखें...">${section.bodyHTML || ''}</div>
      </section>
    `).join('');
    bindEditorInputEvents(wrap);
  }

  function syncInspectorValues(article = currentArticle()) {
    if (!article) return;
    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };
    setValue('newsStatus', article.status);
    setValue('newsSectionName', article.section);
    setValue('newsAuthor', article.author);
    setValue('newsBeat', article.beat);
    setValue('newsPubTime', article.pubTime);
    setValue('newsNotes', article.notes);
    renderSources();
    renderTags();
    renderChecklist();
  }

  function bindEditorInputEvents(root) {
    root.querySelectorAll('textarea, input, [contenteditable="true"]').forEach(element => {
      element.addEventListener('input', () => {
        // यदि पेस्ट की वजह से ऑटो-स्क्रॉल सस्पेंडेड है, तो इसे स्किप करें
        if (!newsAutoScrollSuspended) {
          // यहाँ सिस्टम का मुख्य ऑटो-स्क्रॉल फंक्शन कॉल करें
          if (typeof scheduleEditorCaretAutoScroll === 'function') {
            scheduleEditorCaretAutoScroll();
          }
        }
        updateNewsStats();
        scheduleNewsSave();
      });

      element.addEventListener('paste', () => {
        // पेस्ट करते ही स्क्रॉलिंग को अस्थायी रूप से रोकें
        newsAutoScrollSuspended = true;
      });

      element.addEventListener('mousedown', () => {
        // कहीं भी क्लिक करने पर ऑटो-स्क्रॉल फिर से चालू करें
        newsAutoScrollSuspended = false;
      });

      element.addEventListener('keydown', () => {
        // टाइपिंग शुरू करने या नेविगेशन कीज़ (Up/Down/Left/Right) दबाने पर स्क्रॉल चालू करें
        newsAutoScrollSuspended = false;
      });
    });
  }

  function bindInspectorEvents() {
    ['newsSectionName', 'newsAuthor', 'newsBeat', 'newsPubTime', 'newsNotes'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        renderMetaStrip({ ...currentArticle(), author: valueOf('newsAuthor'), beat: valueOf('newsBeat') });
        scheduleNewsSave();
      });
      document.getElementById(id)?.addEventListener('change', scheduleNewsSave);
    });
    document.getElementById('newsSourceInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addNewsSource();
      }
    });
    document.getElementById('newsTagInput')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addNewsTag();
      }
    });
  }

  function valueOf(id) {
    return document.getElementById(id)?.value || '';
  }

  function captureCurrentArticle(options = {}) {
    const article = currentArticle();
    if (!article || !document.getElementById('newsHeadline')) return;
    article.headline = valueOf('newsHeadline');
    article.subhead = valueOf('newsSubhead');
    article.bodyHTML = document.getElementById('newsBodyEditor')?.innerHTML || '';
    article.sections = Array.from(document.querySelectorAll('.newsdesk-section-card')).map(card => ({
      id: card.dataset.sectionId || makeId('section'),
      title: card.querySelector('.newsdesk-section-title-input')?.value || 'सेक्शन',
      bodyHTML: card.querySelector('.newsdesk-section-body')?.innerHTML || ''
    }));
    article.status = valueOf('newsStatus') || article.status;
    article.section = valueOf('newsSectionName') || article.section;
    article.author = valueOf('newsAuthor') || article.author;
    article.beat = valueOf('newsBeat') || article.beat;
    article.pubTime = valueOf('newsPubTime');
    article.notes = valueOf('newsNotes');
    if (options.touch !== false) article.updatedAt = new Date().toISOString();
  }

  function scheduleNewsSave() {
    clearTimeout(newsDeskState.saveTimer);
    captureCurrentArticle({ touch: false });
    syncNewsToolbarSummary();
    setSaveState('dirty', 'Saving...');
    newsDeskState.saveTimer = setTimeout(() => saveNewsArticle(false), NEWS_AUTOSAVE_DELAY);
  }

  async function saveNewsArticle(showToast = false) {
    if (newsDeskState.isSaving) return;
    newsDeskState.isSaving = true;
    captureCurrentArticle();
    writeLocalNewsState();
    try {
      const didSync = await writeWorkspaceNewsState();
      setSaveState('saved', newsSaveTargetLabel(didSync));
      renderArticleList();
      syncNewsToolbarSummary();
      renderMetaStrip();
      if (showToast) showNewsToast(didSync ? 'Saved to local project files' : 'Saved in browser memory');
    } catch (error) {
      console.warn('NewsDesk save failed:', error);
      setSaveState('error', 'Save failed');
      if (showToast) showNewsToast('Save failed. Browser copy सुरक्षित है।');
    } finally {
      newsDeskState.isSaving = false;
      updateNewsStats();
    }
  }

  async function selectNewsWorkspaceFolder() {
    if (!('showDirectoryPicker' in window) || !('indexedDB' in window)) {
      showNewsWorkspaceNotice('यह browser local folder sync support नहीं करता। Browser autosave active है।');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: 'lekhak-manch-newsdesk', mode: 'readwrite' });
      if (typeof verifyProjectPermission === 'function' && !(await verifyProjectPermission(handle, true))) {
        showNewsWorkspaceNotice('Folder permission चाहिए। Browser autosave active है।');
        return;
      }
      showAppLoader?.('Loading NewsDesk workspace...');
      if (await loadNewsProjectHandle(handle, { typeFolderName: '', storeHandle: true })) {
        renderAll();
        setSaveState('saved', newsSaveTargetLabel(false));
        showNewsToast(`News project ready: ${handle.name || 'Selected folder'}`);
        return;
      }
      projectDirectoryHandle = null;
      projectManifest = null;
      if (typeof setActiveProjectTypeFolderName === 'function') setActiveProjectTypeFolderName('');
      if (typeof deleteStoredDirectoryHandle === 'function') await deleteStoredDirectoryHandle(PROJECT_HANDLE_KEY);
      localStorage.removeItem(PROJECT_FOLDER_KEY);
      localStorage.removeItem(PROJECT_MANIFEST_KEY);
      workspaceDirectoryHandle = handle;
      newsDeskState.workspaceName = handle.name || '';
      if (typeof saveWorkspaceHandle === 'function') await saveWorkspaceHandle(handle);
      localStorage.setItem('lm_project_mode', 'workspace');
      localStorage.setItem('lm_workspace_folder_name', handle.name || '');
      const workspaceState = await readWorkspaceNewsState();
      if (workspaceState) {
        applyNewsDeskState(workspaceState);
        writeLocalNewsState();
      } else {
        await writeWorkspaceNewsState();
      }
      renderAll();
      setSaveState('saved', newsSaveTargetLabel(false));
      showNewsToast(`Workspace ready: ${handle.name || 'Selected folder'}`);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.warn('NewsDesk workspace selection failed:', error);
        showNewsWorkspaceNotice('Workspace folder connect नहीं हो पाया। Browser autosave active है।');
      }
    } finally {
      hideAppLoader?.();
    }
  }

  async function restoreNewsWorkspace() {
    try {
      if (typeof readWorkspaceHandle === 'function') {
        const workspaceHandle = await readWorkspaceHandle();
        if (
          workspaceHandle &&
          (typeof verifyProjectPermission !== 'function' || await verifyProjectPermission(workspaceHandle, false))
        ) {
          workspaceDirectoryHandle = workspaceHandle;
          localStorage.setItem(WORKSPACE_FOLDER_KEY, workspaceHandle.name || '');
        }
      }

      if (typeof readProjectHandle === 'function') {
        const projectHandle = await readProjectHandle();
        if (
          projectHandle &&
          (typeof verifyProjectPermission !== 'function' || await verifyProjectPermission(projectHandle, false))
        ) {
          const typeFolderName = localStorage.getItem(PROJECT_TYPE_FOLDER_KEY) || NEWS_WORKSPACE_DIR;
          if (await loadNewsProjectHandle(projectHandle, { typeFolderName, storeHandle: false })) {
            renderAll();
            setSaveState('saved', 'News project restored');
            return;
          }
        }
      }

      if (!workspaceDirectoryHandle) return;
      newsDeskState.workspaceName = workspaceDirectoryHandle.name || '';
      localStorage.setItem(WORKSPACE_FOLDER_KEY, workspaceDirectoryHandle.name || '');
      const workspaceState = await readWorkspaceNewsState();
      if (workspaceState) {
        applyNewsDeskState(workspaceState);
        writeLocalNewsState();
        renderAll();
        setSaveState('saved', 'Workspace restored');
      }
    } catch (error) {
      console.warn('NewsDesk workspace restore failed:', error);
    }
  }

  function selectNewsArticle(id) {
    captureCurrentArticle();
    newsDeskState.currentArticleId = id;
    writeLocalNewsState();
    renderArticleList();
    renderToolbar();
    renderPaper();
    syncInspectorValues();
    setSaveState('saved', newsSaveTargetLabel(false));
  }

  function newNewsArticle() {
    captureCurrentArticle();
    const article = createArticle({
      headline: '',
      subhead: '',
      bodyHTML: '',
      pubTime: new Date(Date.now() + 3600000).toISOString().slice(0, 16)
    });
    newsDeskState.articles.unshift(article);
    newsDeskState.currentArticleId = article.id;
    renderAll();
    scheduleNewsSave();
    document.getElementById('newsHeadline')?.focus();
  }

  function loadNewsTemplate(key) {
    const template = templates[key];
    const article = currentArticle();
    if (!template || !article) return;
    captureCurrentArticle();
    article.headline = template.headline;
    article.subhead = template.subhead;
    article.bodyHTML = textToHtml(template.body);
    article.sections = [];
    article.updatedAt = new Date().toISOString();
    renderPaper();
    renderToolbar();
    syncInspectorValues(article);
    scheduleNewsSave();
    showNewsToast(`${template.title} template loaded`);
  }

  function addNewsSection() {
    const article = currentArticle();
    if (!article) return;
    captureCurrentArticle();
    article.sections.push({
      id: makeId('section'),
      title: `सेक्शन ${article.sections.length + 1}`,
      bodyHTML: ''
    });
    renderNewsSections(article.sections);
    scheduleNewsSave();
    document.querySelector('.newsdesk-section-card:last-child .newsdesk-section-body')?.focus();
  }

  function removeNewsSection(id) {
    const article = currentArticle();
    if (!article) return;
    captureCurrentArticle();
    article.sections = article.sections.filter(section => section.id !== id);
    renderNewsSections(article.sections);
    scheduleNewsSave();
  }

  function renderSources() {
    const article = currentArticle();
    const list = document.getElementById('newsSources');
    if (!article || !list) return;
    list.innerHTML = article.sources.length ? article.sources.map((source, index) => `
      <div class="newsdesk-source-item">
        <span class="newsdesk-source-num">${index + 1}</span>
        <span>
          <span class="newsdesk-source-text">${newsEscape(source.text)}</span>
          <span class="newsdesk-source-type">${newsEscape(source.type)}</span>
        </span>
        <button class="newsdesk-source-remove" type="button" onclick="removeNewsSource('${newsEscape(source.id)}')" title="Remove source">${icon('x')}</button>
      </div>
    `).join('') : '<div class="newsdesk-source-text">अभी कोई source नहीं जोड़ा गया।</div>';
  }

  function addNewsSource() {
    const article = currentArticle();
    const input = document.getElementById('newsSourceInput');
    const type = document.getElementById('newsSourceType')?.value || 'Official';
    const text = input?.value.trim();
    if (!article || !text) return;
    article.sources.push({ id: makeId('source'), text, type });
    if (input) input.value = '';
    renderSources();
    updateNewsStats();
    scheduleNewsSave();
  }

  function removeNewsSource(id) {
    const article = currentArticle();
    if (!article) return;
    article.sources = article.sources.filter(source => source.id !== id);
    renderSources();
    updateNewsStats();
    scheduleNewsSave();
  }

  function renderTags() {
    const article = currentArticle();
    const wrap = document.getElementById('newsTags');
    if (!article || !wrap) return;
    wrap.innerHTML = article.tags.map(tag => `
      <span class="newsdesk-tag">${newsEscape(tag)}
        <button type="button" onclick="removeNewsTag('${newsEscape(tag)}')" title="Remove tag">${icon('x')}</button>
      </span>
    `).join('');
  }

  function addNewsTag() {
    const article = currentArticle();
    const input = document.getElementById('newsTagInput');
    const tag = input?.value.trim();
    if (!article || !tag) return;
    if (!article.tags.includes(tag)) article.tags.push(tag);
    if (input) input.value = '';
    renderTags();
    scheduleNewsSave();
  }

  function removeNewsTag(tag) {
    const article = currentArticle();
    if (!article) return;
    article.tags = article.tags.filter(item => item !== tag);
    renderTags();
    scheduleNewsSave();
  }

  function renderChecklist() {
    const article = currentArticle();
    const wrap = document.getElementById('newsChecklist');
    if (!article || !wrap) return;
    wrap.innerHTML = checklistItems.map(item => {
      const checked = Boolean(article.checklist?.[item.id]);
      return `
        <label class="newsdesk-check-row ${checked ? 'is-done' : ''}">
          <input type="checkbox" data-check-id="${newsEscape(item.id)}" ${checked ? 'checked' : ''} onchange="toggleNewsChecklist(this)">
          ${newsEscape(item.label)}
        </label>
      `;
    }).join('');
  }

  function toggleNewsChecklist(input) {
    const article = currentArticle();
    if (!article) return;
    const id = input.dataset.checkId;
    article.checklist = { ...defaultChecklist(), ...article.checklist, [id]: input.checked };
    input.closest('.newsdesk-check-row')?.classList.toggle('is-done', input.checked);
    scheduleNewsSave();
  }

  function updateNewsStatus(status) {
    const article = currentArticle();
    if (!article) return;
    article.status = status;
    renderArticleList();
    syncNewsToolbarSummary(article);
    renderMetaStrip(article);
    scheduleNewsSave();
  }

  function publishNewsArticle() {
    const status = document.getElementById('newsStatus');
    if (status) status.value = 'published';
    updateNewsStatus('published');
    showNewsToast('✓ आर्टिकल प्रकाशित status में मार्क हुआ');
  }

  function articlePlainText(article = currentArticle()) {
    if (!article) return '';
    const sectionText = article.sections.map(section => `${section.title} ${htmlToPlainText(section.bodyHTML)}`).join(' ');
    return [article.headline, article.subhead, htmlToPlainText(article.bodyHTML), sectionText].join(' ').trim();
  }

  function updateNewsStats() {
    captureCurrentArticle({ touch: false });
    const article = currentArticle();
    if (!article) return;
    const fullText = articlePlainText(article);
    const words = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0;
    const mins = Math.max(1, Math.round(words / 200));
    const pct = Math.min(100, Math.round((words / newsDeskState.wordTarget) * 100));
    const sections = 1 + article.sections.length;
    const paragraphs = Math.max(1, (fullText.match(/\n+/g) || []).length + 1);
    const doneChecks = checklistItems.filter(item => article.checklist?.[item.id]).length;
    const stats = document.getElementById('newsStats');
    if (stats) {
      stats.innerHTML = `
        <div class="newsdesk-stat-row"><span>कुल शब्द</span><strong>${words}</strong></div>
        <div class="newsdesk-stat-row"><span>पढ़ने का समय</span><strong>${mins} मिनट</strong></div>
        <div class="newsdesk-stat-row"><span>लक्ष्य (${newsDeskState.wordTarget} शब्द)</span><strong>${pct}%</strong></div>
        <div class="newsdesk-progress"><span style="width:${pct}%"></span></div>
        <div class="newsdesk-stat-row"><span>सोर्सेज़</span><strong>${article.sources.length}</strong></div>
        <div class="newsdesk-stat-row"><span>सेक्शन्स</span><strong>${sections}</strong></div>
        <div class="newsdesk-stat-row"><span>चेकलिस्ट</span><strong>${doneChecks}/${checklistItems.length}</strong></div>
        <div class="newsdesk-stat-row"><span>पैराग्राफ संकेत</span><strong>${paragraphs}</strong></div>
      `;
    }
    const wordCount = document.getElementById('newsWordCount');
    const readTime = document.getElementById('newsReadTime');
    syncNewsToolbarSummary(article);
    if (wordCount) wordCount.textContent = `${words} शब्द`;
    if (readTime) readTime.textContent = `${mins} मिनट`;
  }

  function formatNews(command) {
    document.execCommand(command, false, null);
    updateNewsStats();
    scheduleNewsSave();
  }

  function formatNewsBlockquote() {
    document.execCommand('formatBlock', false, 'blockquote');
    updateNewsStats();
    scheduleNewsSave();
  }

  function insertNewsLink() {
    const url = prompt('URL दर्ज करें (https://...)');
    if (!url) return;
    document.execCommand('createLink', false, url);
    scheduleNewsSave();
  }

  function applyNewsFontFamily(value) {
    const editor = document.getElementById('newsBodyEditor');
    const fonts = {
      serif: 'Georgia, "Times New Roman", serif',
      sans: 'var(--ui-font)',
      mono: 'Consolas, monospace'
    };
    if (editor) editor.style.fontFamily = fonts[value] || fonts.serif;
  }

  function applyNewsFontSize(value) {
    const editor = document.getElementById('newsBodyEditor');
    if (editor) editor.style.fontSize = value;
  }

  function toggleNewsFocus() {
    document.body.classList.toggle('newsdesk-focus-mode');
    document.getElementById('newsFocusBtn')?.classList.toggle('is-active', document.body.classList.contains('newsdesk-focus-mode'));
  }

  function newsAiAction(type) {
    captureCurrentArticle({ touch: false });
    const article = currentArticle();
    const prompts = {
      headline: `मेरी इस हेडलाइन को ज्यादा साफ, आकर्षक और क्लिकबेट-फ्री बनाओ:\n"${article?.headline || ''}"`,
      seo: `इस आर्टिकल के लिए 5 SEO-friendly headline variants सुझाओ:\n"${article?.headline || ''}"`,
      factcheck: `इस आर्टिकल को publish करने से पहले fact-check checklist बनाओ:\n"${article?.headline || ''}"\n\nSources:\n${(article?.sources || []).map(source => `- ${source.text}`).join('\n')}`
    };
    const output = document.getElementById('newsAiOutput');
    if (output) output.textContent = prompts[type] || 'AI prompt तैयार नहीं हो पाया।';
    showNewsToast('AI prompt तैयार है');
  }

  function showNewsStyleGuide() {
    showNewsToast('Style guide prompt inspector में लिखा गया');
    const output = document.getElementById('newsAiOutput');
    if (output) {
      output.textContent = 'स्टाइल गाइड: संख्याएँ स्पष्ट रखें, तारीख absolute लिखें, quotes attribution के साथ दें, abbreviations पहली बार पूरे लिखें, headline में साफ sentence case रखें।';
    }
  }

  function showNewsSeoTips() {
    showNewsToast('SEO tips inspector में लिखे गए');
    const output = document.getElementById('newsAiOutput');
    if (output) {
      output.textContent = 'SEO tips: मुख्य keyword headline के पहले हिस्से में रखें, 3-5 tags चुनें, meta summary अलग रखें, source links और image alt text final pass में verify करें।';
    }
  }

  function renderAll() {
    renderSidebar();
    renderToolbar();
    renderInspector();
    renderPaper();
    window.hydrateLmIcons?.();
    window.initCustomSelects?.();
    setSaveState('saved', newsSaveTargetLabel(false));
  }

  async function initNewsDesk() {
    applyNewsTheme();
    const stored = readLocalNewsState();
    newsDeskState.articles = stored.articles;
    newsDeskState.currentArticleId = stored.currentArticleId;
    newsDeskState.wordTarget = stored.wordTarget;
    renderAll();
    await restoreNewsWorkspace();
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeNewsdeskSidebarMenu();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveNewsArticle(true);
      }
    });
    document.addEventListener('click', event => {
      if (event.target.closest?.('#newsdeskSidebarMenuBtn, #newsdeskSidebarMenuPanel')) return;
      closeNewsdeskSidebarMenu();
    });
    document.addEventListener('pointermove', handleNewsToolDockPointerMove);
    document.addEventListener('pointerup', handleNewsToolDockPointerUp);
  }

  window.saveNewsArticle = saveNewsArticle;
  window.restoreNewsWorkspace = restoreNewsWorkspace;
  window.toggleNewsdeskSidebarMenu = toggleNewsdeskSidebarMenu;
  window.closeNewsdeskSidebarMenu = closeNewsdeskSidebarMenu;
  window.selectNewsWorkspaceFolder = selectNewsWorkspaceFolder;
  window.selectNewsArticle = selectNewsArticle;
  window.newNewsArticle = newNewsArticle;
  window.loadNewsTemplate = loadNewsTemplate;
  window.addNewsSection = addNewsSection;
  window.removeNewsSection = removeNewsSection;
  window.addNewsSource = addNewsSource;
  window.removeNewsSource = removeNewsSource;
  window.addNewsTag = addNewsTag;
  window.removeNewsTag = removeNewsTag;
  window.toggleNewsChecklist = toggleNewsChecklist;
  window.updateNewsStatus = updateNewsStatus;
  window.publishNewsArticle = publishNewsArticle;
  window.formatNews = formatNews;
  window.formatNewsBlockquote = formatNewsBlockquote;
  window.insertNewsLink = insertNewsLink;
  window.applyNewsFontFamily = applyNewsFontFamily;
  window.applyNewsFontSize = applyNewsFontSize;
  window.toggleNewsFocus = toggleNewsFocus;
  window.toggleNewsToolDock = toggleNewsToolDock;
  window.toggleNewsFontTools = toggleNewsFontTools;
  window.focusNewsHeadline = focusNewsHeadline;
  window.newsAiAction = newsAiAction;
  window.showNewsStyleGuide = showNewsStyleGuide;
  window.showNewsSeoTips = showNewsSeoTips;

  document.addEventListener('DOMContentLoaded', initNewsDesk);
})();
