'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const GlobeCollection = dynamic(
    () => import('@designcodeio/threeui/components/GlobeCollection').then((m) => m.GlobeCollection),
    { ssr: false },
);

/**
 * Decorative WebGL orb beside the sign-in form (ThreeUI "Globe: Energy Orb",
 * MIT). Hidden from assistive tech, and not mounted at all when the reader
 * prefers reduced motion or the browser has no WebGL, so the form never
 * depends on it.
 */
export default function AuthOrb() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
        const wide = window.matchMedia('(min-width: 60rem)');
        const hasWebGL = !!document.createElement('canvas').getContext('webgl');
        const update = () => setShow(!calm.matches && wide.matches && hasWebGL);
        update();
        calm.addEventListener('change', update);
        wide.addEventListener('change', update);
        return () => {
            calm.removeEventListener('change', update);
            wide.removeEventListener('change', update);
        };
    }, []);

    if (!show) return null;
    return (
        <div className='auth-orb' aria-hidden='true'>
            <GlobeCollection variant='energy-orb' hue={140} saturation={0.7} glow={0.6} smokeStrength={0.7} />
        </div>
    );
}
