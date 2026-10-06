/* eslint-disable @typescript-eslint/no-explicit-any */

import { TextDecoder, TextEncoder } from 'util';

import {
  detectSubtitleEncoding,
  isSubtitleFile,
  subtitleTypeFor,
} from '../subtitleLoader';

// jsdom 不提供 TextDecoder / TextEncoder，浏览器里是自带的
beforeAll(() => {
  const globals = globalThis as any;
  if (typeof globals.TextDecoder === 'undefined') {
    globals.TextDecoder = TextDecoder;
  }
  if (typeof globals.TextEncoder === 'undefined') {
    globals.TextEncoder = TextEncoder;
  }
});

describe('subtitleTypeFor', () => {
  it('识别支持的三种字幕', () => {
    expect(subtitleTypeFor('ch.srt')).toBe('srt');
    expect(subtitleTypeFor('zh.VTT')).toBe('vtt');
    expect(subtitleTypeFor('subs.ass')).toBe('ass');
  });

  it('其他扩展名一律不支持', () => {
    expect(subtitleTypeFor('movie.mp4')).toBeNull();
    expect(subtitleTypeFor('no_extension')).toBeNull();
    expect(isSubtitleFile('README.md')).toBe(false);
  });
});

describe('detectSubtitleEncoding', () => {
  it('合法的 UTF-8 保持 utf-8', () => {
    const buffer = new TextEncoder().encode('第一行 中文').buffer;
    expect(detectSubtitleEncoding(buffer)).toBe('utf-8');
  });

  it('GBK 字节流（非法 UTF-8）判定为 gbk', () => {
    // “中文” 的 GBK 编码
    const buffer = Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]).buffer;
    expect(detectSubtitleEncoding(buffer)).toBe('gbk');
  });
});
