/* eslint-disable @typescript-eslint/no-explicit-any, no-console, react-hooks/exhaustive-deps */

import { useEffect, useRef } from 'react';

import { getPlayerOsd } from './playerOsd';

interface UseKeyboardShortcutsOptions {
  artPlayerRef: React.MutableRefObject<any>;
  goPreviousEpisode: () => void;
  goNextEpisode: () => void;
  canGoPreviousEpisode: () => boolean;
  canGoNextEpisode: () => boolean;
  /** ？键：显示/收起快捷键列表 */
  toggleShortcutHelp: () => void;
}

const SEEK_SECONDS = 10;
const VOLUME_STEP = 0.1;

/**
 * 全局播放快捷键：方向键快进快退与音量、空格播放暂停、M 静音、F 全屏、Alt+方向键切集。
 * 只在播放器存在且焦点不在输入框时生效。
 */
export function useKeyboardShortcuts({
  artPlayerRef,
  goPreviousEpisode,
  goNextEpisode,
  canGoPreviousEpisode,
  canGoNextEpisode,
  toggleShortcutHelp,
}: UseKeyboardShortcutsOptions) {
  const handlersRef = useRef({
    goPreviousEpisode,
    goNextEpisode,
    canGoPreviousEpisode,
    canGoNextEpisode,
    toggleShortcutHelp,
  });
  handlersRef.current = {
    goPreviousEpisode,
    goNextEpisode,
    canGoPreviousEpisode,
    canGoNextEpisode,
    toggleShortcutHelp,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }

      const player = artPlayerRef.current;
      const prevent = () => event.preventDefault();
      const { key, altKey } = event;

      if (key === '?' || key === '/') {
        handlersRef.current.toggleShortcutHelp();
        prevent();
        return;
      }

      if (altKey) {
        if (key === 'ArrowLeft' && handlersRef.current.canGoPreviousEpisode()) {
          handlersRef.current.goPreviousEpisode();
          prevent();
        } else if (
          key === 'ArrowRight' &&
          handlersRef.current.canGoNextEpisode()
        ) {
          handlersRef.current.goNextEpisode();
          prevent();
        }
        return;
      }

      if (!player) return;

      const osd = getPlayerOsd(player);
      const progressRatio = player.duration
        ? player.currentTime / player.duration
        : 0;

      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const forward = key === 'ArrowRight';
        if (forward && player.currentTime >= player.duration - SEEK_SECONDS) {
          return;
        }
        if (!forward && player.currentTime < SEEK_SECONDS) return;

        player.currentTime += forward ? SEEK_SECONDS : -SEEK_SECONDS;
        osd.show(
          `${forward ? '快进' : '快退'} ${SEEK_SECONDS} 秒`,
          progressRatio
        );
        prevent();
        return;
      }

      if (key === 'ArrowUp' || key === 'ArrowDown') {
        const up = key === 'ArrowUp';
        const next =
          Math.round((player.volume + (up ? 1 : -1) * VOLUME_STEP) * 10) / 10;
        if (next < 0 || next > 1) return;

        player.volume = next;
        osd.show(`音量 ${Math.round(next * 100)}`, next);
        prevent();
        return;
      }

      if (key === ' ') {
        player.toggle();
        prevent();
        return;
      }

      if (key === 'm' || key === 'M') {
        player.mute = !player.mute;
        osd.show(
          player.mute ? '已静音' : `音量 ${Math.round(player.volume * 100)}`
        );
        prevent();
        return;
      }

      if (key === 'f' || key === 'F') {
        player.fullscreen = !player.fullscreen;
        prevent();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
}
