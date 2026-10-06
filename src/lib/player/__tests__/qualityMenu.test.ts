/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  currentQualityLabel,
  formatBitrate,
  hasMultipleLevels,
  levelLabel,
  qualityOptions,
} from '../qualityMenu';

describe('formatBitrate', () => {
  it('按量级选择 Mbps / kbps', () => {
    expect(formatBitrate(2_500_000)).toBe('2.5 Mbps');
    expect(formatBitrate(480_000)).toBe('480 kbps');
  });

  it('缺失或为 0 时返回空串', () => {
    expect(formatBitrate(0)).toBe('');
    expect(formatBitrate(undefined)).toBe('');
  });
});

describe('levelLabel', () => {
  it('优先用分辨率命名', () => {
    expect(levelLabel({ height: 1080, bitrate: 5_000_000 }, 0)).toBe('1080P');
  });

  it('没有分辨率时退回码率', () => {
    expect(levelLabel({ bitrate: 1_200_000 }, 1)).toBe('1.2 Mbps');
  });

  it('两者都没有时用序号，避免空条目', () => {
    expect(levelLabel({}, 2)).toBe('线路 3');
    expect(levelLabel(undefined, 0)).toBe('线路 1');
  });
});

describe('qualityOptions', () => {
  const levels = [{ height: 1080 }, { height: 720 }, { height: 480 }];

  it('自适应时只有“自动”被选中', () => {
    const options = qualityOptions({
      levels,
      autoLevelEnabled: true,
      currentLevel: 1,
    });

    expect(options.map((item) => item.label)).toEqual([
      '自动',
      '1080P',
      '720P',
      '480P',
    ]);
    expect(options.filter((item) => item.selected)).toEqual([
      { value: -1, label: '自动', selected: true },
    ]);
  });

  it('手动锁定档位时选中对应分辨率', () => {
    const selected = qualityOptions({
      levels,
      autoLevelEnabled: false,
      currentLevel: 2,
    }).find((item) => item.selected);

    expect(selected?.label).toBe('480P');
  });

  it('标记多档位，供菜单决定是否出现', () => {
    expect(hasMultipleLevels({ levels })).toBe(true);
    expect(hasMultipleLevels({ levels: [{ height: 720 }] })).toBe(false);
    expect(hasMultipleLevels(undefined)).toBe(false);
  });

  it('选中项缺失时也能给出当前清晰度', () => {
    expect(
      currentQualityLabel({ levels, autoLevelEnabled: false, currentLevel: 1 })
    ).toBe('720P');
    expect(currentQualityLabel({ levels, currentLevel: -1 })).toBe('自动');
  });
});
