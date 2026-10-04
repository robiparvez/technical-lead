'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const OPEN_EVENT = 'tl-open-search';

export function openSearch() {
    window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Search input. Query lives in the URL (?q=); typing commits after a short
 * debounce so results stay live without per-keystroke navigation.
 * "/" anywhere focuses the search.
 */
export default function SearchBox() {
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState('');
    const [disabled] = useState(false);
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
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const typing =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;
            if (e.key === '/' && !typing) {
                e.preventDefault();
                window.dispatchEvent(new Event(OPEN_EVENT));
                inputRef.current?.focus();
            }
        };
        const onOpen = () => inputRef.current?.focus();
        window.addEventListener('keydown', onKey);
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener(OPEN_EVENT, onOpen);
        };
    }, []);

    return (
        <div className='search' role='search'>
            <label className='search-label' htmlFor='search-input'>
                Search questions
            </label>
            <input
                ref={inputRef}
                id='search-input'
                className='search-input'
                type='search'
                placeholder='Search questions, answers, tags'
                value={value}
                disabled={disabled}
                autoComplete='off'
                onChange={(e) => setValue(e.target.value)}
            />
            <p className='search-hint'>
                Press <kbd>/</kbd> to search. Matches show question, answer, and tags.
            </p>
        </div>
    );
}
