/* eslint-disable @typescript-eslint/no-explicit-any, no-console, react-hooks/exhaustive-deps */

import { useCallback, useEffect, useRef } from 'react';

import { savePlayRecord } from '@/lib/db.client';

// 不同存储后端的写放大不同，据此决定进度保存频率
function getProgressSaveIntervalMs(): number {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE;
  if (storageType === 'd1') return 10000;
  if (storageType === 'upstash') return 20000;
  return 5000;
}

interface UsePlayProgressOptions {
  artPlayerRef: React.MutableRefObject<any>;
  sourceRef: React.MutableRefObject<string>;
  idRef: React.MutableRefObject<string>;
  titleRef: React.MutableRefObject<string>;
  detailRef: React.MutableRefObject<any>;
  episodeIndexRef: React.MutableRefObject<number>;
  searchTitle: string;
}

/**
 * 播放进度保存：限频写入、页面隐藏/卸载时补写。
 */
export function usePlayProgress({
  artPlayerRef,
  sourceRef,
  idRef,
  titleRef,
  detailRef,
  episodeIndexRef,
  searchTitle,
}: UsePlayProgressOptions) {
  const lastSaveTimeRef = useRef<number>(0);
  const intervalMsRef = useRef(getProgressSaveIntervalMs());

  const save = useCallback(async () => {
    const source = sourceRef.current;
    const id = idRef.current;
    const title = titleRef.current;
    const detail = detailRef.current;

    if (
      !artPlayerRef.current ||
      !source ||
      !id ||
      !title ||
      !detail?.source_name
    ) {
      return;
    }

    const player = artPlayerRef.current;
    const currentTime = player.currentTime || 0;
    const duration = player.duration || 0;

    // 播放时间太短或时长无效时不写入
    if (currentTime < 1 || !duration) {
      return;
    }

    try {
      await savePlayRecord(source, id, {
        title,
        source_name: detail.source_name || '',
        year: detail.year,
        cover: detail.poster || '',
        index: episodeIndexRef.current + 1, // 转换为 1 基索引
        total_episodes: detail.episodes?.length || 1,
        play_time: Math.floor(currentTime),
        total_time: Math.floor(duration),
        save_time: Date.now(),
        search_title: searchTitle,
      });

      lastSaveTimeRef.current = Date.now();
    } catch (err) {
      console.error('保存播放进度失败:', err);
    }
  }, [searchTitle]);

  // 到达保存间隔才写一次，供 video:timeupdate 高频调用
  const saveOnTick = useCallback(() => {
    const now = Date.now();
    if (now - lastSaveTimeRef.current <= intervalMsRef.current) return;
    lastSaveTimeRef.current = now;
    save();
  }, [save]);

  useEffect(() => {
    const handleBeforeUnload = () => save();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') save();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 站内路由跳转不会触发 beforeunload，卸载时补写最后一次进度
  useEffect(() => {
    return () => {
      void save();
    };
  }, []);

  return { saveProgress: save, saveProgressOnTick: saveOnTick };
}
