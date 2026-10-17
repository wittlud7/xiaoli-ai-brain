import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpenCheck,
  Flame,
  Heart,
  MessageCircleHeart,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Target,
} from 'lucide-react';

type Companion = {
  id: string;
  name: string;
  title: string;
  emoji: string;
  gradient: string;
  bubble: string;
  strengths: string[];
};

type Quest = {
  id: string;
  title: string;
  reward: string;
  done: boolean;
};

const COMPANIONS: Companion[] = [
  {
    id: 'lumo',
    name: 'Lumo',
    title: '冲刺教练',
    emoji: '🦉',
    gradient: 'from-lime-300 via-emerald-300 to-green-400',
    bubble: '先拿下一道题，我们再谈完美。今天要有“冲线感”。',
    strengths: ['刷题推进', '考前激励', '节奏管理'],
  },
  {
    id: 'mika',
    name: 'Mika',
    title: '耐心讲题官',
    emoji: '🐻',
    gradient: 'from-sky-300 via-cyan-300 to-blue-400',
    bubble: '卡住很正常，我们把题拆成三步，一步一步过。',
    strengths: ['概念拆解', '错题复盘', '稳态陪练'],
  },
  {
    id: 'nova',
    name: 'Nova',
    title: '脑洞搭档',
    emoji: '🦊',
    gradient: 'from-amber-300 via-orange-300 to-rose-400',
    bubble: '把知识点和真实场景连起来，你会记得更牢。',
    strengths: ['类比举例', '播客陪听', '学习趣味感'],
  },
];

const INITIAL_QUESTS: Quest[] = [
  { id: 'q1', title: '完成 1 次播客收听 + 追问', reward: '+20 XP', done: true },
  { id: 'q2', title: '把 1 个薄弱点加入知识图谱复习队列', reward: '+35 XP', done: false },
  { id: 'q3', title: '做完 5 道针对练习题', reward: '+1 连胜保护盾', done: false },
];

const ACTIONS = [
  '陪我复盘错题',
  '现在带我冲一组练习',
  '把今天的任务切成 15 分钟一段',
  '先鼓励我一下，再开始学习',
];

export const CompanionArena = () => {
  const [selectedId, setSelectedId] = useState('lumo');
  const [quests, setQuests] = useState<Quest[]>(INITIAL_QUESTS);
  const [activeAction, setActiveAction] = useState(ACTIONS[0]);

  const companion = COMPANIONS.find((item) => item.id === selectedId) || COMPANIONS[0];
  const completed = quests.filter((quest) => quest.done).length;
  const xpProgress = Math.round((completed / quests.length) * 100);

  const coachReply = useMemo(() => {
    const actionMap: Record<string, string> = {
      '陪我复盘错题': '我们先不着急刷新题，把最近最容易错的那一类问题拆掉。',
      '现在带我冲一组练习': '好，目标明确一点。我会先给你一组最有收益的题，把成就感打出来。',
      '把今天的任务切成 15 分钟一段': '没问题，我会按 Duolingo 的节奏来：短回合、快反馈、每段都能收工。',
      '先鼓励我一下，再开始学习': '你已经不是从零开始了。今天我们只需要比昨天多推进一步。',
    };

    return actionMap[activeAction] || companion.bubble;
  }, [activeAction, companion.bubble]);

  const toggleQuest = (questId: string) => {
    setQuests((prev) => prev.map((quest) => (
      quest.id === questId ? { ...quest, done: !quest.done } : quest
    )));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex-1 min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(163,230,53,0.18),_transparent_20%),linear-gradient(180deg,#f8fafc_0%,#ffffff_55%,#f7fee7_100%)] p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_380px]">
          <div className="overflow-hidden rounded-[2rem] border border-emerald-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="relative overflow-hidden p-6 md:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(163,230,53,0.18),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.12),_transparent_28%)]" />
              <div className="relative grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(260px,0.7fr)]">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    <Sparkles className="h-4 w-4" />
                    Duolingo-style AI Companion
                  </div>
                  <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
                    AI 伙伴不只是头像，而是会带你闯关的学习搭档
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                    这一版把伙伴页从“装扮展示”改成“陪学作战台”。你会看到连胜、爱心、任务、行动建议和即时反馈，更接近 Duolingo 那种低压力、高反馈的状态设计。
                  </p>

                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-orange-600"><Flame className="h-4 w-4" /> 连胜</div>
                      <p className="mt-3 text-3xl font-black text-slate-900">12 天</p>
                      <p className="mt-1 text-xs text-slate-500">保持节奏比一次爆发更重要</p>
                    </div>
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-rose-500"><Heart className="h-4 w-4" /> 爱心</div>
                      <p className="mt-3 text-3xl font-black text-slate-900">5 / 5</p>
                      <p className="mt-1 text-xs text-slate-500">今天还可以大胆试错</p>
                    </div>
                    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-amber-500"><Star className="h-4 w-4" /> XP</div>
                      <p className="mt-3 text-3xl font-black text-slate-900">180</p>
                      <p className="mt-1 text-xs text-slate-500">完成任务就会持续涨分</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.24)]">
                  <div className={`mx-auto flex h-40 w-40 items-center justify-center rounded-[2.5rem] bg-gradient-to-br ${companion.gradient} text-[5rem] shadow-[0_20px_60px_rgba(163,230,53,0.2)]`}>
                    {companion.emoji}
                  </div>
                  <div className="mt-5 text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Current partner</p>
                    <h2 className="mt-2 text-3xl font-black" style={{ fontFamily: 'var(--font-display)' }}>{companion.name}</h2>
                    <p className="mt-1 text-sm text-slate-300">{companion.title}</p>
                  </div>
                  <div className="mt-5 rounded-[1.5rem] bg-white/8 p-4 text-sm leading-7 text-slate-100">
                    “{coachReply}”
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {companion.strengths.map((tag) => (
                      <span key={tag} className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Target className="h-4 w-4 text-emerald-500" />
                今日任务
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300" style={{ width: `${xpProgress}%` }} />
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500">已完成 {completed}/{quests.length} 个任务</p>
              <div className="mt-4 space-y-3">
                {quests.map((quest) => (
                  <button
                    key={quest.id}
                    onClick={() => toggleQuest(quest.id)}
                    className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${quest.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-white'}`}
                  >
                    <div className={`mt-0.5 h-5 w-5 rounded-full border-2 ${quest.done ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{quest.title}</p>
                      <p className="mt-1 text-xs text-slate-500">奖励：{quest.reward}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Swords className="h-4 w-4 text-sky-500" />
                一键发起伙伴动作
              </div>
              <div className="mt-4 grid gap-3">
                {ACTIONS.map((action) => (
                  <button
                    key={action}
                    onClick={() => setActiveAction(action)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${activeAction === action ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'}`}
                  >
                    {action}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <MessageCircleHeart className="h-4 w-4 text-rose-500" />
              选择你的伙伴风格
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {COMPANIONS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`rounded-[1.75rem] border p-4 text-left transition ${selectedId === item.id ? 'border-emerald-300 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-slate-50 hover:bg-white'}`}
                >
                  <div className={`flex h-16 w-16 items-center justify-center rounded-[1.5rem] bg-gradient-to-br ${item.gradient} text-4xl shadow-sm`}>
                    {item.emoji}
                  </div>
                  <p className="mt-4 text-lg font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>{item.name}</p>
                  <p className="mt-1 text-sm font-medium text-slate-600">{item.title}</p>
                  <p className="mt-3 text-xs leading-6 text-slate-500">{item.bubble}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#1f2937_46%,#166534_100%)] p-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.24)]">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-lime-200">
                  <ShieldCheck className="h-4 w-4" />
                  降低放弃感
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-100">
                  Duolingo 模式的价值，不是“卡通一点”，而是把学习拆成连续的小胜利。这里的连胜、任务和伙伴回应，都是在减少用户中途掉线的概率。
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-lime-200">
                  <BookOpenCheck className="h-4 w-4" />
                  连接知识库功能
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-100">
                  伙伴不是独立装饰页，而应该成为知识图谱、播客、总结、刷题等能力的入口。所以这版把动作指令直接放在角色旁边，减少切页成本。
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
};
