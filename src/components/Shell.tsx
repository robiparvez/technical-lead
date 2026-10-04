'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * App shell. Desktop: collapsible sticky sidebar with nav, search above
 * content; a hamburger toggles it, floating top-left when collapsed.
 * Phone: top bar with hamburger and search buttons opening in-flow panels.
 */
export default function Shell({
    nav,
    search,
    children,
}: {
    nav: React.ReactNode;
    search: React.ReactNode;
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
            </header>

            <div id='phone-menu' className='phone-panel' data-open={panel === 'menu'}>
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
                        onClick={showSidebar}
                    >
                        <HamburgerIcon />
                    </button>
                )}
                {sidebarOpen && (
                    <aside className='sidebar' id='sidebar'>
                        <div className='sidebar-inner'>
                            <button
                                type='button'
                                ref={inlineToggleRef}
                                className='btn btn-icon sidebar-toggle-inline'
                                aria-label='Hide navigation'
                                aria-expanded='true'
                                aria-controls='sidebar'
                                onClick={hideSidebar}
                            >
                                <HamburgerIcon />
                            </button>
                            {search}
                            {nav}
                        </div>
                    </aside>
                )}
                <main id='main'>{children}</main>
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
