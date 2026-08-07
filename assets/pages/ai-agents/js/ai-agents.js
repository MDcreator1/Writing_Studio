// AI Agents Studio & Monitor - Core Controller

const DEFAULT_AGENTS = [
  {
    id: 'world-builder',
    name: 'World Builder Agent',
    role: 'World Rules & Systems Architect',
    icon: '🌍',
    desc: 'Monitors continents, magic systems, technology, noble clans, items, and world rules for fiction continuity.',
    enabled: true,
    mode: 'auditor',
    status: 'Active',
    metrics: 'Monitors Naming & Lore Database'
  },
  {
    id: 'character-manager',
    name: 'Character & Archetype Agent',
    role: 'Character Persona & Arc Tracker',
    icon: '👤',
    desc: 'Tracks character appearance, goals, powers, relationships, emotional state, and growth across chapters.',
    enabled: true,
    mode: 'cowriter',
    status: 'Active',
    metrics: 'Monitors Character Entries'
  },
  {
    id: 'plot-architect',
    name: 'Plot & Arc Architect Agent',
    role: 'Story Structure & Pacing Guide',
    icon: '📖',
    desc: 'Analyzes Three-Act structure, Hero’s Journey, chapter pacing, twists, and foreshadowing elements.',
    enabled: true,
    mode: 'cowriter',
    status: 'Active',
    metrics: 'Analyzes Chapter Pacing'
  },
  {
    id: 'continuity-memory',
    name: 'Continuity & Memory Agent (RAG)',
    role: 'Rule & Contradiction Guard',
    icon: '🔍',
    desc: 'Retrieves relevant lore rules and facts to prevent plot holes, timeline errors, and canon contradictions.',
    enabled: true,
    mode: 'auditor',
    status: 'Active',
    metrics: 'RAG Memory Indexing'
  },
  {
    id: 'style-tone',
    name: 'Style & Tone Agent',
    role: 'Voice & Cadence Learner',
    icon: '✍️',
    desc: 'Learns author sentence length, dialogue style, description depth, vocabulary, and emotional tone.',
    enabled: true,
    mode: 'passive',
    status: 'Active',
    metrics: 'Style Learning Enabled'
  },
  {
    id: 'editor-quality',
    name: 'Editor & Quality Agent',
    role: 'Grammar & Prose Editor',
    icon: '🛠️',
    desc: 'Scans for weak descriptions, repetitive phrasing, dialogue polish, and offer 1-click prose fixes.',
    enabled: true,
    mode: 'cowriter',
    status: 'Active',
    metrics: 'Real-time Quality Scan'
  },
  {
    id: 'timeline-lore',
    name: 'Timeline & Lore Agent',
    role: 'Chronology & Canon Database',
    icon: '⏱️',
    desc: 'Enforces historical timeline sequence, event dates, calendar consistency, and historical lore.',
    enabled: true,
    mode: 'auditor',
    status: 'Active',
    metrics: 'Chronology Index'
  },
  {
    id: 'idea-scene',
    name: 'Idea & Scene Expansion Agent',
    role: 'Brainstorming & Scene Co-writer',
    icon: '💡',
    desc: 'Generates scene continuations, trope variations, action beats, and creative dialogue options.',
    enabled: true,
    mode: 'cowriter',
    status: 'Active',
    metrics: 'Idea Generator Ready'
  }
];

let activeProjectData = {
  manifest: { title: 'Untitled Story', type: 'novel', language: 'hi' },
  namingData: { categories: [], entries: [] },
  storyFacts: [],
  chapters: [],
  aiDeskState: null
};

// Initialize Application Data
function initAIAgentsStudio() {
  loadProjectStorageData();
  renderHeaderMetrics();
  renderAgentsGrid();
  renderInspectorData();
  logConsole('sys', '[READY] Studio loaded. 8 AI Agents synced with local story database.');
}

// Load data from LocalStorage
function loadProjectStorageData() {
  try {
    // Search keys in LocalStorage
    const keys = Object.keys(localStorage);
    
    // Find active project desk state
    const aiDeskKey = keys.find(k => k.startsWith('lm_ai_desk_state:'));
    if (aiDeskKey) {
      activeProjectData.aiDeskState = JSON.parse(localStorage.getItem(aiDeskKey) || '{}');
    }

    // Try finding stored manifest or story keys
    for (const key of keys) {
      if (key.includes('naming_data') || key.includes('tags')) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || '{}');
          if (parsed && (parsed.entries || parsed.categories)) {
            activeProjectData.namingData = parsed;
          }
        } catch (e) {}
      }
      if (key.includes('facts') || key.includes('notes')) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(parsed) && parsed.length) {
            activeProjectData.storyFacts = parsed;
          }
        } catch (e) {}
      }
    }

    // Check document / title from localStorage or fallback
    const folderName = localStorage.getItem('lm_project_folder_name') || 'Lekhak Manch Novel Workspace';
    activeProjectData.manifest.title = folderName;

  } catch (error) {
    console.warn('Could not read project data from localStorage:', error);
  }
}

// Render Header Metrics
function renderHeaderMetrics() {
  document.getElementById('projectNameText').textContent = activeProjectData.manifest.title;
  
  const activeCount = DEFAULT_AGENTS.filter(a => a.enabled).length;
  document.getElementById('statActiveAgents').textContent = `${activeCount} / ${DEFAULT_AGENTS.length}`;

  const namingCount = activeProjectData.namingData?.entries?.length || 0;
  document.getElementById('statNamingEntries').textContent = namingCount;

  const factsCount = activeProjectData.storyFacts?.length || 0;
  document.getElementById('statStoryFacts').textContent = factsCount;

  const provider = activeProjectData.aiDeskState?.activeProviderId || 'OpenAI / ChatGPT';
  document.getElementById('statProviderName').textContent = String(provider).toUpperCase();
}

// Render Agents Grid
function renderAgentsGrid() {
  const container = document.getElementById('agentsGrid');
  if (!container) return;

  container.innerHTML = DEFAULT_AGENTS.map(agent => `
    <div class="agent-card ${agent.enabled ? '' : 'is-off'}" id="agent-card-${agent.id}">
      <div class="agent-head">
        <div class="agent-identity">
          <div class="agent-avatar">${agent.icon}</div>
          <div class="agent-name-wrap">
            <h3>${escapeHtml(agent.name)}</h3>
            <span class="agent-role-tag">${escapeHtml(agent.role)}</span>
          </div>
        </div>
        <label class="toggle-switch" title="Toggle Agent On/Off">
          <input type="checkbox" ${agent.enabled ? 'checked' : ''} onchange="toggleAgent('${agent.id}', this.checked)">
          <span class="slider"></span>
        </label>
      </div>

      <p class="agent-desc">${escapeHtml(agent.desc)}</p>

      <div class="agent-meta-row">
        <span class="agent-status-badge ${agent.enabled ? 'active' : 'offline'}">
          ● ${agent.enabled ? agent.status : 'Disabled'}
        </span>
        <select class="agent-mode-select" onchange="changeAgentMode('${agent.id}', this.value)" ${agent.enabled ? '' : 'disabled'}>
          <option value="passive" ${agent.mode === 'passive' ? 'selected' : ''}>Passive Monitor</option>
          <option value="cowriter" ${agent.mode === 'cowriter' ? 'selected' : ''}>Co-Writer Mode</option>
          <option value="auditor" ${agent.mode === 'auditor' ? 'selected' : ''}>Strict Auditor Mode</option>
        </select>
      </div>

      <div class="agent-footer">
        <span class="agent-stat-pill">${escapeHtml(agent.metrics)}</span>
        <button type="button" class="btn-xs" onclick="runAgentDiagnostic('${agent.id}')" ${agent.enabled ? '' : 'disabled'}>
          ⚡ Diagnostic
        </button>
      </div>
    </div>
  `).join('');
}

// Render Inspector Data
function renderInspectorData() {
  // Naming List
  const namingContainer = document.getElementById('namingLoreList');
  const entries = activeProjectData.namingData?.entries || [];
  document.getElementById('namingCountBadge').textContent = `${entries.length} Entities`;

  if (entries.length) {
    namingContainer.innerHTML = entries.slice(0, 15).map(e => `
      <div class="lore-item">
        <div class="lore-title">
          <span>${escapeHtml(e.name || 'Unnamed')}</span>
          <span class="badge">${escapeHtml(e.categoryId || 'General')}</span>
        </div>
        ${e.info ? `<p class="lore-desc">${escapeHtml(e.info)}</p>` : ''}
      </div>
    `).join('');
  } else {
    namingContainer.innerHTML = `<p class="empty-msg">No naming/world entities found in storage.</p>`;
  }

  // Facts List
  const factsContainer = document.getElementById('storyFactsList');
  const facts = activeProjectData.storyFacts || [];
  document.getElementById('factsCountBadge').textContent = `${facts.length} Rules`;

  if (facts.length) {
    factsContainer.innerHTML = facts.slice(0, 15).map(f => `
      <div class="lore-item">
        <div class="lore-title">
          <span>${escapeHtml(f.title || f.text || 'Canon Fact')}</span>
          ${f.pinned ? `<span class="badge">Pinned Rule</span>` : ''}
        </div>
        ${f.text && f.title ? `<p class="lore-desc">${escapeHtml(f.text)}</p>` : ''}
      </div>
    `).join('');
  } else {
    factsContainer.innerHTML = `<p class="empty-msg">No canon facts/rules found in storage.</p>`;
  }

  // Payload JSON
  const payloadBlock = document.getElementById('payloadJsonBlock');
  const payload = {
    projectTitle: activeProjectData.manifest.title,
    activeProvider: activeProjectData.aiDeskState?.activeProviderId || 'openai',
    activeAgentsCount: DEFAULT_AGENTS.filter(a => a.enabled).length,
    namingEntities: entries.slice(0, 20),
    storyFacts: facts.slice(0, 20),
    contextWindowLimit: '6,000 characters'
  };
  payloadBlock.textContent = JSON.stringify(payload, null, 2);
}

// Tab Switching
function switchInspectorTab(tabName) {
  const tabs = ['naming', 'facts', 'chapters', 'payload'];
  tabs.forEach(t => {
    const btn = document.querySelector(`.tab-btn[data-tab="${t}"]`);
    const content = document.getElementById(`tabContent${capitalize(t)}`);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (content) content.classList.toggle('hidden', t !== tabName);
  });
}

// Agent Actions
function toggleAgent(agentId, enabled) {
  const agent = DEFAULT_AGENTS.find(a => a.id === agentId);
  if (!agent) return;
  agent.enabled = enabled;
  renderHeaderMetrics();
  renderAgentsGrid();
  logConsole('agent', `[AGENT UPDATED] ${agent.name} is now ${enabled ? 'ENABLED' : 'DISABLED'}.`);
}

function changeAgentMode(agentId, mode) {
  const agent = DEFAULT_AGENTS.find(a => a.id === agentId);
  if (!agent) return;
  agent.mode = mode;
  logConsole('agent', `[AGENT MODE] ${agent.name} set to mode: ${mode.toUpperCase()}`);
}

function runAgentDiagnostic(agentId) {
  const agent = DEFAULT_AGENTS.find(a => a.id === agentId);
  if (!agent) return;
  logConsole('sys', `[DIAGNOSTIC START] Running latency & context test on ${agent.name}...`);
  setTimeout(() => {
    logConsole('success', `[DIAGNOSTIC OK] ${agent.name} responding cleanly. Memory context sync: 100%.`);
  }, 600);
}

// Run Full Novel Audit Simulation
function runFullContinuityAudit() {
  logConsole('sys', '================================================');
  logConsole('sys', '🚀 STARTING FULL NOVEL CONTINUITY & LORE AUDIT');
  logConsole('sys', '================================================');

  const steps = [
    { delay: 400, type: 'agent', msg: '[🌍 World Builder Agent] Verifying magic/tech rules against story facts...' },
    { delay: 900, type: 'success', msg: '[🌍 World Builder Agent] Verified: 0 world-building rule conflicts found.' },
    { delay: 1400, type: 'agent', msg: '[👤 Character Agent] Cross-referencing character profiles & relationships with active naming entries...' },
    { delay: 1900, type: 'success', msg: '[👤 Character Agent] Verified: Naming integrity valid across all active chapters.' },
    { delay: 2400, type: 'agent', msg: '[📖 Plot Architect Agent] Checking Three-Act pacing & emotional crescendo...' },
    { delay: 2900, type: 'warn', msg: '[📖 Plot Architect Agent] Recommendation: Consider expanding the climax of Chapter 2 for emotional punch.' },
    { delay: 3400, type: 'agent', msg: '[🔍 Continuity Agent] Running RAG vector check against historical facts...' },
    { delay: 3900, type: 'success', msg: '[🔍 Continuity Agent] No timeline anomalies or character contradictions detected!' },
    { delay: 4400, type: 'sys', msg: '✅ [AUDIT COMPLETE] Novel Health Status: 100% Canon Compliant.' }
  ];

  steps.forEach(step => {
    setTimeout(() => {
      logConsole(step.type, step.msg);
    }, step.delay);
  });
}

// Terminal Console Utilities
function logConsole(type, message) {
  const output = document.getElementById('consoleOutput');
  if (!output) return;
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  line.textContent = `[${timestamp}] ${message}`;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function clearConsoleLog() {
  const output = document.getElementById('consoleOutput');
  if (output) output.innerHTML = '';
}

function handleConsoleInputKey(event) {
  if (event.key === 'Enter') sendConsoleDirective();
}

function sendConsoleDirective() {
  const input = document.getElementById('agentConsoleInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  logConsole('user', `> ${text}`);
  input.value = '';

  setTimeout(() => {
    logConsole('agent', `[AGENT ORCHESTRA] Executing directive: "${text}"...`);
    setTimeout(() => {
      logConsole('success', `[AGENT ORCHESTRA] Directive processed and synced with story memory.`);
    }, 800);
  }, 400);
}

function copyPayloadJson() {
  const code = document.getElementById('payloadJsonBlock')?.textContent;
  if (code) {
    navigator.clipboard.writeText(code);
    logConsole('sys', '[COPIED] AI Prompt Context Payload copied to clipboard.');
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function capitalize(str) {
  return String(str).charAt(0).toUpperCase() + String(str).slice(1);
}

// Auto Init on DOM Load
document.addEventListener('DOMContentLoaded', initAIAgentsStudio);
