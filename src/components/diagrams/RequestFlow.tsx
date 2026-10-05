import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, chevron, seg } from './shared';

/**
 * Animated request flow: client -> API gateway -> orders service -> its
 * database -> response back. Outline shapes, open chevrons, position motion.
 * The active path is highlighted with the accent color.
 */

const CLIENT = { x: 60, y: 180 };
const GATEWAY = { x1: 150, y1: 140, x2: 280, y2: 220 };
const SERVICES = [
    { name: 'Orders', x1: 400, y1: 30, x2: 540, y2: 100 },
    { name: 'Payments', x1: 400, y1: 145, x2: 540, y2: 215 },
    { name: 'Inventory', x1: 400, y1: 260, x2: 540, y2: 330 },
];
const DB = { x1: 590, y1: 50, x2: 690, y2: 90 };

export default function RequestFlow() {
    const frame = useCurrentFrame();
    const { durationInFrames } = useVideoConfig();

    // segments: to gateway, to orders, to db, response back, hold, loop fade-free restart
    const s1 = seg(frame, 0, 40); // client -> gateway
    const s2 = seg(frame, 40, 85); // gateway -> orders
    const s3 = seg(frame, 85, 115); // orders -> db
    const s4 = seg(frame, 115, 175); // response: db -> gateway -> client
    const active = (from: number, to: number) => frame >= from && frame < to;
    const nearLoop = frame > durationInFrames - 20;

    const gx = 215;
    const dotOn = (x1: number, y1: number, x2: number, y2: number, p: number) => ({
        cx: x1 + (x2 - x1) * p,
        cy: y1 + (y2 - y1) * p,
    });

    const d1 = dotOn(CLIENT.x + 20, 180, gx, 180, s1);
    const d2 = dotOn(280, 180, 400, 65, s2);
    const d3 = dotOn(540, 65, DB.x1, 70, s3);
    const respP = s4;
    const d4a = respP < 0.5 ? dotOn(DB.x1, 70, 540, 65, respP * 2) : { cx: -100, cy: -100 };
    const d4b = respP >= 0.5 ? dotOn(400, 65, 280, 180, (respP - 0.5) * 2) : { cx: -100, cy: -100 };
    const d4c = respP >= 1 ? dotOn(gx, 180, CLIENT.x + 20, 180, 0) : { cx: -100, cy: -100 };

    const dot = (d: { cx: number; cy: number }) =>
        d.cx < 0 ? null : (
            <circle cx={d.cx} cy={d.cy} r='6' fill='none' stroke={C.accent} strokeWidth='3' />
        );

    return (
        <AbsoluteFill>
            <svg viewBox='0 0 720 360' width='100%' height='100%'>
                {/* client */}
                <circle
                    cx={CLIENT.x}
                    cy={CLIENT.y}
                    r='22'
                    fill='none'
                    stroke={C.primary}
                    strokeWidth='2'
                />
                <text
                    x={CLIENT.x}
                    y={CLIENT.y + 4}
                    textAnchor='middle'
                    fontSize='11'
                    fill={C.primary}
                >
                    client
                </text>

                {/* gateway */}
                <rect
                    x={GATEWAY.x1}
                    y={GATEWAY.y1}
                    width={GATEWAY.x2 - GATEWAY.x1}
                    height={GATEWAY.y2 - GATEWAY.y1}
                    rx='8'
                    fill='none'
                    stroke={frame >= 40 && frame < 175 ? C.primary : C.secondary}
                    strokeWidth='2'
                />
                <text x='215' y='175' textAnchor='middle' fontSize='12' fill={C.primary}>
                    API gateway
                </text>
                <text x='215' y='192' textAnchor='middle' fontSize='10' fill={C.secondary}>
                    auth, routing, limits
                </text>

                {/* client-gateway path */}
                <line
                    x1='82'
                    y1='180'
                    x2='148'
                    y2='180'
                    stroke={active(0, 40) ? C.accent : C.secondary}
                    strokeWidth='2'
                />
                {chevron(148, 180, 0, active(0, 40) ? C.accent : C.secondary)}

                {/* services */}
                {SERVICES.map((s) => {
                    const isOrders = s.name === 'Orders';
                    const hot = isOrders && frame >= 40 && frame < 190;
                    return (
                        <g key={s.name}>
                            <rect
                                x={s.x1}
                                y={s.y1}
                                width={s.x2 - s.x1}
                                height={s.y2 - s.y1}
                                rx='8'
                                fill='none'
                                stroke={hot ? C.primary : C.secondary}
                                strokeWidth='2'
                            />
                            <text
                                x={(s.x1 + s.x2) / 2}
                                y={(s.y1 + s.y2) / 2 + 4}
                                textAnchor='middle'
                                fontSize='12'
                                fill={C.primary}
                            >
                                {s.name}
                            </text>
                            {/* gateway -> service */}
                            <line
                                x1='280'
                                y1='180'
                                x2={s.x1}
                                y2={(s.y1 + s.y2) / 2}
                                stroke={isOrders && active(40, 85) ? C.accent : C.secondary}
                                strokeWidth='2'
                            />
                            {chevron(
                                s.x1,
                                (s.y1 + s.y2) / 2,
                                isOrders ? -10 : 20,
                                isOrders && active(40, 85) ? C.accent : C.secondary,
                            )}
                        </g>
                    );
                })}

                {/* orders db */}
                <rect
                    x={DB.x1}
                    y={DB.y1}
                    width={DB.x2 - DB.x1}
                    height={DB.y2 - DB.y1}
                    rx='18'
                    fill='none'
                    stroke={active(85, 130) ? C.primary : C.secondary}
                    strokeWidth='2'
                />
                <text
                    x={(DB.x1 + DB.x2) / 2}
                    y='75'
                    textAnchor='middle'
                    fontSize='11'
                    fill={C.primary}
                >
                    orders DB
                </text>
                <line
                    x1='540'
                    y1='65'
                    x2='588'
                    y2='70'
                    stroke={active(85, 175) ? C.accent : C.secondary}
                    strokeWidth='2'
                />
                {chevron(588, 70, 5, active(85, 175) ? C.accent : C.secondary)}

                {/* response marker */}
                {frame >= 115 && frame < 200 && (
                    <text x='360' y='330' textAnchor='middle' fontSize='11' fill={C.secondary}>
                        response returns to the client over the same path
                    </text>
                )}
                {nearLoop && (
                    <text x='360' y='330' textAnchor='middle' fontSize='11' fill={C.secondary}>
                        each service owns its data; calls stay shallow
                    </text>
                )}

                {/* moving request dots (position motion) */}
                {dot(d1)}
                {dot(d2)}
                {dot(d3)}
                {dot(d4a)}
                {dot(d4b)}
                {d4c.cx < 0 ? null : dot(d4c)}
            </svg>
        </AbsoluteFill>
    );
}
