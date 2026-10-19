'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DIAGRAM_OPTIONS } from '@/components/Diagram';
import ResultMark from '@/components/ResultMark';
import TextField from '@/components/TextField';
import {
    LANGUAGES,
    checkQuestion,
    deleteQuestion,
    parseDiagramSpec,
    parseTags,
    saveQuestion,
    type AdminTopic,
    type ApiError,
    type CheckContext,
} from '@/lib/adminApi';
import { DIFFICULTIES, DIFFICULTY_LABELS, POINTS } from '@/lib/quiz';
import type { Difficulty, Question } from '@/data/types';

const DIAGRAM_IDS = DIAGRAM_OPTIONS.map((d) => d.id);

interface Draft {
    id: string;
    difficulty: Difficulty;
    question: string;
    answer: string;
    keyTakeaway: string;
    tags: string;
    hasCode: boolean;
    codeLanguage: string;
    codeSnippet: string;
    diagramMode: 'none' | 'animated' | 'custom';
    diagramId: string;
    diagramJson: string;
}

// error summary order follows the form
const FIELD_ORDER = ['question', 'answer', 'keyTakeaway', 'tags', 'codeLanguage', 'codeSnippet', 'diagram', 'diagramJson'];
const FIELD_INPUT: Record<string, string> = {
    question: 'q-question',
    answer: 'q-answer',
    keyTakeaway: 'q-takeaway',
    tags: 'q-tags',
    codeLanguage: 'q-code-language',
    codeSnippet: 'q-code-snippet',
    diagram: 'q-diagram-id',
    diagramJson: 'q-diagram-json',
};

/** Routes a server 422 `fields` map onto form inputs; the rest has no input. */
function mapServerFields(fields: Record<string, string>, customDiagram: boolean) {
    const mapped: Record<string, string> = {};
    const unmapped: string[] = [];
    for (const [key, message] of Object.entries(fields)) {
        let field = key;
        if (key.startsWith('tags')) field = 'tags';
        else if (key === 'code.language') field = 'codeLanguage';
        else if (key.startsWith('code')) field = 'codeSnippet';
        else if (key.startsWith('diagram')) field = customDiagram ? 'diagramJson' : 'diagram';
        if (FIELD_ORDER.includes(field)) mapped[field] ??= message;
        else unmapped.push(message);
    }
    return { mapped, unmapped };
}

function toDraft(q: Question | undefined): Draft {
    return {
        id: q?.id ?? '',
        difficulty: q?.difficulty ?? 'basic',
        question: q?.question ?? '',
        answer: q?.answer ?? '',
        keyTakeaway: q?.keyTakeaway ?? '',
        tags: q?.tags.join(', ') ?? '',
        hasCode: Boolean(q?.code),
        codeLanguage: q?.code?.language ?? 'typescript',
        codeSnippet: q?.code?.snippet ?? '',
        diagramMode: !q?.diagram ? 'none' : typeof q.diagram === 'string' ? 'animated' : 'custom',
        diagramId: typeof q?.diagram === 'string' ? q.diagram : DIAGRAM_IDS[0],
        diagramJson: q?.diagram && typeof q.diagram !== 'string' ? JSON.stringify(q.diagram, null, 2) : '',
    };
}

function fromDraft(d: Draft): { question: Question; diagramError?: string } {
    const question: Question = {
        id: d.id.trim(),
        difficulty: d.difficulty,
        tags: parseTags(d.tags),
        question: d.question.trim(),
        answer: d.answer.trim(),
        keyTakeaway: d.keyTakeaway.trim(),
    };
    if (d.hasCode) question.code = { language: d.codeLanguage, snippet: d.codeSnippet };
    if (d.diagramMode === 'animated') question.diagram = d.diagramId;
    if (d.diagramMode === 'custom') {
        const spec = parseDiagramSpec(d.diagramJson);
        if (typeof spec === 'string') return { question, diagramError: spec };
        question.diagram = spec;
    }
    return { question };
}

/**
 * Add or edit one question. Field errors appear once a field loses focus or
 * on save; the checks list beside the form runs live and mirrors the rules
 * the site build enforces. Saving with errors shows a summary that links to
 * each field. Back and Delete each ask before they throw work away.
 */
export default function QuestionEditor({
    topic,
    originalId,
    techTagCounts,
    techTagLabels,
    onSaved,
    onDeleted,
    onBack,
}: {
    topic: AdminTopic;
    originalId?: string;
    techTagCounts: Record<string, number>;
    techTagLabels: Record<string, string>;
    onSaved: (topic: AdminTopic, saved: Question, previousTags: string[], created: boolean) => void;
    onDeleted: (topic: AdminTopic, removed: Question) => void;
    onBack: () => void;
}) {
    const original = topic.questions.find((q) => q.id === originalId);
    const initial = useMemo(() => toDraft(original), [original]);
    const [draft, setDraft] = useState(initial);
    const [touched, setTouched] = useState<Set<string>>(new Set());
    const [submitted, setSubmitted] = useState(false);
    const [serverFields, setServerFields] = useState<Record<string, string>>({});
    const [saveError, setSaveError] = useState('');
    const [busy, setBusy] = useState<'saving' | 'deleting' | null>(null);
    const [confirm, setConfirm] = useState<'discard' | 'delete' | null>(null);
    const headingRef = useRef<HTMLHeadingElement>(null);
    const summaryRef = useRef<HTMLDivElement>(null);
    const confirmRef = useRef<HTMLButtonElement>(null);
    const deleteRef = useRef<HTMLButtonElement>(null);

    const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
    const ctx: CheckContext = { topic, originalId, techTagCounts, techTagLabels, diagramIds: DIAGRAM_IDS };
    const { question, diagramError } = fromDraft(draft);
    const result = checkQuestion(question, ctx);
    const fields: Record<string, string> = { ...result.fields, ...serverFields };
    if (diagramError) fields.diagramJson = diagramError;
    const checks = result.checks.map((c) => (c.id === 'diagram' && diagramError ? { ...c, ok: false } : c));
    if (draft.diagramMode === 'custom' && !checks.some((c) => c.id === 'diagram'))
        checks.push({ id: 'diagram', label: 'The diagram can render', ok: false });
    const shown = (key: string) => (submitted || touched.has(key) ? fields[key] : undefined);
    const problems = FIELD_ORDER.filter((k) => fields[k]);

    useEffect(() => headingRef.current?.focus(), []);
    useEffect(() => {
        if (confirm) confirmRef.current?.focus();
    }, [confirm]);
    // warn before a reload or tab close drops unsaved edits
    useEffect(() => {
        if (!dirty) return;
        const warn = (e: BeforeUnloadEvent) => e.preventDefault();
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
        setDraft((d) => ({ ...d, [key]: value }));
        setServerFields({});
    };
    const touch = (key: string) => setTouched((t) => new Set(t).add(key));

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitted(true);
        setSaveError('');
        if (problems.length) {
            requestAnimationFrame(() => summaryRef.current?.focus());
            return;
        }
        setBusy('saving');
        try {
            const { topic: next, saved } = await saveQuestion(topic.slug, question, ctx);
            onSaved(next, saved, original?.tags ?? [], !originalId);
        } catch (err) {
            const apiError = err as ApiError;
            if (apiError.fields) {
                const { mapped, unmapped } = mapServerFields(apiError.fields, draft.diagramMode === 'custom');
                setServerFields(mapped);
                // keys with no input on this form (form, difficulty, ...) would vanish otherwise
                if (unmapped.length) setSaveError(`Not saved. ${unmapped.join(' ')}`);
                requestAnimationFrame(() => summaryRef.current?.focus());
            } else setSaveError(`Not saved. ${apiError.message} Your edits are still here, so try again.`);
            setBusy(null);
        }
    };

    const remove = async () => {
        if (!original) return;
        setBusy('deleting');
        setSaveError('');
        try {
            onDeleted(await deleteQuestion(topic.slug, original.id), original);
        } catch (err) {
            const apiError = err as ApiError;
            setSaveError(`Not deleted. ${apiError.fields?.delete ?? apiError.message}`);
            setConfirm(null);
            setBusy(null);
            requestAnimationFrame(() => deleteRef.current?.focus());
        }
    };

    const back = () => (dirty ? setConfirm('discard') : onBack());

    return (
        <div className='admin-editor'>
            <p className='admin-back'>
                <button type='button' className='text-link admin-back-link' onClick={back}>
                    Back to {topic.title} questions
                </button>
            </p>
            <h2 className='admin-editor-title' ref={headingRef} tabIndex={-1}>
                {originalId ? 'Edit question' : 'Add question'}{' '}
                {originalId && <span className='admin-count'>{originalId}</span>}
            </h2>

            {confirm === 'discard' && (
                <div className='admin-confirm' role='group' aria-labelledby='discard-text'>
                    <p id='discard-text'>Leave without saving? Your changes to this question are discarded.</p>
                    <button type='button' className='btn' onClick={onBack}>
                        Discard changes
                    </button>
                    <button type='button' className='btn' ref={confirmRef} onClick={() => setConfirm(null)}>
                        Keep editing
                    </button>
                </div>
            )}

            {submitted && problems.length > 0 && (
                <div className='admin-summary' ref={summaryRef} tabIndex={-1} role='alert' aria-labelledby='summary-title'>
                    <h3 id='summary-title' className='admin-summary-title'>
                        Fix {problems.length === 1 ? 'this problem' : `these ${problems.length} problems`} before you save
                    </h3>
                    <ul>
                        {problems.map((k) => (
                            <li key={k}>
                                <a className='text-link' href={`#${FIELD_INPUT[k]}`}>
                                    {fields[k]}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <form className='admin-editor-grid' onSubmit={save} noValidate>
                <div className='admin-form'>
                    <TextField
                        id='q-id'
                        label='Id'
                        hint={
                            originalId
                                ? 'Ids never change, because readers’ saved progress uses them.'
                                : 'The next free id in this topic, such as microservices-q27. It is permanent once saved.'
                        }
                        value={draft.id || 'Assigned when you save'}
                        mono
                        readOnly
                        onChange={() => {}}
                    />

                    <fieldset className='field'>
                        <legend className='field-label'>Difficulty</legend>
                        <div className='choice-row'>
                            {DIFFICULTIES.map((d) => (
                                <label key={d} className='choice'>
                                    <input
                                        type='radio'
                                        className='quiz-radio'
                                        name='difficulty'
                                        value={d}
                                        checked={draft.difficulty === d}
                                        onChange={() => set('difficulty', d)}
                                    />
                                    <span>
                                        {DIFFICULTY_LABELS[d]}
                                        <span className='choice-hint'>{POINTS[d].reward} quiz points</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <TextField
                        id='q-question'
                        label='Question'
                        value={draft.question}
                        max={300}
                        multiline
                        rows={2}
                        error={shown('question')}
                        onChange={(v) => set('question', v)}
                        onBlur={() => touch('question')}
                    />
                    <TextField
                        id='q-answer'
                        label='Answer'
                        hint='Shown as one paragraph under the question.'
                        value={draft.answer}
                        max={2000}
                        multiline
                        rows={8}
                        error={shown('answer')}
                        onChange={(v) => set('answer', v)}
                        onBlur={() => touch('answer')}
                    />
                    <TextField
                        id='q-takeaway'
                        label='Key takeaway'
                        hint='The quiz shows it as the correct option and as a wrong option for other questions, so make it a complete sentence that differs from every other takeaway in this topic.'
                        value={draft.keyTakeaway}
                        max={240}
                        multiline
                        rows={2}
                        error={shown('keyTakeaway')}
                        onChange={(v) => set('keyTakeaway', v)}
                        onBlur={() => touch('keyTakeaway')}
                    />
                    <TextField
                        id='q-tags'
                        label='Tags'
                        hint='Separate tags with commas. Each tag links to a list of every question that carries it.'
                        value={draft.tags}
                        mono
                        error={shown('tags')}
                        onChange={(v) => set('tags', v)}
                        onBlur={() => touch('tags')}
                    />
                    {question.tags.length > 0 && (
                        <ul className='admin-tag-preview' aria-label='Tags as readers see them'>
                            {question.tags.map((t) => (
                                <li key={t} className='tag'>
                                    {t}
                                    {t in techTagLabels && <span className='sr-only'> ({techTagLabels[t]} page)</span>}
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className='admin-optional'>
                        <fieldset className='field'>
                            <legend className='field-label'>Code sample</legend>
                            <label className='check'>
                                <input
                                    type='checkbox'
                                    className='check-box'
                                    checked={draft.hasCode}
                                    aria-controls='q-code-fields'
                                    onChange={(e) => set('hasCode', e.target.checked)}
                                />
                                <span>Show a code sample under the answer</span>
                            </label>
                            {draft.hasCode && (
                                <div id='q-code-fields' className='admin-nested'>
                                    <div className='field'>
                                        <label className='field-label' htmlFor='q-code-language'>
                                            Language
                                        </label>
                                        <select
                                            id='q-code-language'
                                            className='input'
                                            value={draft.codeLanguage}
                                            onChange={(e) => set('codeLanguage', e.target.value)}
                                        >
                                            {LANGUAGES.map((l) => (
                                                <option key={l}>{l}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <TextField
                                        id='q-code-snippet'
                                        label='Snippet'
                                        hint='Write it as it should appear. The page shows it as text, so markup stays visible.'
                                        value={draft.codeSnippet}
                                        max={4000}
                                        multiline
                                        rows={8}
                                        mono
                                        error={shown('codeSnippet')}
                                        onChange={(v) => set('codeSnippet', v)}
                                        onBlur={() => touch('codeSnippet')}
                                    />
                                </div>
                            )}
                        </fieldset>
                    </div>

                    <div className='admin-optional'>
                        <fieldset className='field'>
                            <legend className='field-label'>Diagram</legend>
                            <div className='choice-row'>
                                {(
                                    [
                                        ['none', 'No diagram'],
                                        ['animated', 'Built-in animation'],
                                        ['custom', 'Custom spec'],
                                    ] as const
                                ).map(([value, label]) => (
                                    <label key={value} className='choice'>
                                        <input
                                            type='radio'
                                            className='quiz-radio'
                                            name='diagram-mode'
                                            checked={draft.diagramMode === value}
                                            onChange={() => set('diagramMode', value)}
                                        />
                                        <span>{label}</span>
                                    </label>
                                ))}
                            </div>
                            {draft.diagramMode === 'animated' && (
                                <div className='admin-nested field'>
                                    <label className='field-label' htmlFor='q-diagram-id'>
                                        Animation
                                    </label>
                                    <select
                                        id='q-diagram-id'
                                        className='input'
                                        value={draft.diagramId}
                                        aria-invalid={Boolean(shown('diagram'))}
                                        onChange={(e) => set('diagramId', e.target.value)}
                                    >
                                        {DIAGRAM_OPTIONS.map((d) => (
                                            <option key={d.id} value={d.id}>
                                                {d.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            {draft.diagramMode === 'custom' && (
                                <div className='admin-nested'>
                                    <TextField
                                        id='q-diagram-json'
                                        label='Diagram spec (JSON)'
                                        hint='An object with a "title" and a "kind": flow, branch, sequence, layers, or compare. The server checks the rest of the shape.'
                                        value={draft.diagramJson}
                                        multiline
                                        rows={10}
                                        mono
                                        error={shown('diagramJson')}
                                        onChange={(v) => set('diagramJson', v)}
                                        onBlur={() => touch('diagramJson')}
                                    />
                                </div>
                            )}
                        </fieldset>
                    </div>
                </div>

                <aside className='admin-checks' aria-labelledby='checks-title'>
                    <h3 id='checks-title' className='admin-checks-title'>
                        Site build checks
                    </h3>
                    <p className='field-hint'>
                        The site build stops on any of these, so the page checks them as you type.
                    </p>
                    <ul className='admin-check-list'>
                        {checks.map((c) => (
                            <li key={c.id} data-ok={c.ok}>
                                <svg
                                    className='quiz-glyph'
                                    data-result={c.ok ? 'correct' : 'wrong'}
                                    viewBox='0 0 14 14'
                                    aria-hidden='true'
                                    focusable='false'
                                >
                                    <circle className='ring' cx='7' cy='7' r='6' fill='none' strokeWidth='2' />
                                    <ResultMark result={c.ok ? 'correct' : 'wrong'} />
                                </svg>
                                <span>
                                    <span className='sr-only'>{c.ok ? 'Passes: ' : 'Fails: '}</span>
                                    {c.label}
                                    {c.detail && <span className='admin-check-detail'>{c.detail}</span>}
                                </span>
                            </li>
                        ))}
                    </ul>
                </aside>

                <div className='admin-editor-foot'>
                    {saveError && (
                        <p className='admin-message is-error' role='alert'>
                            {saveError}
                        </p>
                    )}
                    <div className='admin-actions'>
                        <button type='submit' className='btn btn-primary' disabled={busy !== null} aria-busy={busy === 'saving'}>
                            {busy === 'saving' ? 'Saving…' : originalId ? 'Save question' : 'Add question'}
                        </button>
                        <button type='button' className='btn' disabled={busy !== null} onClick={back}>
                            Cancel
                        </button>
                        {original && confirm !== 'delete' && (
                            <button
                                type='button'
                                className='btn admin-danger'
                                ref={deleteRef}
                                disabled={busy !== null}
                                onClick={() => setConfirm('delete')}
                            >
                                Delete question
                            </button>
                        )}
                    </div>
                    {confirm === 'delete' && original && (
                        <div className='admin-confirm' role='group' aria-labelledby='delete-text'>
                            <p id='delete-text'>
                                Delete {original.id}? It leaves the site at the next rebuild. Its id stays reserved so
                                readers&rsquo; progress cannot attach to a different question, and you can restore it
                                from the deleted list.
                            </p>
                            <button type='button' className='btn admin-danger' disabled={busy !== null} onClick={remove}>
                                {busy === 'deleting' ? 'Deleting…' : 'Delete question'}
                            </button>
                            <button
                                type='button'
                                className='btn'
                                ref={confirmRef}
                                disabled={busy !== null}
                                onClick={() => {
                                    setConfirm(null);
                                    requestAnimationFrame(() => deleteRef.current?.focus());
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            </form>
        </div>
    );
}
