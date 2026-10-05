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
