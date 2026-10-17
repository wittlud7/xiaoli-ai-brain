import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import * as d3 from 'd3';
import {
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Network,
  Search,
  Sparkles,
  Target,
} from 'lucide-react';

type SubjectKey = 'all' | 'physics' | 'math' | 'history' | 'programming';
type Mastery = 'mastered' | 'learning' | 'review' | 'locked';

type GraphNode = {
  id: string;
  label: string;
  subject: SubjectKey;
  cluster: string;
  level: 1 | 2 | 3;
  summary: string;
  examples: string[];
  related: string[];
  mastery: Mastery;
  nextStep: string;
};

const SUBJECTS: Array<{ id: SubjectKey; label: string; accent: string }> = [
  { id: 'all', label: '综合宇宙', accent: 'from-emerald-400 to-lime-300' },
  { id: 'physics', label: '物理', accent: 'from-sky-400 to-cyan-300' },
  { id: 'math', label: '数学', accent: 'from-fuchsia-400 to-rose-300' },
  { id: 'history', label: '历史', accent: 'from-amber-400 to-orange-300' },
  { id: 'programming', label: '编程', accent: 'from-indigo-400 to-blue-300' },
];

const GRAPH_NODES: GraphNode[] = [
  {
    id: 'force-analysis',
    label: '受力分析',
    subject: 'physics',
    cluster: '经典力学',
    level: 1,
    summary: '先画对象，再列力，最后建立方向和方程。',
    examples: ['斜面物块', '电梯超重与失重'],
    related: ['newton-2', 'energy-conservation'],
    mastery: 'learning',
    nextStep: '先把“受哪些力”写清楚，再考虑合力和加速度。',
  },
  {
    id: 'newton-2',
    label: '牛顿第二定律',
    subject: 'physics',
    cluster: '经典力学',
    level: 2,
    summary: '合外力决定加速度，方向与合力方向一致。',
    examples: ['传送带', '拉力与摩擦力模型'],
    related: ['force-analysis', 'kinematics'],
    mastery: 'review',
    nextStep: '把 F=ma 当作“结果句”，前面先做力的拆解。',
  },
  {
    id: 'kinematics',
    label: '运动学',
    subject: 'physics',
    cluster: '运动描述',
    level: 2,
    summary: '位移、速度、加速度是解运动题的三根主线。',
    examples: ['自由落体', '平抛运动'],
    related: ['newton-2', 'force-analysis'],
    mastery: 'mastered',
    nextStep: '继续把图像题和公式题互相转换。',
  },
  {
    id: 'energy-conservation',
    label: '能量守恒',
    subject: 'physics',
    cluster: '能量观点',
    level: 2,
    summary: '不用逐时刻算力，也能从始末状态直接求解。',
    examples: ['摆球最低点速度', '弹簧储能'],
    related: ['force-analysis', 'newton-2'],
    mastery: 'locked',
    nextStep: '先建立系统，再区分内力与外力做功。',
  },
  {
    id: 'function-thinking',
    label: '函数思想',
    subject: 'math',
    cluster: '代数策略',
    level: 1,
    summary: '把题目转成“变量如何变化”的关系图。',
    examples: ['单调性', '最值问题'],
    related: ['derivative', 'coordinate-thinking'],
    mastery: 'learning',
    nextStep: '先判断定义域，再谈增减、奇偶和周期。',
  },
  {
    id: 'derivative',
    label: '导数应用',
    subject: 'math',
    cluster: '代数策略',
    level: 2,
    summary: '导数是研究函数变化率和最值的放大镜。',
    examples: ['切线斜率', '最值证明'],
    related: ['function-thinking', 'inequality'],
    mastery: 'review',
    nextStep: '把“求导数”转成“理解图像变化”的语言。',
  },
  {
    id: 'inequality',
    label: '不等式转化',
    subject: 'math',
    cluster: '证明与转化',
    level: 2,
    summary: '抓住同构、配方、均值不等式等常见抓手。',
    examples: ['柯西', '均值不等式'],
    related: ['derivative', 'function-thinking'],
    mastery: 'mastered',
    nextStep: '把常见转化套路整理成自己的解题句式。',
  },
  {
    id: 'coordinate-thinking',
    label: '坐标化思维',
    subject: 'math',
    cluster: '几何转代数',
    level: 3,
    summary: '几何图形一旦坐标化，关系会变得可计算。',
    examples: ['解析几何圆锥曲线', '向量'],
    related: ['function-thinking'],
    mastery: 'locked',
    nextStep: '优先选择最省变量的坐标系。',
  },
  {
    id: 'chronology',
    label: '时间线骨架',
    subject: 'history',
    cluster: '历史结构',
    level: 1,
    summary: '先搭起时间线，史实才有位置和因果。',
    examples: ['近代化进程', '王朝更替'],
    related: ['cause-effect', 'comparison'],
    mastery: 'mastered',
    nextStep: '先记大节点，再补充关键人物和事件。',
  },
  {
    id: 'cause-effect',
    label: '因果链分析',
    subject: 'history',
    cluster: '历史结构',
    level: 2,
    summary: '把背景、过程、影响拆成连续链条。',
    examples: ['辛亥革命', '工业革命'],
    related: ['chronology', 'comparison'],
    mastery: 'learning',
    nextStep: '把“为什么发生”和“产生了什么后果”分层回答。',
  },
  {
    id: 'comparison',
    label: '横向对比',
    subject: 'history',
    cluster: '答题表达',
    level: 2,
    summary: '同类事件放在一起，比孤立背诵更容易得分。',
    examples: ['中西近代化', '制度比较'],
    related: ['chronology', 'cause-effect'],
    mastery: 'review',
    nextStep: '用“相同点 / 不同点 / 原因”三栏组织答案。',
  },
  {
    id: 'algorithms',
    label: '算法直觉',
    subject: 'programming',
    cluster: '代码思维',
    level: 1,
    summary: '先理解数据流，再讨论复杂度和实现。',
    examples: ['双指针', '贪心'],
    related: ['data-structures', 'debugging'],
    mastery: 'learning',
    nextStep: '先画流程，再动手写代码。',
  },
  {
    id: 'data-structures',
    label: '数据结构映射',
    subject: 'programming',
    cluster: '代码思维',
    level: 2,
    summary: '选对结构，很多问题会自动简化。',
    examples: ['栈与括号匹配', '哈希去重'],
    related: ['algorithms', 'debugging'],
    mastery: 'mastered',
    nextStep: '养成“这题的核心容器是什么”的第一反应。',
  },
  {
    id: 'debugging',
    label: '调试链路',
    subject: 'programming',
    cluster: '代码思维',
    level: 2,
    summary: '复现、定位、最小化、修复，是最稳的四步。',
    examples: ['打印关键变量', '断点缩小范围'],
    related: ['algorithms', 'data-structures'],
    mastery: 'review',
    nextStep: '出 bug 时先确认输入、输出和中间状态。',
  },
];

const masteryMeta: Record<Mastery, { label: string; color: string; chip: string }> = {
  mastered: { label: '已掌握', color: '#10b981', chip: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  learning: { label: '学习中', color: '#3b82f6', chip: 'bg-sky-100 text-sky-700 border-sky-200' },
  review: { label: '待复习', color: '#f59e0b', chip: 'bg-amber-100 text-amber-700 border-amber-200' },
  locked: { label: '未解锁', color: '#94a3b8', chip: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const KnowledgeGraphExplorer = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeSubject, setActiveSubject] = useState<SubjectKey>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>('force-analysis');
  const [masteryState, setMasteryState] = useState<Record<string, Mastery>>(() =>
    Object.fromEntries(GRAPH_NODES.map((node) => [node.id, node.mastery])),
  );

  const scopedNodes = useMemo(() => {
    const subjectNodes = activeSubject === 'all'
      ? GRAPH_NODES
      : GRAPH_NODES.filter((node) => node.subject === activeSubject);

    const lowered = query.trim().toLowerCase();
    if (!lowered) return subjectNodes;

    return subjectNodes.filter((node) =>
      [node.label, node.summary, node.cluster, ...node.examples].join(' ').toLowerCase().includes(lowered),
    );
  }, [activeSubject, query]);

  const nodesWithState = useMemo(
    () => scopedNodes.map((node) => ({ ...node, mastery: masteryState[node.id] || node.mastery })),
    [masteryState, scopedNodes],
  );

  const graphLinks = useMemo(() => {
    const visibleIds = new Set(nodesWithState.map((node) => node.id));
    return nodesWithState.flatMap((node) =>
      node.related
        .filter((target) => visibleIds.has(target))
        .map((target) => ({ source: node.id, target })),
    );
  }, [nodesWithState]);

  useEffect(() => {
    if (!nodesWithState.length) {
      setSelectedId('');
      return;
    }

    if (!nodesWithState.some((node) => node.id === selectedId)) {
      setSelectedId(nodesWithState[0].id);
    }
  }, [nodesWithState, selectedId]);

  const selectedNode = nodesWithState.find((node) => node.id === selectedId) || nodesWithState[0] || null;

  const summaryStats = useMemo(() => {
    const mastered = nodesWithState.filter((node) => node.mastery === 'mastered').length;
    const learning = nodesWithState.filter((node) => node.mastery === 'learning').length;
    const review = nodesWithState.filter((node) => node.mastery === 'review').length;
    const coverage = nodesWithState.length ? Math.round((mastered / nodesWithState.length) * 100) : 0;
    return { mastered, learning, review, coverage };
  }, [nodesWithState]);

  useEffect(() => {
    if (!svgRef.current || !nodesWithState.length) return;

    const svgElement = svgRef.current;
    const width = svgElement.clientWidth || 900;
    const height = svgElement.clientHeight || 560;

    d3.select(svgElement).selectAll('*').remove();

    const svg = d3
      .select(svgElement)
      .attr('viewBox', [0, 0, width, height])
      .style('cursor', 'grab');

    const root = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.6, 2.8]).on('zoom', (event) => {
      root.attr('transform', event.transform);
    });

    svg.call(zoom as never);
    svg.call(zoom.transform as never, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.95));

    const nodes = nodesWithState.map((node) => ({ ...node }));
    const links = graphLinks.map((link) => ({ ...link }));
    const selectedIds = selectedNode ? new Set([selectedNode.id, ...selectedNode.related]) : new Set<string>();

    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force('link', d3.forceLink(links as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[]).id((d: any) => d.id).distance(115))
      .force('charge', d3.forceManyBody().strength(-390))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius((d: any) => 32 + d.level * 6));

    root
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (link: any) => (selectedIds.size === 0 || selectedIds.has(link.source.id) || selectedIds.has(link.target.id) ? 'rgba(148,163,184,0.45)' : 'rgba(203,213,225,0.18)'))
      .attr('stroke-width', 1.4)
      .attr('stroke-linecap', 'round');

    const nodeGroup = root
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (_event, node: any) => setSelectedId(node.id))
      .call(
        d3
          .drag<SVGGElement, any>()
          .on('start', (event, node) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            node.fx = node.x;
            node.fy = node.y;
            svg.style('cursor', 'grabbing');
          })
          .on('drag', (event, node) => {
            node.fx = event.x;
            node.fy = event.y;
          })
          .on('end', (event, node) => {
            if (!event.active) simulation.alphaTarget(0);
            node.fx = null;
            node.fy = null;
            svg.style('cursor', 'grab');
          }) as never,
      );

    nodeGroup
      .append('circle')
      .attr('r', (node: any) => 16 + node.level * 5)
      .attr('fill', (node: any) => masteryMeta[node.mastery].color)
      .attr('stroke', (node: any) => (selectedNode?.id === node.id ? '#0f172a' : '#ffffff'))
      .attr('stroke-width', (node: any) => (selectedNode?.id === node.id ? 3 : 2))
      .attr('opacity', (node: any) => {
        if (!selectedIds.size) return 1;
        return selectedIds.has(node.id) ? 1 : 0.32;
      })
      .style('filter', (node: any) => `drop-shadow(0 10px 20px ${masteryMeta[node.mastery].color}33)`);

    nodeGroup
      .append('text')
      .text((node: any) => node.label)
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-size', (node: any) => (node.level === 1 ? 12 : 11))
      .attr('font-weight', 700)
      .attr('fill', '#ffffff')
      .style('pointer-events', 'none');

    simulation.on('tick', () => {
      root
        .selectAll('line')
        .attr('x1', (link: any) => link.source.x)
        .attr('y1', (link: any) => link.source.y)
        .attr('x2', (link: any) => link.target.x)
        .attr('y2', (link: any) => link.target.y);

      nodeGroup.attr('transform', (node: any) => `translate(${node.x},${node.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphLinks, nodesWithState, selectedNode]);

  const updateSelectedMastery = (next: Mastery) => {
    if (!selectedNode) return;
    setMasteryState((prev) => ({ ...prev, [selectedNode.id]: next }));
  };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex-1 min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(163,230,53,0.16),_transparent_22%),linear-gradient(180deg,#f8fafc_0%,#ffffff_52%,#f8fafc_100%)] p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_340px] md:p-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Network className="h-4 w-4" />
                Interactive Knowledge Graph
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
                让知识图谱真正能探索、能点击、能推进掌握度
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                这一版不再只是把知识点堆成一张图，而是把“掌握状态、关联链路、下一步行动”一起放进来。你可以搜索、聚焦、切换学科，并把单个节点推进到已掌握或待复习。
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {SUBJECTS.map((subject) => (
                  <button
                    key={subject.id}
                    onClick={() => setActiveSubject(subject.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeSubject === subject.id ? `bg-gradient-to-r ${subject.accent} text-slate-950 shadow-lg` : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {subject.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Coverage</p>
                <div className="mt-3 flex items-end gap-3">
                  <span className="text-4xl font-black text-slate-900">{summaryStats.coverage}%</span>
                  <span className="pb-1 text-sm text-slate-500">已掌握覆盖率</span>
                </div>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300" style={{ width: `${summaryStats.coverage}%` }} />
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Target className="h-4 w-4 text-sky-500" />
                  当前学科节奏
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs font-semibold">
                  <div className="rounded-2xl bg-white p-3 text-emerald-700 shadow-sm">已掌握<br />{summaryStats.mastered}</div>
                  <div className="rounded-2xl bg-white p-3 text-sky-700 shadow-sm">学习中<br />{summaryStats.learning}</div>
                  <div className="rounded-2xl bg-white p-3 text-amber-700 shadow-sm">待复习<br />{summaryStats.review}</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-5 md:flex-row md:items-center md:justify-between md:p-6">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索概念、例子、解题策略"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-emerald-400 focus:bg-white"
                />
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Sparkles className="h-4 w-4 text-emerald-500" />
                点击节点可聚焦关系，右侧可直接推进掌握状态
              </div>
            </div>
            <div className="relative h-[560px] overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_24%),linear-gradient(180deg,#0f172a_0%,#111827_100%)]">
              <div className="pointer-events-none absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)', backgroundSize: '28px 28px' }} />
              <svg ref={svgRef} className="absolute inset-0 h-full w-full" />
              <div className="absolute bottom-4 left-4 rounded-2xl border border-white/10 bg-slate-900/75 p-3 text-xs text-slate-300 backdrop-blur">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-400" /> 已掌握</div>
                <div className="mt-2 flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-sky-400" /> 学习中</div>
                <div className="mt-2 flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-amber-400" /> 待复习</div>
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Focused node</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-900" style={{ fontFamily: 'var(--font-display)' }}>
                    {selectedNode?.label || '暂无节点'}
                  </h2>
                </div>
                {selectedNode && (
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${masteryMeta[selectedNode.mastery].chip}`}>
                    {masteryMeta[selectedNode.mastery].label}
                  </span>
                )}
              </div>

              {selectedNode ? (
                <>
                  <p className="mt-4 text-sm leading-7 text-slate-600">{selectedNode.summary}</p>
                  <div className="mt-5 rounded-[1.5rem] bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">下一步动作</p>
                    <p className="mt-2 text-sm font-medium leading-6 text-slate-700">{selectedNode.nextStep}</p>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(['mastered', 'learning', 'review', 'locked'] as Mastery[]).map((state) => (
                      <button
                        key={state}
                        onClick={() => updateSelectedMastery(state)}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${selectedNode.mastery === state ? masteryMeta[state].chip : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                      >
                        {masteryMeta[state].label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">典型例子</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedNode.examples.map((example) => (
                        <span key={example} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                          {example}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">关联概念</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedNode.related.map((relatedId) => {
                        const relatedNode = nodesWithState.find((node) => node.id === relatedId);
                        if (!relatedNode) return null;
                        return (
                          <button
                            key={relatedId}
                            onClick={() => setSelectedId(relatedId)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            {relatedNode.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-slate-500">当前筛选下没有匹配节点。</p>
              )}
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <BookOpenCheck className="h-4 w-4 text-emerald-500" />
                学习路径
              </div>
              <div className="mt-4 space-y-3">
                {nodesWithState.slice(0, 6).map((node, index) => (
                  <button
                    key={node.id}
                    onClick={() => setSelectedId(node.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${selectedNode?.id === node.id ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-white'}`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-500 shadow-sm">
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{node.label}</p>
                      <p className="truncate text-xs text-slate-500">{node.cluster}</p>
                    </div>
                    {node.mastery === 'mastered' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <CircleDashed className="h-5 w-5 text-slate-300" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,#082f49_0%,#0f172a_100%)] p-6 text-white shadow-[0_20px_60px_rgba(15,23,42,0.24)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-sky-200">
                <BrainCircuit className="h-4 w-4" />
                为什么这版更像“可用的图谱”
              </div>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                <li>节点不只是静态展示，而是可搜索、可聚焦、可推进掌握状态。</li>
                <li>右侧同时展示下一步动作和关联概念，方便从“看图”切到“学习”。</li>
                <li>状态色和学习路径能直接告诉你：现在该攻哪个点、哪个点该复习。</li>
              </ul>
            </div>
          </aside>
        </section>
      </div>
    </motion.div>
  );
};
