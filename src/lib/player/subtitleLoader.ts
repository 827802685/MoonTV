/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

// 第三方片源基本不带字幕，这里支持用户自己载入本地字幕文件（选择或拖拽）。

import { getPlayerOsd } from './playerOsd';

type SubtitleType = 'vtt' | 'srt' | 'ass';

export const LOAD_SUBTITLE_SETTING_NAME = '载入字幕';
export const CLEAR_SUBTITLE_SETTING_NAME = '关闭字幕';

const ACCEPT: Record<string, SubtitleType> = {
  srt: 'srt',
  vtt: 'vtt',
  ass: 'ass',
};

export const SUBTITLE_ACCEPT = Object.keys(ACCEPT)
  .map((ext) => `.${ext}`)
  .join(',');

function extensionOf(fileName: string): string {
  const matched = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return matched ? matched[1].toLowerCase() : '';
}

export function subtitleTypeFor(fileName: string): SubtitleType | null {
  return ACCEPT[extensionOf(fileName)] ?? null;
}

export function isSubtitleFile(fileName: string): boolean {
  return subtitleTypeFor(fileName) !== null;
}

/**
 * 国内字幕常见 GBK 编码，按字节判断一次，避免载入后满屏乱码。
 */
export function detectSubtitleEncoding(buffer: ArrayBuffer): string {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return 'utf-8';
  } catch {
    try {
      new TextDecoder('gbk').decode(buffer);
      return 'gbk';
    } catch {
      return 'utf-8';
    }
  }
}

const objectUrls = new WeakMap<object, string>();

function rememberObjectUrl(player: any, url: string): void {
  const previous = objectUrls.get(player);
  if (previous) URL.revokeObjectURL(previous);
  objectUrls.set(player, url);
}

/** 载入字幕文件，返回字幕名（作为面板提示） */
export async function applySubtitleFile(
  player: any,
  file: File
): Promise<string> {
  const type = subtitleTypeFor(file.name);
  if (!type) throw new Error('不支持的字幕格式');

  const buffer = await file.arrayBuffer();
  const encoding = detectSubtitleEncoding(buffer);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'text/plain' }));

  rememberObjectUrl(player, url);
  player.subtitle = { url, type, name: file.name, encoding };

  return file.name;
}

export function clearSubtitle(player: any): void {
  if (!player) return;

  player.subtitle = false;
  const previous = objectUrls.get(player);
  if (previous) {
    URL.revokeObjectURL(previous);
    objectUrls.delete(player);
  }
}

/** 弹出文件选择框，取消时返回 null */
export function pickSubtitleFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = SUBTITLE_ACCEPT;
    input.style.display = 'none';

    const finish = (file: File | null) => {
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));

    document.body.appendChild(input);
    input.click();
  });
}

function shortenLabel(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name;
}

export function updateSettingTooltip(
  player: any,
  name: string,
  tooltip: string
) {
  player?.setting?.update?.({ name, tooltip });
}

/** 设置面板里的字幕相关条目 */
export function buildSubtitleSettings(getPlayer: () => any): any[] {
  return [
    {
      name: LOAD_SUBTITLE_SETTING_NAME,
      html: LOAD_SUBTITLE_SETTING_NAME,
      tooltip: SUBTITLE_ACCEPT,
      onClick: async function () {
        const player = getPlayer();
        const file = await pickSubtitleFile();
        if (!player || !file) {
          updateSettingTooltip(
            player,
            LOAD_SUBTITLE_SETTING_NAME,
            '未选择文件'
          );
          return;
        }

        try {
          const name = await applySubtitleFile(player, file);
          updateSettingTooltip(
            player,
            LOAD_SUBTITLE_SETTING_NAME,
            shortenLabel(name)
          );
          getPlayerOsd(player).show('字幕已载入');
        } catch (err) {
          console.warn('载入字幕失败:', err);
          updateSettingTooltip(player, LOAD_SUBTITLE_SETTING_NAME, '载入失败');
        }
      },
    },
    {
      name: CLEAR_SUBTITLE_SETTING_NAME,
      html: CLEAR_SUBTITLE_SETTING_NAME,
      tooltip: '关闭',
      onClick: function () {
        clearSubtitle(getPlayer());
        return '已关闭';
      },
    },
  ];
}

/**
 * 支持把字幕文件直接拖到画面上，返回解绑函数。
 */
export function attachSubtitleDrop(player: any): () => void {
  const surface: HTMLElement | undefined = player?.template?.player;
  if (!surface) return () => undefined;

  const osd = getPlayerOsd(player);

  const hasFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types || []).includes('Files');

  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer && (event.dataTransfer.dropEffect = 'copy');
  };

  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();

    const file = event.dataTransfer?.files?.[0];
    if (!file || !isSubtitleFile(file.name)) {
      osd.show('仅支持 srt / vtt / ass 字幕');
      return;
    }

    void applySubtitleFile(player, file)
      .then((name) => osd.show(`字幕已载入：${shortenLabel(name)}`))
      .catch(() => osd.show('字幕载入失败'));
  };

  surface.addEventListener('dragover', onDragOver);
  surface.addEventListener('drop', onDrop);

  return () => {
    surface.removeEventListener('dragover', onDragOver);
    surface.removeEventListener('drop', onDrop);
  };
}
