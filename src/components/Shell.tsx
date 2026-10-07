'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { FOCUS_SEARCH_EVENT, REVEAL_SEARCH_EVENT } from '@/components/SearchBox';

// matches the sidebar breakpoint in app.css
const DESKTOP_QUERY = '(min-width: 60rem)';

/**
 * App shell. Desktop: a full-height collapsible sticky sidebar with brand and
 * nav, beside a content column topped by a sticky header with search and
 * theme centered; the two top rows line up. A hamburger or
 * Ctrl/Cmd+B toggles the sidebar, and the hamburger floats top-left when it
 * is collapsed. Phone: top bar with hamburger and search buttons opening
 * in-flow panels, plus the theme toggle.
 * "/" reveals the search for the current layout and focuses it.
 */
export default function Shell({
    nav,
    search,
    theme,
    children,
}: {
    nav: React.ReactNode;
    search: React.ReactNode;
    theme: React.ReactNode;
    children: React.ReactNode;
}) {
    const [panel, setPanel] = useState<'none' | 'menu' | 'search'>('none');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const inlineToggleRef = useRef<HTMLButtonElement>(null);
    const floatingToggleRef = useRef<HTMLButtonElement>(null);

    const openSearch = () => setPanel((p) => (p === 'search' ? 'none' : 'search'));
    const openMenu = () => setPanel((p) => (p === 'menu' ? 'none' : 'menu'));

    // keep focus on a live toggle when the focused one unmounts;
    // the focus lands in the effect, after React commits the swap
    const pendingFocus = useRef<'inline' | 'floating' | null>(null);
    const hideSidebar = () => {
        pendingFocus.current = 'floating';
        setSidebarOpen(false);
    };
    const showSidebar = () => {
        pendingFocus.current = 'inline';
        setSidebarOpen(true);
    };

    useEffect(() => {
        const reveal = () => {
            // the desktop header search is always visible; only phone needs a panel
            if (!window.matchMedia(DESKTOP_QUERY).matches) setPanel('search');
            // focus once React has committed the revealed panel
            requestAnimationFrame(() => window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT)));
        };
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const typing =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;
            if (e.key === '/' && !typing) {
                e.preventDefault();
                reveal();
            }
            // Ctrl+B (Cmd+B on macOS) toggles the desktop sidebar from anywhere
            // except rich-text editors, where it means bold
            const toggleKey =
                (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b';
            if (toggleKey && !target.isContentEditable && window.matchMedia(DESKTOP_QUERY).matches) {
                e.preventDefault();
                if (sidebarOpen) {
                    // focus would be lost with the unmounted sidebar; hand it to the floating toggle
                    if (document.getElementById('sidebar')?.contains(document.activeElement)) {
                        pendingFocus.current = 'floating';
                    }
                    setSidebarOpen(false);
                } else {
                    setSidebarOpen(true);
                }
            }
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener(REVEAL_SEARCH_EVENT, reveal);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener(REVEAL_SEARCH_EVENT, reveal);
        };
    }, [sidebarOpen]);

    useEffect(() => {
        if (pendingFocus.current === 'inline') inlineToggleRef.current?.focus();
        if (pendingFocus.current === 'floating') floatingToggleRef.current?.focus();
        pendingFocus.current = null;
    }, [sidebarOpen]);

    return (
        <>
            <header className='topbar'>
                <button
                    type='button'
                    className='btn btn-icon'
                    aria-label='Menu'
                    aria-expanded={panel === 'menu'}
                    aria-controls='phone-menu'
                    onClick={openMenu}
                >
                    <HamburgerIcon />
                </button>
                <Link className='brand' href='/'>
                    Tech lead study
                </Link>
                <button
                    type='button'
                    className='btn'
                    aria-expanded={panel === 'search'}
                    aria-controls='phone-search'
                    onClick={openSearch}
                >
                    Search
                </button>
                {theme}
            </header>

            {/* close the menu once a link in it is followed, including the current page */}
            <div
                id='phone-menu'
                className='phone-panel'
                data-open={panel === 'menu'}
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a')) setPanel('none');
                }}
            >
                {nav}
            </div>
            <div id='phone-search' className='phone-panel' data-open={panel === 'search'}>
                {search}
            </div>

            <div className='app' data-sidebar={sidebarOpen ? 'open' : 'hidden'}>
                {!sidebarOpen && (
                    <button
                        type='button'
                        ref={floatingToggleRef}
                        className='btn btn-icon sidebar-toggle-floating'
                        aria-label='Show navigation'
                        aria-expanded='false'
                        aria-controls='sidebar'
                        aria-keyshortcuts='Control+B Meta+B'
                        title='Show navigation (Ctrl+B)'
                        onClick={showSidebar}
                    >
                        <HamburgerIcon />
                    </button>
                )}
                {sidebarOpen && (
                    <aside className='sidebar' id='sidebar'>
                        <div className='sidebar-head'>
                            <Link className='brand' href='/'>
                                Tech lead study
                            </Link>
                            <button
                                type='button'
                                ref={inlineToggleRef}
                                className='btn btn-icon'
                                aria-label='Hide navigation'
                                aria-expanded='true'
                                aria-controls='sidebar'
                                aria-keyshortcuts='Control+B Meta+B'
                                title='Hide navigation (Ctrl+B)'
                                onClick={hideSidebar}
                            >
                                <HamburgerIcon />
                            </button>
                        </div>
                        {nav}
                    </aside>
                )}
                <div className='app-main'>
                    <header className='site-header'>
                        {search}
                        {theme}
                    </header>
                    <main id='main'>
                        <div className='content'>{children}</div>
                    </main>
                </div>
            </div>
        </>
    );
}

function HamburgerIcon() {
    return (
        <svg viewBox='0 0 20 14' width='20' height='14' aria-hidden='true' focusable='false'>
            <path
                d='M1 1 H19 M1 7 H19 M1 13 H19'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                fill='none'
            />
        </svg>
    );
}
