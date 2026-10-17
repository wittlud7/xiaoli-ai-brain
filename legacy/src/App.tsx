import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  FileText,
  FolderOpen,
  Headphones,
  Network,
  PenSquare,
  PlayCircle,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  UserCircle,
} from 'lucide-react';
import { generateAIContent, generateAudioContent } from './services/geminiService';
import { MindmapViewer } from './components/MindmapViewer';
import { PodcastPlayer } from './components/PodcastPlayer';
import { KnowledgeGraphExplorer } from './components/KnowledgeGraphExplorer';
import { CompanionArena } from './components/CompanionArena';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type View = 'dashboard' | 'knowledge' | 'generation' | 'graph' | 'avatar';
type Subject = 'general' | 'physics' | 'math' | 'history' | 'programming';
type ToolId = 'podcast' | 'summary' | 'mindmap';

type KnowledgeFile = {
  id: string;
  name: string;
  subject: Subject;
  kind: 'note' | 'pdf' | 'text';
  content: string;
  createdAt: string;
};

type ToolEntry = {
  id: string;
  tool: ToolId;
  createdAt: string;
  title: string;
  data: any;
};

type Notebook = {
  id: string;
  name: string;
  fileIds: string[];
  history: ToolEntry[];
};

const STORE = {
  files: 'xiaoli-files-v5',
  notebooks: 'xiaoli-notebooks-v5',
};

const SUBJECTS: Record<Subject, string> = {
  general: 'General',
  physics: 'Physics',
  math: 'Math',
  history: 'History',
  programming: 'Programming',
};

const TOOL_META: Record<ToolId, { label: string; description: string; icon: LucideIcon }> = {
  podcast: {
    label: 'AI Podcast',
    description: 'Generate a dual-host script and synthesize GPT TTS audio.',
    icon: Headphones,
  },
  summary: {
    label: 'Study Brief',
    description: 'Turn source notes into a compact review sheet.',
    icon: FileText,
  },
  mindmap: {
    label: 'Mind Map',
    description: 'Render a Markmap-ready knowledge structure.',
    icon: Network,
  },
};

const DEMO_FILES: KnowledgeFile[] = [
  {
    id: 'physics-demo',
    name: 'Newton law review',
    subject: 'physics',
    kind: 'note',
    createdAt: '2026-03-12',
    content: 'Newton second law links net force and acceleration. Start from a force diagram, choose axes, then write F = ma. Inclines, elevators, and conveyor belts are the most error-prone scenes.',
  },
  {
    id: 'math-demo',
    name: 'Derivative sprint notes',
    subject: 'math',
    kind: 'text',
    createdAt: '2026-03-11',
    content: 'Derivatives are used for monotonicity, extrema, and optimization. Define the domain, compute the derivative, then discuss sign changes. Parameter problems need careful boundary checks.',
  },
  {
    id: 'history-demo',
    name: 'Industrial revolution timeline',
    subject: 'history',
    kind: 'note',
    createdAt: '2026-03-10',
    content: 'The industrial revolution began in Britain because of capital, markets, technology, and institutions. Essays are strongest when framed as background, process, and impact.',
  },
];

const DEMO_NOTEBOOKS: Notebook[] = [
  { id: 'default-notebook', name: 'Exam Sprint Notebook', fileIds: ['physics-demo', 'math-demo'], history: [] },
];

const NAV_ITEMS: Array<{ id: View; label: string; hint: string; icon: LucideIcon }> = [
  { id: 'dashboard', label: 'Overview', hint: 'Main workspace', icon: BrainCircuit },
  { id: 'knowledge', label: 'Library', hint: 'Upload and edit sources', icon: FolderOpen },
  { id: 'generation', label: 'Studio', hint: 'Podcast, brief, map', icon: Headphones },
  { id: 'graph', label: 'Graph', hint: 'Interactive concept map', icon: Network },
  { id: 'avatar', label: 'Companion', hint: 'Duolingo-style coach', icon: UserCircle },
];

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function trimForPrompt(text: string, limit = 2200) {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > limit ? `${compact.slice(0, limit)} ...` : compact;
}

function buildKnowledgeContext(files: KnowledgeFile[]) {
  return files
    .map((file, index) => [
      `Source ${index + 1}`,
      `Title: ${file.name}`,
      `Subject: ${SUBJECTS[file.subject]}`,
      `Type: ${file.kind}`,
      `Content: ${trimForPrompt(file.content)}`,
    ].join('\n'))
    .join('\n\n');
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[1.4rem] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{hint}</p>
    </div>
  );
}

function Dashboard({
  files,
  notebooks,
  setView,
}: {
  files: KnowledgeFile[];
  notebooks: Notebook[];
  setView: (view: View) => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="grid gap-8 p-6 md:grid-cols-[minmax(0,1.05fr)_360px] md:p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Sparkles className="h-4 w-4" />
                GPT TTS + Notebook-style workflow
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900 md:text-5xl" style={{ fontFamily: 'var(--font-display)' }}>
                One study surface for sources, podcasts, graph exploration, and companion loops
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                Upload material, bind it to a notebook, generate a podcast or review brief, then move into the knowledge graph and companion experience. The podcast voice path now uses GPT TTS end to end.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button onClick={() => setView('generation')} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                  Open Generation Studio
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button onClick={() => setView('knowledge')} className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                  Manage Library
                </button>
              </div>
            </div>
            <div className="rounded-[1.7rem] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(163,230,53,0.18),_transparent_22%),linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                  <Headphones className="h-7 w-7" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Current focus</p>
                  <p className="text-xs text-slate-500">Podcast, graph, and companion rebuild</p>
                </div>
              </div>
              <ul className="mt-5 space-y-3 text-sm leading-7 text-slate-600">
                <li>Podcast mode behaves more like a notebook workspace than a single audio card.</li>
                <li>The graph is searchable, selectable, and stateful.</li>
                <li>The companion page now acts like a lightweight mission coach.</li>
              </ul>
            </div>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Files" value={String(files.length)} hint="Seed sources plus new uploads" />
          <Stat label="Notebooks" value={String(notebooks.length)} hint="Collections of sources and outputs" />
          <Stat label="Port" value="3000" hint="Server is intended to be reachable on 0.0.0.0" />
        </section>
      </div>
    </motion.div>
  );
}

function KnowledgeBase({
  files,
  setFiles,
  setNotebooks,
}: {
  files: KnowledgeFile[];
  setFiles: React.Dispatch<React.SetStateAction<KnowledgeFile[]>>;
  setNotebooks: React.Dispatch<React.SetStateAction<Notebook[]>>;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState<Subject>('general');
  const [uploading, setUploading] = useState(false);

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== fileId));
    setNotebooks((prev) => prev.map((notebook) => ({ ...notebook, fileIds: notebook.fileIds.filter((id) => id !== fileId) })));
  };

  const addManual = () => {
    if (!title.trim() || !content.trim()) return;
    setFiles((prev) => [{
      id: `manual-${Date.now()}`,
      name: title.trim(),
      subject,
      kind: 'note',
      content: content.trim(),
      createdAt: new Date().toISOString(),
    }, ...prev]);
    setTitle('');
    setContent('');
  };

  const readPdf = async (file: File) => {
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const parts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();
      parts.push(text.items.map((item: any) => item.str || '').join(' '));
    }
    return parts.join('\n');
  };

  const uploadFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files || []);
    if (!picked.length) return;
    setUploading(true);
    try {
      const next = await Promise.all(picked.map(async (file) => {
        const lower = file.name.toLowerCase();
        const text = lower.endsWith('.pdf') ? await readPdf(file) : await file.text();
        const guessed: Subject =
          lower.includes('physics') ? 'physics' :
          lower.includes('math') ? 'math' :
          lower.includes('history') ? 'history' :
          lower.includes('code') || lower.includes('program') ? 'programming' :
          'general';

        return {
          id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          subject: guessed,
          kind: lower.endsWith('.pdf') ? 'pdf' : 'text',
          content: text,
          createdAt: new Date().toISOString(),
        } as KnowledgeFile;
      }));

      setFiles((prev) => [...next, ...prev]);
      event.target.value = '';
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <FolderOpen className="h-4 w-4" />
              Source Shelf
            </div>
            <h1 className="mt-4 text-4xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
              Add PDF files, text files, or quick notes
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Uploaded content flows directly into the notebook workspace. This is the fastest way to test the end-to-end generation loop.
            </p>
            <label className="mt-6 flex cursor-pointer flex-col items-center justify-center rounded-[1.8rem] border border-dashed border-emerald-300 bg-emerald-50 px-6 py-10 text-center transition hover:border-emerald-400 hover:bg-emerald-100/60">
              <UploadCloud className="h-10 w-10 text-emerald-600" />
              <p className="mt-4 text-lg font-bold text-slate-900">Upload PDF / TXT / MD</p>
              <p className="mt-2 text-sm text-slate-500">{uploading ? 'Parsing file content...' : 'PDF pages are converted to plain text automatically.'}</p>
              <input type="file" accept=".pdf,.txt,.md" multiple className="hidden" onChange={uploadFiles} />
            </label>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <PenSquare className="h-4 w-4 text-sky-500" />
              Quick note
            </div>
            <div className="mt-4 grid gap-4">
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Note title" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white" />
              <select value={subject} onChange={(event) => setSubject(event.target.value as Subject)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white">
                {Object.entries(SUBJECTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={9} placeholder="Write a short note or a review summary here." className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-7 text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white" />
              <button onClick={addManual} className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                <Plus className="h-4 w-4" />
                Save to library
              </button>
            </div>
          </div>
        </section>
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Library</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Current sources</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{files.length} items</span>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {files.map((file) => (
              <div key={file.id} className="rounded-[1.6rem] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-slate-900">{file.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-white px-3 py-1 text-slate-600">{SUBJECTS[file.subject]}</span>
                      <span className="rounded-full bg-white px-3 py-1 text-slate-500">{file.kind}</span>
                    </div>
                  </div>
                  <button onClick={() => removeFile(file.id)} className="rounded-full bg-white p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4 max-h-28 overflow-hidden text-sm leading-7 text-slate-600">{file.content || 'No content.'}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </motion.div>
  );
}

function GenerationStudio({
  files,
  notebooks,
  setNotebooks,
  setView,
}: {
  files: KnowledgeFile[];
  notebooks: Notebook[];
  setNotebooks: React.Dispatch<React.SetStateAction<Notebook[]>>;
  setView: (view: View) => void;
}) {
  const [activeNotebookId, setActiveNotebookId] = useState(notebooks[0]?.id || '');
  const [tool, setTool] = useState<ToolId>('podcast');
  const [newNotebookName, setNewNotebookName] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'warning' | 'error'>('success');
  const [currentOutput, setCurrentOutput] = useState<ToolEntry | null>(null);

  useEffect(() => {
    if (!notebooks.length) {
      setActiveNotebookId('');
      setCurrentOutput(null);
      return;
    }

    if (!notebooks.some((notebook) => notebook.id === activeNotebookId)) {
      setActiveNotebookId(notebooks[0].id);
    }
  }, [activeNotebookId, notebooks]);

  const activeNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === activeNotebookId) || null,
    [activeNotebookId, notebooks],
  );

  useEffect(() => {
    if (!activeNotebook) {
      setCurrentOutput(null);
      return;
    }

    setCurrentOutput((prev) => {
      if (prev && activeNotebook.history.some((entry) => entry.id === prev.id)) {
        return activeNotebook.history.find((entry) => entry.id === prev.id) || prev;
      }
      return activeNotebook.history[0] || null;
    });
  }, [activeNotebook]);

  const activeFiles = useMemo(() => {
    if (!activeNotebook) return [];
    return files.filter((file) => activeNotebook.fileIds.includes(file.id));
  }, [activeNotebook, files]);

  const outputFiles = useMemo(() => {
    if (!currentOutput?.data?.activeFileIds) return activeFiles;
    const visible = files.filter((file) => currentOutput.data.activeFileIds.includes(file.id));
    return visible.length ? visible : activeFiles;
  }, [activeFiles, currentOutput, files]);

  const createNotebook = () => {
    const notebook: Notebook = {
      id: `notebook-${Date.now()}`,
      name: newNotebookName.trim() || `Notebook ${notebooks.length + 1}`,
      fileIds: files.slice(0, Math.min(files.length, 2)).map((file) => file.id),
      history: [],
    };

    setNotebooks((prev) => [notebook, ...prev]);
    setActiveNotebookId(notebook.id);
    setNewNotebookName('');
    setMessageTone('success');
    setMessage('Notebook created. Bind files and start generating.');
  };

  const toggleFile = (fileId: string) => {
    if (!activeNotebook) return;
    setNotebooks((prev) => prev.map((notebook) => (
      notebook.id === activeNotebook.id
        ? {
            ...notebook,
            fileIds: notebook.fileIds.includes(fileId)
              ? notebook.fileIds.filter((id) => id !== fileId)
              : [...notebook.fileIds, fileId],
          }
        : notebook
    )));
  };

  const deleteHistory = (entryId: string) => {
    if (!activeNotebook) return;
    setNotebooks((prev) => prev.map((notebook) => (
      notebook.id === activeNotebook.id
        ? { ...notebook, history: notebook.history.filter((entry) => entry.id !== entryId) }
        : notebook
    )));
    setCurrentOutput((prev) => (prev?.id === entryId ? null : prev));
  };

  const runGeneration = async () => {
    if (!activeNotebook) {
      setMessageTone('error');
      setMessage('Create a notebook first.');
      return;
    }

    if (!activeFiles.length) {
      setMessageTone('error');
      setMessage('Bind at least one source file to the notebook.');
      return;
    }

    setIsGenerating(true);
    setMessage('');

    try {
      const context = buildKnowledgeContext(activeFiles);
      const sourceNames = activeFiles.map((file) => file.name).join(', ');
      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      let entry: ToolEntry;

      if (tool === 'summary') {
        const markdown = await generateAIContent(
          `Write a concise Chinese study brief in Markdown.

Notebook: ${activeNotebook.name}
Sources: ${sourceNames}

Requirements:
1. Use Chinese.
2. Include sections named Core Concepts, Exam Focus, Common Mistakes, and Quick Memory.
3. Stay grounded in the source material.
4. Keep it readable for a student review session.

Source material:
${context}`,
        );

        entry = {
          id: `entry-${Date.now()}`,
          tool,
          createdAt: new Date().toISOString(),
          title: `${activeNotebook.name} / Study Brief / ${timestamp}`,
          data: {
            markdown,
            activeFileIds: activeFiles.map((file) => file.id),
          },
        };
      } else if (tool === 'mindmap') {
        let markdown = await generateAIContent(
          `Write a Chinese Markdown outline for Markmap.

Notebook: ${activeNotebook.name}
Sources: ${sourceNames}

Rules:
1. Output Markdown only.
2. First line must be a level-1 heading.
3. Use headings and bullet points.
4. Organize ideas as concepts, links, examples, and pitfalls.

Source material:
${context}`,
        );

        if (!markdown.trim().startsWith('#')) {
          markdown = `# ${activeNotebook.name}\n\n${markdown}`;
        }

        entry = {
          id: `entry-${Date.now()}`,
          tool,
          createdAt: new Date().toISOString(),
          title: `${activeNotebook.name} / Mind Map / ${timestamp}`,
          data: {
            markdown,
            activeFileIds: activeFiles.map((file) => file.id),
          },
        };
      } else {
        const text = await generateAIContent(
          `Write a Chinese dual-host study podcast script.

Notebook: ${activeNotebook.name}
Sources: ${sourceNames}

Rules:
1. Alternate each paragraph between "主持人A：" and "主持人B：".
2. Produce 12 to 16 turns.
3. Host A frames the topic. Host B asks follow-up questions, gives examples, and flags mistakes.
4. End with a short review action.
5. Keep it grounded in the material and avoid filler.

Source material:
${context}`,
        );

        const audioData = await generateAudioContent(text);

        entry = {
          id: `entry-${Date.now()}`,
          tool,
          createdAt: new Date().toISOString(),
          title: `${activeNotebook.name} / AI Podcast / ${timestamp}`,
          data: {
            text,
            audioData,
            activeFileIds: activeFiles.map((file) => file.id),
          },
        };
      }

      setNotebooks((prev) => prev.map((notebook) => (
        notebook.id === activeNotebook.id
          ? { ...notebook, history: [entry, ...notebook.history].slice(0, 12) }
          : notebook
      )));

      setCurrentOutput(entry);

      if (tool === 'podcast' && !entry.data.audioData) {
        setMessageTone('warning');
        setMessage('Script generated, but audio did not come back. Check OPENAI_API_KEY and server logs.');
      } else {
        setMessageTone('success');
        setMessage(`${TOOL_META[tool].label} is ready.`);
      }
    } catch (error: any) {
      console.error('Generation failed:', error);
      setMessageTone('error');
      setMessage(error?.message || 'Generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 overflow-y-auto p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <BookOpen className="h-4 w-4 text-emerald-500" />
                Notebook Manager
              </div>
              <div className="mt-4 flex gap-3">
                <input value={newNotebookName} onChange={(event) => setNewNotebookName(event.target.value)} placeholder="New notebook name" className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white" />
                <button onClick={createNotebook} className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {notebooks.map((notebook) => (
                  <button key={notebook.id} onClick={() => setActiveNotebookId(notebook.id)} className={`w-full rounded-[1.5rem] border p-4 text-left transition ${activeNotebookId === notebook.id ? 'border-emerald-300 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-white'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-slate-900">{notebook.name}</p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">{notebook.fileIds.length} files</span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-slate-500">{notebook.history.length ? `${notebook.history.length} generated items` : 'No outputs yet'}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <FolderOpen className="h-4 w-4 text-sky-500" />
                    Source Binding
                  </div>
                  <p className="mt-1 text-xs leading-6 text-slate-500">Pick which files feed the current notebook.</p>
                </div>
                <button onClick={() => setView('knowledge')} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
                  Open library
                </button>
              </div>
              <div className="mt-5 space-y-3">
                {files.map((file) => {
                  const checked = Boolean(activeNotebook?.fileIds.includes(file.id));
                  return (
                    <button key={file.id} onClick={() => toggleFile(file.id)} className={`flex w-full items-start gap-3 rounded-[1.35rem] border px-4 py-3 text-left transition ${checked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-white'}`}>
                      <div className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${checked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{file.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{SUBJECTS[file.subject]} / {file.kind}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <div className="space-y-6">
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <Sparkles className="h-4 w-4" />
                    Generation Studio
                  </div>
                  <h1 className="mt-4 text-4xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
                    Turn a notebook into audio, briefs, and maps
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                    This page is the notebook-first workflow. Pick a notebook, choose the output type, and keep reviewing results in one place.
                  </p>
                </div>
                <div className="rounded-[1.7rem] border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Current notebook</p>
                  <p className="mt-2 text-2xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
                    {activeNotebook?.name || 'None selected'}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-slate-500">
                    {activeFiles.length ? `${activeFiles.length} source files attached` : 'No source files attached yet.'}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {(Object.entries(TOOL_META) as Array<[ToolId, (typeof TOOL_META)[ToolId]]>).map(([id, meta]) => {
                  const Icon = meta.icon;
                  const active = tool === id;
                  return (
                    <button key={id} onClick={() => setTool(id)} className={`rounded-[1.6rem] border p-5 text-left transition ${active ? 'border-slate-900 bg-slate-900 text-white shadow-[0_18px_50px_rgba(15,23,42,0.16)]' : 'border-slate-200 bg-slate-50 hover:bg-white'}`}>
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${active ? 'bg-white/10 text-white' : 'bg-white text-slate-700'}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <p className={`mt-4 text-lg font-black ${active ? 'text-white' : 'text-slate-900'}`} style={{ fontFamily: 'var(--font-display)' }}>{meta.label}</p>
                      <p className={`mt-2 text-sm leading-6 ${active ? 'text-slate-200' : 'text-slate-500'}`}>{meta.description}</p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button onClick={runGeneration} disabled={isGenerating} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300">
                  <PlayCircle className="h-4 w-4" />
                  {isGenerating ? 'Generating...' : `Generate ${TOOL_META[tool].label}`}
                </button>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                  Frontend uses local /api routes for testing
                </span>
              </div>

              {message && (
                <div className={`mt-5 rounded-[1.4rem] border px-4 py-3 text-sm leading-6 ${messageTone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : messageTone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                  {message}
                </div>
              )}
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Output</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Current preview</h2>
                </div>
                {currentOutput && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{formatTime(currentOutput.createdAt)}</span>
                )}
              </div>

              <div className="mt-5">
                {!currentOutput ? (
                  <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-emerald-600 shadow-sm">
                      <BrainCircuit className="h-8 w-8" />
                    </div>
                    <h3 className="mt-4 text-2xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Start with a podcast run</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-500">
                      A podcast generation verifies text creation, GPT TTS synthesis, and the frontend player together.
                    </p>
                  </div>
                ) : currentOutput.tool === 'podcast' ? (
                  <PodcastPlayer text={currentOutput.data.text} audioData={currentOutput.data.audioData} activeFiles={outputFiles.map((file) => ({ ...file, type: file.kind }))} />
                ) : currentOutput.tool === 'mindmap' ? (
                  <div className="space-y-5">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-600">
                      The map canvas is interactive. Drag, zoom, and use it as a structural review layer.
                    </div>
                    <MindmapViewer markdown={currentOutput.data.markdown} />
                  </div>
                ) : (
                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-6">
                      <div className="prose prose-slate max-w-none prose-headings:font-black prose-headings:text-slate-900 prose-p:leading-7 prose-li:leading-7">
                        <ReactMarkdown>{currentOutput.data.markdown}</ReactMarkdown>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Next steps</p>
                        <h3 className="mt-2 text-xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Good follow-ups</h3>
                        <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
                          <p>Move mistakes into the graph to track weak nodes.</p>
                          <p>Regenerate the same notebook as a podcast to hear the same content in another mode.</p>
                          <p>Keep this brief as the quick review layer before practice.</p>
                        </div>
                      </div>
                      <div className="rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#0f766e_100%)] p-5 text-white">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Source files</p>
                        <div className="mt-4 space-y-3">
                          {outputFiles.map((file) => (
                            <div key={file.id} className="rounded-2xl border border-white/10 bg-white/8 p-4 text-sm text-slate-100">{file.name}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">History</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Notebook history</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{activeNotebook?.history.length || 0} items</span>
              </div>

              <div className="mt-5 grid gap-3">
                {activeNotebook?.history.length ? activeNotebook.history.map((entry) => (
                  <div key={entry.id} className={`flex items-center gap-3 rounded-[1.4rem] border px-4 py-3 ${currentOutput?.id === entry.id ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                    <button onClick={() => setCurrentOutput(entry)} className="min-w-0 flex-1 text-left">
                      <p className="truncate text-sm font-semibold text-slate-900">{entry.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{TOOL_META[entry.tool].label} / {formatTime(entry.createdAt)}</p>
                    </button>
                    <button onClick={() => deleteHistory(entry.id)} className="rounded-full bg-white p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )) : (
                  <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-slate-500">
                    No outputs yet. Generate one item and it will appear here.
                  </div>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [files, setFiles] = useState<KnowledgeFile[]>(() => readStore(STORE.files, DEMO_FILES));
  const [notebooks, setNotebooks] = useState<Notebook[]>(() => readStore(STORE.notebooks, DEMO_NOTEBOOKS));

  useEffect(() => {
    window.localStorage.setItem(STORE.files, JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    if (!notebooks.length && files.length) {
      setNotebooks([{
        id: 'auto-notebook',
        name: 'Starter Notebook',
        fileIds: files.slice(0, Math.min(files.length, 2)).map((file) => file.id),
        history: [],
      }]);
      return;
    }

    window.localStorage.setItem(STORE.notebooks, JSON.stringify(notebooks));
  }, [files, notebooks]);

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(163,230,53,0.08),_transparent_22%),linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] text-slate-900">
      <aside className="hidden w-[300px] shrink-0 border-r border-slate-200 bg-white/80 px-6 py-8 backdrop-blur xl:flex xl:flex-col">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] bg-gradient-to-br from-emerald-400 to-lime-300 text-slate-900 shadow-[0_18px_40px_rgba(163,230,53,0.22)]">
            <BrainCircuit className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">XiaoLi AI Brain</p>
            <h1 className="text-2xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Study Surface</h1>
          </div>
        </div>

        <div className="mt-8 space-y-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.id;
            return (
              <button key={item.id} onClick={() => setCurrentView(item.id)} className={`flex w-full items-center gap-3 rounded-[1.4rem] px-4 py-3 text-left transition ${active ? 'bg-slate-900 text-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]' : 'text-slate-600 hover:bg-slate-100'}`}>
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${active ? 'bg-white/10 text-white' : 'bg-white text-slate-700 shadow-sm'}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${active ? 'text-white' : 'text-slate-900'}`}>{item.label}</p>
                  <p className={`text-xs ${active ? 'text-slate-200' : 'text-slate-500'}`}>{item.hint}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-auto space-y-4">
          <div className="rounded-[1.7rem] border border-slate-200 bg-slate-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Suggested flow</p>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
              <p>1. Upload or write one source item.</p>
              <p>2. Attach it to a notebook.</p>
              <p>3. Generate a podcast first to verify the full stack.</p>
            </div>
          </div>
          <div className="rounded-[1.7rem] border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Live stack</p>
            <p className="mt-2 text-lg font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>Frontend and API share one local server</p>
            <p className="mt-3 text-sm leading-7 text-slate-600">This setup is meant to be opened directly on the app port for testing.</p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 px-4 py-4 backdrop-blur md:px-8 xl:hidden">
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = currentView === item.id;
              return (
                <button key={item.id} onClick={() => setCurrentView(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div key={currentView} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex min-h-0 flex-1 flex-col">
            {currentView === 'dashboard' && <Dashboard files={files} notebooks={notebooks} setView={setCurrentView} />}
            {currentView === 'knowledge' && <KnowledgeBase files={files} setFiles={setFiles} setNotebooks={setNotebooks} />}
            {currentView === 'generation' && <GenerationStudio files={files} notebooks={notebooks} setNotebooks={setNotebooks} setView={setCurrentView} />}
            {currentView === 'graph' && <KnowledgeGraphExplorer />}
            {currentView === 'avatar' && <CompanionArena />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
