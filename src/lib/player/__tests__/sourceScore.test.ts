/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { getVideoResolutionFromM3u8 } from '@/lib/utils';

import {
  calculateSourceScore,
  findFasterSource,
  orderSourcesByRank,
  parseSpeedKBps,
  pickFallbackSource,
  pickProbeUrl,
  probeSources,
  rankMeasuredSources,
  VideoTestResult,
} from '../sourceScore';

jest.mock('@/lib/utils', () => ({
  getVideoResolutionFromM3u8: jest.fn(),
}));

const mockProbe = getVideoResolutionFromM3u8 as jest.MockedFunction<
  typeof getVideoResolutionFromM3u8
>;

const result = (
  quality: string,
  loadSpeed: string,
  pingTime: number
): VideoTestResult => ({ quality, loadSpeed, pingTime });

describe('parseSpeedKBps', () => {
  it('统一换算为 KB/s', () => {
    expect(parseSpeedKBps('1.5 MB/s')).toBeCloseTo(1536);
    expect(parseSpeedKBps('800 KB/s')).toBeCloseTo(800);
  });

  it('缺省或异常值返回 0', () => {
    expect(parseSpeedKBps('未知')).toBe(0);
    expect(parseSpeedKBps('测量中...')).toBe(0);
    expect(parseSpeedKBps('')).toBe(0);
    expect(parseSpeedKBps('nonsense')).toBe(0);
  });
});

describe('calculateSourceScore', () => {
  const bounds = { maxSpeed: 1024, minPing: 100, maxPing: 1000 };

  it('分辨率越高分数越高', () => {
    const base = result('1080p', '1024 KB/s', 100);
    const sd = result('SD', '1024 KB/s', 100);
    expect(calculateSourceScore(base, bounds)).toBeGreaterThan(
      calculateSourceScore(sd, bounds)
    );
  });

  it('延迟最低的源拿到满额延迟分', () => {
    const fast = result('未知', '未知', 100);
    const slow = result('未知', '未知', 1000);
    expect(calculateSourceScore(fast, bounds)).toBeGreaterThan(
      calculateSourceScore(slow, bounds)
    );
  });

  it('全部延迟相同时不除零', () => {
    const same = { maxSpeed: 1024, minPing: 200, maxPing: 200 };
    expect(calculateSourceScore(result('4K', '未知', 200), same)).toBeCloseTo(
      100 * 0.4 + 30 * 0.4 + 100 * 0.2
    );
  });

  it('无效延迟不参与加分', () => {
    expect(calculateSourceScore(result('未知', '未知', 0), bounds)).toBeCloseTo(
      30 * 0.4
    );
  });
});

describe('pickProbeUrl', () => {
  it('多集时取第二集，单集取第一集', () => {
    expect(pickProbeUrl(['a', 'b', 'c'])).toBe('b');
    expect(pickProbeUrl(['a'])).toBe('a');
    expect(pickProbeUrl([])).toBeUndefined();
    expect(pickProbeUrl(undefined)).toBeUndefined();
  });
});

describe('rankMeasuredSources', () => {
  it('空输入返回空数组', () => {
    expect(rankMeasuredSources([])).toEqual([]);
  });

  it('按综合评分从高到低排序', () => {
    const ranked = rankMeasuredSources([
      { source: 'slow', testResult: result('SD', '100 KB/s', 900) },
      { source: 'best', testResult: result('1080p', '1024 KB/s', 100) },
      { source: 'mid', testResult: result('720p', '500 KB/s', 400) },
    ]);

    expect(ranked.map((item) => item.source)).toEqual(['best', 'mid', 'slow']);
    expect(ranked[0].score).toBeGreaterThan(ranked[2].score);
  });

  it('速度全部缺省时使用默认基准且不报错', () => {
    const ranked = rankMeasuredSources([
      { source: 'a', testResult: result('4K', '未知', 0) },
      { source: 'b', testResult: result('SD', '未知', 0) },
    ]);
    expect(ranked[0].source).toBe('a');
  });
});

describe('probeSources', () => {
  beforeEach(() => jest.resetAllMocks());

  it('跳过没有播放地址的源', async () => {
    mockProbe.mockResolvedValue(result('1080p', '1024 KB/s', 100));

    const results = await probeSources<{ id: string; episodes: string[] }>(
      [
        { id: 'ok', episodes: ['u1', 'u2'] },
        { id: 'empty', episodes: [] },
      ],
      (source) => source.episodes
    );

    expect(results[0]?.source.id).toBe('ok');
    expect(results[1]).toBeNull();
    expect(mockProbe).toHaveBeenCalledTimes(1);
    expect(mockProbe).toHaveBeenCalledWith('u2');
  });

  it('单个源测速失败不影响其他源', async () => {
    mockProbe
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(result('720p', '500 KB/s', 200));

    const results = await probeSources<{ id: string; episodes: string[] }>(
      [
        { id: 'bad', episodes: ['a'] },
        { id: 'good', episodes: ['b'] },
      ],
      (source) => source.episodes
    );

    expect(results[0]).toBeNull();
    expect(results[1]?.source.id).toBe('good');
  });

  it('通过 onResult 增量回传结果', async () => {
    mockProbe.mockResolvedValue(result('1080p', '1024 KB/s', 100));
    const seen: string[] = [];

    await probeSources(
      [
        { id: 'x', episodes: ['1', '2'] },
        { id: 'y', episodes: ['3', '4'] },
      ],
      (source) => source.episodes,
      (source) => seen.push(source.id)
    );

    expect(seen.sort()).toEqual(['x', 'y']);
  });
});

describe('后台测速结果的排序与提示', () => {
  const src = (name: string) => ({ source: name, id: `id-${name}` });
  const measured = (name: string, score: number) => ({
    source: src(name),
    testResult: result('1080p', '1 MB/s', 100),
    score,
  });

  it('orderSourcesByRank 未测速的源排在后面', () => {
    const sources = [src('a'), src('b'), src('c')];
    const ranked = [measured('c', 90), measured('a', 50)];

    expect(orderSourcesByRank(sources, ranked).map((s) => s.source)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('findFasterSource 分差不足时不打扰当前播放', () => {
    const ranked = [measured('fast', 80), measured('slow', 75)];

    expect(findFasterSource(ranked, 'slow-id-slow')).toBeNull();
    expect(findFasterSource(ranked, 'fast-id-fast')).toBeNull();
    expect(
      findFasterSource(
        [measured('fast', 80), measured('slow', 60)],
        'slow-id-slow'
      )?.source.source
    ).toBe('fast');
  });

  it('当前源没有测速结果时直接推荐最优源', () => {
    expect(
      findFasterSource([measured('fast', 80)], 'other-id-other')?.source.source
    ).toBe('fast');
  });

  it('pickFallbackSource 跳过已尝试过的源', () => {
    const ordered = [src('a'), src('b'), src('c')];

    expect(pickFallbackSource(ordered, new Set(['a-id-a']))?.source).toBe('b');
    expect(
      pickFallbackSource(ordered, new Set(['a-id-a', 'b-id-b', 'c-id-c']))
    ).toBeNull();
  });
});
