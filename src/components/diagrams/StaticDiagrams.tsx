import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, Dot, chevron, seg, tone, weight } from './shared';

/**
 * Hand-built outline diagrams, animated as Remotion compositions. Area shapes
 * carry fill="none"; fill appears only on text; arrowheads are open chevrons.
 * An accent dot walks the flow; nodes and paths are secondary before the dot
 * reaches them, accent while current, and primary once visited.
 */

/** REST: three endpoints with fixed payloads vs GraphQL: one request, exact fields. */
export function RestVsGraphQL() {
    const frame = useCurrentFrame();
    // Three REST round trips (out, back), then one GraphQL round trip.
    const TRIP = 40;
    const LEG = 18;
    const GQL = 130;
    const gqlColor = tone(frame, GQL, Infinity);
    return (
        <AbsoluteFill>
            <svg className='static-diagram' viewBox='0 0 720 300'>
                {/* REST half */}
                <text
                    x='150'
                    y='24'
                    textAnchor='middle'
                    fontSize='12'
                    fontWeight='600'
                    fill={C.primary}
                >
                    REST
                </text>
                <rect
                    x='20'
                    y='125'
                    width='90'
                    height='50'
                    rx='8'
                    fill='none'
                    stroke={C.primary}
                    strokeWidth='2'
                />
                <text x='65' y='153' textAnchor='middle' fontSize='11' fill={C.primary}>
                    client
                </text>

                {[
                    { y: 40, path: '/orders', extra: '+ 14 unused fields' },
                    { y: 125, path: '/users/12', extra: '+ 9 unused fields' },
                    { y: 210, path: '/inventory', extra: '+ 6 unused fields' },
                ].map((e, i) => {
                    const start = i * TRIP;
                    const color = tone(frame, start, start + 2 * LEG);
                    const out: [number, number][] = [
                        [110, 150],
                        [195, e.y + 25],
                    ];
                    return (
                        <g key={e.path}>
                            <line
                                x1='110'
                                y1='150'
                                x2='195'
                                y2={e.y + 25}
                                stroke={color}
                                strokeWidth={weight(color)}
                            />
                            {chevron(195, e.y + 25, -27, color, e.path, 6, 1.5)}
                            <rect
                                x='198'
                                y={e.y}
                                width='100'
                                height='50'
                                rx='6'
                                fill='none'
                                stroke={color}
                                strokeWidth={weight(color)}
                            />
                            <text x='248' y={e.y + 22} textAnchor='middle' fontSize='10' fill={C.primary}>
                                {e.path}
                            </text>
                            <text x='248' y={e.y + 38} textAnchor='middle' fontSize='9' fill={C.secondary}>
                                {e.extra}
                            </text>
                            <Dot points={out} p={seg(frame, start, start + LEG)} />
                            <Dot points={[...out].reverse()} p={seg(frame, start + LEG, start + 2 * LEG)} />
                        </g>
                    );
                })}
                <text x='150' y='285' textAnchor='middle' fontSize='10' fill={C.secondary}>
                    3 requests, server-fixed shapes
                </text>

                {/* divider: not a rule, an open chevron pointing right */}
                {chevron(355, 150, 0, C.secondary, 'divider', 6, 1.5)}

                {/* GraphQL half */}
                <text
                    x='540'
                    y='24'
                    textAnchor='middle'
                    fontSize='12'
                    fontWeight='600'
                    fill={C.primary}
                >
                    GraphQL
                </text>
                <rect
                    x='390'
                    y='125'
                    width='90'
                    height='50'
                    rx='8'
                    fill='none'
                    stroke={C.primary}
                    strokeWidth='2'
                />
                <text x='435' y='153' textAnchor='middle' fontSize='11' fill={C.primary}>
                    client
                </text>

                <line x1='480' y1='150' x2='560' y2='150' stroke={gqlColor} strokeWidth={weight(gqlColor)} />
                {chevron(560, 150, 0, gqlColor, 'gql', 6, 1.5)}
                <rect
                    x='563'
                    y='120'
                    width='130'
                    height='60'
                    rx='6'
                    fill='none'
                    stroke={gqlColor}
                    strokeWidth={weight(gqlColor)}
                />
                <text x='628' y='142' textAnchor='middle' fontSize='10' fill={C.primary}>
                    POST /graphql
                </text>
                <text x='628' y='158' textAnchor='middle' fontSize='9' fill={C.secondary}>
                    {'{ order(id) { total } }'}
                </text>
                <text x='628' y='172' textAnchor='middle' fontSize='9' fill={C.secondary}>
                    exactly these fields
                </text>
                <text x='540' y='285' textAnchor='middle' fontSize='10' fill={C.secondary}>
                    1 request, client-declared shape
                </text>
                <Dot
                    points={[
                        [480, 150],
                        [563, 150],
                    ]}
                    p={seg(frame, GQL, GQL + LEG)}
                />
                <Dot
                    points={[
                        [563, 150],
                        [480, 150],
                    ]}
                    p={seg(frame, GQL + LEG, GQL + 2 * LEG)}
                />
            </svg>
        </AbsoluteFill>
    );
}

/** B-tree index descent: searching key 28 touches 3 pages instead of a full scan. */
export function BTreeIndex() {
    const frame = useCurrentFrame();
    // root dwell, descend to internal page, dwell, descend to leaf, found.
    const T1 = 20;
    const AT_INTERNAL = 50;
    const T2 = 75;
    const FOUND = 105;
    const root = tone(frame, 0, AT_INTERNAL);
    const internal = tone(frame, AT_INTERNAL, FOUND);
    const leafHot = tone(frame, FOUND, Infinity);
    const edge1 = tone(frame, T1, AT_INTERNAL);
    const edge2 = tone(frame, T2, FOUND);
    return (
        <AbsoluteFill>
            <svg className='static-diagram' viewBox='0 0 720 340'>
                {/* root */}
                <rect
                    x='290'
                    y='20'
                    width='140'
                    height='50'
                    rx='6'
                    fill='none'
                    stroke={root}
                    strokeWidth={weight(root)}
                />
                <text x='360' y='50' textAnchor='middle' fontSize='12' fill={C.primary}>
                    root: 50
                </text>

                {/* internal nodes */}
                <rect
                    x='100'
                    y='120'
                    width='160'
                    height='50'
                    rx='6'
                    fill='none'
                    stroke={internal}
                    strokeWidth={weight(internal)}
                />
                <text x='180' y='150' textAnchor='middle' fontSize='12' fill={C.primary}>
                    20 | 35
                </text>
                <rect
                    x='460'
                    y='120'
                    width='160'
                    height='50'
                    rx='6'
                    fill='none'
                    stroke={C.secondary}
                    strokeWidth='1.5'
                />
                <text x='540' y='150' textAnchor='middle' fontSize='12' fill={C.secondary}>
                    70 | 85
                </text>

                {/* root -> internal */}
                <line x1='330' y1='70' x2='220' y2='118' stroke={edge1} strokeWidth={weight(edge1)} />
                {chevron(220, 118, 55, edge1, 'r1', 6, 1.5)}
                <line x1='390' y1='70' x2='500' y2='118' stroke={C.secondary} strokeWidth='1.5' />
                {frame >= T1 && (
                    <text x='268' y='88' textAnchor='end' fontSize='10' fill={C.secondary}>
                        28 &lt; 50
                    </text>
                )}

                {/* leaves, one row */}
                {[
                    { x: 20, keys: '10 | 15', hot: false },
                    { x: 190, keys: '22 | 28', hot: true },
                    { x: 360, keys: '31 | 38', hot: false },
                    { x: 530, keys: '65 | 68', hot: false },
                ].map((leaf) => (
                    <g key={leaf.keys}>
                        <rect
                            x={leaf.x}
                            y='230'
                            width='150'
                            height='45'
                            rx='6'
                            fill='none'
                            stroke={leaf.hot ? leafHot : C.secondary}
                            strokeWidth={leaf.hot ? weight(leafHot) : 1.5}
                        />
                        <text
                            x={leaf.x + 75}
                            y='257'
                            textAnchor='middle'
                            fontSize='11'
                            fill={leaf.hot ? C.primary : C.secondary}
                        >
                            {leaf.keys}
                        </text>
                    </g>
                ))}

                {/* internal -> leaves: left node hot path to 22|28 */}
                <line x1='140' y1='170' x2='95' y2='228' stroke={C.secondary} strokeWidth='1.5' />
                <line x1='200' y1='170' x2='260' y2='228' stroke={edge2} strokeWidth={weight(edge2)} />
                {chevron(260, 228, -60, edge2, 'l1', 6, 1.5)}
                <line x1='510' y1='170' x2='435' y2='228' stroke={C.secondary} strokeWidth='1.5' />
                <line x1='575' y1='170' x2='605' y2='228' stroke={C.secondary} strokeWidth='1.5' />

                {/* hot node target: internal -> leaf 22|28 uses x=190..340 so aim at 260 */}
                <text x='560' y='330' textAnchor='middle' fontSize='10' fill={C.secondary}>
                    key 28: root, one internal page, one leaf page — 3 reads, no full scan
                </text>
                {frame >= T2 && (
                    <text x='180' y='205' fontSize='10' fill={C.secondary}>
                        28 &lt; 35
                    </text>
                )}

                <Dot
                    points={[
                        [330, 70],
                        [220, 118],
                    ]}
                    p={seg(frame, T1, AT_INTERNAL)}
                />
                <Dot
                    points={[
                        [200, 170],
                        [260, 228],
                    ]}
                    p={seg(frame, T2, FOUND)}
                />
            </svg>
        </AbsoluteFill>
    );
}

/** Container deployment: push image to a registry, orchestrator schedules pods across nodes, load balancer serves users. */
export function ContainerDeploy() {
    const frame = useCurrentFrame();
    // push, store, deploy, schedule six pods, lose one and replace it, then serve traffic.
    const AT_REGISTRY = 24;
    const DEPLOY = 36;
    const AT_CLUSTER = 60;
    const SCHEDULE = 8;
    const FAIL = 125;
    const REPLACED = 150;
    const TRAFFIC = 165;
    const push = tone(frame, 0, AT_REGISTRY);
    const registry = tone(frame, AT_REGISTRY, AT_CLUSTER);
    const deploy = tone(frame, DEPLOY, AT_CLUSTER);
    const cluster = frame >= AT_CLUSTER ? C.primary : C.secondary;
    const serve = tone(frame, TRAFFIC, Infinity);
    return (
        <AbsoluteFill>
            <svg className='static-diagram' viewBox='0 0 720 300'>
                <text x='60' y='120' fontSize='12' fontWeight='600' fill={C.primary}>
                    push
                </text>
                <rect x='20' y='130' width='80' height='45' rx='6' fill='none' stroke={C.primary} strokeWidth='2' />
                <text x='60' y='157' textAnchor='middle' fontSize='10' fill={C.primary}>
                    CI build
                </text>

                <line x1='100' y1='152' x2='170' y2='152' stroke={push} strokeWidth={weight(push)} />
                {chevron(170, 152, 0, push, 'p1', 6, 1.5)}

                {/* registry with image layers */}
                <rect
                    x='175'
                    y='120'
                    width='120'
                    height='65'
                    rx='8'
                    fill='none'
                    stroke={registry}
                    strokeWidth={weight(registry)}
                />
                <text x='235' y='140' textAnchor='middle' fontSize='11' fill={C.primary}>
                    registry
                </text>
                {[0, 1, 2].map((i) => (
                    <line key={i} x1='195' x2='275' y1={150 + i * 9} y2={150 + i * 9} stroke={C.secondary} strokeWidth='1.5' />
                ))}
                <text x='235' y='200' textAnchor='middle' fontSize='9' fill={C.secondary}>
                    versioned image layers
                </text>

                <line x1='295' y1='152' x2='365' y2='152' stroke={deploy} strokeWidth={weight(deploy)} />
                {chevron(365, 152, 0, deploy, 'p2', 6, 1.5)}

                {/* orchestrator + nodes with pods */}
                <rect x='370' y='60' width='230' height='190' rx='10' fill='none' stroke={cluster} strokeWidth='2' />
                <text x='485' y='82' textAnchor='middle' fontSize='11' fontWeight='600' fill={C.primary}>
                    cluster: 3 nodes
                </text>
                {[0, 1, 2].map((n) => (
                    <g key={n}>
                        <rect
                            x='390'
                            y={95 + n * 48}
                            width='190'
                            height='38'
                            rx='6'
                            fill='none'
                            stroke={C.secondary}
                            strokeWidth='1.5'
                        />
                        <text x='400' y={118 + n * 48} fontSize='9' fill={C.secondary}>
                            node {n + 1}
                        </text>
                        {[0, 1].map((p) => {
                            const scheduled = AT_CLUSTER + (n * 2 + p) * SCHEDULE;
                            const replaced = n === 2 && p === 1;
                            const down = replaced && frame >= FAIL && frame < REPLACED;
                            const color =
                                replaced && frame >= REPLACED
                                    ? C.accent
                                    : tone(frame, scheduled, scheduled + SCHEDULE);
                            return (
                                <rect
                                    key={p}
                                    x={455 + p * 62}
                                    y={101 + n * 48}
                                    width='52'
                                    height='26'
                                    rx='5'
                                    fill='none'
                                    stroke={down ? C.secondary : color}
                                    strokeWidth={weight(color)}
                                    strokeDasharray={down ? '3 3' : undefined}
                                    opacity={frame >= scheduled && !down ? 1 : 0.3}
                                />
                            );
                        })}
                    </g>
                ))}
                <text x='485' y='268' textAnchor='middle' fontSize='9' fill={C.secondary}>
                    replicas declared once; dead pods are replaced (one outlined)
                </text>

                {/* users via load balancer */}
                <line x1='600' y1='152' x2='655' y2='152' stroke={serve} strokeWidth={weight(serve)} />
                {chevron(655, 152, 0, serve, 'p3', 6, 1.5)}
                <circle cx='680' cy='152' r='16' fill='none' stroke={C.primary} strokeWidth='2' />
                <text x='680' y='156' textAnchor='middle' fontSize='9' fill={C.primary}>
                    users
                </text>
                <text x='678' y='196' textAnchor='middle' fontSize='9' fill={C.secondary}>
                    load balancer
                </text>

                <Dot
                    points={[
                        [100, 152],
                        [175, 152],
                    ]}
                    p={seg(frame, 0, AT_REGISTRY)}
                />
                <Dot
                    points={[
                        [295, 152],
                        [370, 152],
                    ]}
                    p={seg(frame, DEPLOY, AT_CLUSTER)}
                />
                {[0, 1, 2].map((j) => (
                    <Dot
                        key={j}
                        points={[
                            [600, 152],
                            [664, 152],
                        ]}
                        p={seg(frame, TRAFFIC + j * 15, TRAFFIC + j * 15 + 24)}
                    />
                ))}
            </svg>
        </AbsoluteFill>
    );
}
