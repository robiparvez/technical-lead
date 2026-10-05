'use client';

import { useEffect, useId } from 'react';
import { createStore } from '@/lib/storage';

type Theme = 'system' | 'light' | 'dark';

const OPTIONS: Array<{ value: Theme; label: string }> = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
];

// key and JSON format are read by the pre-paint script in app/layout.tsx
const store = createStore<Theme>('tl-theme', 'system', (raw) =>
    raw === 'light' || raw === 'dark' ? raw : 'system',
);

function apply(theme: Theme) {
    if (theme === 'system') {
        delete document.documentElement.dataset.theme;
    } else {
        document.documentElement.dataset.theme = theme;
    }
}

/**
 * Light, dark, or follow the OS. The inline script in the root layout sets
 * data-theme before first paint; this keeps it in sync after a choice here
 * or in another tab.
 */
export default function ThemeSwitch() {
    const theme = store.useValue();
    const labelId = useId();

    // read storage, not `theme`: the hydration pass reports the server value
    // ('system') and would briefly undo the pre-paint script
    useEffect(() => apply(store.get()), [theme]);

    return (
        <div className='theme-switch' role='group' aria-labelledby={labelId}>
            <span className='label' id={labelId}>
                Theme
            </span>
            <div className='theme-options'>
                {OPTIONS.map((o) => (
                    <button
                        key={o.value}
                        type='button'
                        className='btn'
                        aria-pressed={theme === o.value}
                        onClick={() => store.set(o.value)}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
