import { forwardRef } from 'react';

export const NoiseMeter = forwardRef<HTMLSpanElement, { visible: boolean }>(function NoiseMeter(
  { visible },
  ref,
) {
  return (
    <span ref={ref} className={`noise-meter${visible ? '' : ' hidden'}`} aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => <span key={i} style={{ height: `${20 + i * 6}%` }} />)}
    </span>
  );
});
