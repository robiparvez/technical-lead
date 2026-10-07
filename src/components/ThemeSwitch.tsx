'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { createStore } from '@/lib/storage';

type Theme = 'system' | 'light' | 'dark';

// key and JSON format are read by the pre-paint script in app/layout.tsx
const store = createStore<Theme>('tl-theme', 'system', (raw) =>
    raw === 'light' || raw === 'dark' ? raw : 'system',
);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function apply(theme: Theme) {
    if (theme === 'system') {
        delete document.documentElement.dataset.theme;
    } else {
        document.documentElement.dataset.theme = theme;
    }
}

function subscribeToOsTheme(onChange: () => void) {
    const query = window.matchMedia(DARK_QUERY);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
}

/** The theme on screen right now: a saved choice, else the OS preference. */
function isDarkNow() {
    const saved = document.documentElement.dataset.theme;
    return saved ? saved === 'dark' : window.matchMedia(DARK_QUERY).matches;
}

/**
 * Light/dark toggle. Until the reader clicks, the page follows the OS; a
 * click saves the opposite of what is showing. The inline script in the root
 * layout sets data-theme before first paint, and CSS picks the sun or moon
 * icon from the same rules, so the icon is right before hydration.
 */
export default function ThemeSwitch() {
    const theme = store.useValue();
    // server snapshot is light; aria-pressed corrects itself after hydration
    const osDark = useSyncExternalStore(
        subscribeToOsTheme,
        () => window.matchMedia(DARK_QUERY).matches,
        () => false,
    );
    const dark = theme === 'dark' || (theme === 'system' && osDark);

    // read storage, not `theme`: the hydration pass reports the server value
    // ('system') and would briefly undo the pre-paint script
    useEffect(() => apply(store.get()), [theme]);

    const toggle = () => {
        const next: Theme = isDarkNow() ? 'light' : 'dark';
        const commit = () => {
            apply(next);
            store.set(next);
        };
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // cross-fade the whole page where supported; otherwise switch instantly
        if (!reduce && document.startViewTransition) {
            document.startViewTransition(commit);
        } else {
            commit();
        }
    };

    return (
        <button
            type='button'
            className='btn btn-icon theme-toggle'
            aria-label='Dark theme'
            aria-pressed={dark}
            title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggle}
        >
            <svg className='theme-icon theme-icon-sun' viewBox='0 0 24 24' width='20' height='20' aria-hidden='true' focusable='false'>
                <circle cx='12' cy='12' r='4' />
                <path d='M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' />
            </svg>
            <svg className='theme-icon theme-icon-moon' viewBox='0 0 24 24' width='20' height='20' aria-hidden='true' focusable='false'>
                <path d='M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z' />
            </svg>
        </button>
    );
}
