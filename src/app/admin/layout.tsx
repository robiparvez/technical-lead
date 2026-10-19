import { Toaster } from 'sonner';
import AdminNav from '@/components/AdminNav';
import FullscreenToggle from '@/components/FullscreenToggle';
import ThemeSwitch from '@/components/ThemeSwitch';
import { AppFrame } from '@/components/Shell';

// sonner reads these custom properties, so the toasts follow the site theme
const TOAST_THEME = {
    '--normal-bg': 'var(--color-canvas)',
    '--normal-text': 'var(--color-text-primary)',
    '--normal-border': 'var(--color-border-control)',
} as React.CSSProperties;

/**
 * Admin shell: the app frame (collapsible sidebar, sticky header, phone menu)
 * with the admin nav, the project title as brand, no search, and a wider
 * content column. The root Shell steps aside under /admin, so this is the only
 * frame on these pages. The Toaster shows the save, update, delete and restore
 * toasts (lib/adminToast).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <AppFrame
                brand='Technical Lead Study Guide'
                brandHref='/admin'
                nav={<AdminNav />}
                theme={
                    <>
                        <FullscreenToggle />
                        <ThemeSwitch />
                    </>
                }
                wide
            >
                {children}
            </AppFrame>
            <Toaster position='bottom-right' closeButton style={TOAST_THEME} />
        </>
    );
}
