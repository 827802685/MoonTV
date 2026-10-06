/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import Hls from 'hls.js';

export interface AdFilterResult {
  /** 改写后的播放列表 */
  content: string;
  /** 命中的广告分片数 */
  removedSegments: number;
  /** 命中的广告总时长（秒） */
  removedSeconds: number;
}

interface Segment {
  /** 该分片之前的所有标签行 */
  tags: string[];
  uri: string;
  duration: number;
  /** 标签中是否带 DISCONTINUITY，即是否自成一段编码不连续的块 */
  discontinuity: boolean;
  /** 标签中是否带 CUE-OUT / SCTE-35 开始标记 */
  adStart: boolean;
  /** 标签中是否带 CUE-IN 结束标记 */
  adEnd: boolean;
}

// 无显式标记时，按分片数与时长判定一个不连续块是否像广告
const MAX_AD_SEGMENTS = 15;
const MAX_AD_SECONDS = 180;
// 疑似广告块与主内容块的最小时长比，避免把正片当成广告
const AD_TO_MAIN_RATIO = 3;
// 主内容短于此秒数时不做推断式剔除
const MIN_MAIN_CONTENT_SECONDS = 120;

const EMPTY_RESULT: AdFilterResult = {
  content: '',
  removedSegments: 0,
  removedSeconds: 0,
};

function hasAdStartTag(tags: string[]): boolean {
  return tags.some((line) => {
    const tag = line.trim();
    if (/^#EXT-X-CUE-OUT\b/i.test(tag)) return true;
    if (/^#EXT-X-DATERANGE/i.test(tag)) {
      return /SCTE-?35-OUT|CUE-OUT|START_ON|\bX-AD\b/i.test(tag);
    }
    return false;
  });
}

function hasAdEndTag(tags: string[]): boolean {
  return tags.some((line) => {
    const tag = line.trim();
    if (/^#EXT-X-CUE-IN\b/i.test(tag)) return true;
    if (/^#EXT-X-DATERANGE/i.test(tag)) {
      return /SCTE-?35-IN|CUE-IN|END_ON/i.test(tag);
    }
    return false;
  });
}

/**
 * 作用于整个列表（或其后所有分片）的标签，剔除分片时必须原样保留。
 * 其余标签（DISCONTINUITY / CUE-OUT / DATERANGE 等）即使出现在首条
 * #EXTINF 之前，也是给后面那个分片用的，要跟着分片一起移除。
 */
const PLAYLIST_LEVEL_TAG =
  /^#EXT-X-(VERSION|TARGETDURATION|MEDIA-SEQUENCE|PLAYLIST-TYPE|INDEPENDENT-SEGMENTS|START-DATE|SESSION-KEY|SESSION-DATA|SERVER-CONTROL|PART-INF|I-FRAMES-ONLY|KEY|MAP|START)\b/i;

function isPlaylistLevelTag(tag: string): boolean {
  return /^#EXTM3U/i.test(tag) || PLAYLIST_LEVEL_TAG.test(tag);
}

/**
 * 把媒体播放列表解析为头部、分片序列与尾部（ENDLIST 等）。
 * 首条 #EXTINF 之前的标签按作用域拆分：列表级标签进头部，
 * 其余跟随其后的分片，剔除广告时一并移除。
 */
function parseSegments(lines: string[]): {
  header: string[];
  segments: Segment[];
  tail: string[];
} | null {
  const header: string[] = [];
  const segments: Segment[] = [];
  let pendingTags: string[] = [];
  let inHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    if (trimmed.startsWith('#')) {
      if (inHeader && isPlaylistLevelTag(trimmed)) {
        header.push(line);
      } else {
        inHeader = false;
        pendingTags.push(line);
      }
      continue;
    }

    const durationTag = pendingTags
      .slice()
      .reverse()
      .find((tag) => /^#EXTINF/i.test(tag.trim()));

    segments.push({
      tags: pendingTags,
      uri: line,
      duration: durationTag
        ? parseFloat(durationTag.replace(/^\s*#EXTINF:/i, '')) || 0
        : 0,
      discontinuity: pendingTags.some((tag) =>
        /^#EXT-X-DISCONTINUITY\b/i.test(tag.trim())
      ),
      adStart: hasAdStartTag(pendingTags),
      adEnd: hasAdEndTag(pendingTags),
    });
    pendingTags = [];
  }

  if (segments.length === 0) return null;

  return { header, segments, tail: pendingTags };
}

/**
 * 找出应剔除的分片下标集合。
 * 优先信任显式标记（CUE-OUT/CUE-IN、SCTE-35），
 * 其次按 DISCONTINUITY 分块，把明显偏短的块当作广告插播。
 */
function findAdIndexes(segments: Segment[]): Set<number> {
  const ads = new Set<number>();

  let inMarkedAd = false;
  segments.forEach((segment, index) => {
    // 标签跟随其后的分片：CUE-IN 之后即回到正片
    if (segment.adEnd) inMarkedAd = false;
    if (segment.adStart) inMarkedAd = true;
    if (inMarkedAd) ads.add(index);
  });
  if (ads.size > 0) return ads;

  // 按 discontinuity 切块
  const blocks: number[][] = [];
  segments.forEach((segment, index) => {
    if (segment.discontinuity || blocks.length === 0) {
      blocks.push([index]);
    } else {
      blocks[blocks.length - 1].push(index);
    }
  });
  if (blocks.length < 2) return ads;

  const blockSeconds = blocks.map((block) =>
    block.reduce((sum, index) => sum + segments[index].duration, 0)
  );
  const longest = Math.max(...blockSeconds);

  // 主内容过短（如预告片）时不做推断，宁可不删也不误删正片
  if (longest < MIN_MAIN_CONTENT_SECONDS) return ads;

  blocks.forEach((block, index) => {
    const seconds = blockSeconds[index];
    if (
      block.length <= MAX_AD_SEGMENTS &&
      seconds > 0 &&
      seconds <= MAX_AD_SECONDS &&
      seconds * AD_TO_MAIN_RATIO <= longest
    ) {
      block.forEach((i) => ads.add(i));
    }
  });

  return ads;
}

function rewriteTargetDuration(content: string): string {
  const pattern = /^#EXTINF:\s*([\d.]+)/gim;
  let max = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    max = Math.max(max, parseFloat(match[1]) || 0);
  }
  if (max === 0) return content;

  const target = Math.ceil(max);
  return content.replace(
    /^#EXT-X-TARGETDURATION:\d+/gim,
    `#EXT-X-TARGETDURATION:${target}`
  );
}

/**
 * 剔除 m3u8 中的广告分段。
 * 采集源常用 #EXT-X-DISCONTINUITY 把广告和正片拼在同一个列表里，
 * 直接删掉 DISCONTINUITY 标签会让广告和正片混在一起继续播，
 * 这里改为整段剔除并修正 TARGETDURATION。
 */
export function filterAds(m3u8Content: string): AdFilterResult {
  if (!m3u8Content) return { ...EMPTY_RESULT, content: m3u8Content };
  if (!/^#EXTM3U/m.test(m3u8Content)) {
    return { ...EMPTY_RESULT, content: m3u8Content };
  }

  const parsed = parseSegments(m3u8Content.split('\n'));
  if (!parsed) return { ...EMPTY_RESULT, content: m3u8Content };

  const { header, segments, tail } = parsed;
  const adIndexes = findAdIndexes(segments);

  // 不能把整个列表清空
  if (adIndexes.size === 0 || adIndexes.size >= segments.length) {
    return {
      content: m3u8Content,
      removedSegments: 0,
      removedSeconds: 0,
    };
  }

  const kept = segments.filter((_, index) => !adIndexes.has(index));
  const removedSeconds = segments
    .filter((_, index) => adIndexes.has(index))
    .reduce((sum, segment) => sum + segment.duration, 0);

  const lines: string[] = [];
  // header 与空行原样保留，广告分片连同其标签一起移除
  for (const line of header) {
    if (line.trim() === '') continue;
    lines.push(line);
  }
  kept.forEach((segment, keptIndex) => {
    for (const tag of segment.tags) {
      const trimmed = tag.trim();
      // 正片内部各块之间可能真的编码不连续，只有拼接后的首块标记必须去掉，
      // 否则 hls.js 会在列表开头插一个无意义的断点
      if (keptIndex === 0 && /^#EXT-X-DISCONTINUITY\b/i.test(trimmed)) continue;
      // 广告结束标记随广告一起失效
      if (/^#EXT-X-CUE-IN\b/i.test(trimmed)) continue;
      lines.push(tag);
    }
    lines.push(segment.uri);
  });
  for (const line of tail) {
    if (line.trim() === '') continue;
    lines.push(line);
  }

  const content = rewriteTargetDuration(lines.join('\n'));
  return {
    content,
    removedSegments: adIndexes.size,
    removedSeconds: Math.round(removedSeconds),
  };
}

export interface AdFilterEvent {
  removedSegments: number;
  removedSeconds: number;
}

type AdFilterListener = (event: AdFilterEvent) => void;

const adFilterListeners = new Set<AdFilterListener>();

/** 订阅去广告命中事件，返回取消订阅函数 */
export function subscribeAdsFiltered(listener: AdFilterListener): () => void {
  adFilterListeners.add(listener);
  return () => {
    adFilterListeners.delete(listener);
  };
}

function notifyAdsFiltered(event: AdFilterEvent) {
  adFilterListeners.forEach((listener) => listener(event));
}

/**
 * 拦截 manifest / level 响应并改写播放列表的 hls.js loader。
 */
export class AdFilteringHlsLoader extends Hls.DefaultConfig.loader {
  constructor(config: any) {
    super(config);
    const load = this.load.bind(this);
    this.load = function (context: any, config: any, callbacks: any) {
      if (
        (context as any).type === 'manifest' ||
        (context as any).type === 'level'
      ) {
        const onSuccess = callbacks.onSuccess;
        callbacks.onSuccess = function (
          response: any,
          stats: any,
          context: any
        ) {
          if (response.data && typeof response.data === 'string') {
            const result = filterAds(response.data);
            if (result.removedSegments > 0) {
              console.log(
                `已剔除 ${result.removedSegments} 个广告分片，约 ${result.removedSeconds} 秒`
              );
              notifyAdsFiltered({
                removedSegments: result.removedSegments,
                removedSeconds: result.removedSeconds,
              });
            }
            response.data = result.content;
          }
          return onSuccess(response, stats, context, null);
        };
      }
      load(context, config, callbacks);
    };
  }
}
