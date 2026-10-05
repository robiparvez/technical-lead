import { DIFFICULTIES, POINTS, formatPoints } from '@/lib/quiz';

const LABELS = { basic: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' };

/** Reward and penalty per difficulty, as shown before a round starts. */
export default function PointsTable() {
    return (
        <dl className='quiz-points'>
            {DIFFICULTIES.map((d) => (
                <div key={d}>
                    <dt className='label'>{LABELS[d]}</dt>
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
