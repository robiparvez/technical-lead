'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FOCUS_SEARCH_EVENT, REVEAL_SEARCH_EVENT } from '@/components/SearchBox';
import AccountControl from '@/components/AccountControl';
import { SyncProvider } from '@/components/SyncProvider';

const DESKTOP_QUERY = '(min-width: 60rem)';

/**
 * App shell. Desktop: a full-height collapsible sticky sidebar with brand and
 * nav, beside a content column topped by a sticky header with search and
 * theme centered; the two top rows line up. A hamburger or
 * Ctrl/Cmd+B toggles the sidebar, and the hamburger floats top-left when it
 * is collapsed. Phone: top bar with hamburger and search buttons opening
 * in-flow panels, plus the theme toggle.
 * "/" reveals the search for the current layout and focuses it.
 * SyncProvider wraps everything: it starts after mount and drives the
 * progress/score stores from the API once a stored token checks out.
 *
 * The frame itself is AppFrame: the site uses it from here, and /admin uses
 * it from app/admin/layout.tsx with its own nav, brand and no search. Under
 * /admin this component only keeps SyncProvider mounted and lets that layout
 * draw the frame.
 */
export default function Shell(props: {
    nav: React.ReactNode;
    search: React.ReactNode;
    theme: React.ReactNode;
    children: React.ReactNode;
}) {
    const inAdmin = /^\/admin(\/|$)/.test(usePathname());
    return <SyncProvider>{inAdmin ? props.children : <AppFrame {...props} />}</SyncProvider>;
}

/** Collapsible sidebar, sticky header and phone panels around the page. */
export function AppFrame({
    brand = 'Tech lead study',
    brandHref = '/',
    nav,
    search,
    theme,
    wide = false,
    children,
}: {
    brand?: string;
    brandHref?: string;
    nav: React.ReactNode;
    /** Omit on pages without search: the Search button, panel and "/" shortcut go away. */
    search?: React.ReactNode;
    theme: React.ReactNode;
    /** A wider content column, for dashboards. */
    wide?: boolean;
    children: React.ReactNode;
}) {
    const hasSearch = search != null;
    const [panel, setPanel] = useState<'none' | 'menu' | 'search'>('none');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const inlineToggleRef = useRef<HTMLButtonElement>(null);
    const floatingToggleRef = useRef<HTMLButtonElement>(null);

    const openSearch = () => setPanel((p) => (p === 'search' ? 'none' : 'search'));
    const openMenu = () => setPanel((p) => (p === 'menu' ? 'none' : 'menu'));

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
            if (!hasSearch) return;
            if (!window.matchMedia(DESKTOP_QUERY).matches) setPanel('search');
            requestAnimationFrame(() => window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT)));
        };
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const typing =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;
            if (e.key === '/' && !typing && hasSearch) {
                e.preventDefault();
                reveal();
            }
            const toggleKey =
                (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b';
            if (toggleKey && !target.isContentEditable && window.matchMedia(DESKTOP_QUERY).matches) {
                e.preventDefault();
                if (sidebarOpen) {
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
    }, [sidebarOpen, hasSearch]);

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
                <Link className='brand' href={brandHref}>
                    {brand}
                </Link>
                {hasSearch && (
                    <button
                        type='button'
                        className='btn'
                        aria-expanded={panel === 'search'}
                        aria-controls='phone-search'
                        onClick={openSearch}
                    >
                        Search
                    </button>
                )}
                {theme}
            </header>

            <div
                id='phone-menu'
                className='phone-panel'
                data-open={panel === 'menu'}
                onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a')) setPanel('none');
                }}
            >
                {nav}
                <AccountControl />
            </div>
            {hasSearch && (
                <div id='phone-search' className='phone-panel' data-open={panel === 'search'}>
                    {search}
                </div>
            )}

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
                            <Link className='brand' href={brandHref}>
                                {brand}
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
                        <AccountControl inline />
                    </header>
                    <main id='main'>
                        <div className='content' data-wide={wide}>
                            {children}
                        </div>
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
