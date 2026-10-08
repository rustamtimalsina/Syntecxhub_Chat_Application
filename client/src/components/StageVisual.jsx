import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import AuthPreview from './AuthPreview.jsx';

function FailNow({ onFail }) {
  useEffect(() => { onFail?.(); }, [onFail]);
  return null;
}

// Loaded only when needed, and if the download fails the app falls back instead of crashing
const BubbleScene = lazy(() =>
  import('./BubbleScene.jsx').catch(() => ({ default: FailNow }))
);

const hasWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

export default function StageVisual() {
  const [failed, setFailed] = useState(false);
  const [small] = useState(() => matchMedia('(max-width: 880px)').matches);
  const [webgl] = useState(hasWebGL);
  const fail = useCallback(() => setFailed(true), []);

  if (small) return null;
  if (!webgl || failed) return <AuthPreview />;

  return (
    <div className="stage-visual" aria-hidden="true">
      <Suspense fallback={null}>
        <BubbleScene onFail={fail} />
      </Suspense>
    </div>
  );
}