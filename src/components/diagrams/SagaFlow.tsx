import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, chevron, seg } from './shared';

/**
 * Animated saga: four local transactions chained by events; the last step
 * fails and compensation events roll the earlier steps back.
 */

const Y = 150;
const H = 70;
const W = 140;
const XS = [30, 200, 370, 540];
const NAMES = ['Order', 'Payment', 'Inventory', 'Shipping'];

// phase boundaries in frames (30fps): forward steps, failure, compensation
const PH = { fwd0: 0, fwd1: 45, fwd2: 90, fwd3: 135, fail: 180, comp1: 210, comp2: 255, done: 300 };

export default function SagaFlow() {
    const frame = useCurrentFrame();

    const done = [frame >= PH.fwd1, frame >= PH.fwd2, frame >= PH.fwd3, frame >= PH.fail];
    const failed = frame >= PH.fail;
    const compensated = [frame >= PH.done, frame >= PH.comp2, frame >= PH.comp1, frame >= PH.fail];

    // forward dots between services
    const fwdDot = (i: number, from: number, to: number) => {
        const p = seg(frame, from, to);
        if (p <= 0 || p >= 1) return null;
        const x1 = XS[i] + W,
            x2 = XS[i + 1];
        return (
            <circle
                key={`f${i}`}
                cx={x1 + (x2 - x1) * p}
                cy={Y + H / 2}
                r='6'
                fill='none'
                stroke={C.accent}
                strokeWidth='3'
            />
        );
    };
    // compensation dots travel backwards
    const backDot = (i: number, from: number, to: number) => {
        const p = seg(frame, from, to);
        if (p <= 0 || p >= 1) return null;
        const x2 = XS[i] + W,
            x1 = XS[i + 1];
        return (
            <circle
                key={`b${i}`}
                cx={x1 + (x2 - x1) * p}
                cy={Y + H / 2 + 26}
                r='6'
                fill='none'
                stroke={C.accent}
                strokeWidth='3'
            />
        );
    };

    return (
        <AbsoluteFill>
            <svg viewBox='0 0 720 400' width='100%' height='100%'>
                {NAMES.map((name, i) => {
                    const stroke = failed && i === 3 ? C.accent : done[i] ? C.primary : C.secondary;
                    return (
                        <g key={name}>
                            <rect
                                x={XS[i]}
                                y={Y}
                                width={W}
                                height={H}
                                rx='8'
                                fill='none'
                                stroke={stroke}
                                strokeWidth='2'
                            />
                            <text
                                x={XS[i] + W / 2}
                                y={Y + 28}
                                textAnchor='middle'
                                fontSize='12'
                                fill={C.primary}
                            >
                                {name}
                            </text>
                            {i < 3 && done[i] && !failed && (
                                <text
                                    x={XS[i] + W / 2}
                                    y={Y + 48}
                                    textAnchor='middle'
                                    fontSize='14'
                                    fill={C.accent}
                                >
                                    ✓
                                </text>
                            )}
                            {compensated[i] && i < 3 && (
                                <text
                                    x={XS[i] + W / 2}
                                    y={Y + 48}
                                    textAnchor='middle'
                                    fontSize='11'
                                    fill={C.secondary}
                                >
                                    {i === 0 ? 'cancelled' : 'compensated'}
                                </text>
                            )}
                        </g>
                    );
                })}

                {/* shipping failure mark */}
                {failed && (
                    <text
                        x={XS[3] + W / 2}
                        y={Y + 48}
                        textAnchor='middle'
                        fontSize='14'
                        fill={C.accent}
                    >
                        ✗
                    </text>
                )}
                {failed && (
                    <text
                        x={XS[3] + W / 2}
                        y={Y + H + 22}
                        textAnchor='middle'
                        fontSize='11'
                        fill={C.secondary}
                    >
                        card charge fails at shipping
                    </text>
                )}

                {/* forward event arrows */}
                {[0, 1, 2].map((i) => {
                    const from = [PH.fwd0, PH.fwd1, PH.fwd2][i];
                    const to = [PH.fwd1, PH.fwd2, PH.fwd3][i];
                    const hot = frame >= from && frame < to;
                    const x1 = XS[i] + W,
                        x2 = XS[i + 1];
                    return (
                        <g key={`a${i}`}>
                            <line
                                x1={x1}
                                y1={Y + H / 2}
                                x2={x2}
                                y2={Y + H / 2}
                                stroke={hot ? C.accent : C.secondary}
                                strokeWidth='2'
                            />
                            {chevron(x2, Y + H / 2, 0, hot ? C.accent : C.secondary)}
                            <text
                                x={(x1 + x2) / 2}
                                y={Y + H / 2 - 10}
                                textAnchor='middle'
                                fontSize='10'
                                fill={C.secondary}
                            >
                                {['order placed', 'payment ok', 'stock reserved'][i]}
                            </text>
                        </g>
                    );
                })}

                {/* compensation arrows (reverse direction, below) */}
                {[2, 1, 0].map((i) => {
                    const visible = frame >= [PH.comp1, PH.comp2, PH.done][2 - i];
                    const x2 = XS[i] + W,
                        x1 = XS[i + 1];
                    return (
                        <g key={`c${i}`}>
                            {visible && (
                                <>
                                    <line
                                        x1={x1}
                                        y1={Y + H / 2 + 26}
                                        x2={x2}
                                        y2={Y + H / 2 + 26}
                                        stroke={C.accent}
                                        strokeWidth='2'
                                    />
                                    {chevron(x2, Y + H / 2 + 26, 0, C.accent)}
                                    <text
                                        x={(x1 + x2) / 2}
                                        y={Y + H / 2 + 48}
                                        textAnchor='middle'
                                        fontSize='10'
                                        fill={C.secondary}
                                    >
                                        {['cancel order', 'refund payment', 'release stock'][2 - i]}
                                    </text>
                                </>
                            )}
                        </g>
                    );
                })}

                {fwdDot(0, PH.fwd0, PH.fwd1)}
                {fwdDot(1, PH.fwd1, PH.fwd2)}
                {fwdDot(2, PH.fwd2, PH.fwd3)}
                {backDot(2, PH.comp1, PH.comp2)}
                {backDot(1, PH.comp2, PH.done)}

                {/* narrative line */}
                <text x='360' y='40' textAnchor='middle' fontSize='11' fill={C.secondary}>
                    {frame < PH.fail
                        ? 'each service commits locally, then publishes an event'
                        : 'failure triggers compensating actions in reverse order'}
                </text>
            </svg>
        </AbsoluteFill>
    );
}
