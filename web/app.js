import { WORKSPACE_KEY, persist, snapshot, validateWorkspace } from './workspace.js';
import { readSource } from './files.js';

let notice = '';
let accessToken = '';
let savingBlocked = false;
let storedWorkspace;
const uniqueId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
try {
  const raw = localStorage.getItem(WORKSPACE_KEY);
  if (raw) storedWorkspace = validateWorkspace(JSON.parse(raw));
} catch { savingBlocked = true; notice = 'Saved workspace could not be loaded. Original storage has been preserved. Import a valid backup to recover.'; }

const STORE = {
  files: 'xiaoli-static-files-v1',
  notebooks: 'xiaoli-static-notebooks-v1',
  graphMastery: 'xiaoli-static-graph-mastery-v1'
};

const SUBJECTS = {
  general: 'General',
  physics: 'Physics',
  math: 'Math',
  history: 'History',
  programming: 'Programming'
};

const TOOL_META = {
  podcast: { label: 'AI Podcast', description: 'Dual-host script plus GPT TTS audio.' },
  summary: { label: 'Study Brief', description: 'Fast review notes in one page.' },
  mindmap: { label: 'Mind Map', description: 'Structured outline for revision.' }
};

const DEMO_FILES = [
  {
    id: 'physics-demo',
    name: 'Newton law review',
    subject: 'physics',
    kind: 'note',
    createdAt: '2026-03-12',
    content: 'Newton second law links net force and acceleration. Start from a force diagram, choose axes, then write F = ma. Inclines, elevators, and conveyor belts are the most error-prone scenes.'
  },
  {
    id: 'math-demo',
    name: 'Derivative sprint notes',
    subject: 'math',
    kind: 'text',
    createdAt: '2026-03-11',
    content: 'Derivatives are used for monotonicity, extrema, and optimization. Define the domain, compute the derivative, then discuss sign changes. Parameter problems need careful boundary checks.'
  },
  {
    id: 'history-demo',
    name: 'Industrial revolution timeline',
    subject: 'history',
    kind: 'note',
    createdAt: '2026-03-10',
    content: 'The industrial revolution began in Britain because of capital, markets, technology, and institutions. Essays are strongest when framed as background, process, and impact.'
  }
];

const DEMO_NOTEBOOKS = [
  { id: 'default-notebook', name: 'Exam Sprint Notebook', fileIds: ['physics-demo', 'math-demo'], history: [] }
];

const GRAPH_NODES = [
  { id: 'force-analysis', label: 'Force Analysis', subject: 'physics', x: 120, y: 110, summary: 'Start with the object, list forces, then set directions.', related: ['newton-2'], mastery: 'learning', next: 'Practice incline and elevator questions.' },
  { id: 'newton-2', label: 'Newton 2', subject: 'physics', x: 270, y: 170, summary: 'Net force sets acceleration.', related: ['force-analysis', 'kinematics'], mastery: 'review', next: 'Translate force diagrams into equations.' },
  { id: 'kinematics', label: 'Kinematics', subject: 'physics', x: 430, y: 110, summary: 'Position, velocity, acceleration, and graphs.', related: ['newton-2'], mastery: 'mastered', next: 'Switch between graph and formula views.' },
  { id: 'function-thinking', label: 'Function Thinking', subject: 'math', x: 140, y: 330, summary: 'Translate a problem into variable change.', related: ['derivative'], mastery: 'learning', next: 'Always check the domain first.' },
  { id: 'derivative', label: 'Derivative', subject: 'math', x: 320, y: 380, summary: 'The derivative is a lens for change and extrema.', related: ['function-thinking', 'inequality'], mastery: 'review', next: 'Use sign charts instead of memorized slogans.' },
  { id: 'inequality', label: 'Inequalities', subject: 'math', x: 500, y: 320, summary: 'Look for structure, symmetry, and substitution.', related: ['derivative'], mastery: 'mastered', next: 'Collect your favorite conversion patterns.' },
  { id: 'chronology', label: 'Timeline', subject: 'history', x: 640, y: 130, summary: 'Events become clearer once placed on a timeline.', related: ['cause-effect'], mastery: 'mastered', next: 'Anchor each unit with 3 big dates.' },
  { id: 'cause-effect', label: 'Cause and Effect', subject: 'history', x: 810, y: 210, summary: 'Split background, process, and impact.', related: ['chronology'], mastery: 'learning', next: 'Separate causes from consequences in writing.' },
  { id: 'algorithms', label: 'Algorithms', subject: 'programming', x: 640, y: 380, summary: 'Follow the data flow before writing code.', related: ['debugging'], mastery: 'learning', next: 'Sketch the process first.' },
  { id: 'debugging', label: 'Debugging', subject: 'programming', x: 830, y: 350, summary: 'Reproduce, isolate, minimize, fix.', related: ['algorithms'], mastery: 'review', next: 'Check inputs, outputs, and middle states.' }
];

const COMPANIONS = [
  { id: 'lumo', name: 'Lumo', title: 'Sprint Coach', emoji: '🦉', gradient: 'linear-gradient(135deg,#d8ff81 0%,#69c247 100%)', bubble: 'One clear win first. Momentum before perfection.', strengths: ['Practice bursts', 'Exam rhythm', 'Momentum'] },
  { id: 'mika', name: 'Mika', title: 'Patient Tutor', emoji: '🐻', gradient: 'linear-gradient(135deg,#9fe1ff 0%,#4da4ff 100%)', bubble: 'If you are stuck, we break the problem into smaller moves.', strengths: ['Concept breakdown', 'Error review', 'Steady pace'] },
  { id: 'nova', name: 'Nova', title: 'Idea Buddy', emoji: '🦊', gradient: 'linear-gradient(135deg,#ffd382 0%,#ff8f66 100%)', bubble: 'Make the topic concrete and your memory will hold longer.', strengths: ['Examples', 'Podcast mode', 'Memory hooks'] }
];

const INITIAL_QUESTS = [
  { id: 'q1', title: 'Finish one podcast run and one follow-up question', reward: '+20 XP', done: true },
  { id: 'q2', title: 'Mark one weak concept in the graph', reward: '+35 XP', done: false },
  { id: 'q3', title: 'Complete a 15 minute focused sprint', reward: '+1 shield', done: false }
];

const ACTIONS = [
  'Review my mistakes',
  'Start a short sprint',
  'Split today into 15 minute blocks',
  'Encourage me before I begin'
];

const state = {
  view: 'overview',
  files: load(STORE.files, DEMO_FILES),
  notebooks: load(STORE.notebooks, DEMO_NOTEBOOKS),
  drafts: {
    title: '',
    content: '',
    subject: 'general',
    notebookName: '',
    followupInput: ''
  },
  studio: {
    activeNotebookId: '',
    tool: 'podcast',
    selectedHistoryId: '',
    busy: false,
    message: '',
    tone: 'success',
    followups: [],
    followupBusy: false
  },
  graph: {
    subject: 'all',
    query: '',
    selectedId: 'force-analysis',
    mastery: load(STORE.graphMastery, Object.fromEntries(GRAPH_NODES.map((node) => [node.id, node.mastery])))
  },
  companion: {
    selectedId: 'lumo',
    activeAction: ACTIONS[0],
    quests: INITIAL_QUESTS.map((item) => ({ ...item }))
  }
};

function load(key, fallback) {
  const field = Object.entries(STORE).find(([, value]) => value === key)?.[0];
  if (storedWorkspace && field) return storedWorkspace[field];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function save() {
  if (savingBlocked) return;
  try { persist(localStorage, state); }
  catch { notice = 'Changes could not be saved. Export a backup now, then remove old sources or history to free space.'; }
}

function ensureNotebook() {
  if (!state.notebooks.length) {
    state.notebooks = [{ id: 'auto-notebook', name: 'Starter Notebook', fileIds: state.files.slice(0, 2).map((file) => file.id), history: [] }];
  }
  if (!state.studio.activeNotebookId || !state.notebooks.some((item) => item.id === state.studio.activeNotebookId)) {
    state.studio.activeNotebookId = state.notebooks[0].id;
  }
}

function getActiveNotebook() {
  ensureNotebook();
  return state.notebooks.find((item) => item.id === state.studio.activeNotebookId) || null;
}

function getActiveFiles() {
  const notebook = getActiveNotebook();
  if (!notebook) return [];
  return state.files.filter((file) => notebook.fileIds.includes(file.id));
}

function getCurrentOutput() {
  const notebook = getActiveNotebook();
  if (!notebook) return null;
  if (state.studio.selectedHistoryId) {
    return notebook.history.find((item) => item.id === state.studio.selectedHistoryId) || notebook.history[0] || null;
  }
  return notebook.history[0] || null;
}

function setMessage(text, tone = 'success') {
  state.studio.message = text;
  state.studio.tone = tone;
}

function formatTime(value) {
  try {
    return new Date(value).toLocaleString('en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    if (/^\s*-\s+/.test(line)) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${inlineMarkdown(line.replace(/^\s*-\s+/, ''))}</li>`;
      continue;
    }
    if (inList) {
      html += '</ul>';
      inList = false;
    }
    if (/^###\s+/.test(line)) html += `<h3>${inlineMarkdown(line.replace(/^###\s+/, ''))}</h3>`;
    else if (/^##\s+/.test(line)) html += `<h2>${inlineMarkdown(line.replace(/^##\s+/, ''))}</h2>`;
    else if (/^#\s+/.test(line)) html += `<h1>${inlineMarkdown(line.replace(/^#\s+/, ''))}</h1>`;
    else if (line.trim()) html += `<p>${inlineMarkdown(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html || `<p>${inlineMarkdown(markdown || '')}</p>`;
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function buildContext(files) {
  const budget = Math.max(100, Math.floor(24000 / files.length) - 700);
  return files
    .map((file, index) => `Source ${index + 1}\nTitle: ${file.name}\nSubject: ${SUBJECTS[file.subject]}\nType: ${file.kind}\nContent excerpt: ${String(file.content || '').replace(/\s+/g, ' ').slice(0, budget)}`)
    .join('\n\n');
}

async function postJson(url, body, retry = true) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000)
  });
  if (response.status === 401 && retry) {
    accessToken = window.prompt('Enter this workspace’s access key (kept only until this page closes):') || '';
    if (accessToken) return postJson(url, body, false);
  }
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error((data && (data.error || data.message)) || `Request failed (${response.status})`);
  }
  return data;
}

function navItems() {
  return [
    ['overview', 'Overview', 'Main workspace', '◎'],
    ['library', 'Library', 'Upload and edit sources', '▣'],
    ['studio', 'Studio', 'Podcast, brief, map', '▶'],
    ['graph', 'Graph', 'Interactive concept map', '◌'],
    ['companion', 'Companion', 'Duolingo-style coach', '☺']
  ];
}
function renderLayout(content) {
  const nav = navItems().map(([id, label, hint, icon]) => `
    <button class="${state.view === id ? 'active' : ''}" data-action="set-view" data-view="${id}">
      <span class="icon">${icon}</span>
      <span><strong>${label}</strong><br><small>${hint}</small></span>
    </button>`).join('');

  const mobileNav = navItems().map(([id, label]) => `<button class="ghost ${state.view === id ? 'active' : ''}" data-action="set-view" data-view="${id}">${label}</button>`).join('');

  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">✦</div>
          <div>
            <div class="eyebrow">XiaoLi AI Brain</div>
            <h1 class="display">Study Surface</h1>
          </div>
        </div>
        <nav class="nav">${nav}</nav>
        <div class="sidebar-card">
          <div class="eyebrow">Suggested flow</div>
          <p>1. Add one source. 2. Attach it to a notebook. 3. Generate a podcast first to verify the full stack.</p>
        </div>
        <div class="sidebar-card">
          <div class="eyebrow">Your workspace · Alpha</div>
          <p>Sources and text history stay in this browser. Selected text is sent to AI providers when you generate. Download audio before refreshing.</p>
        </div>
      </aside>
      <main class="main">
        <div class="mobile-nav">${mobileNav}</div>
        <div class="workspace-tools"><span>小理 AI 大脑 · v0.1 Alpha</span><button class="ghost" data-action="export-workspace">Export backup</button><button class="ghost" data-action="import-workspace">Import backup</button><input id="backup-import" type="file" accept=".json" hidden /></div>
        ${notice ? `<div role="status" class="status-banner status-warning">${escapeHtml(notice)}</div>` : ''}
        <div class="view">${content}</div>
      </main>
    </div>`;
}

function renderOverview() {
  return `
    <section class="panel hero">
      <div>
        <div class="pill">GPT TTS + notebook-style workflow</div>
        <h1 class="display" style="font-size:52px; margin-top:16px;">One surface for sources, podcasts, graph review, and companion loops</h1>
        <p class="muted">Upload study material, bind it to a notebook, generate a podcast or review brief, then move into the graph and companion pages.</p>
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:20px;">
          <button class="button" data-action="set-view" data-view="studio">Open Studio</button>
          <button class="ghost" data-action="set-view" data-view="library">Manage Library</button>
        </div>
      </div>
      <div class="hero-side">
        <div class="eyebrow">Current focus</div>
        <h3 class="display" style="font-size:28px; margin-top:8px;">Podcast, graph, and companion rebuild</h3>
        <p class="muted">The app is organized around a notebook workflow now instead of isolated AI cards.</p>
        <ul>
          <li>Podcast mode keeps script, audio, and follow-up in one workspace.</li>
          <li>The graph lets you search, click, and update mastery state.</li>
          <li>The companion panel behaves more like a mission coach.</li>
        </ul>
      </div>
    </section>
    <section class="stats">
      <div class="panel"><div class="eyebrow">Files</div><div class="stat-value">${state.files.length}</div><div class="muted">Seed sources plus new uploads</div></div>
      <div class="panel"><div class="eyebrow">Notebooks</div><div class="stat-value">${state.notebooks.length}</div><div class="muted">Source collections and output history</div></div>
      <div class="panel"><div class="eyebrow">Release</div><div class="stat-value">Alpha</div><div class="muted">Graph and companion are interactive demos</div></div>
    </section>`;
}

function renderLibrary() {
  return `
    <section class="split">
      <div class="stack">
        <div class="panel">
          <div class="pill">Source Shelf</div>
          <h1 class="display" style="font-size:42px; margin-top:16px;">Add PDF files, text files, or quick notes</h1>
          <p class="muted">PDF, text and markdown are read in your browser. Up to 10 MB per file, 100 PDF pages, and 100,000 text characters. Scanned PDFs require OCR first.</p>
          <div style="margin-top:20px; padding:28px; border:1px dashed #a5d97f; background:#f0fde6; border-radius:24px; text-align:center;">
            <div style="font-size:42px;">⇪</div>
            <p><strong>Upload PDF / TXT / MD</strong></p>
            <input id="file-upload" type="file" accept=".pdf,.txt,.md" multiple />
          </div>
        </div>
        <div class="panel">
          <div class="eyebrow">Quick note</div>
          <div class="stack" style="margin-top:16px;">
            <input class="field" name="draft-title" value="${escapeHtml(state.drafts.title)}" placeholder="Note title" />
            <select class="select" name="draft-subject">${Object.entries(SUBJECTS).map(([value, label]) => `<option value="${value}" ${state.drafts.subject === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
            <textarea class="textarea" name="draft-content" placeholder="Write a short note or summary here.">${escapeHtml(state.drafts.content)}</textarea>
            <button class="button" data-action="save-note">Save to library</button>
          </div>
        </div>
      </div>
      <div class="panel">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div><div class="eyebrow">Library</div><h2 class="display" style="font-size:32px; margin-top:8px;">Current sources</h2></div>
          <span class="ghost">${state.files.length} items</span>
        </div>
        <div class="stack" style="margin-top:20px;">${state.files.map((file) => `
          <div class="list-card">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
              <div>
                <strong>${escapeHtml(file.name)}</strong>
                <div class="muted" style="margin-top:8px; font-size:13px;">${SUBJECTS[file.subject]} / ${file.kind}</div>
              </div>
              <button class="ghost" data-action="delete-file" data-file-id="${file.id}">Delete</button>
            </div>
            <p class="muted" style="margin-top:14px;">${escapeHtml(String(file.content || '').slice(0, 220))}</p>
          </div>`).join('')}</div>
      </div>
    </section>`;
}

function renderStudio() {
  const notebook = getActiveNotebook();
  const files = getActiveFiles();
  const output = getCurrentOutput();
  return `
    <section class="split">
      <div class="stack">
        <div class="panel">
          <div class="eyebrow">Notebook Manager</div>
          <div style="display:flex; gap:12px; margin-top:16px;">
            <input class="field" name="draft-notebook-name" value="${escapeHtml(state.drafts.notebookName)}" placeholder="New notebook name" />
            <button class="button" data-action="create-notebook">Create</button>
          </div>
          <div class="stack" style="margin-top:18px;">${state.notebooks.map((item) => `
            <button class="source-item ${item.id === state.studio.activeNotebookId ? 'active' : ''}" data-action="select-notebook" data-notebook-id="${item.id}">
              <div style="display:flex; justify-content:space-between; gap:12px;">
                <strong>${escapeHtml(item.name)}</strong>
                <span class="muted">${item.fileIds.length} files</span>
              </div>
              <div class="muted" style="margin-top:8px; font-size:13px;">${item.history.length} outputs</div>
            </button>`).join('')}</div>
        </div>
        <div class="panel">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div><div class="eyebrow">Source Binding</div><p class="muted">Pick which files feed the current notebook.</p></div>
            <button class="ghost" data-action="set-view" data-view="library">Open library</button>
          </div>
          <div class="stack" style="margin-top:18px;">${state.files.map((file) => {
            const checked = notebook && notebook.fileIds.includes(file.id);
            return `<button class="source-item ${checked ? 'active' : ''}" data-action="toggle-file" data-file-id="${file.id}"><strong>${escapeHtml(file.name)}</strong><div class="muted" style="margin-top:8px; font-size:13px;">${SUBJECTS[file.subject]} / ${file.kind}</div></button>`;
          }).join('')}</div>
        </div>
      </div>
      <div class="stack">
        <div class="panel">
          <div class="pill">Generation Studio</div>
          <h1 class="display" style="font-size:44px; margin-top:16px;">Turn a notebook into audio, briefs, and maps</h1>
          <p class="muted">Current notebook: <strong>${notebook ? escapeHtml(notebook.name) : 'None'}</strong>. Attached files: ${files.length}/20. Generation uses excerpts from each source, up to 24,000 characters total; it does not read the full document.</p>
          <div class="tool-grid" style="margin-top:18px;">${Object.entries(TOOL_META).map(([id, meta]) => `
            <button class="tool-card ${state.studio.tool === id ? 'active' : ''}" data-action="select-tool" data-tool="${id}">
              <strong>${meta.label}</strong>
              <div style="margin-top:8px; font-size:14px;">${meta.description}</div>
            </button>`).join('')}</div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:18px;">
            <button class="button green" data-action="generate-output" ${state.studio.busy ? 'disabled' : ''}>${state.studio.busy ? 'Generating...' : `Generate ${TOOL_META[state.studio.tool].label}`}</button>
            <span class="ghost">Based on your selected source excerpts</span>
          </div>
          ${state.studio.message ? `<div class="status-banner status-${state.studio.tone}" style="margin-top:18px;">${escapeHtml(state.studio.message)}</div>` : ''}
        </div>
        ${renderOutput(output)}
        <div class="panel">
          <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;"><div><div class="eyebrow">History</div><h2 class="display" style="font-size:30px; margin-top:8px;">Notebook history</h2></div><span class="ghost">${notebook ? notebook.history.length : 0} items</span></div>
          <div class="stack" style="margin-top:18px;">${notebook && notebook.history.length ? notebook.history.map((item) => `
            <div class="history-item ${state.studio.selectedHistoryId === item.id || (!state.studio.selectedHistoryId && notebook.history[0]?.id === item.id) ? 'active' : ''}">
              <button style="all:unset; display:block; cursor:pointer; width:100%;" data-action="select-history" data-history-id="${item.id}">
                <strong>${escapeHtml(item.title)}</strong>
                <div class="muted" style="margin-top:8px; font-size:13px;">${TOOL_META[item.tool].label} / ${formatTime(item.createdAt)}</div>
              </button>
              <button class="ghost" style="margin-top:12px;" data-action="delete-history" data-history-id="${item.id}">Delete</button>
            </div>`).join('') : '<div class="list-card"><p class="muted">No outputs yet.</p></div>'}</div>
        </div>
      </div>
    </section>`;
}

function renderOutput(output) {
  if (!output) {
    return `<section class="panel"><div class="eyebrow">Output</div><h2 class="display" style="font-size:30px; margin-top:8px;">Current preview</h2><p class="muted" style="margin-top:16px;">Start with a podcast run to verify text generation, GPT TTS, and playback together.</p></section>`;
  }
  if (output.tool === 'podcast') return renderPodcastOutput(output);
  if (output.tool === 'mindmap') {
    return `<section class="panel"><div class="eyebrow">Output</div><h2 class="display" style="font-size:30px; margin-top:8px;">Mind map outline</h2><div class="markdown-output" style="margin-top:18px;">${markdownToHtml(output.data.markdown)}</div></section>`;
  }
  return `<section class="output-layout"><div class="panel"><div class="eyebrow">Output</div><h2 class="display" style="font-size:30px; margin-top:8px;">Study brief</h2><div class="markdown-output" style="margin-top:18px;">${markdownToHtml(output.data.markdown)}</div></div><aside class="stack"><div class="panel"><div class="eyebrow">Next steps</div><p>Move weak concepts into the graph, then regenerate the same notebook as a podcast for spaced repetition.</p></div><div class="panel"><div class="eyebrow">Sources</div>${(output.data.activeFileIds || []).map((id) => state.files.find((file) => file.id === id)).filter(Boolean).map((file) => `<div class="list-card" style="margin-top:12px;"><strong>${escapeHtml(file.name)}</strong></div>`).join('')}</div></aside></section>`;
}

function renderPodcastOutput(output) {
  const sourceFiles = (output.data.activeFileIds || []).map((id) => state.files.find((file) => file.id === id)).filter(Boolean);
  const transcriptBlocks = String(output.data.text || '').split(/\n{2,}/).filter(Boolean);
  const audioSrc = output.data.audioData && output.data.audioData.data ? `data:${output.data.audioData.mimeType || 'audio/mpeg'};base64,${output.data.audioData.data}` : '';
  return `
    <section class="podcast-layout">
      <div class="podcast-main stack">
        <div class="audio-panel">
          <div class="eyebrow">AI Podcast</div>
          <h2 class="display" style="font-size:30px; margin-top:8px;">Notebook mode podcast workspace</h2>
          <p class="muted">AI-generated voices. Text history is saved; audio lasts until this page closes. Download it to keep a copy.</p>
          ${audioSrc ? `<audio controls style="width:100%; margin-top:18px;" src="${audioSrc}"></audio>` : '<div class="status-banner status-warning" style="margin-top:18px;">Audio not available for this run.</div>'}
          ${audioSrc ? `<a class="ghost" href="${audioSrc}" download="xiaoli-podcast.mp3">Download audio</a>` : ''}
        </div>
        <div class="chat-panel">
          <div class="eyebrow">Transcript</div>
          <div class="transcript" style="margin-top:16px;">${transcriptBlocks.map((block) => {
            const hostA = /^(主持人A|Joe)\s*[：:]/.test(block);
            const hostB = /^(主持人B|Jane)\s*[：:]/.test(block);
            return `<div class="transcript-block ${hostA ? 'host-a' : hostB ? 'host-b' : ''}">${markdownToHtml(block)}</div>`;
          }).join('')}</div>
        </div>
        <div class="chat-panel">
          <div class="eyebrow">Follow-up</div>
          <div class="chat-thread" style="margin-top:16px;">${state.studio.followups.length ? state.studio.followups.map((item) => `<div class="followup-bubble ${item.role === 'user' ? 'user' : ''}">${markdownToHtml(item.content)}</div>`).join('') : '<div class="followup-bubble">Ask what the exam focus is, request a simpler explanation, or ask for a real-life example.</div>'}</div>
          <div style="display:flex; gap:12px; margin-top:16px;">
            <input class="field" name="draft-followup" value="${escapeHtml(state.drafts.followupInput)}" placeholder="Ask a follow-up about this podcast" />
            <button class="button green" data-action="send-followup" ${state.studio.followupBusy ? 'disabled' : ''}>${state.studio.followupBusy ? 'Sending...' : 'Send'}</button>
          </div>
        </div>
      </div>
      <aside class="stack">
        <div class="panel"><div class="eyebrow">Sources</div>${sourceFiles.map((file) => `<div class="list-card" style="margin-top:12px;"><strong>${escapeHtml(file.name)}</strong><div class="muted" style="margin-top:8px; font-size:13px;">${SUBJECTS[file.subject]} / ${file.kind}</div></div>`).join('')}</div>
        <div class="panel"><div class="eyebrow">Use it like this</div><p>Listen once, ask a follow-up, then move the weak topic into the graph so the review loop keeps going.</p></div>
      </aside>
    </section>`;
}
function renderGraph() {
  const subject = state.graph.subject;
  const query = state.graph.query.trim().toLowerCase();
  const visible = GRAPH_NODES.filter((node) => (subject === 'all' || node.subject === subject) && (!query || `${node.label} ${node.summary}`.toLowerCase().includes(query)));
  const selected = visible.find((node) => node.id === state.graph.selectedId) || visible[0] || GRAPH_NODES[0];
  if (selected) state.graph.selectedId = selected.id;
  const links = visible.flatMap((node) => node.related.filter((target) => visible.some((item) => item.id === target)).map((target) => ({ source: node.id, target })));
  const subjectButtons = ['all', 'physics', 'math', 'history', 'programming'].map((value) => `<button class="ghost ${state.graph.subject === value ? 'active' : ''}" data-action="set-graph-subject" data-subject="${value}">${value}</button>`).join('');
  return `
    <section class="graph-shell">
      <div class="panel">
        <div class="eyebrow">Knowledge Graph</div>
        <h1 class="display" style="font-size:40px; margin-top:8px;">Interactive concept graph</h1>
        <p class="muted">Demo concept graph: search preset nodes and save mastery state. Nodes are not extracted from your uploaded sources.</p>
        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:18px;">${subjectButtons}</div>
        <input class="field" style="margin-top:16px;" name="graph-query" value="${escapeHtml(state.graph.query)}" placeholder="Search concept" />
        <svg class="graph-canvas" viewBox="0 0 980 520" style="margin-top:18px;">${links.map((link) => {
          const a = visible.find((item) => item.id === link.source);
          const b = visible.find((item) => item.id === link.target);
          return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#cfdae3" stroke-width="2" />`;
        }).join('')}${visible.map((node) => {
          const mastery = state.graph.mastery[node.id] || node.mastery;
          const color = mastery === 'mastered' ? '#69c247' : mastery === 'review' ? '#f5b341' : mastery === 'learning' ? '#4da4ff' : '#94a3b8';
          return `<g data-action="select-graph-node" data-node-id="${node.id}" style="cursor:pointer;"><circle cx="${node.x}" cy="${node.y}" r="34" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="3" /><text x="${node.x}" y="${node.y + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="#10212f">${escapeHtml(node.label)}</text></g>`;
        }).join('')}</svg>
      </div>
      <aside class="stack">
        <div class="panel">
          <div class="eyebrow">Selected node</div>
          <h2 class="display" style="font-size:28px; margin-top:8px;">${escapeHtml(selected.label)}</h2>
          <p class="muted">${escapeHtml(selected.summary)}</p>
          <label class="eyebrow" style="display:block; margin-top:16px;">Mastery</label>
          <select class="select" name="graph-mastery" data-node-id="${selected.id}" style="margin-top:8px;">
            ${['mastered', 'learning', 'review', 'locked'].map((value) => `<option value="${value}" ${(state.graph.mastery[selected.id] || selected.mastery) === value ? 'selected' : ''}>${value}</option>`).join('')}
          </select>
          <div class="graph-node-card" style="margin-top:16px;"><strong>Next step</strong><p class="muted">${escapeHtml(selected.next)}</p></div>
        </div>
      </aside>
    </section>`;
}

function renderCompanion() {
  const companion = COMPANIONS.find((item) => item.id === state.companion.selectedId) || COMPANIONS[0];
  const completed = state.companion.quests.filter((item) => item.done).length;
  const progress = Math.round((completed / state.companion.quests.length) * 100);
  const actionText = {
    [ACTIONS[0]]: 'We start with the mistakes that keep repeating and remove them one by one.',
    [ACTIONS[1]]: 'Short round, fast feedback, clear win. We do not need a marathon to make progress.',
    [ACTIONS[2]]: 'Fifteen minute blocks work because each one has a clear end and an easy restart.',
    [ACTIONS[3]]: 'You are not restarting from zero. Today only needs one more step than yesterday.'
  }[state.companion.activeAction];

  return `
    <section class="companion-shell">
      <div class="stack">
        <div class="panel companion-hero">
          <div>
            <div class="pill">Companion demo · sample stats</div>
            <h1 class="display" style="font-size:44px; margin-top:16px;">Choose a study companion</h1>
            <p class="muted">Try preset encouragement and sample quests. Streaks, XP and hearts are demonstration values; quests reset when you reload.</p>
            <div class="card-grid" style="margin-top:18px;">
              <div class="companion-card"><div class="eyebrow">Streak</div><div class="stat-value">12</div><div class="muted">Keep momentum alive</div></div>
              <div class="companion-card"><div class="eyebrow">Hearts</div><div class="stat-value">5/5</div><div class="muted">Room to try and fail</div></div>
              <div class="companion-card"><div class="eyebrow">XP</div><div class="stat-value">180</div><div class="muted">Every quest moves the bar</div></div>
            </div>
          </div>
          <div class="companion-card" style="background:#112536; color:white;">
            <div class="avatar-badge" style="background:${companion.gradient};">${companion.emoji}</div>
            <div class="eyebrow" style="margin-top:16px; color:#cdeab8;">Current partner</div>
            <h2 class="display" style="font-size:30px; margin-top:8px;">${escapeHtml(companion.name)}</h2>
            <p>${escapeHtml(companion.title)}</p>
            <div class="followup-bubble" style="margin-top:16px; background:rgba(255,255,255,.08); border-color:rgba(255,255,255,.12);">${escapeHtml(actionText)}</div>
          </div>
        </div>
        <div class="panel">
          <div class="eyebrow">Choose your companion</div>
          <div class="card-grid" style="margin-top:18px;">${COMPANIONS.map((item) => `<button class="companion-card" data-action="select-companion" data-companion-id="${item.id}"><div class="avatar-badge" style="width:96px; height:96px; font-size:42px; background:${item.gradient};">${item.emoji}</div><h3 class="display" style="font-size:26px; margin-top:16px;">${escapeHtml(item.name)}</h3><p class="muted">${escapeHtml(item.title)}</p></button>`).join('')}</div>
        </div>
      </div>
      <aside class="stack">
        <div class="panel">
          <div class="eyebrow">Today quests</div>
          <div style="height:10px; background:#e2e8f0; border-radius:999px; margin-top:12px; overflow:hidden;"><div style="width:${progress}%; height:100%; background:linear-gradient(90deg,#69c247 0%,#d8ff81 100%);"></div></div>
          <p class="muted">${completed}/${state.companion.quests.length} completed</p>
          <div class="stack" style="margin-top:16px;">${state.companion.quests.map((quest) => `<button class="quest-item ${quest.done ? 'active' : ''}" data-action="toggle-quest" data-quest-id="${quest.id}"><strong>${escapeHtml(quest.title)}</strong><div class="muted" style="margin-top:8px; font-size:13px;">Reward: ${escapeHtml(quest.reward)}</div></button>`).join('')}</div>
        </div>
        <div class="panel">
          <div class="eyebrow">Quick actions</div>
          <div class="stack" style="margin-top:16px;">${ACTIONS.map((action) => `<button class="source-item ${state.companion.activeAction === action ? 'active' : ''}" data-action="set-companion-action" data-companion-action="${escapeHtml(action)}">${escapeHtml(action)}</button>`).join('')}</div>
        </div>
      </aside>
    </section>`;
}

function render() {
  ensureNotebook();
  save();
  let content = renderOverview();
  if (state.view === 'library') content = renderLibrary();
  if (state.view === 'studio') content = renderStudio();
  if (state.view === 'graph') content = renderGraph();
  if (state.view === 'companion') content = renderCompanion();
  document.getElementById('app').innerHTML = renderLayout(content);
}

async function handleFiles(files) {
  const next = [];
  notice = '';
  for (const file of Array.from(files || [])) {
    const lower = file.name.toLowerCase();
    const subject = lower.includes('physics') ? 'physics' : lower.includes('math') ? 'math' : lower.includes('history') ? 'history' : lower.includes('code') || lower.includes('program') ? 'programming' : 'general';
    try {
      if (state.files.length + next.length >= 200) throw new Error('A workspace can have at most 200 sources.');
      const content = await readSource(file);
      next.push({ id: `upload-${uniqueId()}`, name: file.name.slice(0, 300), subject, kind: lower.endsWith('.pdf') ? 'pdf' : 'text', content, createdAt: new Date().toISOString() });
    } catch (error) { notice += `${file.name}: ${error.message} `; }
  }
  try {
    const files = [...next, ...state.files];
    snapshot({ ...state, files });
    state.files = files;
  } catch (error) { notice = `Import was not saved: ${error.message}`; }
  render();
}

async function generateOutput() {
  const notebook = getActiveNotebook();
  const files = getActiveFiles();
  if (!notebook) return setMessage('Create a notebook first.', 'error'), render();
  if (!files.length) return setMessage('Attach at least one source file.', 'error'), render();
  state.studio.busy = true;
  setMessage('Working...', 'success');
  render();
  try {
    const context = buildContext(files);
    const sourceNames = files.map((file) => file.name).join(', ');
    const stamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    let entry;
    if (state.studio.tool === 'summary') {
      const data = await postJson('/api/gemini/generate', { prompt: `Write a Chinese Markdown study brief.\n\nNotebook: ${notebook.name}\nSources: ${sourceNames}\n\nInclude sections named Core Concepts, Exam Focus, Common Mistakes, and Quick Memory.\n\nSource material:\n${context}` });
      entry = { id: `entry-${Date.now()}`, tool: 'summary', createdAt: new Date().toISOString(), title: `${notebook.name} / Study Brief / ${stamp}`, data: { markdown: data.text, activeFileIds: files.map((file) => file.id) } };
    } else if (state.studio.tool === 'mindmap') {
      const data = await postJson('/api/gemini/generate', { prompt: `Write a Chinese Markdown outline for Markmap.\n\nNotebook: ${notebook.name}\nSources: ${sourceNames}\n\nFirst line must be a level-1 heading. Use headings and bullet points only.\n\nSource material:\n${context}` });
      const markdown = String(data.text || '').trim().startsWith('#') ? data.text : `# ${notebook.name}\n\n${data.text || ''}`;
      entry = { id: `entry-${Date.now()}`, tool: 'mindmap', createdAt: new Date().toISOString(), title: `${notebook.name} / Mind Map / ${stamp}`, data: { markdown, activeFileIds: files.map((file) => file.id) } };
    } else {
      const script = await postJson('/api/gemini/generate', { prompt: `Write a Chinese dual-host study podcast script, at most 4000 characters and 12 paragraphs.\n\nNotebook: ${notebook.name}\nSources: ${sourceNames}\n\nAlternate each paragraph between 主持人A： and 主持人B：. Keep it grounded in the material. End with a review action.\n\nSource material:\n${context}` });
      let audioData = null;
      try { audioData = await postJson('/api/audio/podcast-tts', { text: script.text }); } catch (error) { console.error(error); }
      entry = { id: `entry-${Date.now()}`, tool: 'podcast', createdAt: new Date().toISOString(), title: `${notebook.name} / AI Podcast / ${stamp}`, data: { text: script.text, audioData, activeFileIds: files.map((file) => file.id) } };
      state.studio.followups = [];
    }
    const history = [entry, ...notebook.history].slice(0, 12);
    snapshot({ ...state, notebooks: state.notebooks.map(book => book.id === notebook.id ? { ...book, history } : book) });
    notebook.history = history;
    state.studio.selectedHistoryId = entry.id;
    setMessage(entry.tool === 'podcast' && !entry.data.audioData ? 'Script generated. Audio did not return from GPT TTS.' : `${TOOL_META[entry.tool].label} is ready.`, entry.tool === 'podcast' && !entry.data.audioData ? 'warning' : 'success');
  } catch (error) {
    console.error(error);
    setMessage(error.message || 'Generation failed.', 'error');
  } finally {
    state.studio.busy = false;
    render();
  }
}

async function sendFollowup() {
  const output = getCurrentOutput();
  if (!output || output.tool !== 'podcast' || !state.drafts.followupInput.trim()) return;
  state.studio.followupBusy = true;
  state.studio.followups.push({ role: 'user', content: state.drafts.followupInput.trim() });
  const question = state.drafts.followupInput.trim();
  state.drafts.followupInput = '';
  render();
  try {
    const activeFiles = getActiveFiles();
    const data = await postJson('/api/gemini/generate', { prompt: `You are a notebook-style study host. Answer in Chinese Markdown.\n\nSources: ${activeFiles.map((file) => file.name).join(', ')}\n\nPodcast script:\n${output.data.text}\n\nQuestion: ${question}` });
    state.studio.followups.push({ role: 'ai', content: data.text });
  } catch (error) {
    state.studio.followups.push({ role: 'ai', content: 'The follow-up request failed. Please try again.' });
  } finally {
    state.studio.followupBusy = false;
    render();
  }
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'import-workspace') { document.getElementById('backup-import').click(); return; }
  if (action === 'export-workspace') {
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot(state), null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = `xiaoli-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { notice = error.message; }
  }
  if (action === 'save-note') {
    if (!state.drafts.content.trim() || state.drafts.content.length > 100000 || state.files.length >= 200) notice = 'Enter 1–100,000 characters; keep at most 200 sources.';
    else {
      try {
        const files = [{ id: `note-${uniqueId()}`, name: state.drafts.title.trim().slice(0, 300) || 'Untitled note', subject: state.drafts.subject, kind: 'note', content: state.drafts.content, createdAt: new Date().toISOString() }, ...state.files];
        snapshot({ ...state, files });
        state.files = files;
        state.drafts.title = ''; state.drafts.content = ''; notice = 'Note saved. Attach it to a notebook in Studio to use it.';
      } catch (error) { notice = error.message; }
    }
  }
  if (action === 'set-view') state.view = target.dataset.view;
  if (action === 'create-notebook') {
    if (state.notebooks.length >= 100) { notice = 'A workspace can have at most 100 notebooks.'; return render(); }
    const name = state.drafts.notebookName.trim().slice(0, 300) || `Notebook ${state.notebooks.length + 1}`;
    const notebooks = [{ id: `notebook-${uniqueId()}`, name, fileIds: state.files.slice(0, 2).map((file) => file.id), history: [] }, ...state.notebooks];
    try { snapshot({ ...state, notebooks }); }
    catch (error) { notice = error.message; return render(); }
    state.notebooks = notebooks;
    state.studio.activeNotebookId = state.notebooks[0].id;
    state.drafts.notebookName = '';
  }
  if (action === 'select-notebook') state.studio.activeNotebookId = target.dataset.notebookId;
  if (action === 'toggle-file') {
    const notebook = getActiveNotebook();
    if (notebook.fileIds.includes(target.dataset.fileId)) notebook.fileIds = notebook.fileIds.filter((id) => id !== target.dataset.fileId);
    else if (notebook.fileIds.length < 20) notebook.fileIds.push(target.dataset.fileId);
    else notice = 'Attach at most 20 sources to a notebook.';
  }
  if (action === 'delete-file') {
    state.files = state.files.filter((file) => file.id !== target.dataset.fileId);
    state.notebooks.forEach((notebook) => { notebook.fileIds = notebook.fileIds.filter((id) => id !== target.dataset.fileId); });
  }
  if (action === 'select-tool') state.studio.tool = target.dataset.tool;
  if (action === 'generate-output') generateOutput();
  if (action === 'select-history') state.studio.selectedHistoryId = target.dataset.historyId;
  if (action === 'delete-history') {
    const notebook = getActiveNotebook();
    notebook.history = notebook.history.filter((item) => item.id !== target.dataset.historyId);
    if (state.studio.selectedHistoryId === target.dataset.historyId) state.studio.selectedHistoryId = '';
  }
  if (action === 'send-followup') sendFollowup();
  if (action === 'set-graph-subject') state.graph.subject = target.dataset.subject;
  if (action === 'select-graph-node') state.graph.selectedId = target.dataset.nodeId;
  if (action === 'select-companion') state.companion.selectedId = target.dataset.companionId;
  if (action === 'toggle-quest') {
    const quest = state.companion.quests.find((item) => item.id === target.dataset.questId);
    if (quest) quest.done = !quest.done;
  }
  if (action === 'set-companion-action') state.companion.activeAction = target.dataset.companionAction;
  render();
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (target.name === 'draft-title') state.drafts.title = target.value;
  if (target.name === 'draft-content') state.drafts.content = target.value;
  if (target.name === 'draft-notebook-name') state.drafts.notebookName = target.value;
  if (target.name === 'draft-followup') state.drafts.followupInput = target.value;
  if (target.name === 'graph-query') state.graph.query = target.value;
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.id === 'file-upload') { handleFiles(target.files); return; }
  if (target.id === 'backup-import') { importBackup(target.files?.[0]); return; }
  if (!['draft-subject', 'graph-mastery', 'graph-query'].includes(target.name)) return;
  if (target.name === 'draft-subject') state.drafts.subject = target.value;
  if (target.name === 'graph-mastery') state.graph.mastery[target.dataset.nodeId] = target.value;
  render();
});

async function importBackup(file) {
  if (!file) return;
  try {
    if (file.size > 6000000) throw new Error('Backup must be at most 6 MB.');
    const data = validateWorkspace(JSON.parse(await file.text()));
    if (!window.confirm('Replace this browser’s workspace with the backup? Export the current workspace first if you need it.')) return;
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(data));
    window.location.reload();
  } catch (error) { notice = `Import failed: ${error.message}`; render(); }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.target.name === 'draft-followup') {
    event.preventDefault();
    sendFollowup();
  }
});

try {
  const clean = snapshot(state);
  state.files = clean.files; state.notebooks = clean.notebooks; state.graph.mastery = clean.graphMastery;
}
catch {
  savingBlocked = true;
  state.files = structuredClone(DEMO_FILES);
  state.notebooks = structuredClone(DEMO_NOTEBOOKS);
  state.graph.mastery = Object.fromEntries(GRAPH_NODES.map(node => [node.id, node.mastery]));
  notice = 'Stored data could not be validated. Original storage was preserved. Import a valid backup to continue saving.';
}
render();
