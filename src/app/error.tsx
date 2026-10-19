'use client';

/**
 * Shown in the content area when a page cannot read the content, mostly when
 * the API is not running (lib/content.ts). The sidebar and header stay.
 */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <div className='search-empty' role='alert'>
            <h1 className='topic-title'>Content is not available</h1>
            <p>
                The study guide could not reach the content service. Check that the API is running, then try
                again.
            </p>
            <button type='button' className='btn' onClick={reset}>
                Try again
            </button>
        </div>
    );
}
