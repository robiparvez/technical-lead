/**
 * Placeholder shapes shown while an API call is in flight. The static export
 * cannot use `loading.js` (it needs streaming, which `output: 'export'` lacks),
 * so client components render this in their loading branch or as a
 * `<Suspense>` fallback. Screen readers hear only the label.
 */
export function Skeleton({
    label,
    rows = 0,
    field = false,
    line = false,
}: {
    label: string;
    /** list rows, each a text line and a meta line */
    rows?: number;
    /** a labelled control above the rows */
    field?: boolean;
    /** one short status line, for header text */
    line?: boolean;
}) {
    return (
        <div className={line ? 'skeleton skeleton-inline' : 'skeleton'} role='status'>
            <span className='sr-only'>{label}</span>
            <div className='skeleton-shapes' aria-hidden='true'>
                {line && <span className='skeleton-bar skeleton-line' />}
                {field && (
                    <div className='skeleton-field'>
                        <span className='skeleton-bar' />
                        <span className='skeleton-box' />
                    </div>
                )}
                {rows > 0 && (
                    <ul className='skeleton-rows'>
                        {Array.from({ length: rows }, (_, i) => (
                            <li key={i}>
                                <span className='skeleton-bar' />
                                <span className='skeleton-bar' />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
