/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import Hls from 'hls.js';

import { AdFilteringHlsLoader } from './m3u8AdFilter';

export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** 设置面板里去广告条目的 name，用于命中统计回写 */
export const AD_FILTER_SETTING_NAME = '去广告';

/** 去广告条目的提示文案：开启后显示实际剔除的分片数 */
export function adFilterTooltip(
  enabled: boolean,
  stats?: { segments: number; seconds: number }
): string {
  if (!enabled) return '已关闭';
  if (stats && stats.segments > 0) {
    return `已剔除 ${stats.segments} 段 · 约 ${stats.seconds} 秒`;
  }
  return '已开启';
}

// 源失效时的最大自我恢复次数，超过后交给上层提示/换源
const MAX_HLS_RECOVER_ATTEMPTS = 3;

const LOADING_ICON =
  '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgdmlld0JveD0iMCAwIDUwIDUwIj48cGF0aCBkPSJNMjUuMjUxIDYuNDYxYy0xMC4zMTggMC0xOC42ODMgOC4zNjUtMTguNjgzIDE4LjY4M2g0LjA2OGMwLTguMDcgNi41NDUtMTQuNjE1IDE0LjYxNS0xNC42MTVWNi40NjF6IiBmaWxsPSIjMDA5Njg4Ij48YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPSJ0cmFuc2Zvcm0iIGF0dHJpYnV0ZVR5cGU9IlhNTCIgZHVyPSIxcyIgZnJvbT0iMCAyNSAyNSIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiIHRvPSIzNjAgMjUgMjUiIHR5cGU9InJvdGF0ZSIvPjwvcGF0aD48L3N2Zz4=">';

const NEXT_EPISODE_ICON =
  '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg></i>';

/**
 * 保证视频元素带有当前地址，并开启远程播放（AirPlay / Cast）。
 */
export function ensureVideoSource(
  video: HTMLVideoElement | null,
  url: string
): void {
  if (!video || !url) return;

  const sources = Array.from(video.getElementsByTagName('source'));
  const existed = sources.some((source) => source.src === url);
  if (!existed) {
    sources.forEach((source) => source.remove());
    const sourceEl = document.createElement('source');
    sourceEl.src = url;
    video.appendChild(sourceEl);
  }

  video.disableRemotePlayback = false;
  if (video.hasAttribute('disableRemotePlayback')) {
    video.removeAttribute('disableRemotePlayback');
  }
}

interface AttachHlsOptions {
  blockAdEnabled: boolean;
  /** 无法继续恢复（网络/媒体错误重试耗尽）时回调 */
  onUnrecoverable: (data: any) => void;
}

/**
 * 用 hls.js 接管 m3u8 播放，并在致命错误时有限次自愈。
 */
export function attachHlsSource(
  video: HTMLVideoElement,
  url: string,
  { blockAdEnabled, onUnrecoverable }: AttachHlsOptions
): void {
  if (!Hls) {
    console.error('HLS.js 未加载');
    onUnrecoverable({ details: 'hlsUnavailable' });
    return;
  }

  if (!Hls.isSupported()) {
    // Safari / iOS 可以直接播 m3u8，不必强求 MSE
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      ensureVideoSource(video, url);
      video.src = url;
      video.play?.().catch(() => undefined);
      return;
    }
    onUnrecoverable({ details: 'hlsUnsupported' });
    return;
  }

  if (video.hls) {
    video.hls.destroy();
  }

  const hls = new Hls({
    debug: false, // 关闭日志
    enableWorker: true, // WebWorker 解码，降低主线程压力
    lowLatencyMode: true, // 开启低延迟 LL-HLS

    /* 缓冲/内存相关 */
    maxBufferLength: 30, // 前向缓冲最大 30s，过大容易导致高延迟
    backBufferLength: 30, // 仅保留 30s 已播放内容，避免内存占用
    maxBufferSize: 60 * 1000 * 1000, // 约 60MB，超出后触发清理

    /* 自定义loader */
    loader: blockAdEnabled ? AdFilteringHlsLoader : Hls.DefaultConfig.loader,
  });

  hls.loadSource(url);
  hls.attachMedia(video);
  video.hls = hls;

  ensureVideoSource(video, url);

  let recoverAttempts = 0;

  hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
    if (!data.fatal) return;

    console.error('HLS 致命错误:', data.details, data.type);

    const recoverable =
      data.type === Hls.ErrorTypes.NETWORK_ERROR ||
      data.type === Hls.ErrorTypes.MEDIA_ERROR;

    if (!recoverable || recoverAttempts >= MAX_HLS_RECOVER_ATTEMPTS) {
      hls.destroy();
      onUnrecoverable(data);
      return;
    }

    recoverAttempts += 1;
    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      hls.startLoad();
    } else {
      hls.recoverMediaError();
    }
  });
}

/** 把 hls.js 的致命错误细节翻译成用户看得懂的原因 */
export function describeHlsError(data: any): string {
  const detail = String(data?.details || '');

  if (detail.includes('hlsUnsupported') || detail.includes('hlsUnavailable')) {
    return '当前浏览器不支持该播放方式';
  }
  if (
    detail.includes('manifestLoadError') ||
    detail.includes('levelLoadError')
  ) {
    return '源地址无法访问，可能已失效';
  }
  if (detail.includes('ParseError')) return '播放列表无法解析';
  if (detail.includes('fragLoadError')) return '视频分片加载失败，网络不稳定';
  if (detail.includes('MediaError')) return '视频解码失败，格式不受支持';
  return '播放中断';
}

interface BuildArtPlayerOptionsParams {
  container: HTMLElement;
  url: string;
  poster: string;
  blockAdEnabled: boolean;
  volume: number;
  settings: any[];
  onNextEpisode: () => void;
  onHlsUnrecoverable: (data: any) => void;
}

/**
 * Artplayer 初始化配置。播放器行为相关的回调由调用方注入，
 * 页面只负责状态与事件绑定。
 */
export function buildArtPlayerOptions({
  container,
  url,
  poster,
  blockAdEnabled,
  volume,
  settings,
  onNextEpisode,
  onHlsUnrecoverable,
}: BuildArtPlayerOptionsParams): any {
  return {
    container,
    url,
    poster,
    volume,
    isLive: false,
    muted: false,
    autoplay: true,
    pip: true,
    autoSize: false,
    autoMini: false,
    screenshot: false,
    setting: true,
    loop: false,
    flip: false,
    playbackRate: true,
    aspectRatio: false,
    fullscreen: true,
    fullscreenWeb: true,
    subtitleOffset: false,
    miniProgressBar: false,
    mutex: true,
    playsInline: true,
    autoPlayback: false,
    airplay: true,
    theme: '#22c55e',
    lang: 'zh-cn',
    hotkey: false,
    fastForward: true,
    autoOrientation: true,
    lock: true,
    moreVideoAttr: {
      crossOrigin: 'anonymous',
    },
    customType: {
      m3u8: function (video: HTMLVideoElement, src: string) {
        attachHlsSource(video, src, {
          blockAdEnabled,
          onUnrecoverable: onHlsUnrecoverable,
        });
      },
    },
    icons: { loading: LOADING_ICON },
    settings,
    controls: [
      {
        position: 'left',
        index: 13,
        html: NEXT_EPISODE_ICON,
        tooltip: '播放下一集',
        click: function () {
          onNextEpisode();
        },
      },
    ],
  };
}
