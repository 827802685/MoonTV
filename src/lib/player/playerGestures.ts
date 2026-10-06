/* eslint-disable @typescript-eslint/no-explicit-any */

// Artplayer 自带的 gesture/fastForward 只作用于触摸端，
// 这里补上鼠标端的音量/亮度拖动、双击全屏与长按倍速。

import { getPlayerOsd } from './playerOsd';

const DRAG_THRESHOLD = 6;
const LONG_PRESS_MS = 400;
export const BOOST_RATE = 2;
const BRIGHTNESS_MIN = 0.3;
const BRIGHTNESS_MAX = 1.3;
// 拖动和长按结束后浏览器仍会补一个 click，会误触暂停；这个窗口内的一律吞掉
const CLICK_SUPPRESS_MS = 300;

// 进度条、设置面板等控件上的操作交还给 Artplayer，不识别为手势
const CONTROL_SELECTOR =
  '.art-bottom,.art-settings,.art-contextmenus,.art-popup';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function readBrightness(video: HTMLVideoElement): number {
  const matched = /brightness\(\s*([\d.]+)\s*\)/.exec(video.style.filter || '');
  return matched ? parseFloat(matched[1]) : 1;
}

/**
 * 给播放器画面区域绑定鼠标手势，返回解绑函数。
 */
export function attachMouseGestures(player: any): () => void {
  const surface: HTMLElement | undefined = player?.template?.player;
  const video: HTMLVideoElement | undefined = player?.video;
  if (!surface || !video) return () => undefined;

  const osd = getPlayerOsd(player);

  let dragState: 'none' | 'pending' | 'volume' | 'brightness' = 'none';
  let startX = 0;
  let startY = 0;
  let startVolume = 0;
  let startBrightness = 1;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let boosting = false;
  let rateBeforeBoost = 1;
  let suppressClickUntil = 0;

  const cancelLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const stopBoost = () => {
    if (!boosting) return;
    boosting = false;
    player.playbackRate = rateBeforeBoost;
    osd.hide();
  };

  const onClickCapture = (event: MouseEvent) => {
    if (Date.now() >= suppressClickUntil) return;
    suppressClickUntil = 0;
    // 捕获阶段拦在 window 上，Artplayer 的 click 处理收不到这次点击
    event.stopPropagation();
    event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest?.(CONTROL_SELECTOR)) return;

    dragState = 'pending';
    startX = event.clientX;
    startY = event.clientY;
    startVolume = player.volume ?? 0.7;
    startBrightness = readBrightness(video);

    longPressTimer = setTimeout(() => {
      if (dragState !== 'pending') return;
      dragState = 'none';
      boosting = true;
      rateBeforeBoost = player.playbackRate || 1;
      player.playbackRate = BOOST_RATE;
      osd.show(`${BOOST_RATE} 倍速播放中`);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (dragState === 'none') return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (dragState === 'pending') {
      if (Math.abs(dy) < DRAG_THRESHOLD && Math.abs(dx) < DRAG_THRESHOLD)
        return;
      cancelLongPress();
      if (Math.abs(dx) > Math.abs(dy)) {
        // 横向拖动交给进度条与 Artplayer 自己的快进，不抢
        dragState = 'none';
        return;
      }
      const rect = surface.getBoundingClientRect();
      dragState =
        event.clientX - rect.left < rect.width / 2 ? 'brightness' : 'volume';
    }

    // 向上拖为增大，约 120px 对应满量程
    const ratio = clamp(-dy / 120, -1, 1);

    if (dragState === 'volume') {
      player.volume = Math.round(clamp(startVolume + ratio, 0, 1) * 100) / 100;
      osd.show(
        player.volume === 0
          ? '已静音'
          : `音量 ${Math.round(player.volume * 100)}`
      );
      return;
    }

    const brightness = clamp(
      startBrightness + ratio * 0.6,
      BRIGHTNESS_MIN,
      BRIGHTNESS_MAX
    );
    video.style.filter = `brightness(${brightness.toFixed(2)})`;
    osd.show(
      `亮度 ${Math.round(brightness * 100)}`,
      (brightness - BRIGHTNESS_MIN) / (BRIGHTNESS_MAX - BRIGHTNESS_MIN)
    );
  };

  const endGesture = () => {
    cancelLongPress();
    const wasDrag = dragState === 'volume' || dragState === 'brightness';
    // 普通单击要留给 Artplayer 的暂停/播放
    if (wasDrag || boosting) {
      suppressClickUntil = Date.now() + CLICK_SUPPRESS_MS;
    }
    stopBoost();
    dragState = 'none';
  };

  const onDoubleClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest?.(CONTROL_SELECTOR)) return;
    player.fullscreen = !player.fullscreen;
  };

  surface.addEventListener('pointerdown', onPointerDown);
  surface.addEventListener('pointermove', onPointerMove);
  surface.addEventListener('dblclick', onDoubleClick);
  // 指针可能移出画面才松开，结束判断挂在 window 上
  window.addEventListener('pointerup', endGesture);
  window.addEventListener('pointercancel', endGesture);
  window.addEventListener('click', onClickCapture, true);

  return () => {
    cancelLongPress();
    stopBoost();
    surface.removeEventListener('pointerdown', onPointerDown);
    surface.removeEventListener('pointermove', onPointerMove);
    surface.removeEventListener('dblclick', onDoubleClick);
    window.removeEventListener('pointerup', endGesture);
    window.removeEventListener('pointercancel', endGesture);
    window.removeEventListener('click', onClickCapture, true);
    osd.hide();
  };
}
