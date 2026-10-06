/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { getVideoResolutionFromM3u8 } from '@/lib/utils';

export interface VideoTestResult {
  quality: string;
  loadSpeed: string;
  pingTime: number;
}

export interface MeasuredSource<T> {
  source: T;
  testResult: VideoTestResult;
  score: number;
}

const QUALITY_SCORES: Record<string, number> = {
  '4K': 100,
  '2K': 85,
  '1080p': 75,
  '720p': 60,
  '480p': 40,
  SD: 20,
};

// 速度或延迟缺省时使用的基准值
const DEFAULT_MAX_SPEED_KBPS = 1024;
const DEFAULT_MIN_PING = 50;
const DEFAULT_MAX_PING = 1000;

/**
 * 把 '1.5 MB/s' / '800 KB/s' 统一解析为 KB/s，无法解析时返回 0。
 */
export function parseSpeedKBps(loadSpeed: string): number {
  if (!loadSpeed || loadSpeed === '未知' || loadSpeed === '测量中...') return 0;

  const match = loadSpeed.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  return match[2] === 'MB/s' ? value * 1024 : value;
}

/**
 * 综合评分：分辨率 40% + 下载速度 40% + 网络延迟 20%。
 * 速度按本批最快源线性映射，延迟按本批最优/最差源线性映射。
 */
export function calculateSourceScore(
  testResult: VideoTestResult,
  bounds: { maxSpeed: number; minPing: number; maxPing: number }
): number {
  let score = 0;

  const qualityScore = QUALITY_SCORES[testResult.quality] ?? 0;
  score += qualityScore * 0.4;

  const speedKBps = parseSpeedKBps(testResult.loadSpeed);
  const speedScore =
    speedKBps > 0
      ? Math.min(100, Math.max(0, (speedKBps / bounds.maxSpeed) * 100))
      : 30;
  score += speedScore * 0.4;

  const { minPing, maxPing } = bounds;
  let pingScore = 0;
  if (testResult.pingTime > 0) {
    pingScore =
      maxPing === minPing
        ? 100
        : Math.min(
            100,
            Math.max(
              0,
              ((maxPing - testResult.pingTime) / (maxPing - minPing)) * 100
            )
          );
  }
  score += pingScore * 0.2;

  return Math.round(score * 100) / 100;
}

/**
 * 取用于测速的播放地址。
 * 多集时取第二集：部分源首页地址是预告或占位，测速会失真。
 */
export function pickProbeUrl(episodes?: string[]): string | undefined {
  if (!episodes || episodes.length === 0) return undefined;
  return episodes.length > 1 ? episodes[1] : episodes[0];
}

/**
 * 对已测速的源打分并排序，分值高（更快/更清晰）的在前。
 */
export function rankMeasuredSources<T>(
  items: Array<{ source: T; testResult: VideoTestResult }>
): MeasuredSource<T>[] {
  if (items.length === 0) return [];

  const speeds = items
    .map((item) => parseSpeedKBps(item.testResult.loadSpeed))
    .filter((speed) => speed > 0);
  const pings = items
    .map((item) => item.testResult.pingTime)
    .filter((ping) => ping > 0);

  const bounds = {
    maxSpeed: speeds.length > 0 ? Math.max(...speeds) : DEFAULT_MAX_SPEED_KBPS,
    minPing: pings.length > 0 ? Math.min(...pings) : DEFAULT_MIN_PING,
    maxPing: pings.length > 0 ? Math.max(...pings) : DEFAULT_MAX_PING,
  };

  return items
    .map((item) => ({
      source: item.source,
      testResult: item.testResult,
      score: calculateSourceScore(item.testResult, bounds),
    }))
    .sort((a, b) => b.score - a.score);
}

/** 播放源唯一标识 */
export function sourceKey(source: { source: string; id: string }): string {
  return `${source.source}-${source.id}`;
}

/** 按测速排名重排播放源：测过速的按分值从高到低在前，未测速的保持原顺序 */
export function orderSourcesByRank<T extends { source: string; id: string }>(
  sources: T[],
  ranked: MeasuredSource<T>[]
): T[] {
  const rankedKeys = new Set(ranked.map((item) => sourceKey(item.source)));
  return [
    ...ranked.map((item) => item.source),
    ...sources.filter((source) => !rankedKeys.has(sourceKey(source))),
  ];
}

/**
 * 后台测速结束后判断是否存在明显更优的源，用于“已找到更快的源”提示。
 * 与当前源分差不足 minScoreGap 时不打扰当前播放。
 */
export function findFasterSource<T extends { source: string; id: string }>(
  ranked: MeasuredSource<T>[],
  currentKey: string,
  minScoreGap = 10
): MeasuredSource<T> | null {
  const best = ranked[0];
  if (!best || sourceKey(best.source) === currentKey) return null;

  const current = ranked.find((item) => sourceKey(item.source) === currentKey);
  if (current && best.score - current.score < minScoreGap) return null;

  return best;
}

/** 自动换源时按给定顺序挑一个还没尝试过的源 */
export function pickFallbackSource<T extends { source: string; id: string }>(
  orderedSources: T[],
  tried: Set<string>
): T | null {
  return orderedSources.find((source) => !tried.has(sourceKey(source))) ?? null;
}

/**
 * 并发探测多个播放源。测速失败或没有可用地址的源返回 null，
 * 通过 onResult 增量回传，便于调用方边测速边展示结果。
 */
export async function probeSources<T>(
  sources: T[],
  getEpisodes: (source: T) => string[] | undefined,
  onResult?: (
    source: T,
    testResult: VideoTestResult | null,
    index: number
  ) => void,
  concurrency?: number
): Promise<Array<{ source: T; testResult: VideoTestResult } | null>> {
  const results: Array<{ source: T; testResult: VideoTestResult } | null> =
    sources.map(() => null);
  if (sources.length === 0) return results;

  // 默认均分为两批并发；起播后在后台测速时应调低，避免抢带宽
  const workersCount = Math.min(
    concurrency ?? Math.ceil(sources.length / 2),
    sources.length
  );
  let cursor = 0;

  const workers = Array.from(
    { length: Math.max(1, workersCount) },
    async () => {
      while (cursor < sources.length) {
        const index = cursor++;
        const source = sources[index];
        const url = pickProbeUrl(getEpisodes(source));

        let testResult: VideoTestResult | null = null;
        if (!url) {
          console.warn('播放源没有可用的播放地址，跳过测速');
        } else {
          try {
            testResult = await getVideoResolutionFromM3u8(url);
          } catch {
            testResult = null;
          }
        }

        if (testResult) {
          results[index] = { source, testResult };
        }
        onResult?.(source, testResult, index);
      }
    }
  );

  await Promise.all(workers);
  return results;
}
