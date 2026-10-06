'use client';

import type { ReactNode } from 'react';

import {
  type ShortcutRow,
  KEYBOARD_SHORTCUTS,
  MOUSE_SHORTCUTS,
} from '@/lib/player/playerShortcuts';

interface LoadingOverlayProps {
  /** 遮罩主文案 */
  message: string;
}

/** 播放器区域的通用遮罩：深色高斯模糊 + 居中内容 */
function OverlayShell({ children }: { children: ReactNode }) {
  return (
    <div className='absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl flex items-center justify-center z-[500] transition-all duration-300'>
      {children}
    </div>
  );
}

export function LoadingOverlay({ message }: LoadingOverlayProps) {
  return (
    <OverlayShell>
      <div className='text-center max-w-md mx-auto px-6'>
        <div className='relative mb-8'>
          <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
            <div className='text-white text-4xl'>🎬</div>
            <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
          </div>

          <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
            <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
            <div
              className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
              style={{ animationDelay: '0.5s' }}
            ></div>
            <div
              className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
              style={{ animationDelay: '1s' }}
            ></div>
          </div>
        </div>

        <p className='text-xl font-semibold text-white animate-pulse'>
          {message}
        </p>
      </div>
    </OverlayShell>
  );
}

interface FasterSourceTipProps {
  sourceName: string;
  quality: string;
  loadSpeed: string;
  onSwitch: () => void;
  onDismiss: () => void;
}

/** 后台测速发现明显更快的源时的非阻断提示 */
export function FasterSourceTip({
  sourceName,
  quality,
  loadSpeed,
  onSwitch,
  onDismiss,
}: FasterSourceTipProps) {
  return (
    <div className='absolute top-4 left-4 right-4 sm:right-auto z-[500]'>
      <div className='max-w-sm rounded-xl border border-white/15 bg-gray-900/90 backdrop-blur-sm shadow-xl p-3 text-left'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <p className='text-sm font-medium text-white'>
              ⚡ 已找到更快的播放源
            </p>
            <p className='mt-0.5 text-xs text-gray-400'>
              {sourceName}
              {quality && quality !== '未知' ? ` · ${quality}` : ''}
              {loadSpeed && loadSpeed !== '未知' ? ` · ${loadSpeed}` : ''}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className='text-gray-400 hover:text-white transition-colors'
            title='忽略'
          >
            ✕
          </button>
        </div>
        <button
          onClick={onSwitch}
          className='mt-2 w-full px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium transition-colors'
        >
          切换过去
        </button>
      </div>
    </div>
  );
}

interface PlaybackFailurePanelProps {
  message: string;
  /** 已经尝试过的播放源名称 */
  triedSourceNames: string[];
  /** 可用源总数，用于提示还剩多少可试 */
  totalSources: number;
  onRetry: () => void;
  onOpenSourceSwitcher: () => void;
}

/** 自动换源也救不回来时展示的面板：说明原因、重试、手动换源 */
export function PlaybackFailurePanel({
  message,
  triedSourceNames,
  totalSources,
  onRetry,
  onOpenSourceSwitcher,
}: PlaybackFailurePanelProps) {
  const remaining = Math.max(0, totalSources - triedSourceNames.length);

  return (
    <OverlayShell>
      <div className='text-center max-w-md mx-auto px-6'>
        <div className='text-4xl mb-4'>😵</div>
        <h3 className='text-lg font-semibold text-white mb-2'>
          当前播放源无法播放
        </h3>
        <p className='text-sm text-gray-300 mb-1'>{message}</p>
        {triedSourceNames.length > 0 && (
          <p className='text-xs text-gray-400 mb-4'>
            已自动尝试：{triedSourceNames.join('、')}
            {remaining > 0 ? `，还有 ${remaining} 个源可试` : '，没有其他源了'}
          </p>
        )}

        <div className='flex items-center justify-center gap-3'>
          <button
            onClick={onOpenSourceSwitcher}
            className='px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-medium hover:from-green-600 hover:to-emerald-700 transition-all duration-200'
          >
            手动换源
          </button>
          <button
            onClick={onRetry}
            className='px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors duration-200'
          >
            重新载入
          </button>
        </div>
      </div>
    </OverlayShell>
  );
}

interface NextEpisodeCountdownProps {
  /** 下一集序号（从 1 开始） */
  nextEpisodeNumber: number;
  /** 剩余秒数 */
  secondsLeft: number;
  /** 总秒数，用于画进度环 */
  totalSeconds: number;
  onPlayNow: () => void;
  onCancel: () => void;
}

/** 播完一集后自动连播的倒计时，可立即播放或取消 */
export function NextEpisodeCountdown({
  nextEpisodeNumber,
  secondsLeft,
  totalSeconds,
  onPlayNow,
  onCancel,
}: NextEpisodeCountdownProps) {
  const ratio = totalSeconds > 0 ? secondsLeft / totalSeconds : 0;

  return (
    <div className='absolute bottom-16 right-4 z-[500] max-w-[19rem]'>
      <div className='rounded-xl border border-white/15 bg-gray-900/90 backdrop-blur-sm shadow-xl p-3'>
        <div className='flex items-center gap-3'>
          <div className='relative w-9 h-9 flex-shrink-0'>
            <svg viewBox='0 0 36 36' className='w-9 h-9 -rotate-90'>
              <circle
                cx='18'
                cy='18'
                r='16'
                fill='none'
                stroke='rgba(255,255,255,0.15)'
                strokeWidth='3'
              />
              <circle
                cx='18'
                cy='18'
                r='16'
                fill='none'
                stroke='#22c55e'
                strokeWidth='3'
                strokeLinecap='round'
                strokeDasharray={`${Math.max(0, ratio) * 100.5} 100.5`}
              />
            </svg>
            <span className='absolute inset-0 flex items-center justify-center text-xs font-semibold text-white'>
              {secondsLeft}
            </span>
          </div>

          <div className='min-w-0'>
            <p className='text-sm font-medium text-white truncate'>
              即将播放 第 {nextEpisodeNumber} 集
            </p>
            <div className='mt-1 flex items-center gap-2 text-xs'>
              <button
                onClick={onPlayNow}
                className='px-2 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors'
              >
                立即播放
              </button>
              <button
                onClick={onCancel}
                className='px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 transition-colors'
              >
                取消
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShortcutTable({
  title,
  rows,
}: {
  title: string;
  rows: ShortcutRow[];
}) {
  return (
    <div className='flex-1 min-w-[15rem]'>
      <h4 className='text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2'>
        {title}
      </h4>
      <ul className='space-y-1.5'>
        {rows.map((row) => (
          <li
            key={row.keys}
            className='flex items-center justify-between gap-3'
          >
            <kbd className='px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-[11px] text-white whitespace-nowrap'>
              {row.keys}
            </kbd>
            <span className='text-xs text-gray-300 text-right'>
              {row.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 播放器内的快捷键说明，? 键或面板按钮均可开关 */
export function ShortcutHelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className='absolute inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-sm rounded-xl'>
      <div className='w-full max-w-lg rounded-2xl border border-white/15 bg-gray-900/95 p-5 shadow-2xl'>
        <div className='flex items-center justify-between mb-4'>
          <h3 className='text-base font-semibold text-white'>快捷键</h3>
          <button
            onClick={onClose}
            className='text-gray-400 hover:text-white transition-colors'
            title='关闭'
          >
            ✕
          </button>
        </div>
        <div className='flex flex-col sm:flex-row gap-6'>
          <ShortcutTable title='键盘' rows={KEYBOARD_SHORTCUTS} />
          <ShortcutTable title='鼠标' rows={MOUSE_SHORTCUTS} />
        </div>
      </div>
    </div>
  );
}
