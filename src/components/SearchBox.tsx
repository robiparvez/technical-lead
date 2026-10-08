'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/** Asks the shell to reveal a search input (sidebar or phone panel). */
export const REVEAL_SEARCH_EVENT = 'tl-reveal-search';
/** Focuses whichever search input is visible once the shell has revealed it. */
export const FOCUS_SEARCH_EVENT = 'tl-focus-search';
const CLEAR_EVENT = 'tl-clear-search';

function openSearch() {
    window.dispatchEvent(new Event(REVEAL_SEARCH_EVENT));
}

/** Empties every search input; the debounce then commits '/' to the URL. */
export function clearSearch() {
    window.dispatchEvent(new Event(CLEAR_EVENT));
    openSearch();
}

/**
 * Search input. Query lives in the URL (?q=); typing commits after a short
 * debounce so results stay live without per-keystroke navigation. On the
 * home page the query updates in place; elsewhere it navigates home.
 * The shell renders two instances (sidebar and phone panel), so ids come
 * from useId and only the visible instance takes focus.
 */
export default function SearchBox() {
    const router = useRouter();
    const pathname = usePathname();
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState('');
    const inputId = useId();
    // null until the mount effect syncs the URL query into state
    const committed = useRef<string | null>(null);

    useEffect(() => {
        // read the URL after mount so server and hydration markup match, and
        // again on route changes (a tag link drops ?q=). A URL equal to the
        // last commit came from this box, so skip it to keep newer keystrokes.
        const fromUrl = new URLSearchParams(window.location.search).get('q') ?? '';
        if (committed.current === fromUrl) return;
        setValue(fromUrl);
        committed.current = fromUrl;
    }, [pathname]);

    useEffect(() => {
        if (committed.current === null || committed.current === value) return;
        const timer = setTimeout(() => {
            committed.current = value;
            const query = value ? `?q=${encodeURIComponent(value)}` : '';
            if (pathname === '/') {
                // already on the results page: update ?q= in place. The static
                // export has no per-query payload, so a router navigation here
                // would fall back to a full page load on every keystroke.
                window.history.replaceState(null, '', `${window.location.pathname}${query}`);
            } else {
                router.replace(`/${query}`, { scroll: false });
            }
        }, 200);
        return () => clearTimeout(timer);
    }, [value, router, pathname]);

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
