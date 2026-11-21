import { describe, expect, it, vi } from 'vitest';
import { centreIceLogo, centreIceLogoVersion, fitInCircle, setCentreIceLogo, subscribeCentreIceLogo } from './teamLogo';

describe('the centre-ice team logo', () => {
  it('fits a logo inside the centre circle without distorting it', () => {
    const wide = fitInCircle(200, 100, 50);
    expect(wide.width / wide.height).toBeCloseTo(2);
    expect(Math.hypot(wide.width, wide.height)).toBeCloseTo(100);
  });

  it('starts as the PHormation crest, and clearing it again changes nothing', () => {
    const listener = vi.fn();
    const stop = subscribeCentreIceLogo(listener);
    const before = centreIceLogoVersion();
    setCentreIceLogo(null);
    expect(centreIceLogo()).toBeNull();
    expect(centreIceLogoVersion()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    stop();
  });
});
