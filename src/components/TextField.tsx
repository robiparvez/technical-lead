/** Labelled text input or textarea with hint, character count, and error, wired for screen readers. */
export default function TextField({
    id,
    label,
    hint,
    value,
    max,
    multiline,
    rows = 4,
    mono,
    type = 'text',
    autoComplete,
    error,
    readOnly,
    onChange,
    onBlur,
}: {
    id: string;
    label: string;
    hint?: string;
    value: string;
    max?: number;
    multiline?: boolean;
    rows?: number;
    mono?: boolean;
    /** text (default), email or password — password inputs mask as usual */
    type?: 'text' | 'email' | 'password';
    /** passthrough for the login form's credential fields */
    autoComplete?: string;
    error?: string;
    readOnly?: boolean;
    onChange: (value: string) => void;
    onBlur?: () => void;
}) {
    const describedBy = [hint && `${id}-hint`, max && `${id}-count`, error && `${id}-error`].filter(Boolean).join(' ');
    const props = {
        id,
        className: `input${mono ? ' input-mono' : ''}`,
        value,
        readOnly,
        autoComplete,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
        onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
        onBlur,
    };
    const over = max !== undefined && value.length > max;
    return (
        <div className='field' data-invalid={Boolean(error)}>
            <label className='field-label' htmlFor={id}>
                {label}
            </label>
            {hint && (
                <p className='field-hint' id={`${id}-hint`}>
                    {hint}
                </p>
            )}
            {multiline ? (
                <textarea rows={rows} {...props} />
            ) : (
                <input type={type} {...props} />
            )}
            <div className='field-foot'>
                {error ? (
                    <p className='field-error' id={`${id}-error`}>
                        {error}
                    </p>
                ) : (
                    <span />
                )}
                {max !== undefined && (
                    <p className='field-count' id={`${id}-count`} data-over={over}>
                        {value.length} of {max}
                    </p>
                )}
            </div>
        </div>
    );
}
