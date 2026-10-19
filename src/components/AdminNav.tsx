'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Admin pages in the sidebar; add one entry per new page under /admin. */
const SECTIONS = [
    { href: '/admin', label: 'Content' },
    { href: '/admin/account', label: 'Account' },
];

/** Sidebar and phone-menu navigation for the admin frame. */
export default function AdminNav() {
    // trailingSlash export paths end in '/'; compare without it (root stays '/')
    const pathname = usePathname().replace(/(.)\/$/, '$1');

    return (
        <nav className='nav' aria-label='Admin'>
            <h2 className='nav-heading label'>Admin</h2>
            {SECTIONS.map((s) => (
                <Link
                    key={s.href}
                    className='nav-link'
                    href={s.href}
                    aria-current={pathname === s.href ? 'page' : undefined}
                >
                    <span>{s.label}</span>
                </Link>
            ))}
            <h2 className='nav-heading label'>Site</h2>
            <Link className='nav-link' href='/'>
                <span>Study guide</span>
            </Link>
        </nav>
    );
}
