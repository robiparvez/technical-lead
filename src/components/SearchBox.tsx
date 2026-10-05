'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Asks the shell to reveal a search input (sidebar or phone panel). */
export const REVEAL_SEARCH_EVENT = 'tl-reveal-search';
/** Focuses whichever search input is visible once the shell has revealed it. */
export const FOCUS_SEARCH_EVENT = 'tl-focus-search';
const CLEAR_EVENT = 'tl-clear-search';

export function openSearch() {
    window.dispatchEvent(new Event(REVEAL_SEARCH_EVENT));
}

/** Empties every search input; the debounce then commits '/' to the URL. */
export function clearSearch() {
    window.dispatchEvent(new Event(CLEAR_EVENT));
    openSearch();
}

/**
 * Search input. Query lives in the URL (?q=); typing commits after a short
 * debounce so results stay live without per-keystroke navigation.
 * The shell renders two instances (sidebar and phone panel), so ids come
 * from useId and only the visible instance takes focus.
 */
export default function SearchBox() {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState('');
    const [disabled] = useState(false);
    const inputId = useId();
    // null until the mount effect syncs the URL query into state
    const committed = useRef<string | null>(null);

    useEffect(() => {
        // read the URL after mount so server and hydration markup match;
        // setState here is the intended one-time external-system sync
        const initial = new URLSearchParams(window.location.search).get('q') ?? '';
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue(initial);
        committed.current = initial;
    }, []);

    useEffect(() => {
        if (committed.current === null || committed.current === value) return;
        const timer = setTimeout(() => {
            committed.current = value;
            const url = value ? `/?q=${encodeURIComponent(value)}` : '/';
            router.replace(url, { scroll: false });
        }, 200);
        return () => clearTimeout(timer);
    }, [value, router]);

    useEffect(() => {
        const onFocus = () => {
            const input = inputRef.current;
            // offsetParent is null while the instance's panel is display: none
            if (input && input.offsetParent !== null) input.focus();
        };
        const onClear = () => setValue('');
        window.addEventListener(FOCUS_SEARCH_EVENT, onFocus);
        window.addEventListener(CLEAR_EVENT, onClear);
        return () => {
            window.removeEventListener(FOCUS_SEARCH_EVENT, onFocus);
            window.removeEventListener(CLEAR_EVENT, onClear);
        };
    }, []);

    return (
        <div className='search' role='search'>
            <label className='sr-only' htmlFor={inputId}>
                Search questions, answers, and tags
            </label>
            <input
                ref={inputRef}
                id={inputId}
                className='search-input'
                type='search'
                placeholder='Search questions'
                value={value}
                disabled={disabled}
                autoComplete='off'
                aria-keyshortcuts='/'
                onChange={(e) => setValue(e.target.value)}
            />
            {!value && (
                <kbd className='search-kbd' aria-hidden='true'>
                    /
                </kbd>
            )}
        </div>
    );
}
