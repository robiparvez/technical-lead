import { DIFFICULTIES, DIFFICULTY_LABELS, POINTS, formatPoints } from '@/lib/quiz';

/** Reward and penalty per difficulty, as shown before a round starts. */
export default function PointsTable() {
    return (
        <dl className='quiz-points'>
            {DIFFICULTIES.map((d) => (
                <div key={d}>
                    <dt className='label'>{DIFFICULTY_LABELS[d]}</dt>
                    <dd>
                        {formatPoints(POINTS[d].reward)}
                        <span className='sr-only'> points if correct,</span>
                        <span aria-hidden='true'> / </span>
                        {formatPoints(-POINTS[d].penalty)}
                        <span className='sr-only'> points if wrong</span>
                    </dd>
                </div>
            ))}
        </dl>
    );
}
