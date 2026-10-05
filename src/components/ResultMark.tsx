/** Check or cross stroke drawn inside a 14×14 ring node. */
export default function ResultMark({ result }: { result: 'correct' | 'wrong' }) {
    return (
        <path
            className='glyph'
            d={result === 'correct' ? 'M4.4 7.2 L6.2 9 L9.6 5.2' : 'M5 5 L9 9 M9 5 L5 9'}
            fill='none'
            strokeWidth='1.75'
            strokeLinecap='round'
            strokeLinejoin='round'
        />
    );
}
