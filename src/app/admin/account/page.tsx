import { ChangePasswordForm } from '@/components/PasswordForms';

export const metadata = {
    title: 'Technical Lead Study Guide',
    robots: { index: false, follow: false },
};

export default function AdminAccountPage() {
    return (
        <div className='auth'>
            <header className='topic-header'>
                <h1 className='topic-title'>Account</h1>
                <p className='topic-meta'>Change the password for the account you are signed in with.</p>
            </header>
            <ChangePasswordForm />
        </div>
    );
}
