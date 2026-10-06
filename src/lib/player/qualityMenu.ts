/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

import Hls from 'hls.js';

/** 设置面板里清晰度条目的 name */
export const QUALITY_SETTING_NAME = '清晰度';

export interface HlsLevelLike {
  height?: number;
  width?: number;
  bitrate?: number;
  name?: string;
}

export interface HlsLike {
  levels: HlsLevelLike[];
  autoLevelEnabled?: boolean;
  currentLevel?: number;
}

export interface QualityOption {
  /** hls.js 的 currentLevel，-1 表示自适应 */
  value: number;
  label: string;
  selected: boolean;
}

/** 只有一档清晰度时菜单没有意义 */
export function hasMultipleLevels(hls: unknown): hls is HlsLike {
  const levels = (hls as HlsLike | undefined)?.levels;
  return Array.isArray(levels) && levels.length > 1;
}

export function formatBitrate(bitrate?: number): string {
  if (!bitrate || bitrate <= 0) return '';
  if (bitrate >= 1_000_000) return `${(bitrate / 1_000_000).toFixed(1)} Mbps`;
  return `${Math.round(bitrate / 1000)} kbps`;
}

/** 优先用分辨率命名，拿不到就退回码率，再不行用序号 */
export function levelLabel(
  level: HlsLevelLike | undefined,
  index: number
): string {
  if (!level) return `线路 ${index + 1}`;
  if (level.height) return `${level.height}P`;
  const bitrate = formatBitrate(level.bitrate);
  return bitrate || `线路 ${index + 1}`;
}

export function qualityOptions(hls: HlsLike): QualityOption[] {
  const auto = !!hls.autoLevelEnabled;
  const current = hls.currentLevel ?? -1;

  return [
    { value: -1, label: '自动', selected: auto },
    ...(hls.levels || []).map((level, index) => ({
      value: index,
      label: levelLabel(level, index),
      selected: !auto && current === index,
    })),
  ];
}

export function currentQualityLabel(hls: HlsLike): string {
  const selected = qualityOptions(hls).find((item) => item.selected);
  if (selected) return selected.label;
  const current = hls.currentLevel ?? -1;
  return current < 0 ? '自动' : levelLabel(hls.levels?.[current], current);
}

/**
 * 重建清晰度条目。levels 变化（首次解析、码率列表更新）时调用。
 */
export function syncQualityMenu(player: any): void {
  const hls: HlsLike | undefined = player?.video?.hls;
  if (!hasMultipleLevels(hls)) {
    if (player?.setting?.find?.(QUALITY_SETTING_NAME)) {
      player.setting.remove(QUALITY_SETTING_NAME);
    }
    return;
  }

  player.setting.remove(QUALITY_SETTING_NAME);
  player.setting.add({
    name: QUALITY_SETTING_NAME,
    html: QUALITY_SETTING_NAME,
    tooltip: currentQualityLabel(hls),
    selector: qualityOptions(hls).map((option) => ({
      name: String(option.value),
      html: option.label,
      active: option.selected,
    })),
    onSelect(item: any) {
      const value = Number(item?.name);
      if (!Number.isFinite(value)) return currentQualityLabel(hls);

      try {
        (player.video.hls as any).currentLevel = value;
      } catch (err) {
        console.warn('切换清晰度失败:', err);
      }
      return value < 0 ? '自动' : levelLabel(hls.levels?.[value], value);
    },
  });
}

const bound = new WeakSet<object>();

/**
 * 监听 hls.js 的码率事件，保持设置面板与真实清晰度一致。
 * 以 hls 实例为键：原地换源会换掉实例，需要重新绑定。
 */
export function bindQualityMenu(player: any): void {
  const hls: any = player?.video?.hls;
  if (!player || !hls || typeof hls.on !== 'function' || !Hls?.Events) return;
  if (bound.has(hls)) return;

  bound.add(hls);

  const events = Hls.Events;
  const onLevelsChanged = () => syncQualityMenu(player);
  const onLevelSwitched = (_event: any, data: any) => {
    if (!player?.setting) return;
    const index = Number(data?.level);
    player.setting.update({
      name: QUALITY_SETTING_NAME,
      tooltip:
        index < 0 || (hls.autoLevelEnabled && index === hls.currentLevel)
          ? '自动'
          : levelLabel(hls.levels?.[index], index),
    });
  };

  syncQualityMenu(player);
  hls.on(events.MANIFEST_PARSED, onLevelsChanged);
  hls.on(events.LEVELS_UPDATED, onLevelsChanged);
  hls.on(events.LEVEL_SWITCHED, onLevelSwitched);
}
