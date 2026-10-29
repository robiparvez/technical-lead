import ChevronGlyph from '@/components/ChevronGlyph';

/** Heading button that folds and unfolds the section whose id is `controls`. */
export default function FoldToggle({
    open,
    controls,
    onToggle,
    children,
}: {
    open: boolean;
    controls: string;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type='button'
            className='fold-toggle'
            aria-expanded={open}
            aria-controls={controls}
            onClick={onToggle}
        >
            {children}
            <ChevronGlyph />
        </button>
    );
}
