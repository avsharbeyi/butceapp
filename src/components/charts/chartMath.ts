export interface BarInput {
  income: number;
  expense: number;
}

export interface BarMetric {
  incomeHeight: number;
  expenseHeight: number;
}

export interface BarMetricsResult {
  maxValue: number;
  bars: BarMetric[];
}

export interface DonutInput {
  id: string;
  value: number;
  color: string;
}

export interface DonutArc {
  id: string;
  color: string;
  startAngle: number;
  endAngle: number;
  sweepAngle: number;
  pct: number;
  isFullCircle: boolean;
}

export interface AreaPoint {
  x: number;
  y: number;
  value: number;
}

export interface AreaPointsResult {
  points: AreaPoint[];
  linePath: string;
  areaPath: string;
  zeroY: number;
  minValue: number;
  maxValue: number;
}

function sanitizeNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function sanitizeFinite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes normalized SVG bar heights for income/expense pairs.
 * Safely clamps empty or all-zero series so `maxValue >= 1` and all heights are `>= 0`.
 */
export function computeBarMetrics(
  values: BarInput[],
  chartHeight: number,
): BarMetricsResult {
  const safeHeight = Number.isFinite(chartHeight) && chartHeight > 0 ? chartHeight : 0;

  if (values.length === 0) {
    return { maxValue: 1, bars: [] };
  }

  let rawMax = 0;
  const sanitized = values.map((item) => {
    const income = sanitizeNonNegative(item.income);
    const expense = sanitizeNonNegative(item.expense);
    if (income > rawMax) rawMax = income;
    if (expense > rawMax) rawMax = expense;
    return { income, expense };
  });

  const maxValue = Math.max(1, rawMax);

  const bars = sanitized.map(({ income, expense }) => ({
    incomeHeight: rawMax === 0 || safeHeight === 0 ? 0 : (income / maxValue) * safeHeight,
    expenseHeight: rawMax === 0 || safeHeight === 0 ? 0 : (expense / maxValue) * safeHeight,
  }));

  return { maxValue, bars };
}

/**
 * Computes contiguous 360-degree donut arc angles from positive slice values.
 * Returns `[]` when empty or all values are `<= 0`, and marks a single non-zero
 * slice with `isFullCircle: true`.
 */
export function computeDonutArcs(items: DonutInput[]): DonutArc[] {
  const positive = items
    .map((item) => ({
      id: item.id,
      color: item.color,
      value: sanitizeNonNegative(item.value),
    }))
    .filter((item) => item.value > 0);

  if (positive.length === 0) {
    return [];
  }

  if (positive.length === 1) {
    return [
      {
        id: positive[0].id,
        color: positive[0].color,
        startAngle: 0,
        endAngle: 360,
        sweepAngle: 360,
        pct: 100,
        isFullCircle: true,
      },
    ];
  }

  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) {
    return [];
  }

  let cursor = 0;
  return positive.map((item, idx) => {
    const isLast = idx === positive.length - 1;
    const pct = (item.value / total) * 100;
    const sweepAngle = isLast ? Math.max(0, 360 - cursor) : (item.value / total) * 360;
    const startAngle = cursor;
    const endAngle = isLast ? 360 : cursor + sweepAngle;
    cursor = endAngle;

    return {
      id: item.id,
      color: item.color,
      startAngle,
      endAngle,
      sweepAngle,
      pct,
      isFullCircle: false,
    };
  });
}

/**
 * Computes SVG coordinates, polyline path, area polygon path relative to `zeroY`,
 * and domain bounds for a cash-flow series. Handles empty, single-point, constant,
 * all-zero, and mixed positive/negative arrays safely.
 */
export function computeAreaPoints(
  values: number[],
  width: number,
  height: number,
  padding = 16,
): AreaPointsResult {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 300;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 160;
  const rawPad = Number.isFinite(padding) && padding >= 0 ? padding : 0;
  const maxAllowedPadX = Math.max(0, safeWidth / 2 - 1);
  const maxAllowedPadY = Math.max(0, safeHeight / 2 - 1);
  const padX = Math.min(rawPad, maxAllowedPadX);
  const padY = Math.min(rawPad, maxAllowedPadY);

  const innerWidth = Math.max(0, safeWidth - padX * 2);
  const innerHeight = Math.max(0, safeHeight - padY * 2);
  const midY = padY + innerHeight / 2;

  if (values.length === 0) {
    return {
      points: [],
      linePath: '',
      areaPath: '',
      zeroY: midY,
      minValue: 0,
      maxValue: 0,
    };
  }

  const finiteValues = values.map(sanitizeFinite);
  const minValue = Math.min(0, ...finiteValues);
  const maxValue = Math.max(0, ...finiteValues);
  const span = maxValue - minValue;

  const valueToY = (val: number): number => {
    if (span === 0) {
      return midY;
    }
    return padY + ((maxValue - val) / span) * innerHeight;
  };

  const zeroY = valueToY(0);

  const points: AreaPoint[] = finiteValues.map((value, idx) => {
    const x =
      finiteValues.length === 1
        ? padX + innerWidth / 2
        : padX + (idx / (finiteValues.length - 1)) * innerWidth;
    const y = valueToY(value);
    return { x, y, value };
  });

  if (points.length === 1) {
    const p = points[0];
    const linePath = `M ${roundCoord(p.x)} ${roundCoord(p.y)}`;
    const areaPath = `M ${roundCoord(p.x)} ${roundCoord(p.y)} L ${roundCoord(p.x)} ${roundCoord(zeroY)} Z`;
    return {
      points,
      linePath,
      areaPath,
      zeroY,
      minValue,
      maxValue,
    };
  }

  const lineSegments = points.map((pt, idx) => {
    const cmd = idx === 0 ? 'M' : 'L';
    return `${cmd} ${roundCoord(pt.x)} ${roundCoord(pt.y)}`;
  });
  const linePath = lineSegments.join(' ');

  const first = points[0];
  const last = points[points.length - 1];
  const areaPath = `${linePath} L ${roundCoord(last.x)} ${roundCoord(zeroY)} L ${roundCoord(first.x)} ${roundCoord(zeroY)} Z`;

  return {
    points,
    linePath,
    areaPath,
    zeroY,
    minValue,
    maxValue,
  };
}

/** Converts polar angle (0 deg at 12 o'clock, clockwise) to SVG cartesian coordinates. */
export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleInDegrees: number,
): { x: number; y: number } {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: roundCoord(cx + radius * Math.cos(angleInRadians)),
    y: roundCoord(cy + radius * Math.sin(angleInRadians)),
  };
}

/** Builds an SVG donut ring sector path between `startAngle` and `endAngle` (clockwise from top). */
export function describeDonutSectorPath(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = Math.min(359.99, Math.max(0, endAngle - startAngle));
  const clampedEnd = startAngle + sweep;
  const largeArcFlag = sweep > 180 ? 1 : 0;

  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, clampedEnd);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, clampedEnd);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${roundCoord(outerRadius)} ${roundCoord(outerRadius)} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${roundCoord(innerRadius)} ${roundCoord(innerRadius)} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    'Z',
  ].join(' ');
}
