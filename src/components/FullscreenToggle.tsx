'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
}

const noSubscribe = () => () => {};

/**
 * Full-screen toggle for the whole page. Escape or F11 exits natively, and the
 * button follows `fullscreenchange`, so it stays right either way. It hides
 * where the browser has no Fullscreen API (iPhone Safari); the server
 * snapshot assumes support so the button does not shift the header on the
 * browsers that have it.
 */
export default function FullscreenToggle() {
    const active = useSyncExternalStore(
        subscribe,
        () => Boolean(document.fullscreenElement),
        () => false,
    );
    const supported = useSyncExternalStore(
        noSubscribe,
        () => document.fullscreenEnabled,
        () => true,
    );
    if (!supported) return null;

    const toggle = () => {
        const request = document.fullscreenElement
            ? document.exitFullscreen()
            : document.documentElement.requestFullscreen();
        request.catch(() => {});
    };

    return (
        <button
            type='button'
            className='btn btn-icon'
            aria-label='Full screen'
            aria-pressed={active}
            title={active ? 'Exit full screen' : 'Enter full screen'}
            onClick={toggle}
        >
            <svg viewBox='0 0 24 24' width='20' height='20' aria-hidden='true' focusable='false'>
                <path
                    d={
                        active
                            ? 'M9 4v5H4 M20 9h-5V4 M15 20v-5h5 M4 15h5v5'
                            : 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5'
                    }
                    stroke='currentColor'
                    strokeWidth='2'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    fill='none'
                />
            </svg>
        </button>
    );
}
