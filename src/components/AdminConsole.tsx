'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AdminSignInForm, AdminSignInHeader } from '@/components/AdminSignIn';
import QuestionEditor from '@/components/QuestionEditor';
import { Skeleton } from '@/components/Skeleton';
import { useSync } from '@/components/SyncProvider';
import TextField from '@/components/TextField';
import {
    GROUPS,
    LIMITS,
    checkTopicDetails,
    getTopic,
    listDeleted,
    listTopics,
    restoreQuestion,
    updateTopic,
    type AdminTopic,
    type AdminTopicSummary,
    type ApiError,
    type DeletedQuestion,
    type TopicDetails,
} from '@/lib/adminApi';
import { adminToast } from '@/lib/adminToast';
import { authClient, getStoredToken } from '@/lib/auth';
import { DIFFICULTIES, DIFFICULTY_LABELS } from '@/lib/quiz';
import type { Difficulty, Question } from '@/data/types';

const PROJECT_TITLE = 'Technical Lead Study Guide';

type View = { kind: 'list' } | { kind: 'edit'; id?: string };

type Access = 'checking' | 'allowed' | 'denied' | 'signed-out' | 'error';

/**
 * Content admin: check the admin role, then pick a topic, edit its details,
 * and add, edit, or delete its questions. Every call goes through
 * lib/adminApi against the real admin endpoints; while the role is unknown
 * the topic-list skeleton shows (plan: Loading states, /admin role check).
 */
export default function AdminConsole({
    techTagCounts,
    techTagLabels,
}: {
    techTagCounts: Record<string, number>;
    techTagLabels: Record<string, string>;
}) {
    const [accessState, setAccess] = useState<Access>('checking');
    // signing out while the editor is open (any Sign out button) drops it at
    // once and shows the sign-in screen, without waiting for a new role check
    const { status: syncStatus } = useSync();
    const access: Access =
        syncStatus === 'signed-out' && (accessState === 'allowed' || accessState === 'denied')
            ? 'signed-out'
            : accessState;
    const [accessAttempt, setAccessAttempt] = useState(0);
    const [summaries, setSummaries] = useState<AdminTopicSummary[] | null>(null);
    const [listFailed, setListFailed] = useState(false);
    const [listAttempt, setListAttempt] = useState(0);
    const [slug, setSlug] = useState('');
    const [loaded, setLoaded] = useState<{ slug: string; topic?: AdminTopic; failed?: boolean } | null>(null);
    const [topicAttempt, setTopicAttempt] = useState(0);
    const [view, setView] = useState<View>({ kind: 'list' });
    const [tagCounts, setTagCounts] = useState(techTagCounts);
    const [deletedVersion, setDeletedVersion] = useState(0);
    const [filter, setFilter] = useState('');
    const [difficulty, setDifficulty] = useState<'' | Difficulty>('');
    const returnFocus = useRef<string | null>(null);

    // role check (only when a token is stored; plan: /admin role check row)
    useEffect(() => {
        let live = true;
        const check = async (): Promise<Access> => {
            if (!getStoredToken()) return 'signed-out';
            try {
                const { data } = await authClient.getSession();
                if (!data?.user) return 'signed-out';
                // role is our server-side column; the stock client type omits it
                const role = (data.user as { role?: string }).role;
                return role === 'admin' ? 'allowed' : 'denied';
            } catch {
                return 'error';
            }
        };
        check().then((next) => {
            if (live) setAccess(next);
        });
        return () => {
            live = false;
        };
    }, [accessAttempt]);

    // fetch the topic list once the role is known
    useEffect(() => {
        if (access !== 'allowed') return;
        listTopics()
            .then((list) => {
                setSummaries(list);
                setSlug((s) => s || list[0]?.slug || '');
            })
            .catch(() => setListFailed(true));
    }, [access, listAttempt]);
    const retryList = () => {
        setListFailed(false);
        setListAttempt((a) => a + 1);
    };

    useEffect(() => {
        if (!slug) return;
        let live = true;
        getTopic(slug)
            .then((t) => live && setLoaded({ slug, topic: t }))
            .catch(() => live && setLoaded({ slug, failed: true }));
        return () => {
            live = false;
        };
    }, [slug, topicAttempt]);
    const topic = loaded?.slug === slug ? (loaded.topic ?? null) : null;
    const topicState = loaded?.slug !== slug ? 'loading' : loaded.failed ? 'error' : 'ready';
    const setTopic = (next: AdminTopic) => setLoaded({ slug: next.slug, topic: next });
    const retryTopic = () => {
        setLoaded(null);
        setTopicAttempt((a) => a + 1);
    };

    // after returning to the list, put focus back on the row (or button) that opened the editor
    useEffect(() => {
        if (view.kind !== 'list' || !returnFocus.current) return;
        document.getElementById(returnFocus.current)?.focus();
        returnFocus.current = null;
    }, [view]);

    const refreshSummaries = () => listTopics().then(setSummaries);

    const onSaved = (next: AdminTopic, saved: Question, previousTags: string[], created: boolean) => {
        setTagCounts((counts) => {
            const c = { ...counts };
            for (const t of previousTags) if (t in techTagLabels && !saved.tags.includes(t)) c[t] -= 1;
            for (const t of saved.tags) if (t in techTagLabels && !previousTags.includes(t)) c[t] = (c[t] ?? 0) + 1;
            return c;
        });
        setTopic(next);
        refreshSummaries();
        adminToast.done(created ? `Question ${saved.id} added.` : `Question ${saved.id} saved.`);
        returnFocus.current = `row-${saved.id}`;
        setView({ kind: 'list' });
    };

    const onDeleted = (next: AdminTopic, removed: Question) => {
        setTagCounts((counts) => {
            const c = { ...counts };
            for (const t of removed.tags) if (t in techTagLabels) c[t] -= 1;
            return c;
        });
        setTopic(next);
        refreshSummaries();
        setDeletedVersion((v) => v + 1);
        adminToast.done(`Question ${removed.id} deleted. You can restore it from the deleted list.`);
        returnFocus.current = 'add-question';
        setView({ kind: 'list' });
    };

    const onRestored = (next: AdminTopic, restored: Question) => {
        setTagCounts((counts) => {
            const c = { ...counts };
            for (const t of restored.tags) if (t in techTagLabels) c[t] = (c[t] ?? 0) + 1;
            return c;
        });
        setTopic(next);
        refreshSummaries();
        setDeletedVersion((v) => v + 1);
        setFilter('');
        setDifficulty('');
        adminToast.done(`Question ${restored.id} restored.`);
        // the restored row renders on the next commit
        requestAnimationFrame(() => document.getElementById(`row-${restored.id}`)?.focus());
    };

    const openEditor = (id?: string) => {
        returnFocus.current = id ? `row-${id}` : 'add-question';
        setView({ kind: 'edit', id });
    };

    const visible =
        topic?.questions.filter((q) => {
            const needle = filter.trim().toLowerCase();
            const matches = !needle || q.id.includes(needle) || q.question.toLowerCase().includes(needle);
            return matches && (!difficulty || q.difficulty === difficulty);
        }) ?? [];

    if (access === 'checking') return <Skeleton label='Checking admin access' field rows={6} />;

    // nobody signed in: the admin landing page is the sign-in screen itself;
    // after a successful sign-in the role check runs again in place
    if (access === 'signed-out')
        return (
            <div className='auth'>
                <AdminSignInHeader />
                <AdminSignInForm
                    next='/admin'
                    onSignedIn={() => {
                        setAccess('checking');
                        setAccessAttempt((a) => a + 1);
                    }}
                />
            </div>
        );

    if (access === 'denied')
        return (
            <div className='admin'>
                <header className='topic-header admin-header'>
                    <h1 className='topic-title'>{PROJECT_TITLE}</h1>
                </header>
                <div className='admin-state'>
                    <p>
                        This account cannot edit content. Only the site owner holds the admin role, and it is
                        granted from the server, not from this page.
                    </p>
                </div>
            </div>
        );

    if (access === 'error')
        return (
            <div className='admin'>
                <header className='topic-header admin-header'>
                    <h1 className='topic-title'>{PROJECT_TITLE}</h1>
                </header>
                <div className='admin-state' role='alert'>
                    <p>The sign-in check did not answer. Check that the content service is running, then try again.</p>
                    <button
                        type='button'
                        className='btn'
                        onClick={() => {
                            setAccess('checking');
                            setAccessAttempt((a) => a + 1);
                        }}
                    >
                        Try again
                    </button>
                </div>
            </div>
        );

    return (
        <div className='admin'>
            <header className='topic-header admin-header'>
                <h1 className='topic-title'>{PROJECT_TITLE}</h1>
                <p className='topic-meta'>Saved changes show on the site as soon as a page loads again.</p>
            </header>

            {listFailed ? (
                <div className='admin-state' role='alert'>
                    <p>The topic list did not load. Check that the content service is running, then try again.</p>
                    <button type='button' className='btn' onClick={retryList}>
                        Try again
                    </button>
                </div>
            ) : !summaries ? (
                <Skeleton label='Loading topics' field rows={6} />
            ) : view.kind === 'edit' && topic ? (
                <QuestionEditor
                    key={view.id ?? 'new'}
                    topic={topic}
                    originalId={view.id}
                    techTagCounts={tagCounts}
                    techTagLabels={techTagLabels}
                    onSaved={onSaved}
                    onDeleted={onDeleted}
                    onBack={() => setView({ kind: 'list' })}
                />
            ) : (
                <>
                    <div className='admin-topic-pick field'>
                        <label className='field-label' htmlFor='admin-topic'>
                            Topic
                        </label>
                        <select
                            id='admin-topic'
                            className='input'
                            value={slug}
                            onChange={(e) => {
                                setFilter('');
                                setDifficulty('');
                                setSlug(e.target.value);
                            }}
                        >
                            {GROUPS.map((group) => (
                                <optgroup key={group} label={group}>
                                    {summaries
                                        .filter((s) => s.group === group)
                                        .map((s) => (
                                            <option key={s.slug} value={s.slug}>
                                                {s.title} ({s.questionCount})
                                                {s.draft ? ' — draft' : ''}
                                                {s.deleted ? ' — deleted' : ''}
                                            </option>
                                        ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    {topicState === 'loading' && (
                        <Skeleton label='Loading questions' rows={6} />
                    )}
                    {topicState === 'error' && (
                        <div className='admin-state' role='alert'>
                            <p>This topic did not load. Try again, or choose another topic.</p>
                            <button type='button' className='btn' onClick={retryTopic}>
                                Try again
                            </button>
                        </div>
                    )}
                    {topicState === 'ready' && topic && (
                        <>
                            <TopicDetailsForm
                                key={topic.slug}
                                topic={topic}
                                onSaved={(next) => {
                                    setTopic(next);
                                    refreshSummaries();
                                }}
                            />

                            <section className='admin-section' aria-labelledby='questions-heading'>
                                <div className='admin-section-head'>
                                    <h2 id='questions-heading' className='admin-section-title'>
                                        Questions{' '}
                                        <span className='admin-count'>{topic.questions.length}</span>
                                    </h2>
                                    <button
                                        type='button'
                                        id='add-question'
                                        className='btn'
                                        onClick={() => openEditor()}
                                    >
                                        Add question
                                    </button>
                                </div>

                                <div className='admin-filters'>
                                    <div className='field'>
                                        <label className='field-label' htmlFor='admin-filter'>
                                            Find a question
                                        </label>
                                        <input
                                            id='admin-filter'
                                            className='input'
                                            type='search'
                                            placeholder='Id or question text'
                                            value={filter}
                                            onChange={(e) => setFilter(e.target.value)}
                                        />
                                    </div>
                                    <div className='field'>
                                        <label className='field-label' htmlFor='admin-difficulty'>
                                            Difficulty
                                        </label>
                                        <select
                                            id='admin-difficulty'
                                            className='input'
                                            value={difficulty}
                                            onChange={(e) => setDifficulty(e.target.value as '' | Difficulty)}
                                        >
                                            <option value=''>All</option>
                                            {DIFFICULTIES.map((d) => (
                                                <option key={d} value={d}>
                                                    {DIFFICULTY_LABELS[d]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {topic.questions.length === 0 ? (
                                    <div className='admin-state'>
                                        <p>
                                            This topic has no questions. The site hides a topic until it has at least one question,
                                            so add one to publish it.
                                        </p>
                                    </div>
                                ) : visible.length === 0 ? (
                                    <div className='admin-state'>
                                        <p>No question matches these filters.</p>
                                        <button
                                            type='button'
                                            className='btn'
                                            onClick={() => {
                                                setFilter('');
                                                setDifficulty('');
                                            }}
                                        >
                                            Clear filters
                                        </button>
                                    </div>
                                ) : (
                                    <ul className='admin-rows' aria-label={`Questions in ${topic.title}`}>
                                        {visible.map((q) => (
                                            <li key={q.id}>
                                                <button
                                                    type='button'
                                                    id={`row-${q.id}`}
                                                    className='admin-row'
                                                    onClick={() => openEditor(q.id)}
                                                >
                                                    <span className='admin-row-text'>{q.question}</span>
                                                    <span className='admin-row-meta'>
                                                        <span className='index-meta'>{q.id}</span>
                                                        <span className='admin-row-difficulty'>
                                                            {DIFFICULTY_LABELS[q.difficulty]}
                                                        </span>
                                                        <span className='admin-row-action'>
                                                            Edit<span className='sr-only'> question {q.id}</span>
                                                        </span>
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            <DeletedQuestions
                                key={`${topic.slug}-${deletedVersion}`}
                                slug={topic.slug}
                                onRestored={onRestored}
                            />
                        </>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * Soft-deleted questions of the open topic, behind a disclosure. Restore
 * brings a question back under its original id; the section hides itself
 * when nothing is deleted. The parent remounts it after a delete or restore.
 */
function DeletedQuestions({
    slug,
    onRestored,
}: {
    slug: string;
    onRestored: (topic: AdminTopic, restored: Question) => void;
}) {
    const [items, setItems] = useState<DeletedQuestion[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [open, setOpen] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const panelId = useId();

    useEffect(() => {
        let live = true;
        listDeleted(slug)
            .then((list) => live && setItems(list))
            .catch(() => live && setFailed(true));
        return () => {
            live = false;
        };
    }, [slug]);

    if (failed)
        return (
            <p className='admin-state' role='alert'>
                The deleted questions did not load. Reload the page to try again.
            </p>
        );
    if (!items) return <Skeleton label='Loading deleted questions' rows={2} />;
    if (!items.length) return null;

    const restore = async (entry: DeletedQuestion) => {
        setBusyId(entry.question.id);
        adminToast.saving('Restoring question…');
        try {
            onRestored(await restoreQuestion(slug, entry.question.id), entry.question);
        } catch (err) {
            const apiError = err as ApiError;
            adminToast.failed(
                'Question not restored',
                apiError.fields?.restore ?? `${apiError.message}. Try again.`,
            );
            setBusyId(null);
        }
    };
    const time = (stamp: string) => new Date(stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <section className='admin-section' aria-labelledby='deleted-heading'>
            <div className='admin-section-head'>
                <h2 id='deleted-heading' className='admin-section-title'>
                    Deleted questions <span className='admin-count'>{items.length}</span>
                </h2>
                <button
                    type='button'
                    className='btn'
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpen((o) => !o)}
                >
                    {open ? 'Hide deleted questions' : 'Show deleted questions'}
                </button>
            </div>
            <p className='admin-topic-summary'>
                Deleted questions leave the site at once. Their ids stay reserved, so a restore brings
                each one back exactly as it was.
            </p>
            {open && (
                <ul id={panelId} className='admin-rows admin-deleted' aria-label='Deleted questions'>
                    {items.map((entry) => (
                        <li key={entry.question.id} className='admin-deleted-row'>
                            <span className='admin-row-text'>{entry.question.question}</span>
                            <span className='admin-row-meta'>
                                <span className='index-meta'>{entry.question.id}</span>
                                <span>Deleted at {time(entry.deletedAt)}</span>
                                <button
                                    type='button'
                                    className='btn admin-restore'
                                    disabled={busyId !== null}
                                    aria-busy={busyId === entry.question.id}
                                    onClick={() => restore(entry)}
                                >
                                    {busyId === entry.question.id ? 'Restoring…' : 'Restore'}
                                    <span className='sr-only'> question {entry.question.id}</span>
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/** Title, requirement, and group of the open topic, behind a disclosure. The slug never changes. */
function TopicDetailsForm({ topic, onSaved }: { topic: AdminTopic; onSaved: (t: AdminTopic) => void }) {
    const initial: TopicDetails = { title: topic.title, requirement: topic.requirement, group: topic.group };
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(initial);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const panelId = useId();
    const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        const found = checkTopicDetails(draft);
        setErrors(found);
        if (Object.keys(found).length) {
            document.getElementById(`topic-${Object.keys(found)[0]}`)?.focus();
            return;
        }
        setSaving(true);
        adminToast.saving('Saving topic details…');
        try {
            onSaved(await updateTopic(topic.slug, draft));
            adminToast.done('Topic details saved.');
        } catch (err) {
            const apiError = err as ApiError;
            if (apiError.fields) setErrors(apiError.fields);
            adminToast.failed('Topic details not saved', `${apiError.message}. Your edits are still here, so try again.`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className='admin-section admin-topic' aria-labelledby='topic-heading'>
            <div className='admin-section-head'>
                <h2 id='topic-heading' className='admin-section-title'>
                    {topic.title}
                </h2>
                <button
                    type='button'
                    className='btn'
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpen((o) => !o)}
                >
                    {open ? 'Close topic details' : 'Edit topic details'}
                </button>
            </div>
            <p className='admin-topic-summary'>{topic.requirement}</p>
            {open && (
                <form id={panelId} className='admin-form' onSubmit={save} noValidate>
                    <p className='field-hint'>
                        Slug <span className='index-meta'>{topic.slug}</span> stays fixed, because page links and saved
                        progress use it.
                    </p>
                    <TextField
                        id='topic-title'
                        label='Title'
                        value={draft.title}
                        max={LIMITS.title}
                        error={errors.title}
                        onChange={(title) => setDraft({ ...draft, title })}
                    />
                    <TextField
                        id='topic-requirement'
                        label='Requirement'
                        hint='The line from the position profile this topic answers. Shown under the topic title.'
                        value={draft.requirement}
                        max={LIMITS.requirement}
                        multiline
                        error={errors.requirement}
                        onChange={(requirement) => setDraft({ ...draft, requirement })}
                    />
                    <div className='field'>
                        <label className='field-label' htmlFor='topic-group'>
                            Sidebar group
                        </label>
                        <select
                            id='topic-group'
                            className='input'
                            value={draft.group}
                            aria-invalid={Boolean(errors.group)}
                            onChange={(e) => setDraft({ ...draft, group: e.target.value })}
                        >
                            {GROUPS.map((g) => (
                                <option key={g}>{g}</option>
                            ))}
                        </select>
                    </div>
                    <div className='admin-actions'>
                        <button type='submit' className='btn btn-primary' disabled={saving || !dirty} aria-busy={saving}>
                            {saving ? 'Saving…' : 'Save topic details'}
                        </button>
                    </div>
                </form>
            )}
        </section>
    );
}
