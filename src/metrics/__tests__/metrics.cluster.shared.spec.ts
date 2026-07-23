import {
  BUCKET_INTERVAL_MS,
  HOUR_INTERVAL_MS,
  estimatePercentileFromHistogram,
  histogramField,
  histogramToApi,
  readGranularity,
  timelineBucketMs,
} from '../metrics.cluster.shared';

describe('histogramField', () => {
  it('maps a duration to its first covering bound', () => {
    expect(histogramField(0)).toBe('h:25');
    expect(histogramField(25)).toBe('h:25');
    expect(histogramField(26)).toBe('h:50');
    expect(histogramField(999)).toBe('h:1000');
    expect(histogramField(30000)).toBe('h:30000');
  });

  it('sends anything past the last bound to inf', () => {
    expect(histogramField(30001)).toBe('h:inf');
    expect(histogramField(120_000)).toBe('h:inf');
  });
});

describe('estimatePercentileFromHistogram', () => {
  it('returns 0 for an empty population', () => {
    expect(estimatePercentileFromHistogram({}, 0, 99)).toBe(0);
  });

  it('interpolates inside the winning bucket', () => {
    // 100 requests all inside (0, 100]: p50 -> rank 50 of 100 in one bucket
    // spanning (50, 100] would interpolate; single-bucket case spans (0, 25].
    const counts = { 'h:25': 100 };
    expect(estimatePercentileFromHistogram(counts, 100, 50)).toBeCloseTo(12.5, 1);
    expect(estimatePercentileFromHistogram(counts, 100, 100)).toBeCloseTo(25, 1);
  });

  it('walks cumulative counts across buckets', () => {
    const counts = { 'h:25': 50, 'h:100': 50 };
    // p90 -> rank 90. First 50 sit in (0, 25]; the empty 50-bucket narrows
    // the winning interval to (50, 100], where rank 40-of-50 interpolates.
    expect(estimatePercentileFromHistogram(counts, 100, 90)).toBeCloseTo(50 + 50 * (40 / 50), 1);
  });

  it('reports the lower bound of the open-ended bucket', () => {
    const counts = { 'h:inf': 10 };
    expect(estimatePercentileFromHistogram(counts, 10, 99)).toBe(30000);
  });
});

describe('histogramToApi', () => {
  it('strips the h: prefix and drops zero buckets', () => {
    expect(histogramToApi({ 'h:25': 3, 'h:inf': 1, 'h:50': 0, other: 5 })).toEqual({
      '25': 3,
      inf: 1,
    });
  });

  it('returns undefined when nothing is set', () => {
    expect(histogramToApi({})).toBeUndefined();
    expect(histogramToApi({ 'h:25': 0 })).toBeUndefined();
  });
});

describe('timelineBucketMs', () => {
  it('keeps minute buckets up to 2h', () => {
    expect(timelineBucketMs(5 * 60_000)).toBe(BUCKET_INTERVAL_MS);
    expect(timelineBucketMs(2 * HOUR_INTERVAL_MS)).toBe(BUCKET_INTERVAL_MS);
  });

  it('coarsens progressively for larger windows', () => {
    expect(timelineBucketMs(6 * HOUR_INTERVAL_MS)).toBe(5 * BUCKET_INTERVAL_MS);
    expect(timelineBucketMs(24 * HOUR_INTERVAL_MS)).toBe(HOUR_INTERVAL_MS);
    expect(timelineBucketMs(7 * 24 * HOUR_INTERVAL_MS)).toBe(HOUR_INTERVAL_MS);
    // Past a week: 6h buckets so a 30d chart stays ~120 points.
    expect(timelineBucketMs(30 * 24 * HOUR_INTERVAL_MS)).toBe(6 * HOUR_INTERVAL_MS);
  });
});

describe('readGranularity', () => {
  it('serves up to 6h from minute keys and beyond from hourly rollups', () => {
    expect(readGranularity(6 * HOUR_INTERVAL_MS)).toBe('minute');
    expect(readGranularity(6 * HOUR_INTERVAL_MS + 1)).toBe('hour');
    expect(readGranularity(30 * 24 * HOUR_INTERVAL_MS)).toBe('hour');
  });
});
