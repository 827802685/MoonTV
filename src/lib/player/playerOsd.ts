/* eslint-disable @typescript-eslint/no-explicit-any */

// 播放器内的居中提示（音量/亮度/倍速/快进），比 Artplayer 自带的角落 notice 醒目。

const OSD_HIDE_MS = 900;

const OSD_STYLE = `
.art-osd{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;
pointer-events:none;opacity:0;transition:opacity .15s;display:flex;flex-direction:column;
align-items:center;gap:6px;padding:10px 16px;border-radius:12px;background:rgba(0,0,0,.65);
font-size:14px;line-height:1;color:#fff}
.art-osd[data-visible="true"]{opacity:1}
.art-osd-bar{width:120px;height:4px;border-radius:2px;background:hsla(0,0%,100%,.25);overflow:hidden}
.art-osd-bar>i{display:block;height:100%;border-radius:2px;background:#22c55e;transition:width .05s}
`;

export interface OsdHandle {
  /** value 在 0~1 之间时显示进度条，省略则只显示文字 */
  show: (label: string, value?: number) => void;
  hide: () => void;
}

const noop: OsdHandle = { show: () => undefined, hide: () => undefined };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function createOsd(player: any): OsdHandle {
  const surface: HTMLElement | undefined = player?.template?.player;
  if (!surface) return noop;

  if (typeof document.getElementById('art-osd-style') === 'undefined') {
    const style = document.createElement('style');
    style.id = 'art-osd-style';
    style.textContent = OSD_STYLE;
    document.head.appendChild(style);
  }

  const root = document.createElement('div');
  root.className = 'art-osd';
  const text = document.createElement('span');
  const bar = document.createElement('div');
  bar.className = 'art-osd-bar';
  const fill = document.createElement('i');
  bar.appendChild(fill);
  root.appendChild(text);
  root.appendChild(bar);
  surface.appendChild(root);

  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    show(label: string, value?: number) {
      text.textContent = label;
      if (typeof value === 'number') {
        bar.style.display = '';
        fill.style.width = `${clamp01(value) * 100}%`;
      } else {
        bar.style.display = 'none';
      }
      root.dataset.visible = 'true';

      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        root.dataset.visible = 'false';
        hideTimer = null;
      }, OSD_HIDE_MS);
    },
    hide() {
      if (hideTimer) clearTimeout(hideTimer);
      root.dataset.visible = 'false';
    },
  };
}

/**
 * 取该播放器实例的 OSD，首次调用时创建。
 * 实例销毁后 DOM 一起消失，WeakMap 缓存也随之释放。
 */
const cache = new WeakMap<object, OsdHandle>();

export function getPlayerOsd(player: any): OsdHandle {
  if (!player || typeof player !== 'object') return noop;
  let osd = cache.get(player);
  if (!osd) {
    osd = createOsd(player);
    cache.set(player, osd);
  }
  return osd;
}
