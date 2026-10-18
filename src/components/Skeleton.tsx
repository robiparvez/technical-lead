/**
 * Placeholder shapes shown while an API call is in flight. The static export
 * cannot use `loading.js` (it needs streaming, which `output: 'export'` lacks),
 * so client components render this in their loading branch or as a
 * `<Suspense>` fallback. Screen readers hear only the label.
 *
 * P4 adds three small shapes: `count` (a short bar standing in for a progress
 * count or score number), `button` (a button-sized box, the /login fallback)
 * and `as='span'` (inline placement inside <p> or <span> content, where a
 * <div> would be invalid HTML). The quiz rail's per-mark placeholder is an
 * svg circle in QuestionRail (a div cannot live inside an <svg>).
 */
export function Skeleton({
    label,
    rows = 0,
    field = false,
    line = false,
    count = false,
    button = false,
    as = 'div',
}: {
    label: string;
    /** list rows, each a text line and a meta line */
    rows?: number;
    /** a labelled control above the rows */
    field?: boolean;
    /** one short status line, for header text */
    line?: boolean;
    /** a short bar, sized like a progress count or score number */
    count?: boolean;
    /** a button-sized box */
    button?: boolean;
    /** 'span' places the skeleton inline inside <p>/<span> markup */
    as?: 'div' | 'span';
}) {
    const Root = as;
    return (
        <Root className={line || count ? 'skeleton skeleton-inline' : 'skeleton'} role='status'>
            <span className='sr-only'>{label}</span>
            <Root className='skeleton-shapes' aria-hidden='true'>
                {line && <span className='skeleton-bar skeleton-line' />}
                {count && <span className='skeleton-bar skeleton-count' />}
                {button && <span className='skeleton-button' />}
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
            </Root>
        </Root>
    );
}
