import { describe, it, expect } from 'vitest';
import { RINK, RINK_MARKS as M, FT, NET_LEFT, NET_RIGHT } from './constants';

/**
 * These lock the rink to the NHL rulebook. If a marking looks wrong on screen,
 * it should fail here first.
 *
 * Reference: NHL Official Rules, Section 1 (The Rink).
 */

/** Convert a world-unit measurement back into feet */
const ft = (units: number) => units / FT;

describe('rink sheet', () => {
  it('is 200 x 85 feet', () => {
    expect(ft(RINK.width)).toBe(200);
    expect(ft(RINK.height)).toBe(85);
  });

  it('has a 28 ft corner radius', () => {
    expect(ft(RINK.cornerRadius)).toBe(28);
  });

  it('has corners that fit within the sheet', () => {
    expect(RINK.cornerRadius * 2).toBeLessThanOrEqual(RINK.height);
  });

  it('centres correctly', () => {
    expect(ft(RINK.centerX)).toBe(100);
    expect(ft(RINK.centerY)).toBe(42.5);
  });
});

describe('lines', () => {
  it('puts goal lines 11 ft from each end board', () => {
    expect(ft(RINK.goalLineLeftX)).toBe(11);
    expect(ft(RINK.width - RINK.goalLineRightX)).toBe(11);
  });

  it('puts blue lines 25 ft either side of centre', () => {
    expect(ft(RINK.centerX - RINK.blueLineLeftX)).toBe(25);
    expect(ft(RINK.blueLineRightX - RINK.centerX)).toBe(25);
  });

  it('makes the neutral zone 50 ft', () => {
    expect(ft(RINK.blueLineRightX - RINK.blueLineLeftX)).toBe(50);
  });

  it('makes each end zone 64 ft from blue line to end board', () => {
    // 200 = 64 + 50 + 64 + the two 11 ft ends... check against the sheet.
    expect(ft(RINK.blueLineLeftX - RINK.x)).toBe(75);
    expect(ft(RINK.x + RINK.width - RINK.blueLineRightX)).toBe(75);
  });

  it('makes blue and centre lines 12 inches wide', () => {
    expect(ft(M.lineWidthMajor)).toBe(1);
  });

  it('makes goal lines 2 inches wide', () => {
    expect(ft(M.lineWidthMinor) * 12).toBeCloseTo(2);
  });

  it('is symmetric end to end', () => {
    expect(RINK.goalLineLeftX - RINK.x).toBeCloseTo(RINK.x + RINK.width - RINK.goalLineRightX);
    expect(RINK.centerX - RINK.blueLineLeftX).toBeCloseTo(RINK.blueLineRightX - RINK.centerX);
  });
});

describe('faceoff markings', () => {
  it('makes every faceoff circle 30 ft across', () => {
    expect(ft(M.faceoffCircleRadius) * 2).toBe(30);
  });

  it('puts end zone spots 20 ft from the goal line', () => {
    expect(ft(M.endZoneSpotFromGoalLine)).toBe(20);
  });

  it('puts spots 22 ft either side of the long axis', () => {
    expect(ft(M.spotOffsetFromCenterY)).toBe(22);
  });

  it('keeps end zone circles clear of the end boards', () => {
    const spotX = RINK.goalLineLeftX + M.endZoneSpotFromGoalLine;
    expect(spotX - M.faceoffCircleRadius).toBeGreaterThan(RINK.x);
  });

  it('keeps end zone circles inside the side boards', () => {
    const spotY = RINK.centerY + M.spotOffsetFromCenterY;
    expect(spotY + M.faceoffCircleRadius).toBeLessThanOrEqual(RINK.y + RINK.height);
  });

  it('puts neutral zone spots 5 ft off the blue line, inside the neutral zone', () => {
    expect(ft(M.neutralSpotFromBlueLine)).toBe(5);

    const leftSpot = RINK.blueLineLeftX - M.neutralSpotFromBlueLine;
    expect(leftSpot).toBeLessThan(RINK.blueLineLeftX);
    expect(leftSpot).toBeGreaterThan(RINK.goalLineLeftX);
  });

  it('spaces hash marks 5 ft 7 in apart', () => {
    expect(ft(M.hashSeparation)).toBeCloseTo(5 + 7 / 12);
  });

  it('keeps the centre circle clear of both blue lines', () => {
    expect(RINK.centerX - M.faceoffCircleRadius).toBeGreaterThan(RINK.blueLineLeftX);
    expect(RINK.centerX + M.faceoffCircleRadius).toBeLessThan(RINK.blueLineRightX);
  });
});

describe('goal and crease', () => {
  it('makes the goal 6 ft wide and 4 ft deep', () => {
    expect(ft(M.goalHalfWidth) * 2).toBe(6);
    expect(ft(M.goalDepth)).toBe(4);
  });

  it('makes the crease a 6 ft radius arc, 8 ft wide', () => {
    expect(ft(M.creaseRadius)).toBe(6);
    expect(ft(M.creaseHalfWidth) * 2).toBe(8);
  });

  it('keeps the crease arc wider than its flat edge, so the arc is real', () => {
    // If the half-width ever met or exceeded the radius, asin() would produce
    // NaN and the crease would vanish.
    expect(M.creaseHalfWidth).toBeLessThan(M.creaseRadius);
  });

  it('fits the goal behind the goal line without leaving the rink', () => {
    expect(RINK.goalLineLeftX - M.goalDepth).toBeGreaterThan(RINK.x);
    expect(RINK.goalLineRightX + M.goalDepth).toBeLessThan(RINK.x + RINK.width);
  });

  it('aims shots at the centre of each goal mouth', () => {
    expect(NET_LEFT).toEqual({ x: RINK.goalLineLeftX, y: RINK.centerY });
    expect(NET_RIGHT).toEqual({ x: RINK.goalLineRightX, y: RINK.centerY });
  });

  it('makes the trapezoid 22 ft at the goal line and 28 ft at the boards', () => {
    expect(ft(M.trapezoidGoalLineHalfWidth) * 2).toBe(22);
    expect(ft(M.trapezoidBoardsHalfWidth) * 2).toBe(28);
  });

  it('widens the trapezoid toward the boards', () => {
    expect(M.trapezoidBoardsHalfWidth).toBeGreaterThan(M.trapezoidGoalLineHalfWidth);
  });

  it('makes the referee crease a 10 ft semicircle', () => {
    expect(ft(M.refereeCreaseRadius)).toBe(10);
  });
});
