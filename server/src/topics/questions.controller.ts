import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { questions, topics } from '../db/schema.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import {
    decodeQuestionCursor,
    encodeQuestionCursor,
    questionListItemSchema,
    questionQuerySchema,
    type QuestionListItemDto,
    type QuestionQueryDto,
} from './topics.schemas.js';

/**
 * GET /v1/questions: filtered, cursor-paginated public question list ordered
 * by the site's topic order, then question order. Stable ordering key is
 * (topics.sort_order, questions.sort_order, questions.id) — the cursor is
 * that triple, base64url-encoded. Soft-deleted questions and questions of
 * soft-deleted topics are excluded.
 */
@Controller('questions')
export class QuestionsController {
    @Get()
    async list(
        @Query(new ZodValidationPipe(questionQuerySchema)) query: QuestionQueryDto,
    ): Promise<{ items: QuestionListItemDto[]; nextCursor: string | null }> {
        const cursor = query.cursor ? decodeQuestionCursor(query.cursor) : undefined;
        if (query.cursor && !cursor) {
            throw new BadRequestException('cursor: invalid or expired cursor');
        }

        const conditions: SQL[] = [isNull(questions.deletedAt), isNull(topics.deletedAt)];
        if (query.tag) {
            conditions.push(sql`${query.tag} = any(${questions.tags})`);
        }
        if (query.difficulty) {
            conditions.push(eq(questions.difficulty, query.difficulty));
        }
        if (cursor) {
            conditions.push(
                sql`(${topics.sortOrder}, ${questions.sortOrder}, ${questions.id}) > (${cursor.topicSortOrder}, ${cursor.sortOrder}, ${cursor.id})`,
            );
        }

        const { db } = getDb();
        const rows = await db
            .select({
                id: questions.id,
                topicSlug: topics.slug,
                topicSortOrder: topics.sortOrder,
                difficulty: questions.difficulty,
                tags: questions.tags,
                question: questions.question,
                answer: questions.answer,
                code: questions.code,
                keyTakeaway: questions.keyTakeaway,
                diagram: questions.diagram,
                sortOrder: questions.sortOrder,
            })
            .from(questions)
            .innerJoin(topics, eq(questions.topicSlug, topics.slug))
            .where(and(...conditions))
            .orderBy(asc(topics.sortOrder), asc(questions.sortOrder), asc(questions.id))
            .limit(query.limit + 1);

        const hasMore = rows.length > query.limit;
        const page = hasMore ? rows.slice(0, query.limit) : rows;
        const lastRow = page.at(-1);

        return {
            items: page.map((row) =>
                questionListItemSchema.parse({
                    id: row.id,
                    topicSlug: row.topicSlug,
                    difficulty: row.difficulty,
                    tags: row.tags,
                    question: row.question,
                    answer: row.answer,
                    code: row.code,
                    keyTakeaway: row.keyTakeaway,
                    diagram: row.diagram,
                    sortOrder: row.sortOrder,
                }),
            ),
            nextCursor:
                hasMore && lastRow
                    ? encodeQuestionCursor({
                          topicSortOrder: lastRow.topicSortOrder,
                          sortOrder: lastRow.sortOrder,
                          id: lastRow.id,
                      })
                    : null,
        };
    }
}
