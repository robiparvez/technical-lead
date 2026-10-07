import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { DiagramSpec } from '@/data/types';
import { C, Dot, chevron, seg, tone, weight } from './shared';

/**
 * Remotion composition for data-driven DiagramSpec values authored in topic
 * JSON. Same conventions as the hand-built diagrams: area shapes carry
 * fill="none"; fill appears only on text; arrowheads are open chevrons. The
 * whole layout is always visible; an accent dot walks the flow, and each node
 * or path is secondary before the dot reaches it, accent while current, and
 * primary once visited. The timeline loops after a short hold.
 */

const WIDTH = 720;
const BOX_H = 54;
const PAD = 24;
const FPS = 30;

/** Frames the dot rests on a node, travels one edge, and holds before looping. */
const DWELL = 18;
const TRAVEL = 24;
const HOLD = 45;
/** Compare tables: frames spent reading a row and moving to the next one. */
const READ = 45;
const MOVE = 12;

/** Word-wraps a label into SVG tspans that fit roughly `maxChars` per line. */
function Lines({ text, x, y, max, size, color, weight }: {
    text: string;
    x: number;
    y: number;
    max: number;
    size: number;
    color: string;
    weight?: string;
}) {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > max && current) {
            lines.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }
    if (current) lines.push(current);
    const lead = size + 3;
    return (
        <text x={x} y={y} textAnchor='middle' fontSize={size} fontWeight={weight} fill={color}>
            {lines.slice(0, 3).map((line, i) => (
                <tspan key={i} x={x} dy={i === 0 ? 0 : lead}>
                    {line}
                </tspan>
            ))}
        </text>
    );
}

/** Truncates with an ellipsis so table cells never overflow their column. */
function fit(text: string, max: number) {
    return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Frame the dot reaches item i when each item costs one dwell plus one travel. */
const arrive = (i: number) => i * (DWELL + TRAVEL);

/** Frame the dot leaves item i, or Infinity for the last item so it stays current. */
const leave = (i: number, count: number) => (i + 1 < count ? arrive(i + 1) : Infinity);

function flowLayout(spec: Extract<DiagramSpec, { kind: 'flow' }>) {
    const n = spec.steps.length;
    const perRow = n <= 4 ? n : Math.ceil(n / 2);
    const rows = Math.ceil(n / perRow);
    const colW = (WIDTH - 2 * PAD) / perRow;
    return { perRow, colW, height: PAD + rows * (BOX_H + 46) + 14, boxW: Math.min(colW - 22, 190) };
}

function FlowDiagram({ spec }: { spec: Extract<DiagramSpec, { kind: 'flow' }> }) {
    const frame = useCurrentFrame();
    const steps = spec.steps;
    const { perRow, colW, height, boxW } = flowLayout(spec);
    return (
        <svg className='static-diagram' viewBox={`0 0 ${WIDTH} ${height}`}>
            {steps.map((step, i) => {
                const row = Math.floor(i / perRow);
                const col = i % perRow;
                const x = PAD + col * colW + (colW - boxW) / 2;
                const y = PAD + row * (BOX_H + 46);
                const next = i + 1 < steps.length ? steps[i + 1] : null;
                const nextRow = Math.floor((i + 1) / perRow);
                const nextCol = (i + 1) % perRow;
                const sameRow = nextRow === row;
                const nx = PAD + nextCol * colW + (colW - boxW) / 2;
                const box = tone(frame, arrive(i), leave(i, steps.length));
                const go = arrive(i) + DWELL;
                const edge = tone(frame, go, go + TRAVEL);
                const path: [number, number][] = sameRow
                    ? [
                          [x + boxW, y + BOX_H / 2],
                          [nx - 2, y + BOX_H / 2],
                      ]
                    : [
                          [x + boxW / 2, y + BOX_H],
                          [x + boxW / 2, y + BOX_H + 23],
                          [nx + boxW / 2, y + BOX_H + 23],
                          [nx + boxW / 2, y + BOX_H + 44],
                      ];
                return (
                    <g key={step.label}>
                        <rect
                            x={x}
                            y={y}
                            width={boxW}
                            height={BOX_H}
                            rx='8'
                            fill='none'
                            stroke={box}
                            strokeWidth={weight(box)}
                        />
                        <Lines
                            text={step.label}
                            x={x + boxW / 2}
                            y={y + (step.note ? 22 : 31)}
                            max={Math.floor(boxW / 6.2)}
                            size={11}
                            color={C.primary}
                            weight='600'
                        />
                        {step.note && (
                            <Lines
                                text={step.note}
                                x={x + boxW / 2}
                                y={y + (step.label.length > Math.floor(boxW / 6.2) ? 50 : 40)}
                                max={Math.floor(boxW / 5.6)}
                                size={9}
                                color={C.secondary}
                            />
                        )}
                        {next && !sameRow && (
                            <g>
                                <polyline
                                    points={`${x + boxW / 2},${y + BOX_H} ${x + boxW / 2},${y + BOX_H + 23} ${nx + boxW / 2},${y + BOX_H + 23} ${nx + boxW / 2},${y + BOX_H + 37}`}
                                    fill='none'
                                    stroke={edge}
                                    strokeWidth={weight(edge)}
                                />
                                {chevron(nx + boxW / 2, y + BOX_H + 44, 90, edge, `w${i}`, 6, 1.5)}
                            </g>
                        )}
                        {next && sameRow && (
                            <g>
                                <line
                                    x1={x + boxW}
                                    y1={y + BOX_H / 2}
                                    x2={nx - 9}
                                    y2={y + BOX_H / 2}
                                    stroke={edge}
                                    strokeWidth={weight(edge)}
                                />
                                {chevron(nx - 2, y + BOX_H / 2, 0, edge, `a${i}`, 6, 1.5)}
                            </g>
                        )}
                        {next && <Dot points={path} p={seg(frame, go, go + TRAVEL)} />}
                    </g>
                );
            })}
        </svg>
    );
}

const BRANCH_H = 260;
/** One branch pass: decision dwell, travel down the edge, then a double dwell on the outcome. */
const PASS = DWELL + TRAVEL + 2 * DWELL;

function BranchDiagram({ spec }: { spec: Extract<DiagramSpec, { kind: 'branch' }> }) {
    const frame = useCurrentFrame();
    const condW = 240;
    const condX = (WIDTH - condW) / 2;
    const leafW = 250;
    const yesX = WIDTH / 2 - leafW - 40;
    const noX = WIDTH / 2 + 40;
    // The decision is current while the dot sits on it or leaves it, once per pass.
    const deciding = [0, PASS].some((start) => frame >= start && frame < start + DWELL + TRAVEL);
    const cond = deciding ? C.accent : C.primary;
    return (
        <svg className='static-diagram' viewBox={`0 0 ${WIDTH} ${BRANCH_H}`}>
            <rect
                x={condX}
                y={PAD}
                width={condW}
                height={BOX_H + 6}
                rx='8'
                fill='none'
                stroke={cond}
                strokeWidth={weight(cond)}
            />
            <Lines
                text={spec.condition}
                x={WIDTH / 2}
                y={PAD + 24}
                max={Math.floor(condW / 6)}
                size={11}
                color={C.primary}
                weight='600'
            />
            {[
                { spec: spec.yes, x: yesX, edge: spec.yesLabel ?? 'yes', key: 'yes', start: 0 },
                { spec: spec.no, x: noX, edge: spec.noLabel ?? 'no', key: 'no', start: PASS },
            ].map(({ spec: leaf, x, edge, key, start }) => {
                const midY = PAD + BOX_H + 26;
                const cx = x + leafW / 2;
                const tipX = cx > WIDTH / 2 ? x : x + leafW;
                const go = start + DWELL;
                const path = tone(frame, go, go + TRAVEL);
                const box = tone(frame, go + TRAVEL, key === 'yes' ? start + PASS : Infinity);
                return (
                    <g key={key}>
                        <polyline
                            points={`${WIDTH / 2},${PAD + BOX_H + 6} ${WIDTH / 2},${midY} ${cx > WIDTH / 2 ? x - 9 : x + leafW + 9},${midY}`}
                            fill='none'
                            stroke={path}
                            strokeWidth={weight(path)}
                        />
                        {chevron(tipX, midY, cx > WIDTH / 2 ? 0 : 180, path, `e${key}`, 6, 1.5)}
                        <text
                            x={(WIDTH / 2 + cx) / 2}
                            y={midY - 8}
                            textAnchor='middle'
                            fontSize='10'
                            fill={C.secondary}
                        >
                            {edge}
                        </text>
                        <rect
                            x={x}
                            y={midY}
                            width={leafW}
                            height={BOX_H + 12}
                            rx='8'
                            fill='none'
                            stroke={box}
                            strokeWidth={weight(box)}
                        />
                        <Lines
                            text={leaf.label}
                            x={cx}
                            y={midY + (leaf.note ? 22 : 33)}
                            max={Math.floor(leafW / 6)}
                            size={11}
                            color={C.primary}
                            weight='600'
                        />
                        {leaf.note && (
                            <Lines
                                text={leaf.note}
                                x={cx}
                                y={midY + (leaf.label.length > Math.floor(leafW / 6) ? 52 : 42)}
                                max={Math.floor(leafW / 5.6)}
                                size={9}
                                color={C.secondary}
                            />
                        )}
                        <Dot
                            points={[
                                [WIDTH / 2, PAD + BOX_H + 6],
                                [WIDTH / 2, midY],
                                [tipX, midY],
                            ]}
                            p={seg(frame, go, go + TRAVEL)}
                        />
                    </g>
                );
            })}
        </svg>
    );
}

const SEQ_TOP = PAD + 30;
const SEQ_ROW = 44;
const sequenceHeight = (spec: Extract<DiagramSpec, { kind: 'sequence' }>) =>
    SEQ_TOP + spec.messages.length * SEQ_ROW + 30;

function SequenceDiagram({ spec }: { spec: Extract<DiagramSpec, { kind: 'sequence' }> }) {
    const frame = useCurrentFrame();
    const n = spec.actors.length;
    const m = spec.messages.length;
    const colW = (WIDTH - 2 * PAD) / n;
    const top = SEQ_TOP;
    const rowH = SEQ_ROW;
    const height = sequenceHeight(spec);
    const actorX = (i: number) => PAD + colW * i + colW / 2;
    // Each message travels first, then rests; the current message's two actors are lit.
    const step = TRAVEL + DWELL;
    const current = spec.messages[Math.min(Math.floor(frame / step), m - 1)];
    // Lifelines break around message labels that cross them so text stays legible.
    const lifeline = (i: number): [number, number][] => {
        const gaps = spec.messages
            .map((msg, r) => ({ msg, y: top + 20 + r * rowH }))
            .filter(({ msg }) => {
                const lo = Math.min(actorX(msg.from), actorX(msg.to));
                const hi = Math.max(actorX(msg.from), actorX(msg.to));
                const half = (msg.label.length * 5) / 2;
                const mid = (lo + hi) / 2;
                return actorX(i) > lo && actorX(i) < hi && Math.abs(actorX(i) - mid) < half + 4;
            })
            .map(({ y }) => [y - 16, y - 2] as [number, number]);
        const segments: [number, number][] = [];
        let from = top;
        for (const [g1, g2] of gaps) {
            segments.push([from, g1]);
            from = g2;
        }
        segments.push([from, height - 12]);
        return segments;
    };
    return (
        <svg className='static-diagram' viewBox={`0 0 ${WIDTH} ${height}`}>
            {spec.actors.map((actor, i) => {
                const lit = current && (current.from === i || current.to === i);
                return (
                    <g key={actor}>
                        <rect
                            x={actorX(i) - 62}
                            y={PAD}
                            width={124}
                            height={30}
                            rx='6'
                            fill='none'
                            stroke={lit ? C.primary : C.secondary}
                            strokeWidth={lit ? 2 : 1.5}
                        />
                        <text
                            x={actorX(i)}
                            y={PAD + 19}
                            textAnchor='middle'
                            fontSize='10'
                            fontWeight='600'
                            fill={C.primary}
                        >
                            {fit(actor, 20)}
                        </text>
                        {lifeline(i).map(([y1, y2]) => (
                            <line
                                key={y1}
                                x1={actorX(i)}
                                y1={y1}
                                x2={actorX(i)}
                                y2={y2}
                                stroke={C.secondary}
                                strokeWidth='1'
                                strokeDasharray='3 4'
                            />
                        ))}
                    </g>
                );
            })}
            {spec.messages.map((msg, i) => {
                const y = top + 20 + i * rowH;
                const x1 = actorX(msg.from);
                const x2 = actorX(msg.to);
                const leftToRight = x2 > x1;
                const start = i * step;
                const color = tone(frame, start, i + 1 < m ? start + step : Infinity);
                const from = leftToRight ? x1 : x1 - 4;
                const tip = leftToRight ? x2 - 2 : x2 + 2;
                return (
                    <g key={i}>
                        <line
                            x1={from}
                            y1={y}
                            x2={leftToRight ? x2 - 9 : x2 + 4}
                            y2={y}
                            stroke={color}
                            strokeWidth={weight(color)}
                        />
                        {chevron(tip, y, leftToRight ? 0 : 180, color, `m${i}`, 6, 1.5)}
                        <text
                            x={(x1 + x2) / 2}
                            y={y - 6}
                            textAnchor='middle'
                            fontSize='9'
                            fill={color === C.secondary ? C.secondary : C.primary}
                        >
                            {msg.label}
                        </text>
                        <Dot
                            points={[
                                [from, y],
                                [tip, y],
                            ]}
                            p={seg(frame, start, start + TRAVEL)}
                        />
                    </g>
                );
            })}
        </svg>
    );
}

const LAYER_H = 62;
const LAYER_GAP = 12;
const layersHeight = (spec: Extract<DiagramSpec, { kind: 'layers' }>) =>
    PAD * 2 + spec.rows.length * LAYER_H + (spec.rows.length - 1) * LAYER_GAP;

function LayersDiagram({ spec }: { spec: Extract<DiagramSpec, { kind: 'layers' }> }) {
    const frame = useCurrentFrame();
    const n = spec.rows.length;
    const rowH = LAYER_H;
    const bandW = 520;
    const x = (WIDTH - bandW) / 2;
    const centerY = (i: number) => PAD + i * (rowH + LAYER_GAP) + rowH / 2;
    return (
        <svg className='static-diagram' viewBox={`0 0 ${WIDTH} ${layersHeight(spec)}`}>
            {spec.rows.map((row, i) => {
                const y = PAD + i * (rowH + LAYER_GAP);
                const band = tone(frame, arrive(i), leave(i, n));
                // The dot drops from the row above into this one along the left rail.
                const go = i > 0 ? arrive(i - 1) + DWELL : 0;
                const rail = tone(frame, go, go + TRAVEL);
                return (
                    <g key={row.label}>
                        <rect
                            x={x}
                            y={y}
                            width={bandW}
                            height={rowH}
                            rx='8'
                            fill='none'
                            stroke={band}
                            strokeWidth={weight(band)}
                        />
                        <Lines
                            text={row.label}
                            x={x + 170}
                            y={y + (row.note ? 26 : 36)}
                            max={26}
                            size={11}
                            color={C.primary}
                            weight='600'
                        />
                        {row.note && (
                            <Lines
                                text={row.note}
                                x={x + 170}
                                y={y + (row.label.length > 26 ? 48 : 44)}
                                max={24}
                                size={9}
                                color={C.secondary}
                            />
                        )}
                        {i > 0 && chevron(x - 14, centerY(i), 90, rail, `l${i}`, 6, 1.5)}
                        {i > 0 && (
                            <Dot
                                points={[
                                    [x - 14, centerY(i - 1)],
                                    [x - 14, centerY(i)],
                                ]}
                                p={seg(frame, go, go + TRAVEL)}
                            />
                        )}
                    </g>
                );
            })}
        </svg>
    );
}

const CMP_HEADER = 34;
const CMP_ROW = 48;
const compareHeight = (spec: Extract<DiagramSpec, { kind: 'compare' }>) =>
    PAD * 2 + CMP_HEADER + spec.rows.length * CMP_ROW + 8;

function CompareDiagram({ spec }: { spec: Extract<DiagramSpec, { kind: 'compare' }> }) {
    const frame = useCurrentFrame();
    const cols = spec.columns.length;
    const n = spec.rows.length;
    const labelW = 150;
    const colW = (WIDTH - 2 * PAD - labelW) / cols;
    const rowH = CMP_ROW;
    const colX = (c: number) => PAD + labelW + colW * c;
    const rowY = (r: number) => PAD + CMP_HEADER + r * rowH;
    // A marker reads the table row by row, then slides to the next row.
    const step = READ + MOVE;
    const active = Math.min(Math.floor(frame / step), n - 1);
    const slide = active + 1 < n ? seg(frame, active * step + READ, (active + 1) * step) : 0;
    const markerY = rowY(active) + rowH / 2 + slide * rowH;
    return (
        <svg className='static-diagram' viewBox={`0 0 ${WIDTH} ${compareHeight(spec)}`}>
            {spec.columns.map((col, c) => (
                <text
                    key={col}
                    x={colX(c) + colW / 2}
                    y={PAD + 21}
                    textAnchor='middle'
                    fontSize='11'
                    fontWeight='600'
                    fill={C.primary}
                >
                    {fit(col, Math.floor(colW / 6))}
                </text>
            ))}
            {spec.rows.map((row, r) => {
                const y = rowY(r);
                const lit = r === active;
                return (
                    <g key={row.label}>
                        <line
                            x1={PAD}
                            y1={y}
                            x2={WIDTH - PAD}
                            y2={y}
                            stroke={C.secondary}
                            strokeWidth='1'
                            strokeDasharray='2 4'
                        />
                        <Lines
                            text={row.label}
                            x={PAD + labelW / 2}
                            y={y + (row.label.length > 22 ? 22 : 29)}
                            max={22}
                            size={10}
                            color={C.primary}
                            weight='600'
                        />
                        {row.values.slice(0, cols).map((value, c) => (
                            <Lines
                                key={c}
                                text={value}
                                x={colX(c) + colW / 2}
                                y={y + (value.length > Math.floor(colW / 5.6) ? 22 : 29)}
                                max={Math.floor(colW / 5.6)}
                                size={9.5}
                                color={lit ? C.primary : C.secondary}
                            />
                        ))}
                    </g>
                );
            })}
            {chevron(PAD + 8, markerY, 0, C.accent, 'marker', 6, 2)}
        </svg>
    );
}

/** Composition height in px; matches the SVG viewBox so the Player never letterboxes. */
export function specHeight(spec: DiagramSpec) {
    switch (spec.kind) {
        case 'flow':
            return flowLayout(spec).height;
        case 'branch':
            return BRANCH_H;
        case 'sequence':
            return sequenceHeight(spec);
        case 'layers':
            return layersHeight(spec);
        case 'compare':
            return compareHeight(spec);
    }
}

/** Timeline length in frames, rounded up to whole seconds for the time readout. */
export function specFrames(spec: DiagramSpec) {
    const frames = (() => {
        switch (spec.kind) {
            case 'flow':
                return spec.steps.length * DWELL + (spec.steps.length - 1) * TRAVEL;
            case 'branch':
                return 2 * PASS;
            case 'sequence':
                return spec.messages.length * (TRAVEL + DWELL);
            case 'layers':
                return spec.rows.length * DWELL + (spec.rows.length - 1) * TRAVEL;
            case 'compare':
                return spec.rows.length * READ + (spec.rows.length - 1) * MOVE;
        }
    })();
    return Math.ceil((frames + HOLD) / FPS) * FPS;
}

/** Full text alternative, read on the figure because the Player canvas is visual only. */
export function specDescription(spec: DiagramSpec) {
    switch (spec.kind) {
        case 'flow':
            return `${spec.title}: ${spec.steps.map((s) => s.label).join(', then ')}`;
        case 'branch':
            return `${spec.title}: if ${spec.condition}, ${spec.yes.label}; otherwise ${spec.no.label}`;
        case 'sequence':
            return `${spec.title}: ${spec.messages.map((m) => `${spec.actors[m.from]} ${m.label} ${spec.actors[m.to]}`).join('; ')}`;
        case 'layers':
            return `${spec.title}: ${spec.rows.map((r) => r.label).join(', then ')}`;
        case 'compare':
            return `${spec.title}: ${spec.columns.join(' vs ')}, compared on ${spec.rows.map((r) => r.label).join(', ')}`;
    }
}

/** Entry point: the Player passes the spec through inputProps. */
export default function SpecDiagram({ spec }: { spec: DiagramSpec }) {
    return (
        <AbsoluteFill>
            {spec.kind === 'flow' && <FlowDiagram spec={spec} />}
            {spec.kind === 'branch' && <BranchDiagram spec={spec} />}
            {spec.kind === 'sequence' && <SequenceDiagram spec={spec} />}
            {spec.kind === 'layers' && <LayersDiagram spec={spec} />}
            {spec.kind === 'compare' && <CompareDiagram spec={spec} />}
        </AbsoluteFill>
    );
}
