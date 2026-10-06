/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import { filterAds } from '../m3u8AdFilter';

function playlist(body: string): string {
  return `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:120\n${body}#EXT-X-ENDLIST\n`;
}

function segments(prefix: string, count: number, seconds: number): string {
  return Array.from(
    { length: count },
    (_, i) => `#EXTINF:${seconds},\n${prefix}-${i}.ts`
  )
    .join('\n')
    .concat('\n');
}

/** 常见的采集源列表：三段正片中间夹一段广告 */
function withAdBlock(adLines: string): string {
  return playlist(
    [
      segments('main', 30, 60),
      '#EXT-X-DISCONTINUITY\n',
      adLines,
      '#EXT-X-DISCONTINUITY\n',
      segments('tail', 30, 60),
    ].join('\n')
  );
}

describe('filterAds：显式广告标记', () => {
  it('按 CUE-OUT / CUE-IN 剔除整段广告', () => {
    const ad = [
      '#EXT-X-CUE-OUT:30',
      '#EXTINF:15,',
      'ad-0.ts',
      '#EXTINF:15,',
      'ad-1.ts',
      '#EXT-X-CUE-IN',
    ].join('\n');
    const source = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:20',
      '#EXTINF:10,',
      'main-0.ts',
      '#EXTINF:10,',
      'main-1.ts',
      ad,
      '#EXTINF:10,',
      'main-2.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const result = filterAds(source);

    expect(result.removedSegments).toBe(2);
    expect(result.removedSeconds).toBe(30);
    expect(result.content).not.toContain('ad-0.ts');
    expect(result.content).not.toContain('ad-1.ts');
    expect(result.content).toContain('main-0.ts');
    expect(result.content).toContain('main-2.ts');
    // CUE-IN 之后回到正片，不该把正片也删掉
    expect(result.content).toContain('main-1.ts');
  });

  it('识别 SCTE-35 DATERANGE 标记', () => {
    const source = [
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:20',
      '#EXTINF:10,',
      'main-0.ts',
      '#EXT-X-DATERANGE:id=1,SCTE35-OUT=0xFC',
      '#EXTINF:20,',
      'ad-0.ts',
      '#EXT-X-DATERANGE:id=1,SCTE35-IN=0xFC',
      '#EXTINF:10,',
      'main-1.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const result = filterAds(source);

    expect(result.removedSegments).toBe(1);
    expect(result.content).not.toContain('ad-0.ts');
    expect(result.content).toContain('main-1.ts');
  });
});

describe('filterAds：按不连续块推断广告', () => {
  it('剔除明显短于正片的 discontinuity 块', () => {
    const result = filterAds(
      withAdBlock(
        ['#EXTINF:15,', 'ad-0.ts', '#EXTINF:15,', 'ad-1.ts'].join('\n')
      )
    );

    expect(result.removedSegments).toBe(2);
    expect(result.content).not.toContain('ad-0.ts');
    expect(result.content).not.toContain('#EXT-X-CUE-OUT');
    expect(result.content).toContain('main-0.ts');
    expect(result.content).toContain('tail-0.ts');
  });

  it('剔除开头的单分片贴片广告', () => {
    const source = playlist(
      [
        '#EXT-X-DISCONTINUITY\n',
        '#EXTINF:30,\npreroll.ts\n',
        '#EXT-X-DISCONTINUITY\n',
        segments('main', 30, 60),
      ].join('\n')
    );

    const result = filterAds(source);

    expect(result.content).not.toContain('preroll.ts');
    expect(result.content).toContain('main-0.ts');
  });

  it('保留没有广告的正常列表', () => {
    const source = playlist(segments('seg', 30, 60));
    const result = filterAds(source);

    expect(result.removedSegments).toBe(0);
    expect(result.content).toBe(source);
  });

  it('主内容太短时不做推断，避免误删', () => {
    const source = playlist(
      [
        segments('a', 3, 20),
        '#EXT-X-DISCONTINUITY\n',
        segments('b', 2, 20),
      ].join('\n')
    );
    const result = filterAds(source);

    expect(result.removedSegments).toBe(0);
    expect(result.content).toContain('b-0.ts');
  });

  it('正片被切成多个等长块时不误删', () => {
    const source = playlist(
      [
        segments('part1', 10, 60),
        '#EXT-X-DISCONTINUITY\n',
        segments('part2', 10, 60),
        '#EXT-X-DISCONTINUITY\n',
        segments('part3', 10, 60),
      ].join('\n')
    );
    const result = filterAds(source);

    expect(result.removedSegments).toBe(0);
    expect(result.content).toContain('part2-0.ts');
    expect(result.content).toContain('part3-0.ts');
  });

  it('拼接后的正片不再以断点开头，但保留内部断点', () => {
    // 贴片广告被删后，紧跟其后的正片首片不应再带 DISCONTINUITY
    const preroll = playlist(
      [
        '#EXT-X-DISCONTINUITY\n',
        '#EXTINF:30,\npreroll.ts\n',
        '#EXT-X-DISCONTINUITY\n',
        segments('main', 30, 60),
      ].join('\n')
    );
    expect(filterAds(preroll).content).not.toContain('#EXT-X-DISCONTINUITY');

    // 正片内部各块可能真的编码不连续，标记必须保留给 hls.js
    const middle = filterAds(
      withAdBlock(['#EXTINF:15,', 'ad-0.ts'].join('\n'))
    );
    expect((middle.content.match(/#EXT-X-DISCONTINUITY/g) || []).length).toBe(
      1
    );
  });

  it('不残留失效的 CUE-IN 标记', () => {
    const source = [
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:20',
      '#EXT-X-CUE-OUT:30',
      '#EXTINF:15,',
      'ad-0.ts',
      '#EXT-X-CUE-IN',
      '#EXTINF:10,',
      'main-0.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const result = filterAds(source);

    expect(result.removedSegments).toBe(1);
    expect(result.content).not.toContain('#EXT-X-CUE-IN');
    expect(result.content).toContain('main-0.ts');
  });

  it('识别写在首条 EXTINF 之前的贴片广告标记', () => {
    const source = [
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:20',
      '#EXT-X-KEY:METHOD=AES-128,URI="key"',
      '#EXT-X-CUE-OUT:30',
      '#EXTINF:15,',
      'preroll-0.ts',
      '#EXTINF:15,',
      'preroll-1.ts',
      '#EXT-X-CUE-IN',
      '#EXTINF:60,',
      'main-0.ts',
      '#EXTINF:60,',
      'main-1.ts',
      '#EXT-X-ENDLIST',
    ].join('\n');

    const result = filterAds(source);

    expect(result.removedSegments).toBe(2);
    expect(result.content).not.toContain('preroll-0.ts');
    // 列表级的 KEY 不能跟着广告一起被删掉
    expect(result.content).toContain('#EXT-X-KEY:METHOD=AES-128');
    expect(result.content).toContain('main-0.ts');
  });
});

describe('filterAds：安全性', () => {
  it('不会把整个列表清空', () => {
    const source = playlist(
      ['#EXT-X-DISCONTINUITY\n', '#EXTINF:10,\nonly.ts'].join('\n')
    );
    const result = filterAds(source);

    expect(result.content).toContain('only.ts');
    expect(result.removedSegments).toBe(0);
  });

  it('master playlist 原样返回', () => {
    const source = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720',
      '720p.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1920x1080',
      '1080p.m3u8',
    ].join('\n');

    const result = filterAds(source);

    expect(result.removedSegments).toBe(0);
    expect(result.content).toBe(source);
  });

  it('空内容直接返回', () => {
    expect(filterAds('').content).toBe('');
    expect(filterAds('').removedSegments).toBe(0);
  });

  it('非 m3u8 内容不处理', () => {
    const source = 'https://example.com/video.mp4';
    const result = filterAds(source);

    expect(result.content).toBe(source);
    expect(result.removedSegments).toBe(0);
  });

  it('剔除长广告后修正 TARGETDURATION', () => {
    const result = filterAds(
      withAdBlock(['#EXTINF:120,', 'long-ad.ts'].join('\n'))
    );

    expect(result.removedSegments).toBe(1);
    expect(result.removedSeconds).toBe(120);
    // 剩下的正片最长分片 60 秒，头部应被下修
    expect(result.content).toContain('#EXT-X-TARGETDURATION:60');
    expect(result.content).not.toContain('long-ad.ts');
  });

  it('保留 EXT-X-MAP 等头部标签', () => {
    const source = [
      '#EXTM3U',
      '#EXT-X-TARGETDURATION:120',
      '#EXT-X-MAP:URI="init.mp4"',
      segments('main', 30, 60).trim(),
      '#EXT-X-DISCONTINUITY',
      '#EXTINF:20,',
      'ad.mp4',
      '#EXT-X-DISCONTINUITY',
      segments('tail', 30, 60).trim(),
      '#EXT-X-ENDLIST',
    ].join('\n');

    const result = filterAds(source);

    expect(result.content).toContain('#EXT-X-MAP:URI="init.mp4"');
    expect(result.content).not.toContain('ad.mp4');
  });
});
