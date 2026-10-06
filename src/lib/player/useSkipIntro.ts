/* eslint-disable @typescript-eslint/no-explicit-any, no-console, react-hooks/exhaustive-deps */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  deleteSkipConfig,
  getSkipConfig,
  saveSkipConfig,
} from '@/lib/db.client';

import { formatTime } from './formatTime';

export interface SkipConfig {
  enable: boolean;
  intro_time: number;
  outro_time: number;
}

export const EMPTY_SKIP_CONFIG: SkipConfig = {
  enable: false,
  intro_time: 0,
  outro_time: 0,
};

// 跳过检查的限频，避免每个 timeupdate 都读写进度
const SKIP_CHECK_INTERVAL_MS = 1500;

interface UseSkipIntroOptions {
  /** 当前播放源与 ID 的 ref，换源后写入的仍是最新值 */
  sourceRef: React.MutableRefObject<string>;
  idRef: React.MutableRefObject<string>;
  artPlayerRef: React.MutableRefObject<any>;
  hasNextEpisode: () => boolean;
  playNextEpisode: () => void;
}

/**
 * 跳过片头片尾：配置读写、播放器面板项、播放中的自动跳过。
 */
export function useSkipIntro({
  sourceRef,
  idRef,
  artPlayerRef,
  hasNextEpisode,
  playNextEpisode,
}: UseSkipIntroOptions) {
  const [skipConfig, setSkipConfig] = useState<SkipConfig>(EMPTY_SKIP_CONFIG);
  const skipConfigRef = useRef(skipConfig);
  const lastCheckRef = useRef(0);

  useEffect(() => {
    skipConfigRef.current = skipConfig;
  }, [skipConfig]);

  // 初次挂载时读取该影片已保存的片头片尾配置
  useEffect(() => {
    const source = sourceRef.current;
    const id = idRef.current;
    if (!source || !id) return;

    (async () => {
      try {
        const config = await getSkipConfig(source, id);
        if (config) setSkipConfig(config);
      } catch (err) {
        console.error('读取跳过片头片尾配置失败:', err);
      }
    })();
  }, []);

  const handleChange = useCallback(async (newConfig: SkipConfig) => {
    const source = sourceRef.current;
    const id = idRef.current;
    if (!source || !id) return;

    try {
      skipConfigRef.current = newConfig;
      setSkipConfig(newConfig);

      if (!newConfig.enable && !newConfig.intro_time && !newConfig.outro_time) {
        await deleteSkipConfig(source, id);
      } else {
        await saveSkipConfig(source, id, newConfig);
      }

      // 同步面板上的开关状态与片头片尾时间显示
      buildSettings(newConfig).forEach((item) => {
        artPlayerRef.current?.setting?.update(item);
      });
    } catch (err) {
      console.error('保存跳过片头片尾配置失败:', err);
    }
  }, []);

  const clearConfig = useCallback(() => {
    return handleChange({ ...EMPTY_SKIP_CONFIG });
  }, [handleChange]);

  /**
   * 播放器设置面板里的三项：开关、设置片头、设置片尾。
   * 创建播放器与配置变化后刷新时共用。
   */
  function buildSettings(cfg: SkipConfig = skipConfigRef.current): any[] {
    return [
      {
        name: '跳过片头片尾',
        html: '跳过片头片尾',
        switch: cfg.enable,
        onSwitch: function (item: any) {
          handleChange({
            ...skipConfigRef.current,
            enable: !item.switch,
          });
          return !item.switch;
        },
      },
      {
        name: '设置片头',
        html: '设置片头',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="12" r="2" fill="#ffffff"/><path d="M9 12L17 12" stroke="#ffffff" stroke-width="2"/><path d="M17 6L17 18" stroke="#ffffff" stroke-width="2"/></svg>',
        tooltip:
          cfg.intro_time === 0
            ? '设置片头时间'
            : `${formatTime(cfg.intro_time)}`,
        onClick: function () {
          const currentTime = artPlayerRef.current?.currentTime || 0;
          if (currentTime <= 0) return;
          handleChange({
            ...skipConfigRef.current,
            intro_time: currentTime,
          });
          return `${formatTime(currentTime)}`;
        },
      },
      {
        name: '设置片尾',
        html: '设置片尾',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7 6L7 18" stroke="#ffffff" stroke-width="2"/><path d="M7 12L15 12" stroke="#ffffff" stroke-width="2"/><circle cx="19" cy="12" r="2" fill="#ffffff"/></svg>',
        tooltip:
          cfg.outro_time >= 0
            ? '设置片尾时间'
            : `-${formatTime(-cfg.outro_time)}`,
        onClick: function () {
          const outroTime =
            -(
              artPlayerRef.current?.duration - artPlayerRef.current?.currentTime
            ) || 0;
          if (outroTime >= 0) return;
          handleChange({
            ...skipConfigRef.current,
            outro_time: outroTime,
          });
          return `-${formatTime(-outroTime)}`;
        },
      },
    ];
  }

  /**
   * 在 video:timeupdate 中调用，命中片头/片尾区间时自动跳转。
   */
  const handleTimeUpdate = useCallback(
    (player: any, currentTime: number, duration: number) => {
      const cfg = skipConfigRef.current;
      if (!cfg.enable) return;

      const now = Date.now();
      if (now - lastCheckRef.current < SKIP_CHECK_INTERVAL_MS) return;
      lastCheckRef.current = now;

      if (cfg.intro_time > 0 && currentTime < cfg.intro_time) {
        player.currentTime = cfg.intro_time;
        player.notice.show = `已跳过片头 (${formatTime(cfg.intro_time)})`;
      }

      if (cfg.outro_time < 0 && duration > 0) {
        const outroStart = duration + cfg.outro_time;
        if (currentTime > outroStart) {
          if (hasNextEpisode()) {
            playNextEpisode();
          } else {
            player.pause();
          }
          player.notice.show = `已跳过片尾 (${formatTime(-cfg.outro_time)})`;
        }
      }
    },
    [hasNextEpisode, playNextEpisode]
  );

  return {
    skipConfig,
    skipConfigRef,
    buildSkipSettings: buildSettings,
    handleSkipConfigChange: handleChange,
    clearSkipConfig: clearConfig,
    onTimeUpdate: handleTimeUpdate,
  };
}
