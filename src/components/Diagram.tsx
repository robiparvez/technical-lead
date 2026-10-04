'use client';

import { Component, ComponentType, Suspense, lazy, useCallback, useEffect, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import RequestFlow from '@/components/diagrams/RequestFlow';
import SagaFlow from '@/components/diagrams/SagaFlow';
import CiCdFlow from '@/components/diagrams/CiCdFlow';
import { RestVsGraphQL, BTreeIndex, ContainerDeploy } from '@/components/diagrams/StaticDiagrams';

const LazyPlayer = lazy(() => import('@remotion/player').then((m) => ({ default: m.Player })));

interface AnimatedDef {
    component: ComponentType;
    label: string;
    durationInFrames: number;
    fps: number;
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
};

const STATIC: Record<string, { component: ComponentType; label: string }> = {
    'rest-vs-graphql': {
        component: RestVsGraphQL,
        label: 'REST fixed payloads vs one GraphQL request',
    },
    'b-tree-index': { component: BTreeIndex, label: 'B-tree descent for key 28' },
    'container-deploy': {
        component: ContainerDeploy,
        label: 'Image to registry to scheduled pods behind a load balancer',
    },
};

/** Renders a diagram by id: static SVG inline, animated ones through Remotion. */
export default function Diagram({ id }: { id: string }) {
    const animated = ANIMATED[id];
    const statik = STATIC[id];

    if (statik) {
        const Comp = statik.component;
        return (
            <figure className='diagram'>
                <figcaption className='diagram-label'>{statik.label}</figcaption>
                <div className='player-frame'>
                    <Comp />
                </div>
            </figure>
        );
    }

    if (!animated) return null;
    return <AnimatedDiagram def={animated} />;
}

function AnimatedDiagram({ def }: { def: AnimatedDef }) {
    const [player, setPlayer] = useState<PlayerRef | null>(null);
    const [failed, setFailed] = useState(false);
    const [playing, setPlaying] = useState(false);
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        if (!player) return;
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
        player.addEventListener('play', onPlay);
        player.addEventListener('pause', onPause);
        player.addEventListener('frameupdate', onFrame as never);
        return () => {
            player.removeEventListener('play', onPlay);
            player.removeEventListener('pause', onPause);
            player.removeEventListener('frameupdate', onFrame as never);
        };
    }, [player]);

    const attachPlayer = useCallback((ref: PlayerRef | null) => {
        setPlayer(ref);
    }, []);

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

    const seconds = Math.floor(frame / def.fps);
    const total = def.durationInFrames / def.fps;

    return (
        <figure className='diagram' role='group' aria-label={def.label}>
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
                            ref={attachPlayer}
                            component={def.component as never}
                            durationInFrames={def.durationInFrames}
                            fps={def.fps}
                            compositionWidth={720}
                            compositionHeight={400}
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
