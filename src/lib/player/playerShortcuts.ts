/* eslint-disable @typescript-eslint/no-explicit-any */

/** 快捷键说明，与 useKeyboardShortcuts 里的绑定保持一致 */
export interface ShortcutRow {
  keys: string;
  label: string;
}

export const KEYBOARD_SHORTCUTS: ShortcutRow[] = [
  { keys: '← / →', label: '快退 / 快进 10 秒' },
  { keys: '↑ / ↓', label: '音量增减' },
  { keys: '空格', label: '播放 / 暂停' },
  { keys: 'M', label: '静音' },
  { keys: 'F', label: '全屏' },
  { keys: 'Alt + ← / →', label: '上一集 / 下一集' },
  { keys: '?', label: '显示或收起本列表' },
];

export const MOUSE_SHORTCUTS: ShortcutRow[] = [
  { keys: '画面左半按住上下拖', label: '亮度' },
  { keys: '画面右半按住上下拖', label: '音量' },
  { keys: '按住不动 0.4 秒', label: '2 倍速，松开恢复' },
  { keys: '双击画面', label: '全屏' },
];
