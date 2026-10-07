'use client';

import { Component, ComponentType, Suspense, lazy, useEffect, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import type { DiagramSpec } from '@/data/types';
import RequestFlow from '@/components/diagrams/RequestFlow';
import SagaFlow from '@/components/diagrams/SagaFlow';
import CiCdFlow from '@/components/diagrams/CiCdFlow';
import SpecDiagram, { specDescription, specFrames, specHeight } from '@/components/diagrams/SpecDiagram';
import { RestVsGraphQL, BTreeIndex, ContainerDeploy } from '@/components/diagrams/StaticDiagrams';

const LazyPlayer = lazy(() => import('@remotion/player').then((m) => ({ default: m.Player })));

interface AnimatedDef {
    component: ComponentType | ComponentType<{ spec: DiagramSpec }>;
    label: string;
    durationInFrames: number;
    fps: number;
    /** Composition height in px; width is always 720. Defaults to 400. */
    height?: number;
    /** Longer text alternative for the figure; defaults to `label`. */
    description?: string;
    inputProps?: { spec: DiagramSpec };
}

const ANIMATED: Record<string, AnimatedDef> = {
    'request-flow': {
        component: RequestFlow,
        label: 'Request flow through an API gateway to the orders service',
        durationInFrames: 240,
        fps: 30,
    },
    'saga-flow': {
        component: SagaFlow,
        label: 'Saga with compensating actions after a shipping failure',
        durationInFrames: 360,
        fps: 30,
    },
    'ci-cd-pipeline': {
        component: CiCdFlow,
        label: 'A commit promoted from lint to production behind a canary',
        durationInFrames: 330,
        fps: 30,
    },
    'rest-vs-graphql': {
        component: RestVsGraphQL,
        label: 'REST fixed payloads vs one GraphQL request',
        description:
            'REST serves three endpoints with fixed payloads; GraphQL serves one endpoint returning exactly the requested fields',
        durationInFrames: 240,
        fps: 30,
        height: 300,
    },
    'b-tree-index': {
        component: BTreeIndex,
        label: 'B-tree descent for key 28',
        description:
            'B-tree index: searching key 28 descends from the root through one internal page to one leaf page, three page reads',
        durationInFrames: 180,
        fps: 30,
        height: 340,
    },
    'container-deploy': {
        component: ContainerDeploy,
        label: 'Image to registry to scheduled pods behind a load balancer',
        description:
            'Container deployment: a CI build pushes a versioned image to a registry, an orchestrator schedules pod replicas across three nodes, and a load balancer spreads user traffic across pods',
        durationInFrames: 270,
        fps: 30,
        height: 300,
    },
};

/**
 * Renders a question's diagram as a looping Remotion animation: a string id
 * resolves against the hand-built registry above; a DiagramSpec object plays
 * through the generic SpecDiagram composition.
 */
export default function Diagram({ diagram }: { diagram: string | DiagramSpec }) {
    if (typeof diagram !== 'string') {
        return (
            <AnimatedDiagram
                def={{
                    component: SpecDiagram,
                    label: diagram.title,
                    description: specDescription(diagram),
                    durationInFrames: specFrames(diagram),
                    fps: 30,
                    height: specHeight(diagram),
                    inputProps: { spec: diagram },
                }}
            />
        );
    }

    const animated = ANIMATED[diagram];
    if (!animated) return null;
    return <AnimatedDiagram def={animated} />;
}

function AnimatedDiagram({ def }: { def: AnimatedDef }) {
    const [player, setPlayer] = useState<PlayerRef | null>(null);
    const [failed, setFailed] = useState(false);
    const [playing, setPlaying] = useState(false);
    // Whole seconds only: React skips same-value updates, so the readout
    // re-renders once a second instead of on every frame.
    const [seconds, setSeconds] = useState(0);
    const fps = def.fps;

    useEffect(() => {
        if (!player) return;
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        const onFrame = (e: { detail: { frame: number } }) => setSeconds(Math.floor(e.detail.frame / fps));
        player.addEventListener('play', onPlay);
        player.addEventListener('pause', onPause);
        player.addEventListener('frameupdate', onFrame as never);
        return () => {
            player.removeEventListener('play', onPlay);
            player.removeEventListener('pause', onPause);
            player.removeEventListener('frameupdate', onFrame as never);
        };
    }, [player, fps]);

    if (failed) {
        return (
            <figure className='diagram'>
                <figcaption className='diagram-label'>{def.label}</figcaption>
                <div className='player-status' data-kind='error' role='alert'>
                    <span aria-hidden='true'>⚠</span>
                    <span>Diagram failed to load. Reload the page and try again.</span>
                </div>
            </figure>
        );
    }

    const total = def.durationInFrames / def.fps;

    return (
        <figure className='diagram' role='group' aria-label={def.description ?? def.label}>
            <figcaption className='diagram-label'>{def.label}</figcaption>
            <div className='player-frame'>
                <DiagramBoundary onError={() => setFailed(true)}>
                    <Suspense
                        fallback={
                            <div className='player-status' role='status'>
                                <span aria-hidden='true'>…</span>
                                <span>Loading diagram</span>
                            </div>
                        }
                    >
                        <LazyPlayer
                            ref={setPlayer}
                            component={def.component as never}
                            inputProps={def.inputProps}
                            durationInFrames={def.durationInFrames}
                            fps={def.fps}
                            compositionWidth={720}
                            compositionHeight={def.height ?? 400}
                            controls={false}
                            autoPlay={false}
                            loop
                            acknowledgeRemotionLicense
                            style={{ width: '100%' }}
                        />
                    </Suspense>
                </DiagramBoundary>
                <div className='player-controls'>
                    <button
                        type='button'
                        className='btn'
                        disabled={!player}
                        aria-label={playing ? 'Pause diagram' : 'Play diagram'}
                        onClick={() => {
                            if (playing) {
                                player?.pause();
                            } else {
                                player?.play();
                            }
                        }}
                    >
                        {playing ? 'Pause' : 'Play'}
                    </button>
                    <button
                        type='button'
                        className='btn'
                        disabled={!player}
                        aria-label='Restart diagram'
                        onClick={() => {
                            player?.seekTo(0);
                            player?.play();
                        }}
                    >
                        Restart
                    </button>
                    <span className='player-time' aria-hidden='true'>
                        0:{String(seconds).padStart(2, '0')} / 0:{String(total).padStart(2, '0')}
                    </span>
                </div>
            </div>
        </figure>
    );
}

interface BoundaryProps {
    children: React.ReactNode;
    onError: () => void;
}
interface BoundaryState {
    failed: boolean;
}

class DiagramBoundary extends Component<BoundaryProps, BoundaryState> {
    state: BoundaryState = { failed: false };
    static getDerivedStateFromError(): BoundaryState {
        return { failed: true };
    }
    componentDidUpdate(_props: BoundaryProps, prev: BoundaryState) {
        if (this.state.failed && !prev.failed) this.props.onError();
    }
    render() {
        return this.state.failed ? null : this.props.children;
    }
}
