import { IconBallVolleyball } from '@tabler/icons-react';

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><IconBallVolleyball size={27} stroke={1.7} aria-hidden="true" /></span>
      <span className="brand-copy">Volleyball<span>Match Tracker</span></span>
    </div>
  );
}
