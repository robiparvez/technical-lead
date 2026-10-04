import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

/**
 * Animated CI/CD pipeline: a commit travels lint and unit gates, becomes one
 * artifact, deploys to staging, then canary percentages grow to full rollout.
 */

const C = {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    accent: 'var(--color-accent)',
};

const STAGES = [
    { x: 30, label: 'commit' },
    { x: 150, label: 'lint + unit' },
    { x: 290, label: 'build artifact' },
    { x: 430, label: 'staging' },
    { x: 570, label: 'production' },
];
const Y = 120;
const H = 60;
const W = 110;

// phase boundaries in frames
const PH = { start: 0, lint: 40, build: 90, stage: 140, canary: 190, full: 280 };

function chevron(x: number, y: number, color: string, key: string) {
    const s = 7;
    return (
        <polyline
            key={key}
            points={`${x - s},${y - s} ${x},${y} ${x - s},${y + s}`}
            fill='none'
            stroke={color}
            strokeWidth='2'
        />
    );
}

export default function CiCdFlow() {
    const frame = useCurrentFrame();

    const dotX = interpolate(frame, [PH.start, PH.lint, PH.build, PH.stage, PH.canary], [
        STAGES[0].x + W / 2,
        STAGES[1].x + W / 2,
        STAGES[2].x + W / 2,
        STAGES[3].x + W / 2,
        STAGES[4].x + W / 2,
    ], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    const passed = (i: number) => frame >= [PH.lint, PH.build, PH.stage, PH.canary, PH.full][i];
    const canaryPct = Math.floor(interpolate(frame, [PH.canary, PH.full], [5, 100], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    }));

    return (
        <AbsoluteFill>
            <svg viewBox='0 0 720 320' width='100%' height='100%'>
                {STAGES.map((s, i) => {
                    const hot = frame >= [PH.start, PH.lint, PH.build, PH.stage, PH.canary][i] && frame < [PH.lint, PH.build, PH.stage, PH.canary, PH.full][i];
                    const stroke = passed(i) ? C.primary : hot ? C.accent : C.secondary;
                    return (
                        <g key={s.label}>
                            <rect
                                x={s.x}
                                y={Y}
                                width={W}
                                height={H}
                                rx='8'
                                fill='none'
                                stroke={stroke}
                                strokeWidth={hot ? 3 : 2}
                            />
                            <text x={s.x + W / 2} y={Y + 26} textAnchor='middle' fontSize='11' fill={C.primary}>
                                {s.label}
                            </text>
                            {passed(i) && i < 4 && (
                                <text x={s.x + W / 2} y={Y + 44} textAnchor='middle' fontSize='11' fill={C.accent}>
                                    ✓
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* connectors */}
                {[0, 1, 2, 3].map((i) => {
                    const x1 = STAGES[i].x + W;
                    const x2 = STAGES[i + 1].x;
                    const active = frame >= [PH.start, PH.lint, PH.build, PH.stage][i] && frame < [PH.lint, PH.build, PH.stage, PH.canary][i];
                    return (
                        <g key={`c${i}`}>
                            <line x1={x1} y1={Y + H / 2} x2={x2} y2={Y + H / 2} stroke={active ? C.accent : C.secondary} strokeWidth='2' />
                            {chevron(x2, Y + H / 2, active ? C.accent : C.secondary, `ch${i}`)}
                        </g>
                    );
                })}

                {/* the same artifact flows through every environment */}
                <text x='360' y='60' textAnchor='middle' fontSize='11' fill={C.secondary}>
                    one artifact, built once, promoted unchanged through environments
                </text>

                {/* canary meter */}
                {frame >= PH.canary && (
                    <g>
                        <rect x='210' y='230' width='300' height='14' rx='7' fill='none' stroke={C.secondary} strokeWidth='1.5' />
                        <rect x='210' y='230' width={300 * (canaryPct / 100)} height='14' rx='7' fill='none' stroke={C.accent} strokeWidth='2' />
                        <text x='360' y='275' textAnchor='middle' fontSize='12' fill={C.primary}>
                            canary traffic: {canaryPct}%
                        </text>
                        <text x='360' y='295' textAnchor='middle' fontSize='10' fill={C.secondary}>
                            errors stay low, the rollout continues; they spike, it rolls back
                        </text>
                    </g>
                )}
                {frame < PH.canary && (
                    <text x='360' y='275' textAnchor='middle' fontSize='10' fill={C.secondary}>
                        gates fail fast: lint and unit tests reject a bad commit in minutes
                    </text>
                )}

                {/* moving commit dot */}
                <circle cx={dotX} cy={Y + H / 2} r='6' fill='none' stroke={C.accent} strokeWidth='3' />
            </svg>
        </AbsoluteFill>
    );
}
