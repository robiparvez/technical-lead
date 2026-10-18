import { relations, sql } from 'drizzle-orm';
import {
    boolean,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    primaryKey,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

/**
 * Schema per docs/BACKEND_PLAN.md "Database schema".
 *
 * The four better-auth tables (`user`, `session`, `account`, `verification`)
 * mirror the field shapes better-auth 1.7 expects from its drizzle adapter:
 * the adapter addresses columns by the camelCase property keys below (the
 * physical column names are snake_case). `user.role` is our addition.
 */

export const difficultyEnum = pgEnum('difficulty', ['basic', 'intermediate', 'advanced']);

export const outboxStatusEnum = pgEnum('rebuild_outbox_status', [
    'pending',
    'claimed',
    'dispatched',
    'failed',
]);

const createdAt = () =>
    timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();
const updatedAt = () =>
    timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow();

// --- better-auth (no auth code yet; schema only, installed so shapes match) ---

export const user = pgTable('user', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    role: text('role').notNull().default('user'),
});

export const session = pgTable('session', {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
});

export const verification = pgTable('verification', {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
});

// --- content ---

export const topics = pgTable('topics', {
    slug: text('slug').primaryKey(),
    title: text('title').notNull(),
    requirement: text('requirement').notNull(),
    groupLabel: text('group_label').notNull(),
    groupSortOrder: integer('group_sort_order').notNull(),
    sortOrder: integer('sort_order').notNull(),
    questionIdPrefix: text('question_id_prefix').notNull().unique(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
});

export const questions = pgTable(
    'questions',
    {
        id: text('id').primaryKey(),
        topicSlug: text('topic_slug')
            .notNull()
            .references(() => topics.slug, { onUpdate: 'cascade' }),
        difficulty: difficultyEnum('difficulty').notNull(),
        tags: text('tags').array().notNull(),
        question: text('question').notNull(),
        answer: text('answer').notNull(),
        code: jsonb('code'),
        keyTakeaway: text('key_takeaway').notNull(),
        diagram: jsonb('diagram'),
        sortOrder: integer('sort_order').notNull(),
        deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    },
    (table) => [
        index('questions_topic_slug_idx').on(table.topicSlug),
        // Partial unique: soft-deleted rows must not block takeaway reuse.
        uniqueIndex('questions_topic_slug_key_takeaway_live_idx')
            .on(table.topicSlug, table.keyTakeaway)
            .where(sql`deleted_at is null`),
    ],
);

// --- per-user data ---

export const userKnownQuestions = pgTable(
    'user_known_questions',
    {
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        questionId: text('question_id')
            .notNull()
            .references(() => questions.id),
        markedAt: timestamp('marked_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.userId, table.questionId] })],
);

export const quizAttempts = pgTable(
    'quiz_attempts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        topicSlug: text('topic_slug')
            .notNull()
            .references(() => topics.slug),
        clientAttemptId: uuid('client_attempt_id').notNull(),
        number: integer('number').notNull(),
        startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        questionIds: text('question_ids').array().notNull(),
        answered: integer('answered').notNull().default(0),
        correct: integer('correct').notNull().default(0),
        points: integer('points').notNull().default(0),
    },
    (table) => [
        uniqueIndex('quiz_attempts_user_topic_number_idx').on(
            table.userId,
            table.topicSlug,
            table.number,
        ),
        uniqueIndex('quiz_attempts_user_client_attempt_idx').on(
            table.userId,
            table.clientAttemptId,
        ),
    ],
);

export const quizEvents = pgTable(
    'quiz_events',
    {
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        eventId: uuid('event_id').notNull(),
        clientTs: timestamp('client_ts', { withTimezone: true, mode: 'date' }).notNull(),
        payload: jsonb('payload').notNull(),
        appliedAt: timestamp('applied_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [primaryKey({ columns: [table.userId, table.eventId] })],
);

export const quizTopicTotals = pgTable(
    'quiz_topic_totals',
    {
        userId: text('user_id')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        topicSlug: text('topic_slug')
            .notNull()
            .references(() => topics.slug),
        score: integer('score').notNull().default(0),
        correct: integer('correct').notNull().default(0),
        wrong: integer('wrong').notNull().default(0),
        attemptCount: integer('attempt_count').notNull().default(0),
    },
    (table) => [primaryKey({ columns: [table.userId, table.topicSlug] })],
);

export const quizState = pgTable('quiz_state', {
    userId: text('user_id')
        .primaryKey()
        .references(() => user.id, { onDelete: 'cascade' }),
    resetEpoch: integer('reset_epoch').notNull().default(0),
    importedAt: timestamp('imported_at', { withTimezone: true, mode: 'date' }),
});

// --- rebuild pipeline ---

export const rebuildOutbox = pgTable(
    'rebuild_outbox',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        status: outboxStatusEnum('status').notNull().default('pending'),
        payload: jsonb('payload').notNull(),
        contentVersion: text('content_version').notNull(),
        attempts: integer('attempts').notNull().default(0),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        createdAt: createdAt(),
        dispatchedAt: timestamp('dispatched_at', { withTimezone: true, mode: 'date' }),
    },
    (table) => [index('rebuild_outbox_status_next_attempt_idx').on(table.status, table.nextAttemptAt)],
);

// --- relations (drizzle query API) ---

export const topicsRelations = relations(topics, ({ many }) => ({
    questions: many(questions),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
    topic: one(topics, { fields: [questions.topicSlug], references: [topics.slug] }),
}));
