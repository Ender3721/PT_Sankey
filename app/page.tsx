'use client';

import {
  ChangeEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import katex from 'katex';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Braces,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardPaste,
  Download,
  FileJson,
  FlaskConical,
  GripVertical,
  Layers3,
  Link2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Stage = 'raw' | `d${number}`;
type FlowMetric = '数据权重' | '样本量' | '不确定度';
type EditableField = 'name' | 'purpose' | 'condition' | 'component' | 'instrument';
type SortKey = 'stage' | EditableField | 'parents' | 'height';
type SortDirection = 'asc' | 'desc';

type NodeEditTarget = {
  rowId: string;
  field: EditableField;
};

type VariableRow = {
  id: string;
  name: string;
  stage: Stage;
  purpose: string;
  condition: string;
  component: string;
  instrument: string;
  parents: string[];
  weight: number;
};

type LinkAnnotation = {
  note: string;
  formula: string;
  showFormula?: boolean;
  weight?: number;
};

type FlowNode = {
  id: string;
  label: string;
  column: number;
  color: string;
  value: number;
  editTargets: NodeEditTarget[];
  placeholder?: boolean;
};

type FlowLink = {
  id: string;
  source: string;
  target: string;
  baseWeight: number;
};

type ProjectState = {
  variables: VariableRow[];
  annotations: Record<string, LinkAnnotation>;
  metric: FlowMetric;
  maxDerivedStage?: number;
};

const STORAGE_KEY = 'building-physics-flow-v1';
const MIN_DERIVED_STAGES = 1;
const META_COLUMN_LABELS = ['实验目的', '实验场景', '测量仪器'];
const META_COLUMN_COLORS = ['#586849', '#b77743', '#3f7779'];
const DATA_STAGE_COLORS = ['#476b78', '#8b5f72', '#696388', '#a36c42', '#4f7865', '#967a3f', '#5f7893', '#855f8d'];

function stageLevel(stage: Stage) {
  if (stage === 'raw') return 0;
  const parsed = Number(stage.slice(1));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeStage(stage: unknown): Stage {
  if (stage === 'raw' || stage === 0 || stage === '0') return 'raw';
  const match = String(stage ?? '').match(/^d?(\d+)$/i);
  const level = match ? Number(match[1]) : 1;
  return `d${Math.max(1, level)}` as Stage;
}

function stageColumn(stage: Stage) {
  return 3 + stageLevel(stage);
}

function stageColor(stage: Stage) {
  const level = stageLevel(stage);
  return DATA_STAGE_COLORS[level % DATA_STAGE_COLORS.length];
}

function getStages(maxDerivedStage: number) {
  return [
    { value: 'raw' as Stage, label: '原始数据 0', short: '原始 0', color: DATA_STAGE_COLORS[0] },
    ...Array.from({ length: maxDerivedStage }, (_, index) => {
      const level = index + 1;
      return { value: `d${level}` as Stage, label: `衍生数据 ${level}`, short: `衍生 ${level}`, color: DATA_STAGE_COLORS[level % DATA_STAGE_COLORS.length] };
    }),
  ];
}

function maxStageIn(variables: VariableRow[]) {
  return Math.max(MIN_DERIVED_STAGES, ...variables.map((variable) => stageLevel(variable.stage)));
}

function normalizeVariables(variables: VariableRow[]) {
  return variables.map((variable) => ({ ...variable, stage: normalizeStage(variable.stage) }));
}

const SAMPLE_VARIABLES: VariableRow[] = [
  {
    id: 'v-mass',
    name: '称重质量 m',
    stage: 'raw',
    purpose: '测干时状态',
    condition: '干燥至恒重',
    component: '恒温烘干箱',
    instrument: '电子天平（0–6200 g，±0.01 g）',
    parents: [],
    weight: 3,
  },
  {
    id: 'v-volume',
    name: '试件体积 V',
    stage: 'raw',
    purpose: '测干时状态',
    condition: '室温尺寸测量',
    component: '标准试件',
    instrument: '游标卡尺',
    parents: [],
    weight: 2,
  },
  {
    id: 'v-saturated',
    name: '真空饱和质量 m_sat',
    stage: 'raw',
    purpose: '测含湿量',
    condition: '真空饱和',
    component: '真空箱',
    instrument: '电子天平（0–6200 g，±0.01 g）',
    parents: [],
    weight: 3,
  },
  {
    id: 'v-underwater',
    name: '水下称重质量 m_w',
    stage: 'raw',
    purpose: '测含湿量',
    condition: '水下称重',
    component: '水下称重装置',
    instrument: '电子天平（0–6200 g，±0.01 g）',
    parents: [],
    weight: 2,
  },
  {
    id: 'v-dry',
    name: '干质量 m_d',
    stage: 'd1',
    purpose: '测干时状态',
    condition: '连续多次称重',
    component: '恒温烘干箱',
    instrument: '',
    parents: ['v-mass'],
    weight: 3,
  },
  {
    id: 'v-moisture',
    name: '真空饱和含湿量',
    stage: 'd1',
    purpose: '测含湿量',
    condition: '真空饱和',
    component: '真空箱',
    instrument: '',
    parents: ['v-saturated', 'v-dry'],
    weight: 2,
  },
  {
    id: 'v-density',
    name: '干密度 ρ_d',
    stage: 'd2',
    purpose: '测干时状态',
    condition: '',
    component: '',
    instrument: '',
    parents: ['v-dry', 'v-volume'],
    weight: 2,
  },
  {
    id: 'v-apparent',
    name: '表观密度',
    stage: 'd2',
    purpose: '测含湿量',
    condition: '',
    component: '',
    instrument: '',
    parents: ['v-dry', 'v-saturated', 'v-underwater'],
    weight: 1.5,
  },
  {
    id: 'v-porosity',
    name: '开放孔隙率',
    stage: 'd2',
    purpose: '测含湿量',
    condition: '',
    component: '',
    instrument: '',
    parents: ['v-dry', 'v-saturated', 'v-underwater'],
    weight: 1.5,
  },
  {
    id: 'v-one-face',
    name: '单面浸泡饱和体积含水率',
    stage: 'd3',
    purpose: '测含湿量',
    condition: '单面浸泡',
    component: '水下称重装置',
    instrument: '',
    parents: ['v-porosity'],
    weight: 1,
  },
  {
    id: 'v-rain',
    name: '模拟降雨累计饱和体积含水率',
    stage: 'd3',
    purpose: '测含湿量',
    condition: '人工模拟降雨',
    component: '降雨模拟装置',
    instrument: '',
    parents: ['v-moisture', 'v-porosity'],
    weight: 1,
  },
];

const SAMPLE_ANNOTATIONS: Record<string, LinkAnnotation> = {
  'v-mass=>v-dry': {
    note: '连续多次测量，当最小值不再变化时判定为恒重。',
    formula: 'm_d = \\min(m_1,\\ldots,m_n)',
    weight: 3,
  },
  'v-dry=>v-density': {
    note: '干质量与试件体积的关系映射。',
    formula: '\\rho_d = \\frac{m_d}{V}',
    weight: 2,
  },
  'v-volume=>v-density': {
    note: '体积作为干密度计算的归一化量。',
    formula: '\\rho_d = \\frac{m_d}{V}',
    weight: 2,
  },
  'v-porosity=>v-one-face': {
    note: '将开放孔隙率映射到单面浸泡工况。',
    formula: '\\theta_{v,\\mathrm{sat}} = \\frac{V_w}{V}',
    weight: 1,
  },
};

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function metaId(kind: string, ...parts: string[]) {
  return `${kind}:${parts.join('¦')}`;
}

function addOrAggregateLink(map: Map<string, FlowLink>, source: string, target: string, weight: number) {
  const id = `${source}=>${target}`;
  const existing = map.get(id);
  if (existing) existing.baseWeight += weight;
  else map.set(id, { id, source, target, baseWeight: weight });
}

function computeVariableValues(variables: VariableRow[]) {
  const values = new Map<string, number>();
  const ordered = [...variables].sort((a, b) => stageLevel(a.stage) - stageLevel(b.stage));

  ordered.forEach((variable) => {
    if (variable.stage === 'raw') {
      values.set(variable.id, Math.max(0, variable.weight));
      return;
    }

    const value = variable.parents.reduce((total, parentId) => {
      const parent = variables.find((candidate) => candidate.id === parentId);
      if (!parent || stageLevel(parent.stage) >= stageLevel(variable.stage)) return total;
      return total + (values.get(parentId) ?? 0);
    }, 0);
    values.set(variable.id, value);
  });

  return values;
}

function buildFlow(variables: VariableRow[]) {
  const nodeMap = new Map<string, FlowNode>();
  const linkMap = new Map<string, FlowLink>();
  const canonicalByKey = new Map<string, string>();
  const variableNodeIds = new Map<string, string>();
  const rawChains = new Map<string, string[]>();
  const variableValues = computeVariableValues(variables);

  const addNode = (node: FlowNode) => {
    const key = node.placeholder ? `placeholder\u0000${node.id}` : `${node.column}\u0000${node.label}`;
    const canonicalId = canonicalByKey.get(key);
    if (!canonicalId) {
      canonicalByKey.set(key, node.id);
      nodeMap.set(node.id, node);
      return node.id;
    }

    const existing = nodeMap.get(canonicalId);
    if (existing) {
      existing.value += node.value;
      node.editTargets.forEach((target) => {
        if (!existing.editTargets.some((candidate) => candidate.rowId === target.rowId && candidate.field === target.field)) {
          existing.editTargets.push(target);
        }
      });
    }
    return canonicalId;
  };

  variables.forEach((variable) => {
    const variableValue = variableValues.get(variable.id) ?? 0;
    const variableNodeId = addNode({
      id: variable.id,
      label: variable.name || '未命名变量',
      column: stageColumn(variable.stage),
      color: stageColor(variable.stage),
      value: variableValue,
      editTargets: [{ rowId: variable.id, field: 'name' }],
    });
    variableNodeIds.set(variable.id, variableNodeId);

    if (variable.stage === 'raw') {
      const chain: string[] = [];
      if (variable.purpose.trim()) {
        chain.push(addNode({
          id: metaId('purpose', variable.purpose),
          label: variable.purpose,
          column: 0,
          color: META_COLUMN_COLORS[0],
          value: variableValue,
          editTargets: [{ rowId: variable.id, field: 'purpose' }],
        }));
      } else {
        chain.push(addNode({
          id: metaId('placeholder-purpose', variable.id),
          label: '待填写实验目的',
          column: 0,
          color: META_COLUMN_COLORS[0],
          value: variableValue,
          editTargets: [{ rowId: variable.id, field: 'purpose' }],
          placeholder: true,
        }));
      }

      const sceneParts = [variable.condition, variable.component].filter((value) => value.trim());
      if (sceneParts.length) {
        chain.push(addNode({
          id: metaId('scene', ...sceneParts),
          label: sceneParts.join(' · '),
          column: 1,
          color: META_COLUMN_COLORS[1],
          value: variableValue,
          editTargets: [
            ...(variable.condition.trim() ? [{ rowId: variable.id, field: 'condition' as EditableField }] : []),
            ...(variable.component.trim() ? [{ rowId: variable.id, field: 'component' as EditableField }] : []),
          ],
        }));
      } else {
        chain.push(addNode({
          id: metaId('placeholder-scene', variable.id),
          label: '待填写实验场景',
          column: 1,
          color: META_COLUMN_COLORS[1],
          value: variableValue,
          editTargets: [{ rowId: variable.id, field: 'condition' }],
          placeholder: true,
        }));
      }

      if (variable.instrument.trim()) {
        chain.push(addNode({
          id: metaId('instrument', variable.instrument),
          label: variable.instrument,
          column: 2,
          color: META_COLUMN_COLORS[2],
          value: variableValue,
          editTargets: [{ rowId: variable.id, field: 'instrument' }],
        }));
      } else {
        chain.push(addNode({
          id: metaId('placeholder-instrument', variable.id),
          label: '待填写测量仪器',
          column: 2,
          color: META_COLUMN_COLORS[2],
          value: variableValue,
          editTargets: [{ rowId: variable.id, field: 'instrument' }],
          placeholder: true,
        }));
      }

      chain.push(variableNodeId);
      rawChains.set(variable.id, chain);
    }
  });

  variables.forEach((variable) => {
    const variableValue = variableValues.get(variable.id) ?? 0;
    if (variable.stage === 'raw') {
      const chain = rawChains.get(variable.id) ?? [];
      for (let index = 0; index < chain.length - 1; index += 1) {
        addOrAggregateLink(linkMap, chain[index], chain[index + 1], variableValue);
      }
      return;
    }

    const targetId = variableNodeIds.get(variable.id);
    if (!targetId) return;
    variable.parents.forEach((parentId) => {
      const parent = variables.find((candidate) => candidate.id === parentId);
      const sourceId = variableNodeIds.get(parentId);
      if (parent && sourceId && stageLevel(parent.stage) < stageLevel(variable.stage)) {
        addOrAggregateLink(linkMap, sourceId, targetId, variableValues.get(parentId) ?? 0);
      }
    });
  });

  return { nodes: [...nodeMap.values()], links: [...linkMap.values()], variableValues };
}

function splitLabel(label: string) {
  const explicitLines = label.replace(/（/g, '(').replace(/）/g, ')').split(/\r?\n/);
  const wrapped = explicitLines.flatMap((line) => {
    if (line.length <= 10) return [line || ' '];
    return Array.from({ length: Math.ceil(line.length / 10) }, (_, index) => line.slice(index * 10, index * 10 + 10));
  });
  if (wrapped.length <= 3) return wrapped;
  return [...wrapped.slice(0, 2), `${wrapped[2].slice(0, 9)}…`];
}

function safeNumber(value: string, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(-4).padStart(4, '0').toUpperCase();
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <div className="flex items-center justify-between gap-1.5">
      <span>{label}</span>
      <button
        type="button"
        className={`grid size-5 shrink-0 place-items-center rounded transition-colors hover:bg-secondary hover:text-foreground ${active ? 'bg-secondary text-primary' : ''}`}
        onClick={() => onSort(sortKey)}
        aria-label={`${label}按${active && direction === 'asc' ? '降序' : '升序'}排列`}
        title={`按${label}排序`}
      >
        <Icon className="size-3" />
      </button>
    </div>
  );
}

function SankeyGraph({
  variables,
  annotations,
  maxDerivedStage,
  selectedLinkId,
  onSelectLink,
  onSelectNode,
  svgRef,
}: {
  variables: VariableRow[];
  annotations: Record<string, LinkAnnotation>;
  maxDerivedStage: number;
  selectedLinkId: string | null;
  onSelectLink: (id: string) => void;
  onSelectNode: (targets: NodeEditTarget[]) => void;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const flow = useMemo(() => buildFlow(variables), [variables]);
  const stages = useMemo(() => getStages(maxDerivedStage), [maxDerivedStage]);
  const columnLabels = useMemo(() => [...META_COLUMN_LABELS, ...stages.map((stage) => stage.label)], [stages]);
  const columnColors = useMemo(() => [...META_COLUMN_COLORS, ...stages.map((stage) => stage.color)], [stages]);
  const positioned = useMemo(() => {
    const scale = 12;
    const nodeWidth = 24;
    const byColumn = columnLabels.map((_, column) => flow.nodes.filter((node) => node.column === column));
    const nodeHeight = (node: FlowNode) => node.value > 0 ? node.value * scale : 2;
    const columnTotals = byColumn.map((nodes) => nodes.reduce((total, node) => total + nodeHeight(node), 0) + Math.max(0, nodes.length - 1) * 58);
    const height = Math.max(560, ...columnTotals.map((total) => total + 128));
    const positions = new Map<string, { x: number; y: number; h: number }>();
    byColumn.forEach((nodes, column) => {
      const gap = 58;
      const total = columnTotals[column];
      let cursor = Math.max(82, (height - total) / 2 + 24);
      nodes.forEach((node) => {
        const h = nodeHeight(node);
        positions.set(node.id, { x: 28 + column * 184, y: cursor, h });
        cursor += h + gap;
      });
    });

    const outgoingTotals = new Map<string, number>();
    flow.links.forEach((link) => outgoingTotals.set(link.source, (outgoingTotals.get(link.source) ?? 0) + link.baseWeight));
    const sourceCursors = new Map<string, number>();
    const targetCursors = new Map<string, number>();
    const linkBands = new Map<string, { sy0: number; sy1: number; ty0: number; ty1: number }>();
    const orderedLinks = [...flow.links].sort((a, b) => {
      const aSource = positions.get(a.source)?.y ?? 0;
      const bSource = positions.get(b.source)?.y ?? 0;
      return aSource - bSource;
    });

    orderedLinks.forEach((link) => {
      const source = positions.get(link.source);
      const target = positions.get(link.target);
      const sourceNode = flow.nodes.find((node) => node.id === link.source);
      const targetNode = flow.nodes.find((node) => node.id === link.target);
      if (!source || !target || !sourceNode || !targetNode) return;
      const bandHeight = link.baseWeight * scale;
      if (bandHeight <= 0) return;
      const sourceContentTop = source.y;
      const targetContentTop = target.y;
      const duplicates = (outgoingTotals.get(link.source) ?? 0) > sourceNode.value + 0.001;
      const sy0 = duplicates ? sourceContentTop : (sourceCursors.get(link.source) ?? sourceContentTop);
      const ty0 = targetCursors.get(link.target) ?? targetContentTop;
      if (!duplicates) sourceCursors.set(link.source, sy0 + bandHeight);
      targetCursors.set(link.target, ty0 + bandHeight);
      linkBands.set(link.id, { sy0, sy1: sy0 + bandHeight, ty0, ty1: ty0 + bandHeight });
    });

    const width = Math.max(1040, 80 + columnLabels.length * 184);
    return { positions, linkBands, height, nodeWidth, width };
  }, [columnLabels, flow.links, flow.nodes]);

  if (flow.nodes.length === 0) {
    return (
      <div className="grid h-[560px] place-items-center p-8 text-center">
        <div>
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-muted-foreground"><Link2 /></div>
          <p className="mt-4 font-heading text-lg font-semibold">暂无数据流</p>
          <p className="mt-1 text-sm text-muted-foreground">添加一个原始变量即可开始。</p>
        </div>
      </div>
    );
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${positioned.width} ${positioned.height}`}
      className="sankey-svg w-full"
      style={{ minWidth: positioned.width, minHeight: 560, height: positioned.height }}
      role="img"
      aria-label="建筑物理实验变量数据流桑基图"
    >
      <rect width={positioned.width} height={positioned.height} fill="transparent" />
      {columnLabels.map((label, index) => (
        <g key={label}>
          <text x={40 + index * 184} y="36" textAnchor="middle" className="sankey-column-label">{label}</text>
          <line x1={28 + index * 184} x2={52 + index * 184} y1="51" y2="51" stroke={columnColors[index]} strokeWidth="3" opacity=".72" />
        </g>
      ))}

      {flow.links.map((link) => {
        const source = positioned.positions.get(link.source);
        const target = positioned.positions.get(link.target);
        const band = positioned.linkBands.get(link.id);
        if (!source || !target || !band) return null;
        const weight = link.baseWeight;
        const sourceNode = flow.nodes.find((node) => node.id === link.source);
        const targetNode = flow.nodes.find((node) => node.id === link.target);
        const routingOnly = Boolean(sourceNode?.placeholder || targetNode?.placeholder);
        const annotation = routingOnly ? undefined : annotations[link.id];
        const x1 = source.x + (sourceNode?.placeholder ? 0 : positioned.nodeWidth);
        const x2 = target.x;
        const curve = Math.max(50, (x2 - x1) * 0.52);
        const path = `M ${x1} ${band.sy0} C ${x1 + curve} ${band.sy0}, ${x2 - curve} ${band.ty0}, ${x2} ${band.ty0} L ${x2} ${band.ty1} C ${x2 - curve} ${band.ty1}, ${x1 + curve} ${band.sy1}, ${x1} ${band.sy1} Z`;
        const color = targetNode?.color ?? sourceNode?.color ?? '#637068';
        const formula = annotation?.showFormula === false ? '' : annotation?.formula?.trim() ?? '';
        const formulaHtml = formula ? katex.renderToString(formula, { throwOnError: false, displayMode: false, trust: false, strict: 'ignore' }) : '';
        const centerY = (band.sy0 + band.sy1 + band.ty0 + band.ty1) / 4;
        const title = [
          `${sourceNode?.label} → ${targetNode?.label}`,
          `高度 ${formatValue(weight)}`,
          annotation?.note?.trim() ? `备注：${annotation.note.trim()}` : '',
        ].filter(Boolean).join('；');
        return (
          <g key={link.id} className={`sankey-link ${selectedLinkId === link.id ? 'is-selected' : ''}`}>
            {!routingOnly && <path d={path} fill="transparent" stroke="transparent" strokeWidth="10" onClick={() => onSelectLink(link.id)} tabIndex={0} role="button" aria-label={`编辑关系：${sourceNode?.label} 到 ${targetNode?.label}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectLink(link.id); }} />}
            <path className="sankey-flow" d={path} fill={color} fillOpacity={selectedLinkId === link.id ? 0.58 : 0.24} pointerEvents="none" />
            {formulaHtml && (
              <foreignObject x={(x1 + x2) / 2 - 70} y={centerY - 16} width="140" height="32" pointerEvents="none">
                <div xmlns="http://www.w3.org/1999/xhtml" className="sankey-formula-label" dangerouslySetInnerHTML={{ __html: formulaHtml }} />
              </foreignObject>
            )}
            {!routingOnly && <title>{title}</title>}
          </g>
        );
      })}

      {flow.nodes.map((node) => {
        const position = positioned.positions.get(node.id);
        if (!position || node.placeholder) return null;
        const lines = splitLabel(node.label);
        const isEditable = node.editTargets.length > 0;
        return (
          <g
            key={node.id}
            className={`sankey-node ${isEditable ? 'is-clickable' : ''}`}
            onClick={isEditable ? () => onSelectNode(node.editTargets) : undefined}
            onKeyDown={isEditable ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectNode(node.editTargets);
              }
            } : undefined}
            tabIndex={isEditable ? 0 : undefined}
            role={isEditable ? 'button' : undefined}
            aria-label={isEditable ? `定位并编辑：${node.label}` : undefined}
          >
            <rect x={position.x} y={position.y} width={positioned.nodeWidth} height={position.h} fill={node.color} />
            {lines.map((line, index) => (
              <text
                key={line}
                x={position.x + positioned.nodeWidth / 2}
                y={position.y - (lines.length - index) * 13 + 5}
                textAnchor="middle"
                fill={node.color}
                fontSize="10.5"
                fontWeight="650"
              >{line}</text>
            ))}
            <title>{`${node.label}；高度 ${formatValue(node.value)}${isEditable ? '；点击定位到变量表' : ''}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

function UpstreamPicker({ row, variables, onChange }: { row: VariableRow; variables: VariableRow[]; onChange: (parents: string[]) => void }) {
  const candidates = variables.filter((candidate) => candidate.id !== row.id && stageLevel(candidate.stage) < stageLevel(row.stage));
  const selectedNames = row.parents.map((id) => variables.find((candidate) => candidate.id === id)?.name).filter(Boolean);

  return (
    <details className="upstream-picker relative">
      <summary className="flex h-8 min-w-[148px] cursor-pointer list-none items-center justify-between gap-2 rounded-lg border bg-background px-2.5 text-xs hover:bg-secondary">
        <span className="max-w-[115px] truncate">{selectedNames.length ? `已选 ${selectedNames.length} 项` : '点选上游变量'}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </summary>
      <div className="mt-2 w-72 rounded-xl border bg-popover p-2 shadow-lg">
        <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">可选的前置数据</p>
        {candidates.length ? (
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {candidates.map((candidate) => {
              const checked = row.parents.includes(candidate.id);
              return (
                <label key={candidate.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-secondary">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onChange(event.target.checked ? [...row.parents, candidate.id] : row.parents.filter((id) => id !== candidate.id))}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{candidate.name || '未命名变量'}</span>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{candidate.stage === 'raw' ? '原始 0' : `衍生 ${stageLevel(candidate.stage)}`}</Badge>
                </label>
              );
            })}
          </div>
        ) : <p className="px-2 py-4 text-center text-xs text-muted-foreground">请先添加更早层级的变量</p>}
      </div>
    </details>
  );
}

function FormulaPreview({ formula }: { formula: string }) {
  const html = useMemo(() => {
    if (!formula.trim()) return '';
    return katex.renderToString(formula, { throwOnError: false, displayMode: true, trust: false, strict: 'ignore' });
  }, [formula]);

  if (!formula.trim()) return <span className="text-xs text-muted-foreground">在上方输入 LaTeX，此处实时预览</span>;
  return <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function Home() {
  const [variables, setVariables] = useState<VariableRow[]>(SAMPLE_VARIABLES);
  const [annotations, setAnnotations] = useState<Record<string, LinkAnnotation>>(SAMPLE_ANNOTATIONS);
  const [metric, setMetric] = useState<FlowMetric>('数据权重');
  const [maxDerivedStage, setMaxDerivedStage] = useState(() => maxStageIn(SAMPLE_VARIABLES));
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [focusedVariableIds, setFocusedVariableIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [draggedVariableId, setDraggedVariableId] = useState<string | null>(null);
  const [dragOverVariableId, setDragOverVariableId] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteMessage, setPasteMessage] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const variableRowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const focusTimerRef = useRef<number | null>(null);
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as ProjectState;
        if (Array.isArray(parsed.variables)) {
          const normalized = normalizeVariables(parsed.variables);
          setVariables(normalized);
          setMaxDerivedStage(Math.max(parsed.maxDerivedStage ?? MIN_DERIVED_STAGES, maxStageIn(normalized)));
        }
        if (parsed.annotations) setAnnotations(parsed.annotations);
        if (parsed.metric) setMetric(parsed.metric);
      }
    } catch {
      // A malformed local draft should never prevent the editor from opening.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const state: ProjectState = { variables, annotations, metric, maxDerivedStage };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [variables, annotations, metric, maxDerivedStage, hydrated]);

  useEffect(() => () => {
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
  }, []);

  const flow = useMemo(() => buildFlow(variables), [variables]);
  const displayedVariables = useMemo(() => {
    if (!sortKey) return variables;
    const originalIndexes = new Map(variables.map((variable, index) => [variable.id, index]));
    const valueFor = (variable: VariableRow): string | number => {
      if (sortKey === 'stage') return stageLevel(variable.stage);
      if (sortKey === 'height') return flow.variableValues.get(variable.id) ?? 0;
      if (sortKey === 'parents') {
        return variable.parents.map((parentId) => variables.find((candidate) => candidate.id === parentId)?.name ?? '').join('\u0000');
      }
      return variable[sortKey];
    };
    return [...variables].sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison = typeof aValue === 'number' && typeof bValue === 'number'
        ? aValue - bValue
        : String(aValue).localeCompare(String(bValue), 'zh-CN', { numeric: true, sensitivity: 'base' });
      if (comparison !== 0) return sortDirection === 'asc' ? comparison : -comparison;
      return (originalIndexes.get(a.id) ?? 0) - (originalIndexes.get(b.id) ?? 0);
    });
  }, [flow.variableValues, sortDirection, sortKey, variables]);
  const stages = useMemo(() => getStages(maxDerivedStage), [maxDerivedStage]);
  const columnLabels = useMemo(() => [...META_COLUMN_LABELS, ...stages.map((stage) => stage.label)], [stages]);
  const columnColors = useMemo(() => [...META_COLUMN_COLORS, ...stages.map((stage) => stage.color)], [stages]);
  const selectedLink = flow.links.find((link) => link.id === selectedLinkId) ?? null;
  const selectedSource = selectedLink ? flow.nodes.find((node) => node.id === selectedLink.source) : null;
  const selectedTarget = selectedLink ? flow.nodes.find((node) => node.id === selectedLink.target) : null;
  const selectedAnnotation = selectedLinkId ? annotations[selectedLinkId] ?? { note: '', formula: '', showFormula: true } : { note: '', formula: '', showFormula: true };
  const highestStageHasVariables = variables.some((variable) => stageLevel(variable.stage) === maxDerivedStage);
  const canRemoveDerivedStage = maxDerivedStage > MIN_DERIVED_STAGES && !highestStageHasVariables;

  const updateVariable = <K extends keyof VariableRow>(id: string, key: K, value: VariableRow[K]) => {
    if (key === 'stage') setMaxDerivedStage((current) => Math.max(current, stageLevel(normalizeStage(value))));
    setVariables((current) => current.map((variable) => {
      if (variable.id !== id) return variable;
      if (key === 'stage') {
        const nextStage = normalizeStage(value);
        return {
          ...variable,
          stage: nextStage,
          parents: nextStage === 'raw' ? [] : variable.parents.filter((parentId) => {
            const parent = current.find((candidate) => candidate.id === parentId);
            return parent && stageLevel(parent.stage) < stageLevel(nextStage);
          }),
        };
      }
      return { ...variable, [key]: value };
    }));
  };

  const addVariable = () => {
    const previous = variables.at(-1);
    const row: VariableRow = {
      id: makeId('variable'),
      name: '新变量',
      stage: 'd1',
      purpose: previous?.purpose ?? '',
      condition: '',
      component: '',
      instrument: '',
      parents: [],
      weight: 1,
    };
    setVariables((current) => [...current, row]);
  };

  const addDerivedStage = () => {
    setMaxDerivedStage((current) => current + 1);
  };

  const removeDerivedStage = () => {
    if (!canRemoveDerivedStage) return;
    setMaxDerivedStage((current) => Math.max(MIN_DERIVED_STAGES, current - 1));
    setSelectedLinkId(null);
  };

  const removeVariable = (id: string) => {
    setVariables((current) => current.filter((variable) => variable.id !== id).map((variable) => ({ ...variable, parents: variable.parents.filter((parent) => parent !== id) })));
    setAnnotations((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.includes(`${id}=>`) && !key.includes(`=>${id}`))));
    if (selectedLinkId?.includes(id)) setSelectedLinkId(null);
  };

  const updateAnnotation = (patch: Partial<LinkAnnotation>) => {
    if (!selectedLinkId) return;
    setAnnotations((current) => ({
      ...current,
      [selectedLinkId]: { note: '', formula: '', showFormula: true, ...current[selectedLinkId], ...patch },
    }));
  };

  const toggleSelectedLink = (id: string) => {
    setSelectedLinkId((current) => current === id ? null : id);
  };

  const focusVariableRows = (targets: NodeEditTarget[]) => {
    const firstTarget = targets[0];
    if (!firstTarget) return;
    const row = variableRowRefs.current.get(firstTarget.rowId);
    if (!row) return;
    setSelectedLinkId(null);
    setFocusedVariableIds([...new Set(targets.map((target) => target.rowId))]);
    row.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
    if (highlightTimerRef.current !== null) window.clearTimeout(highlightTimerRef.current);
    focusTimerRef.current = window.setTimeout(() => {
      const fieldInput = row.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-variable-field="${firstTarget.field}"]`);
      fieldInput?.focus({ preventScroll: true });
      fieldInput?.select();
      focusTimerRef.current = null;
    }, 520);
    highlightTimerRef.current = window.setTimeout(() => {
      setFocusedVariableIds([]);
      highlightTimerRef.current = null;
    }, 2200);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const applyManualOrder = (orderedIds: string[]) => {
    setVariables((current) => {
      const byId = new Map(current.map((variable) => [variable.id, variable]));
      return orderedIds.map((id) => byId.get(id)).filter((variable): variable is VariableRow => Boolean(variable));
    });
    setSortKey(null);
  };

  const moveVariable = (id: string, direction: -1 | 1) => {
    const orderedIds = displayedVariables.map((variable) => variable.id);
    const index = orderedIds.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= orderedIds.length) return;
    [orderedIds[index], orderedIds[nextIndex]] = [orderedIds[nextIndex], orderedIds[index]];
    applyManualOrder(orderedIds);
  };

  const dropVariable = (event: React.DragEvent<HTMLTableRowElement>, targetId: string) => {
    event.preventDefault();
    if (!draggedVariableId || draggedVariableId === targetId) {
      setDragOverVariableId(null);
      return;
    }
    const orderedIds = displayedVariables.map((variable) => variable.id).filter((id) => id !== draggedVariableId);
    const targetIndex = orderedIds.indexOf(targetId);
    const bounds = event.currentTarget.getBoundingClientRect();
    const insertAfter = event.clientY > bounds.top + bounds.height / 2;
    orderedIds.splice(targetIndex + (insertAfter ? 1 : 0), 0, draggedVariableId);
    applyManualOrder(orderedIds);
    setDraggedVariableId(null);
    setDragOverVariableId(null);
  };

  const downloadFile = (name: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportProject = () => {
    downloadFile('建筑物理实验变量数据流.json', JSON.stringify({ variables, annotations, metric, maxDerivedStage }, null, 2), 'application/json');
  };

  const exportSvg = () => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.querySelectorAll('.sankey-column-label').forEach((element) => element.setAttribute('style', 'fill:#77786f;font-size:11px;font-weight:650;letter-spacing:.06em'));
    clone.querySelectorAll('.sankey-flow').forEach((element) => element.setAttribute('stroke-linecap', 'round'));
    downloadFile('实验变量数据流-桑基图.svg', new XMLSerializer().serializeToString(clone), 'image/svg+xml;charset=utf-8');
  };

  const importJson = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ProjectState;
        if (!Array.isArray(parsed.variables)) throw new Error('invalid');
        const normalized = normalizeVariables(parsed.variables);
        setVariables(normalized);
        setMaxDerivedStage(Math.max(parsed.maxDerivedStage ?? MIN_DERIVED_STAGES, maxStageIn(normalized)));
        setAnnotations(parsed.annotations ?? {});
        setMetric(parsed.metric ?? '数据权重');
      } catch {
        window.alert('无法读取该项目文件，请检查 JSON 格式。');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const importPastedTable = () => {
    const lines = pasteText.split(/\r?\n/).map((line) => line.split('\t')).filter((cells) => cells.some((cell) => cell.trim()));
    const headerIndex = lines.findIndex((cells) => cells.some((cell) => cell.includes('实验目的')) && cells.some((cell) => cell.includes('原始数据')));
    if (headerIndex < 0) {
      setPasteMessage('未找到表头。请从包含“实验目的”的标题行开始粘贴。');
      return;
    }
    const header = lines[headerIndex].map((cell) => cell.trim());
    const find = (text: string) => header.findIndex((cell) => cell.includes(text));
    const purposeIndex = find('实验目的');
    const contextIndex = header.findIndex((cell) => cell.includes('实验条件') || cell.includes('装置'));
    const instrumentIndex = find('测量仪器');
    const stageIndexes: Array<[Stage, number]> = [['raw', find('原始数据')]];
    header.forEach((cell, index) => {
      const match = cell.match(/衍生数据\s*(\d+)/);
      if (match) stageIndexes.push([`d${Number(match[1])}` as Stage, index]);
    });
    stageIndexes.sort((a, b) => stageLevel(a[0]) - stageLevel(b[0]));
    let purpose = '';
    let component = '';
    let instrument = '';
    const imported: VariableRow[] = [];
    lines.slice(headerIndex + 1).forEach((cells) => {
      const read = (index: number) => index >= 0 ? (cells[index] ?? '').trim() : '';
      purpose = read(purposeIndex) || purpose;
      component = read(contextIndex) || component;
      instrument = read(instrumentIndex) || instrument;
      let lastCreated: VariableRow | null = null;
      stageIndexes.forEach(([stage, index]) => {
        const name = read(index);
        if (!name) return;
        const row: VariableRow = {
          id: makeId(stage),
          name,
          stage,
          purpose,
          condition: '',
          component,
          instrument: stage === 'raw' ? instrument : '',
          parents: lastCreated ? [lastCreated.id] : [],
          weight: 1,
        };
        imported.push(row);
        lastCreated = row;
      });
    });
    if (!imported.length) {
      setPasteMessage('找到了表头，但没有识别到变量数据。');
      return;
    }
    setVariables(imported);
    setMaxDerivedStage(maxStageIn(imported));
    setAnnotations({});
    setSelectedLinkId(null);
    setPasteOpen(false);
    setPasteText('');
    setPasteMessage('');
  };

  const resetSample = () => {
    setVariables(SAMPLE_VARIABLES);
    setAnnotations(SAMPLE_ANNOTATIONS);
    setMetric('数据权重');
    setMaxDerivedStage(maxStageIn(SAMPLE_VARIABLES));
    setSelectedLinkId(null);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/80 bg-card/92 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1760px] flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-7">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><FlaskConical className="size-5" /></div>
            <div>
              <h1 className="font-heading text-[17px] font-semibold tracking-tight">实验变量数据流</h1>
              <p className="text-[10px] font-semibold tracking-[0.13em] text-muted-foreground">BUILDING PHYSICS · DATA LINEAGE</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline" className="h-7 gap-1.5 bg-background/70 text-[11px]"><Check className="size-3 text-primary" />本地服务 · 自动保存</Badge>
            <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)}><ClipboardPaste />粘贴表格</Button>
            <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border bg-background px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-muted">
              <FileJson className="size-3.5" />导入项目
              <input type="file" accept="application/json,.json" className="sr-only" onChange={importJson} />
            </label>
            <Button size="sm" onClick={exportProject}><Download />导出项目</Button>
          </div>
        </div>
      </header>

      <section className="mx-auto flex max-w-[1760px] flex-col gap-4 p-4 lg:px-7">
        <section className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-[0_7px_28px_rgb(62_52_37/6%)]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4">
            <div>
              <p className="eyebrow">01 · 数据编辑</p>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="font-heading text-xl font-semibold">实验变量表</h2>
                <Badge variant="secondary">{variables.length} 个变量</Badge>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={resetSample} title="恢复含湿特性示例"><RotateCcw />示例</Button>
              <Button variant="outline" size="sm" onClick={addDerivedStage} title={`新增衍生数据 ${maxDerivedStage + 1}`}><Layers3 />增加衍生层级</Button>
              <Button
                variant="outline"
                size="sm"
                onClick={removeDerivedStage}
                disabled={!canRemoveDerivedStage}
                title={maxDerivedStage <= MIN_DERIVED_STAGES
                  ? '至少保留一个衍生层级'
                  : highestStageHasVariables
                    ? `衍生数据 ${maxDerivedStage} 中仍有变量，请先移动或删除这些变量`
                    : `删除空的衍生数据 ${maxDerivedStage}`}
              ><Trash2 />删除末级</Button>
              <Button size="sm" onClick={addVariable}><Plus />添加变量</Button>
            </div>
          </div>

          <div className="border-b bg-secondary/35 px-5 py-3 text-xs leading-5 text-muted-foreground">
            <span className="font-semibold text-foreground">输入要领：</span>文本框支持换行；空字段会使用隐形占位点保持逐列流动；同层同名节点在图中合并并累加高度。用表头按钮整理表格，用 # 控制图中上下顺序；衍生层级从末级删除，末级含变量时需先移出。
          </div>

          <div className="editor-scroll max-h-[56vh] min-h-[420px] overflow-auto">
            <table className="w-full min-w-[1540px] border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20 bg-card text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground shadow-[0_1px_0_var(--border)]">
                <tr>
                  <th className="w-36 px-3 py-3 text-center" title="# 用于控制同层节点在图中的上下顺序"># · 图层顺序</th>
                  <th className="w-28 px-2 py-3"><SortableHeader label="数据层级" sortKey="stage" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="w-48 px-2 py-3"><SortableHeader label="变量名称" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="w-36 px-2 py-3"><SortableHeader label="实验目的" sortKey="purpose" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="w-36 px-2 py-3"><SortableHeader label="实验条件" sortKey="condition" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="w-40 px-2 py-3"><SortableHeader label="组件 / 装置" sortKey="component" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="w-52 px-2 py-3"><SortableHeader label="测量仪器" sortKey="instrument" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="w-44 px-2 py-3"><SortableHeader label="上游关系" sortKey="parents" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="w-28 px-2 py-3"><SortableHeader label="高度值" sortKey="height" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {displayedVariables.map((row, index) => {
                  const raw = row.stage === 'raw';
                  const computedHeight = flow.variableValues.get(row.id) ?? 0;
                  return (
                    <tr
                      key={row.id}
                      ref={(element) => {
                        if (element) variableRowRefs.current.set(row.id, element);
                        else variableRowRefs.current.delete(row.id);
                      }}
                      data-variable-row={row.id}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnter={() => setDragOverVariableId(row.id)}
                      onDrop={(event) => dropVariable(event, row.id)}
                      className={`group border-b transition-colors hover:bg-secondary/35 ${focusedVariableIds.includes(row.id) ? 'variable-row-target' : ''} ${dragOverVariableId === row.id && draggedVariableId !== row.id ? 'variable-row-drop-target' : ''}`}
                    >
                      <td className="border-b px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = 'move';
                              event.dataTransfer.setData('text/plain', row.id);
                              setDraggedVariableId(row.id);
                            }}
                            onDragEnd={() => {
                              setDraggedVariableId(null);
                              setDragOverVariableId(null);
                            }}
                            className="grid size-7 cursor-grab place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground active:cursor-grabbing"
                            aria-label={`拖动调整 ${row.name} 的图层顺序`}
                            title={`哈希 #${shortHash(row.id)} · 拖动排序`}
                          ><GripVertical className="size-3.5" /></button>
                          <span className="min-w-9 font-mono text-[9px] text-muted-foreground" title={row.id}>#{shortHash(row.id)}</span>
                          <div className="flex flex-col">
                            <button type="button" className="grid size-4 place-items-center rounded hover:bg-secondary disabled:opacity-25" onClick={() => moveVariable(row.id, -1)} disabled={index === 0} aria-label={`上移 ${row.name}`}><ArrowUp className="size-2.5" /></button>
                            <button type="button" className="grid size-4 place-items-center rounded hover:bg-secondary disabled:opacity-25" onClick={() => moveVariable(row.id, 1)} disabled={index === displayedVariables.length - 1} aria-label={`下移 ${row.name}`}><ArrowDown className="size-2.5" /></button>
                          </div>
                        </div>
                      </td>
                      <td className="border-b px-2 py-3">
                        <NativeSelect className="w-full" size="sm" value={row.stage} onChange={(event) => updateVariable(row.id, 'stage', event.target.value as Stage)} aria-label={`第 ${index + 1} 行数据层级`}>
                          {stages.map((stage) => <NativeSelectOption key={stage.value} value={stage.value}>{stage.short}</NativeSelectOption>)}
                        </NativeSelect>
                      </td>
                      <td className="border-b px-2 py-3"><Textarea data-variable-field="name" className="min-h-12 resize-y py-2 text-sm leading-5" value={row.name} onChange={(event) => updateVariable(row.id, 'name', event.target.value)} aria-label={`第 ${index + 1} 行变量名称`} /></td>
                      <td className="border-b px-2 py-3"><Textarea data-variable-field="purpose" className="min-h-12 resize-y py-2 text-sm leading-5" value={row.purpose} onChange={(event) => updateVariable(row.id, 'purpose', event.target.value)} placeholder="如：测含湿量" aria-label={`第 ${index + 1} 行实验目的`} /></td>
                      <td className="border-b px-2 py-3"><Textarea data-variable-field="condition" className="min-h-12 resize-y py-2 text-sm leading-5" value={row.condition} onChange={(event) => updateVariable(row.id, 'condition', event.target.value)} placeholder="如：真空饱和" aria-label={`第 ${index + 1} 行实验条件`} /></td>
                      <td className="border-b px-2 py-3"><Textarea data-variable-field="component" className="min-h-12 resize-y py-2 text-sm leading-5" value={row.component} onChange={(event) => updateVariable(row.id, 'component', event.target.value)} placeholder="如：真空箱" aria-label={`第 ${index + 1} 行实验装置`} /></td>
                      <td className="border-b px-2 py-3"><Textarea data-variable-field="instrument" className="min-h-12 resize-y py-2 text-sm leading-5" value={row.instrument} onChange={(event) => updateVariable(row.id, 'instrument', event.target.value)} placeholder={raw ? '型号、量程、精度' : '由上游继承'} disabled={!raw} aria-label={`第 ${index + 1} 行测量仪器`} /></td>
                      <td className="border-b px-2 py-3">{raw ? <div className="flex h-8 items-center gap-2 rounded-lg border border-dashed px-2.5 text-xs text-muted-foreground"><Link2 className="size-3.5" />仪器自动连接</div> : <UpstreamPicker row={row} variables={variables} onChange={(parents) => updateVariable(row.id, 'parents', parents)} />}</td>
                      <td className="border-b px-2 py-3">
                        {raw ? (
                          <Input type="number" min="0.1" step="0.1" value={row.weight} onChange={(event) => updateVariable(row.id, 'weight', safeNumber(event.target.value))} aria-label={`第 ${index + 1} 行原始高度`} />
                        ) : (
                          <div className="flex h-8 items-center justify-between rounded-lg border bg-secondary/45 px-2.5 text-xs" title="由所有上游变量的高度自动相加">
                            <span className="text-[10px] font-semibold text-muted-foreground">自动</span>
                            <span className="font-mono font-semibold">{formatValue(computedHeight)}</span>
                          </div>
                        )}
                      </td>
                      <td className="border-b px-2 py-3"><Button variant="ghost" size="icon-sm" onClick={() => removeVariable(row.id)} aria-label={`删除 ${row.name}`} title="删除变量"><Trash2 /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!variables.length && <div className="grid min-h-[420px] place-items-center text-center"><div><p className="font-heading text-lg font-semibold">变量表为空</p><Button className="mt-3" onClick={addVariable}><Plus />添加第一个变量</Button></div></div>}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-[0_7px_28px_rgb(62_52_37/6%)]">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4">
            <div>
              <p className="eyebrow">02 · 实时结果</p>
              <div className="mt-1 flex items-center gap-2"><h2 className="font-heading text-xl font-semibold">数据血缘桑基图</h2><Badge variant="secondary">{flow.links.length} 条流</Badge></div>
            </div>
            <div className="flex items-center gap-2">
              <NativeSelect size="sm" value={metric} onChange={(event) => setMetric(event.target.value as FlowMetric)} aria-label="高度值的含义">
                <NativeSelectOption value="数据权重">高度：数据权重</NativeSelectOption>
                <NativeSelectOption value="样本量">高度：样本量</NativeSelectOption>
                <NativeSelectOption value="不确定度">高度：不确定度</NativeSelectOption>
              </NativeSelect>
              <Button variant="outline" size="sm" onClick={exportSvg}><Download />SVG</Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 border-b bg-secondary/30 px-5 py-2.5">
            {columnLabels.map((label, index) => <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><i className="size-2 rounded-full" style={{ background: columnColors[index] }} />{label}</span>)}
          </div>

          <div className="graph-scroll relative h-[62vh] min-h-[540px] overflow-auto bg-[radial-gradient(circle_at_1px_1px,#d8d6cc_1px,transparent_0)] bg-[size:22px_22px]">
            <SankeyGraph variables={variables} annotations={annotations} maxDerivedStage={maxDerivedStage} selectedLinkId={selectedLinkId} onSelectLink={toggleSelectedLink} onSelectNode={focusVariableRows} svgRef={svgRef} />
          </div>
          <div className="flex items-center gap-2 border-t bg-secondary/25 px-5 py-2.5 text-[11px] text-muted-foreground">
            <CircleHelp className="size-3.5 shrink-0" />点击流带可编辑，再次点击可取消；点击任意节点会定位并聚焦上方表格中的对应字段。同层同名节点会自动合并。
          </div>

          {selectedLink && selectedLinkId && (
            <aside className="relation-panel border-t bg-card px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">RELATION · 关系注释</p>
                  <p className="mt-1 text-sm font-semibold leading-5">{selectedSource?.label} <span className="text-primary">→</span> {selectedTarget?.label}</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setSelectedLinkId(null)} aria-label="关闭关系编辑器"><X /></Button>
              </div>
              <div className="mt-4 grid gap-4 2xl:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold">流备注</label>
                  <Textarea className="mt-1 min-h-24 resize-y" value={selectedAnnotation.note} onChange={(event) => updateAnnotation({ note: event.target.value })} placeholder="例：连续多次测量，极值不变时判定为稳定…" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold">LaTeX 公式</label>
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
                        <Switch size="sm" checked={selectedAnnotation.showFormula !== false} onCheckedChange={(checked) => updateAnnotation({ showFormula: checked })} aria-label="在图中显示公式" />
                        图中显示
                      </label>
                      <div className="flex gap-1">
                        {['\\frac{a}{b}', '\\rho', '_{d}'].map((snippet) => <button key={snippet} type="button" className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-secondary" onClick={() => updateAnnotation({ formula: `${selectedAnnotation.formula}${snippet}` })}>{snippet}</button>)}
                      </div>
                    </div>
                  </div>
                  <div className="relative mt-1"><Braces className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" /><Input className="pl-8 font-mono text-xs" value={selectedAnnotation.formula} onChange={(event) => updateAnnotation({ formula: event.target.value })} placeholder="\\rho_d = \\frac{m_d}{V}" /></div>
                  <div className="mt-2 grid min-h-14 place-items-center rounded-xl border bg-secondary/35 px-3 py-2 text-center"><FormulaPreview formula={selectedAnnotation.formula} /></div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-secondary/25 px-3 py-2.5">
                <div><p className="text-xs font-semibold">关系高度</p><p className="mt-1 text-[10px] leading-4 text-muted-foreground">由上游节点的{metric}自动继承，不需要单独输入。</p></div>
                <Badge className="h-7 bg-primary px-3 text-xs">自动继承</Badge>
              </div>
            </aside>
          )}
        </section>
      </section>

      {pasteOpen && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-[#20251f]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="paste-title">
          <div className="max-h-[calc(100vh-32px)] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="eyebrow">IMPORT · 批量录入</p><h2 id="paste-title" className="mt-1 font-heading text-xl font-semibold">从 Excel / WPS 粘贴表格</h2></div>
              <Button variant="ghost" size="icon" onClick={() => setPasteOpen(false)} aria-label="关闭粘贴表格对话框"><X /></Button>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">从“实验目的”表头行开始复制。网页会自动识别原始数据和任意编号的衍生数据层级，同一行内会自动连接；其余关系可在导入后点选补充。
            </p>
            <Textarea autoFocus className="mt-4 min-h-72 resize-y font-mono text-xs leading-5" value={pasteText} onChange={(event) => { setPasteText(event.target.value); setPasteMessage(''); }} placeholder={'实验目的\t实验条件/装置\t测量仪器\t原始数据0\t01关系\t衍生数据1…'} />
            {pasteMessage && <p className="mt-2 text-sm text-destructive">{pasteMessage}</p>}
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">导入会替换当前表格；已有内容可先“导出项目”备份。</p>
              <div className="flex shrink-0 gap-2"><Button variant="outline" onClick={() => setPasteOpen(false)}>取消</Button><Button onClick={importPastedTable}><ClipboardPaste />解析并导入</Button></div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
