import { toast } from 'sonner';

/**
 * One toast slot for every admin write (save, update, delete, restore): the
 * "saving" toast turns into the result in place, and a new write replaces an
 * old error. The <Toaster /> sits in app/admin/layout.tsx.
 */
const WRITE_TOAST = 'admin-write';

export const adminToast = {
    saving: (text: string) => toast.loading(text, { id: WRITE_TOAST }),
    done: (text: string) => toast.success(text, { id: WRITE_TOAST }),
    /** Errors stay until dismissed, so a failed save is not missed. */
    failed: (text: string, detail?: string) =>
        toast.error(text, { id: WRITE_TOAST, description: detail, duration: Infinity }),
};
