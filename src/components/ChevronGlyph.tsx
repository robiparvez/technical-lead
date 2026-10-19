/** Down chevron; the parent button rotates it when its aria-expanded is true. */
export default function ChevronGlyph() {
    return (
        <svg className='q-chevron' viewBox='0 0 14 26' aria-hidden='true' focusable='false'>
            <path
                d='M3 11 L7 15 L11 11'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.75'
                strokeLinecap='round'
                strokeLinejoin='round'
            />
        </svg>
    );
}
