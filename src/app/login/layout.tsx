import type { Metadata } from 'next';

/** The /login page is a client component, so its title comes from here. */
export const metadata: Metadata = {
    title: 'Sign in - Technical Lead Study Guide',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children;
}
