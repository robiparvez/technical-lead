import { interpolate } from 'remotion';

export const C = {
    primary: 'var(--color-text-primary)',
    secondary: 'var(--color-text-secondary)',
    accent: 'var(--color-accent)',
};

/** Progress 0..1 between two frames, clamped at both ends. */
export const seg = (frame: number, start: number, end: number) =>
    interpolate(frame, [start, end], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });

/** Stroke for a node or path the dot visits: secondary before, accent while current, primary after. */
export const tone = (frame: number, start: number, end: number) =>
    frame < start ? C.secondary : frame < end ? C.accent : C.primary;

/** Stroke width that matches `tone`: the current element is drawn heavier. */
export const weight = (color: string) => (color === C.accent ? 2 : 1.5);

/** Point at progress p (0..1) along a polyline, measured by length. */
function along(points: [number, number][], p: number) {
    const lens = points.slice(1).map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
    let d = lens.reduce((a, b) => a + b, 0) * p;
    for (let i = 0; i < lens.length; i++) {
        if (d <= lens[i] || i === lens.length - 1) {
            const t = lens[i] ? Math.min(d / lens[i], 1) : 0;
            return {
                cx: points[i][0] + (points[i + 1][0] - points[i][0]) * t,
                cy: points[i][1] + (points[i + 1][1] - points[i][1]) * t,
            };
        }
        d -= lens[i];
    }
    return { cx: points[0][0], cy: points[0][1] };
}

/** Moving request dot, drawn only while p is strictly between 0 and 1. */
export function Dot({ points, p }: { points: [number, number][]; p: number }) {
    if (p <= 0 || p >= 1) return null;
    const { cx, cy } = along(points, p);
    return <circle cx={cx} cy={cy} r='6' fill='none' stroke={C.accent} strokeWidth='3' />;
}

/** Open arrowhead with its tip at (x, y), pointing right before rotation. */
export function chevron(
    x: number,
    y: number,
    angle: number,
    color: string,
    key?: string,
    size = 7,
    strokeWidth = 2,
) {
    return (
        <polyline
            key={key}
            points={`${x - size},${y - size} ${x},${y} ${x - size},${y + size}`}
            fill='none'
            stroke={color}
            strokeWidth={strokeWidth}
            transform={`rotate(${angle} ${x} ${y})`}
        />
    );
}
