import { describe, expect, it } from 'vitest';
import {
  computeAreaPoints,
  computeBarMetrics,
  computeDonutArcs,
} from '@/components/charts/chartMath';

describe('computeBarMetrics', () => {
  it('returns zero heights and maxValue >= 1 when all values are zero or input is empty', () => {
    expect(computeBarMetrics([], 160)).toEqual({
      maxValue: 1,
      bars: [],
    });

    const zeroResult = computeBarMetrics(
      [
        { income: 0, expense: 0 },
        { income: 0, expense: 0 },
      ],
      160,
    );
    expect(zeroResult.maxValue).toBeGreaterThanOrEqual(1);
    expect(zeroResult.bars).toEqual([
      { incomeHeight: 0, expenseHeight: 0 },
      { incomeHeight: 0, expenseHeight: 0 },
    ]);
  });

  it('scales income and expense heights proportionally to maxValue and chartHeight', () => {
    const result = computeBarMetrics(
      [
        { income: 1000, expense: 250 },
        { income: 500, expense: 750 },
      ],
      200,
    );

    expect(result.maxValue).toBe(1000);
    expect(result.bars[0].incomeHeight).toBeCloseTo(200, 5);
    expect(result.bars[0].expenseHeight).toBeCloseTo(50, 5);
    expect(result.bars[1].incomeHeight).toBeCloseTo(100, 5);
    expect(result.bars[1].expenseHeight).toBeCloseTo(150, 5);
  });

  it('safely clamps negative or non-finite values to zero', () => {
    const result = computeBarMetrics(
      [
        { income: -200, expense: Number.NaN },
        { income: 400, expense: 200 },
      ],
      100,
    );

    expect(result.maxValue).toBe(400);
    expect(result.bars[0]).toEqual({ incomeHeight: 0, expenseHeight: 0 });
    expect(result.bars[1]).toEqual({ incomeHeight: 100, expenseHeight: 50 });
  });
});

describe('computeDonutArcs', () => {
  it('returns empty array for empty or all-zero inputs', () => {
    expect(computeDonutArcs([])).toEqual([]);
    expect(
      computeDonutArcs([
        { id: 'a', value: 0, color: '#EF4444' },
        { id: 'b', value: -10, color: '#10B981' },
      ]),
    ).toEqual([]);
  });

  it('marks a single non-zero slice with isFullCircle: true and 360 degree sweep', () => {
    const arcs = computeDonutArcs([
      { id: 'market', value: 500, color: '#EF4444' },
      { id: 'zero', value: 0, color: '#3B82F6' },
    ]);

    expect(arcs).toHaveLength(1);
    expect(arcs[0]).toMatchObject({
      id: 'market',
      color: '#EF4444',
      startAngle: 0,
      endAngle: 360,
      sweepAngle: 360,
      pct: 100,
      isFullCircle: true,
    });
  });

  it('computes contiguous multi-slice arcs summing to 360 degrees', () => {
    const arcs = computeDonutArcs([
      { id: 'rent', value: 500, color: '#EC4899' },
      { id: 'market', value: 300, color: '#EF4444' },
      { id: 'food', value: 200, color: '#F97316' },
    ]);

    expect(arcs).toHaveLength(3);
    expect(arcs.every((a) => !a.isFullCircle)).toBe(true);
    expect(arcs[0].startAngle).toBe(0);
    expect(arcs[0].sweepAngle).toBeCloseTo(180, 5);
    expect(arcs[1].startAngle).toBeCloseTo(arcs[0].endAngle, 5);
    expect(arcs[1].sweepAngle).toBeCloseTo(108, 5);
    expect(arcs[2].startAngle).toBeCloseTo(arcs[1].endAngle, 5);
    expect(arcs[2].endAngle).toBeCloseTo(360, 5);

    const totalSweep = arcs.reduce((acc, a) => acc + a.sweepAngle, 0);
    const totalPct = arcs.reduce((acc, a) => acc + a.pct, 0);
    expect(totalSweep).toBeCloseTo(360, 5);
    expect(totalPct).toBeCloseTo(100, 5);
  });
});

describe('computeAreaPoints', () => {
  it('handles empty array safely without NaN', () => {
    const result = computeAreaPoints([], 300, 160, 16);
    expect(result.points).toEqual([]);
    expect(result.linePath).toBe('');
    expect(result.areaPath).toBe('');
    expect(result.zeroY).toBeGreaterThanOrEqual(16);
    expect(result.zeroY).toBeLessThanOrEqual(144);
    expect(result.minValue).toBe(0);
    expect(result.maxValue).toBe(0);
  });

  it('handles single point cleanly without NaN', () => {
    const result = computeAreaPoints([250], 300, 160, 16);
    expect(result.points).toHaveLength(1);
    expect(Number.isFinite(result.points[0].x)).toBe(true);
    expect(Number.isFinite(result.points[0].y)).toBe(true);
    expect(result.points[0].x).toBeCloseTo(150, 5);
    expect(result.points[0].y).toBeCloseTo(16, 5);
    expect(result.zeroY).toBeCloseTo(144, 5);
    expect(result.linePath).toContain('M ');
    expect(result.areaPath).toContain('Z');
  });

  it('handles constant and all-zero arrays safely without division by zero', () => {
    const allZero = computeAreaPoints([0, 0, 0, 0], 300, 160, 12);
    expect(allZero.points).toHaveLength(4);
    for (const pt of allZero.points) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
      expect(pt.y).toBeCloseTo(allZero.zeroY, 5);
    }
    expect(allZero.zeroY).toBeGreaterThanOrEqual(12);
    expect(allZero.zeroY).toBeLessThanOrEqual(148);

    const constantPos = computeAreaPoints([100, 100, 100], 300, 160, 12);
    expect(constantPos.points).toHaveLength(3);
    expect(constantPos.points[0].y).toBeCloseTo(12, 5);
    expect(constantPos.points[2].y).toBeCloseTo(12, 5);
    expect(constantPos.zeroY).toBeCloseTo(148, 5);
  });

  it('positions mixed negative and positive values accurately with zeroY inside bounds', () => {
    const padding = 16;
    const height = 176; // innerHeight = 144
    const result = computeAreaPoints([-500, 0, 1000], 320, height, padding);

    expect(result.minValue).toBe(-500);
    expect(result.maxValue).toBe(1000);
    expect(result.zeroY).toBeGreaterThan(padding);
    expect(result.zeroY).toBeLessThan(height - padding);
    // 0 is 2/3 down from max (1000) across span 1500: 16 + (1000/1500)*144 = 16 + 96 = 112
    expect(result.zeroY).toBeCloseTo(112, 5);
    expect(result.points[0].y).toBeCloseTo(160, 5); // min -> bottom
    expect(result.points[1].y).toBeCloseTo(112, 5); // 0 -> zeroY
    expect(result.points[2].y).toBeCloseTo(16, 5); // max -> top
    expect(result.linePath).toContain('L ');
    expect(result.areaPath).toContain('Z');
  });
});
