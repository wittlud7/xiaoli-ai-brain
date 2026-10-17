import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  Headphones,
  MessageCircle,
  PauseCircle,
  PlayCircle,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generateAIContent } from '../services/geminiService';
import { VoiceInput } from './VoiceInput';

type AudioPayload = { data: string; mimeType: string } | string | null;

type ChatMessage = {
  role: 'user' | 'ai';
  content: string;
};

const QUICK_PROMPTS = [
  '用一句话总结这期播客。',
  '这部分知识最容易考什么？',
  '给我一个更贴近生活的例子。',
  '把刚才的重点再讲简单一点。',
];

export const PodcastPlayer = ({
  text,
  audioData,
  activeFiles,
}: {
  text: string;
  audioData: AudioPayload;
  activeFiles: any[];
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const transcriptBlocks = useMemo(
    () => text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean),
    [text],
  );

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    let url: string | null = null;

    if (audioData) {
      const base64String = typeof audioData === 'string' ? audioData : audioData.data;
      const mimeType = typeof audioData === 'string' ? 'audio/pcm' : audioData.mimeType;

      if (!base64String) {
        setAudioUrl(null);
        return;
      }

      const isWaveLike = base64String.startsWith('UklGR');
      const shouldWrapPcm = !isWaveLike && (mimeType.includes('audio/pcm') || mimeType === '' || mimeType === 'audio/wav');

      if (shouldWrapPcm) {
        try {
          const cleanBase64 = base64String.replace(/\s/g, '');
          const binaryString = atob(cleanBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i += 1) {
            bytes[i] = binaryString.charCodeAt(i);
          }

          const wavHeader = new ArrayBuffer(44);
          const view = new DataView(wavHeader);
          view.setUint32(0, 0x52494646, false);
          view.setUint32(4, 36 + bytes.length, true);
          view.setUint32(8, 0x57415645, false);
          view.setUint32(12, 0x666d7420, false);
          view.setUint32(16, 16, true);
          view.setUint16(20, 1, true);
          view.setUint16(22, 1, true);
          view.setUint32(24, 24000, true);
          view.setUint32(28, 48000, true);
          view.setUint16(32, 2, true);
          view.setUint16(34, 16, true);
          view.setUint32(36, 0x64617461, false);
          view.setUint32(40, bytes.length, true);

          url = URL.createObjectURL(new Blob([wavHeader, bytes], { type: 'audio/wav' }));
          setAudioUrl(url);
        } catch (error) {
          console.error('Failed to decode PCM audio:', error);
          setAudioUrl(null);
        }
      } else {
        url = `data:${mimeType || 'audio/mpeg'};base64,${base64String}`;
        setAudioUrl(url);
      }
    } else {
      setAudioUrl(null);
    }

    return () => {
      if (url && url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    };
  }, [audioData]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      if (audioUrl) {
        audioRef.current.load();
      }
    }
  }, [audioUrl, playbackRate]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        console.error('Failed to play audio:', error);
        setIsPlaying(false);
      }
    } else {
      audio.pause();
    }
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(event.target.value);
    if (!audioRef.current) return;
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const formatTime = (time: number) => {
    const safeTime = Number.isFinite(time) ? time : 0;
    const minutes = Math.floor(safeTime / 60);
    const seconds = Math.floor(safeTime % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const sendPrompt = async (promptText: string) => {
    if (!promptText.trim() || isGenerating) return;

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: promptText }];
    setMessages(newMessages);
    setInput('');
    setIsGenerating(true);

    try {
      const prompt = `你是一位知识播客主持人，需要基于知识库资料继续与学生对话。
资料来源：${activeFiles.map((file) => file.name).join('、') || '当前笔记本'}
播客脚本：${text}

历史对话：
${newMessages.map((message) => `${message.role === 'user' ? '学生' : '主持人'}：${message.content}`).join('\n')}

请遵循这些要求：
1. 语气像 NotebookLM 里的学习主持人，轻松、准确、有陪伴感。
2. 如果用户提问不够具体，先帮他定位正在讲的知识点。
3. 优先解释概念、例子、考试应用，而不是空泛鼓励。
4. 输出使用清晰的中文 Markdown。`;

      const result = await generateAIContent(prompt);
      setMessages([...newMessages, { role: 'ai', content: result }]);
    } catch (error) {
      console.error('Podcast follow-up failed:', error);
      setMessages([
        ...newMessages,
        { role: 'ai', content: '这一轮主持人掉线了一下。你可以再问一遍，我会继续接着讲。' },
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const sourceNames = activeFiles.map((file) => file.name).slice(0, 6);
  const downloadName = `ai-podcast-${Date.now()}.mp3`;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="relative overflow-hidden border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,_rgba(163,230,53,0.28),_transparent_35%),linear-gradient(135deg,#ffffff_0%,#f8fafc_58%,#ecfccb_100%)] p-6 md:p-8">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[linear-gradient(135deg,transparent,rgba(16,185,129,0.08))] md:block" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/85 px-3 py-1 text-xs font-semibold text-emerald-700 backdrop-blur">
                <Sparkles className="h-4 w-4" />
                Notebook Mode Podcast
              </div>
              <div>
                <h3 className="text-3xl font-black tracking-tight text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
                  AI 播客工作台
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                  双主持脚本保留在右侧，音频由 GPT TTS 合成。你可以一边听，一边在下方继续追问，就像把知识库变成一个可对话的 Notebook。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {sourceNames.length > 0 ? (
                  sourceNames.map((name) => (
                    <span key={name} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                      {name}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-sm">
                    当前播客未绑定来源资料
                  </span>
                )}
              </div>
            </div>

            <div className="min-w-[280px] rounded-[1.75rem] border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                    <Headphones className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Now Playing</p>
                    <p className="text-base font-bold text-slate-900">学习播客 · 对话版</p>
                    <p className="text-xs text-slate-500">AI 合成音频，仅用于学习演示</p>
                  </div>
                </div>
                {audioUrl && (
                  <a
                    href={audioUrl}
                    download={downloadName}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                    title="下载音频"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                )}
              </div>

              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-12 items-end gap-1 rounded-2xl bg-slate-950 px-4 py-5">
                  {[18, 36, 22, 42, 28, 38, 24, 48, 26, 35, 19, 31].map((height, index) => (
                    <div
                      key={height + index}
                      className={`rounded-full bg-gradient-to-t ${isPlaying ? 'from-emerald-400 via-lime-300 to-white' : 'from-slate-500 via-slate-400 to-slate-200'} transition-all`}
                      style={{ height }}
                    />
                  ))}
                </div>

                <div className="space-y-2">
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    value={currentTime}
                    onChange={handleSeek}
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-emerald-500"
                  />
                  <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={togglePlay}
                    disabled={!audioUrl}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isPlaying ? <PauseCircle className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
                    {isPlaying ? '暂停' : '播放'}
                  </button>
                  {[1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      onClick={() => setPlaybackRate(rate)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${playbackRate === rate ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <audio ref={audioRef} src={audioUrl || undefined} className="hidden" />
        </div>

        <div className="grid gap-6 p-6 md:p-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(260px,0.65fr)]">
          <div className="space-y-6">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                继续追问这期播客
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendPrompt(prompt)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-[360px] rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MessageCircle className="h-4 w-4 text-sky-500" />
                互动问答
              </div>
              <div className="space-y-4">
                {messages.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-500">
                    听到一半也可以随时打断主持人。你可以问“这段怎么考”“换个例子解释”或者“帮我整理成考前速记”。
                  </div>
                )}
                {messages.map((message, index) => (
                  <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'ai' && (
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <Sparkles className="h-5 w-5" />
                      </div>
                    )}
                    <div className={`max-w-[82%] rounded-[1.4rem] px-4 py-3 ${message.role === 'user' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-slate-50 text-slate-700'}`}>
                      <div className="prose prose-sm max-w-none prose-p:leading-7 prose-headings:text-slate-900">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    </div>
                    {message.role === 'user' && (
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200 text-slate-600">
                        <UserCircle className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                ))}
                {isGenerating && (
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-2 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-lime-400" style={{ animationDelay: '0.15s' }} />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-sky-400" style={{ animationDelay: '0.3s' }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 flex gap-3 border-t border-slate-100 pt-5">
                <VoiceInput
                  value={input}
                  onChange={setInput}
                  onEnter={() => sendPrompt(input)}
                  placeholder="继续追问这期播客，比如：这个结论在考试里怎么用？"
                  className="flex-1"
                />
                <button
                  onClick={() => sendPrompt(input)}
                  disabled={!input.trim() || isGenerating}
                  className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-200"
                >
                  发送
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                <FileText className="h-4 w-4 text-orange-500" />
                播客脚本 / Transcript
              </div>
              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {transcriptBlocks.map((block, index) => {
                  const speaker = block.match(/^(主持人A|主持人B|Joe|Jane)\s*[：:]/)?.[1];
                  const tone = speaker === '主持人A' || speaker === 'Joe'
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : speaker === '主持人B' || speaker === 'Jane'
                      ? 'border-sky-200 bg-sky-50/70'
                      : 'border-slate-200 bg-slate-50';

                  return (
                    <div key={`${speaker || 'block'}-${index}`} className={`rounded-2xl border p-4 ${tone}`}>
                      {speaker && (
                        <div className="mb-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 shadow-sm">
                          {speaker === '主持人A' || speaker === 'Joe' ? '主持人 A' : '主持人 B'}
                        </div>
                      )}
                      <div className="prose prose-sm max-w-none prose-p:leading-7 prose-headings:text-slate-900">
                        <ReactMarkdown>{block}</ReactMarkdown>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#111827_45%,#134e4a_100%)] p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.24)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Learning cues</p>
              <h4 className="mt-2 text-xl font-black" style={{ fontFamily: 'var(--font-display)' }}>
                更像 Notebook 的地方
              </h4>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                <li>音频、脚本和来源文件放在同一个工作台里，不需要在不同页面来回跳转。</li>
                <li>你可以把这期播客当成一份“会说话的笔记”，随时补问、追问、复述重点。</li>
                <li>GPT TTS 现在会按照主持人 A / B 拆分语音段落，让播客更接近双人对谈的感觉。</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Source shelf</p>
          <h4 className="mt-2 text-2xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
            当前播客参考了哪些资料
          </h4>
          <div className="mt-5 space-y-3">
            {activeFiles.length > 0 ? (
              activeFiles.map((file) => (
                <div key={file.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{file.subject} · {file.type}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                当前没有选中的来源文件。建议先在笔记本里绑定资料，再生成播客，效果会更接近 NotebookLM。
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Use cases</p>
          <h4 className="mt-2 text-2xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
            适合怎么用
          </h4>
          <div className="mt-5 grid gap-3">
            {[
              '睡前用 1.25x 听一遍，快速复盘当天资料。',
              '把播客当口头版错题本，卡住就直接提问。',
              '听完再切到思维导图，把音频里的结构变成图。',
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
};
