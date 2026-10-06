/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import { Heart } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import {
  deleteFavorite,
  deletePlayRecord,
  deleteSkipConfig,
  generateStorageKey,
  getAllPlayRecords,
  isFavorited,
  saveFavorite,
  saveSkipConfig,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import {
  AD_FILTER_SETTING_NAME,
  adFilterTooltip,
  describeHlsError,
} from '@/lib/player/artPlayerOptions';
import {
  findFasterSource,
  MeasuredSource,
  orderSourcesByRank,
  pickFallbackSource,
  probeSources,
  rankMeasuredSources,
  sourceKey,
  VideoTestResult,
} from '@/lib/player/sourceScore';
import { buildSubtitleSettings } from '@/lib/player/subtitleLoader';
import { useArtPlayer } from '@/lib/player/useArtPlayer';
import { useKeyboardShortcuts } from '@/lib/player/useKeyboardShortcuts';
import { usePlayProgress } from '@/lib/player/usePlayProgress';
import { useSkipIntro } from '@/lib/player/useSkipIntro';
import { SearchResult } from '@/lib/types';
import { processImageUrl } from '@/lib/utils';

import EpisodeSelector from '@/components/EpisodeSelector';
import PageLayout from '@/components/PageLayout';
import {
  FasterSourceTip,
  LoadingOverlay,
  NextEpisodeCountdown,
  PlaybackFailurePanel,
  ShortcutHelpPanel,
} from '@/components/PlayerOverlays';

// 扩展 HTMLVideoElement 类型以支持 hls 属性
declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
}

// 播放失败时最多自动切换几个源，超过后显示失败面板
const MAX_AUTO_SWITCH_SOURCES = 3;
// 起播后在后台测速的并发数，太多会抢当前播放的带宽
const BACKGROUND_PROBE_CONCURRENCY = 2;
// 一集播完后自动连播的倒计时秒数
const AUTO_NEXT_SECONDS = 5;

function PlayPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // -----------------------------------------------------------------------------
  // 状态变量（State）
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('🔍 正在搜索播放源...');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);

  // 收藏状态
  const [favorited, setFavorited] = useState(false);

  // 去广告开关（从 localStorage 继承，默认 true）
  const [blockAdEnabled, setBlockAdEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_blockad');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  // 视频基本信息
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState('');
  // 当前源和ID
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');

  // 搜索所需信息
  const [searchTitle] = useState(searchParams.get('stitle') || '');
  const [searchType] = useState(searchParams.get('stype') || '');

  // 是否需要优选
  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  // 集数相关
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);
  // 异步回调里要用最新的候选源，不能依赖闭包
  const candidatesRef = useRef<SearchResult[]>([]);

  // 同步最新值到 refs
  useEffect(() => {
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
  }, [
    currentSource,
    currentId,
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
  ]);

  // 视频播放地址
  const [videoUrl, setVideoUrl] = useState('');

  // 总集数
  const totalEpisodes = detail?.episodes?.length || 0;

  // 用于记录是否需要在播放器 ready 后跳转到指定进度
  const resumeTimeRef = useRef<number | null>(null);
  // 换源相关状态
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null
  );

  // 优选和测速开关
  const [optimizationEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('enableOptimization');
      if (saved !== null) {
        try {
          return JSON.parse(saved);
        } catch {
          /* ignore */
        }
      }
    }
    return true;
  });

  // 保存优选时的测速结果，避免EpisodeSelector重复测速
  const [precomputedVideoInfo, setPrecomputedVideoInfo] = useState<
    Map<string, { quality: string; loadSpeed: string; pingTime: number }>
  >(new Map());

  // 后台测速发现的更优源，非空时显示切换提示
  const [fasterSource, setFasterSource] =
    useState<MeasuredSource<SearchResult> | null>(null);
  // 自动换源也救不回来时的失败面板内容
  const [playbackFailure, setPlaybackFailure] = useState<{
    message: string;
    triedSourceNames: string[];
  } | null>(null);
  // 本次播放已经试过的源，避免自动换源来回兜圈
  const triedSourcesRef = useRef<Set<string>>(new Set());
  // 递增即强制重建播放器，用于失败面板的“重新载入”
  const [reloadToken, setReloadToken] = useState(0);
  // 初次挂载读取播放记录的 Promise，起播前要先等它
  const playRecordReadyRef = useRef<Promise<void>>(Promise.resolve());

  // 自动连播：播完一集后倒计时切下一集
  const [autoNextEnabled, setAutoNextEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem('enable_auto_next');
    return saved === null ? true : saved === 'true';
  });
  // 非空时显示连播倒计时，left 归零即切集
  const [nextEpisodeCountdown, setNextEpisodeCountdown] = useState<{
    index: number;
    left: number;
  } | null>(null);
  // 快捷键说明面板
  const [showShortcuts, setShowShortcuts] = useState(false);

  // 折叠状态（仅在 lg 及以上屏幕有效）
  const [isEpisodeSelectorCollapsed, setIsEpisodeSelectorCollapsed] =
    useState(false);

  // 换源加载状态
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');

  const artPlayerRef = useRef<any>(null);
  const artRef = useRef<HTMLDivElement | null>(null);

  // 跳过片头片尾：配置读写、面板项与自动跳过
  const {
    skipConfigRef,
    buildSkipSettings,
    clearSkipConfig,
    onTimeUpdate: applySkipRules,
  } = useSkipIntro({
    sourceRef: currentSourceRef,
    idRef: currentIdRef,
    artPlayerRef: artPlayerRef,
    hasNextEpisode: () => {
      const d = detailRef.current;
      const idx = currentEpisodeIndexRef.current;
      return !!d?.episodes?.length && idx < d.episodes.length - 1;
    },
    playNextEpisode: () => handleNextEpisode(),
  });

  // 播放进度保存：限频写入与页面隐藏/卸载时补写
  const { saveProgress, saveProgressOnTick } = usePlayProgress({
    artPlayerRef: artPlayerRef,
    sourceRef: currentSourceRef,
    idRef: currentIdRef,
    titleRef: videoTitleRef,
    detailRef,
    episodeIndexRef: currentEpisodeIndexRef,
    searchTitle,
  });

  // -----------------------------------------------------------------------------
  // 播放源选择与自动换源
  // -----------------------------------------------------------------------------

  /** 更新候选源列表，始终保留正在播放的那个 */
  const applyCandidates = (list: SearchResult[]) => {
    const playing = detailRef.current;
    const merged =
      playing && !list.some((item) => sourceKey(item) === sourceKey(playing))
        ? [playing, ...list]
        : list;
    candidatesRef.current = merged;
    setAvailableSources(merged);
  };

  /** 单独补一个候选源（按 source+id 精确取详情时用） */
  const addCandidate = (detail: SearchResult) => {
    if (
      candidatesRef.current.some(
        (item) => sourceKey(item) === sourceKey(detail)
      )
    ) {
      return;
    }
    candidatesRef.current = [detail, ...candidatesRef.current];
    setAvailableSources(candidatesRef.current);
  };

  /**
   * 起播前等播放记录读完：进度恢复发生在 video:canplay，
   * 记录读晚了就来不及跳转。给一个上限，慢存储不能拖住首帧。
   */
  const waitPlayRecord = async () => {
    await Promise.race([
      playRecordReadyRef.current,
      new Promise((resolve) => setTimeout(resolve, 800)),
    ]);
  };

  /**
   * 后台测速：先让当前源播起来，测完再决定静默切换还是提示用户。
   * playingKey 为起播时选中源的标识。
   */
  const runBackgroundSpeedTest = async (
    candidates: SearchResult[],
    playingKey: string
  ) => {
    if (!optimizationEnabled || candidates.length < 2) return;

    const infoMap = new Map<string, VideoTestResult>();
    const measured: Array<{
      source: SearchResult;
      testResult: VideoTestResult;
    }> = [];

    await probeSources(
      candidates,
      (source) => source.episodes,
      (source, testResult) => {
        if (!testResult) return;
        infoMap.set(sourceKey(source), testResult);
        measured.push({ source, testResult });
        // 边测边把速度回填到换源面板
        setPrecomputedVideoInfo(new Map(infoMap));
      },
      BACKGROUND_PROBE_CONCURRENCY
    );

    if (measured.length === 0) return;

    const ranked = rankMeasuredSources(measured);
    applyCandidates(orderSourcesByRank(candidates, ranked));

    const faster = findFasterSource(ranked, playingKey);
    if (!faster) return;

    // 还没真正播起来就直接换，已经开播则交给用户决定
    if ((artPlayerRef.current?.currentTime || 0) < 1) {
      await switchToSource(faster.source);
    } else {
      setFasterSource(faster);
    }
  };

  /** 切换到指定播放源，尽量沿用当前集数与进度 */
  const switchToSource = async (
    newDetail: SearchResult,
    fallbackTitle = ''
  ) => {
    const prevSource = currentSourceRef.current;
    const prevId = currentIdRef.current;
    const prevIndex = currentEpisodeIndexRef.current;

    setVideoLoadingStage('sourceChanging');
    setIsVideoLoading(true);
    setFasterSource(null);
    setPlaybackFailure(null);
    setNextEpisodeCountdown(null);

    const currentPlayTime = artPlayerRef.current?.currentTime || 0;
    const targetIndex =
      newDetail.episodes && prevIndex < newDetail.episodes.length
        ? prevIndex
        : 0;

    // 只有仍播同一集时才恢复原进度，否则交给播放记录
    if (targetIndex !== prevIndex) {
      resumeTimeRef.current = 0;
    } else if (
      (!resumeTimeRef.current || resumeTimeRef.current === 0) &&
      currentPlayTime > 1
    ) {
      resumeTimeRef.current = currentPlayTime;
    }

    if (prevSource && prevId) {
      try {
        await deletePlayRecord(prevSource, prevId);
      } catch (err) {
        console.error('清除播放记录失败:', err);
      }

      try {
        await deleteSkipConfig(prevSource, prevId);
        await saveSkipConfig(
          newDetail.source,
          newDetail.id,
          skipConfigRef.current
        );
      } catch (err) {
        console.error('迁移跳过片头片尾配置失败:', err);
      }
    }

    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('source', newDetail.source);
    newUrl.searchParams.set('id', newDetail.id);
    newUrl.searchParams.set('year', newDetail.year);
    window.history.replaceState({}, '', newUrl.toString());

    setVideoTitle(newDetail.title || fallbackTitle || videoTitleRef.current);
    setVideoYear(newDetail.year);
    setVideoCover(newDetail.poster);
    setCurrentSource(newDetail.source);
    setCurrentId(newDetail.id);
    setDetail(newDetail);
    setCurrentEpisodeIndex(targetIndex);
  };

  /**
   * 播放源断开：自动换到还没试过的源，连续失败到达上限后交给失败面板。
   */
  const handlePlaybackFailure = async (reason: string) => {
    const playing = detailRef.current;
    if (playing) triedSourcesRef.current.add(sourceKey(playing));

    const next =
      triedSourcesRef.current.size > MAX_AUTO_SWITCH_SOURCES
        ? null
        : pickFallbackSource(candidatesRef.current, triedSourcesRef.current);

    if (!next) {
      setIsVideoLoading(false);
      setPlaybackFailure({
        message: reason,
        triedSourceNames: candidatesRef.current
          .filter((item) => triedSourcesRef.current.has(sourceKey(item)))
          .map((item) => item.source_name || item.source),
      });
      return;
    }

    const player = artPlayerRef.current;
    if (player) {
      player.notice.show = `播放失败，正在切换到 ${
        next.source_name || next.source
      }`;
    }
    await switchToSource(next);
  };

  /** 失败面板的“重新载入”：重建播放器并从当前位置重试同一源 */
  const reloadCurrentSource = () => {
    const player = artPlayerRef.current;
    if (player) resumeTimeRef.current = player.currentTime || 0;

    setPlaybackFailure(null);
    setVideoLoadingStage('sourceChanging');
    setIsVideoLoading(true);
    destroyPlayer();
    setReloadToken((token) => token + 1);
  };

  // 更新视频地址
  const updateVideoUrl = (
    detailData: SearchResult | null,
    episodeIndex: number
  ) => {
    if (
      !detailData ||
      !detailData.episodes ||
      episodeIndex >= detailData.episodes.length
    ) {
      setVideoUrl('');
      return;
    }
    const newUrl = detailData?.episodes[episodeIndex] || '';
    if (newUrl !== videoUrl) {
      setVideoUrl(newUrl);
    }
  };

  // 当集数索引变化时自动更新视频地址
  useEffect(() => {
    updateVideoUrl(detail, currentEpisodeIndex);
  }, [detail, currentEpisodeIndex]);

  // 进入页面时获取源信息：先起播，测速放到后台
  useEffect(() => {
    const fetchSourceDetail = async (
      source: string,
      id: string
    ): Promise<SearchResult[]> => {
      try {
        const detailResponse = await fetch(
          `/api/detail?source=${source}&id=${id}`
        );
        if (!detailResponse.ok) {
          throw new Error('获取视频详情失败');
        }
        const detailData = (await detailResponse.json()) as SearchResult;
        addCandidate(detailData);
        return [detailData];
      } catch (err) {
        console.error('获取视频详情失败:', err);
        return [];
      } finally {
        setSourceSearchLoading(false);
      }
    };
    const fetchSourcesData = async (query: string): Promise<SearchResult[]> => {
      // 根据搜索词获取全部源信息
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}`
        );
        if (!response.ok) {
          throw new Error('搜索失败');
        }
        const data = await response.json();

        // 处理搜索结果，根据规则过滤
        const results = data.results.filter(
          (result: SearchResult) =>
            result.title.replaceAll(' ', '').toLowerCase() ===
              videoTitleRef.current.replaceAll(' ', '').toLowerCase() &&
            (videoYearRef.current
              ? result.year.toLowerCase() === videoYearRef.current.toLowerCase()
              : true) &&
            (searchType
              ? (searchType === 'tv' && result.episodes.length > 1) ||
                (searchType === 'movie' && result.episodes.length === 1)
              : true)
        );
        applyCandidates(results);
        return results;
      } catch (err) {
        setSourceSearchError(err instanceof Error ? err.message : '搜索失败');
        return [];
      } finally {
        setSourceSearchLoading(false);
      }
    };

    /** 确定起始源并立即交给播放器 */
    const startPlaying = async (detailData: SearchResult) => {
      setNeedPrefer(false);
      setCurrentSource(detailData.source);
      setCurrentId(detailData.id);
      setVideoYear(detailData.year);
      setVideoTitle(detailData.title || videoTitleRef.current);
      setVideoCover(detailData.poster);
      setDetail(detailData);
      if (currentEpisodeIndexRef.current >= detailData.episodes.length) {
        setCurrentEpisodeIndex(0);
      }

      // 规范URL参数
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', detailData.source);
      newUrl.searchParams.set('id', detailData.id);
      newUrl.searchParams.set('year', detailData.year);
      newUrl.searchParams.set('title', detailData.title);
      newUrl.searchParams.delete('prefer');
      window.history.replaceState({}, '', newUrl.toString());

      // 播放记录要赶在 canplay 之前读到，否则恢复不了进度
      await waitPlayRecord();
      setLoading(false);
    };

    const initAll = async () => {
      if (!currentSource && !currentId && !videoTitle && !searchTitle) {
        setError('缺少必要参数');
        setLoading(false);
        return;
      }

      setLoading(true);
      const specified = !!currentSource && !!currentId;

      if (specified && !needPreferRef.current) {
        // 明确指定了源：只拉这一个详情就起播，搜索和测速都在后台补
        setLoadingMessage('🎬 正在获取视频详情...');

        const only = await fetchSourceDetail(currentSource, currentId);
        if (only.length === 0) {
          setError('未找到匹配结果');
          setLoading(false);
          return;
        }

        await startPlaying(only[0]);
        await fetchSourcesData(searchTitle || videoTitle);
        void runBackgroundSpeedTest(candidatesRef.current, sourceKey(only[0]));
        return;
      }

      setLoadingMessage('🔍 正在搜索播放源...');

      const results = await fetchSourcesData(searchTitle || videoTitle);
      if (results.length === 0) {
        setError('未找到匹配结果');
        setLoading(false);
        return;
      }

      let startSource = results[0];
      if (specified) {
        const matched = results.find(
          (item) => item.source === currentSource && item.id === currentId
        );
        startSource =
          matched ??
          (await fetchSourceDetail(currentSource, currentId))[0] ??
          startSource;
      }

      await startPlaying(startSource);
      void runBackgroundSpeedTest(
        candidatesRef.current,
        sourceKey(startSource)
      );
    };

    initAll();
  }, []);

  // 播放记录处理
  useEffect(() => {
    // 仅在初次挂载时检查播放记录
    playRecordReadyRef.current = (async () => {
      if (!currentSource || !currentId) return;

      try {
        const allRecords = await getAllPlayRecords();
        const key = generateStorageKey(currentSource, currentId);
        const record = allRecords[key];

        if (record) {
          const targetIndex = record.index - 1;
          const targetTime = record.play_time;

          // 更新当前选集索引
          if (targetIndex !== currentEpisodeIndex) {
            setCurrentEpisodeIndex(targetIndex);
          }

          // 保存待恢复的播放进度，待播放器就绪后跳转
          resumeTimeRef.current = targetTime;
        }
      } catch (err) {
        console.error('读取播放记录失败:', err);
      }
    })();
  }, []);

  // 处理换源
  const handleSourceChange = async (
    newSource: string,
    newId: string,
    newTitle: string
  ) => {
    const newDetail = candidatesRef.current.find(
      (item) => item.source === newSource && item.id === newId
    );
    if (!newDetail) {
      setError('未找到匹配结果');
      return;
    }

    await switchToSource(newDetail, newTitle);
  };

  // ---------------------------------------------------------------------------
  // 集数切换
  // ---------------------------------------------------------------------------
  // 处理集数切换
  const handleEpisodeChange = (episodeNumber: number) => {
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      setNextEpisodeCountdown(null);
      // 在更换集数前保存当前播放进度
      if (artPlayerRef.current) {
        saveProgress();
      }
      setCurrentEpisodeIndex(episodeNumber);
    }
  };

  const handlePreviousEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx > 0) {
      if (artPlayerRef.current) {
        saveProgress();
      }
      setCurrentEpisodeIndex(idx - 1);
    }
  };

  const handleNextEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx < d.episodes.length - 1) {
      if (artPlayerRef.current) {
        saveProgress();
      }
      setCurrentEpisodeIndex(idx + 1);
    }
  };

  /** 开关自动连播，状态写入 localStorage */
  const toggleAutoNext = (): boolean => {
    const newVal = !autoNextEnabled;
    setAutoNextEnabled(newVal);
    if (!newVal) setNextEpisodeCountdown(null);
    try {
      localStorage.setItem('enable_auto_next', String(newVal));
    } catch (_) {
      // ignore
    }
    return newVal;
  };

  // 倒计时走完就切下一集；期间手动切集或取消会清掉状态
  useEffect(() => {
    if (!nextEpisodeCountdown) return;

    if (nextEpisodeCountdown.left <= 0) {
      handleEpisodeChange(nextEpisodeCountdown.index);
      return;
    }

    const timer = setTimeout(
      () =>
        setNextEpisodeCountdown((prev) =>
          prev ? { ...prev, left: prev.left - 1 } : prev
        ),
      1000
    );
    return () => clearTimeout(timer);
  }, [nextEpisodeCountdown]);

  // ---------------------------------------------------------------------------
  // 键盘快捷键
  // ---------------------------------------------------------------------------
  useKeyboardShortcuts({
    artPlayerRef,
    goPreviousEpisode: handlePreviousEpisode,
    goNextEpisode: handleNextEpisode,
    canGoPreviousEpisode: () => currentEpisodeIndexRef.current > 0,
    canGoNextEpisode: () => {
      const d = detailRef.current;
      return (
        !!d?.episodes && currentEpisodeIndexRef.current < d.episodes.length - 1
      );
    },
    toggleShortcutHelp: () => setShowShortcuts((prev) => !prev),
  });

  // ---------------------------------------------------------------------------
  // 播放器生命周期
  // ---------------------------------------------------------------------------
  // 错误页会移除播放器容器，此时同步销毁实例避免残留
  useEffect(() => {
    if (error) {
      destroyPlayer();
    }
  }, [error]);

  // ---------------------------------------------------------------------------
  // 收藏相关
  // ---------------------------------------------------------------------------
  // 每当 source 或 id 变化时检查收藏状态
  useEffect(() => {
    if (!currentSource || !currentId) return;
    (async () => {
      try {
        const fav = await isFavorited(currentSource, currentId);
        setFavorited(fav);
      } catch (err) {
        console.error('检查收藏状态失败:', err);
      }
    })();
  }, [currentSource, currentId]);

  // 监听收藏数据更新事件
  useEffect(() => {
    if (!currentSource || !currentId) return;

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, any>) => {
        const key = generateStorageKey(currentSource, currentId);
        const isFav = !!favorites[key];
        setFavorited(isFav);
      }
    );

    return unsubscribe;
  }, [currentSource, currentId]);

  // 切换收藏
  const handleToggleFavorite = async () => {
    if (
      !videoTitleRef.current ||
      !detailRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current
    )
      return;

    try {
      if (favorited) {
        // 如果已收藏，删除收藏
        await deleteFavorite(currentSourceRef.current, currentIdRef.current);
        setFavorited(false);
      } else {
        // 如果未收藏，添加收藏
        await saveFavorite(currentSourceRef.current, currentIdRef.current, {
          title: videoTitleRef.current,
          source_name: detailRef.current?.source_name || '',
          year: detailRef.current?.year,
          cover: detailRef.current?.poster || '',
          total_episodes: detailRef.current?.episodes.length || 1,
          save_time: Date.now(),
          search_title: searchTitle,
        });
        setFavorited(true);
      }
    } catch (err) {
      console.error('切换收藏失败:', err);
    }
  };

  // 创建并维护 Artplayer 实例
  const { destroyPlayer } = useArtPlayer({
    containerRef: artRef,
    playerRef: artPlayerRef,
    url: videoUrl,
    poster: videoCover,
    title: videoTitle,
    episodeIndex: currentEpisodeIndex,
    loading,
    blockAdEnabled,
    reloadToken,
    detail,
    totalEpisodes,
    resumeTimeRef,
    buildSettings: () => [
      {
        name: AD_FILTER_SETTING_NAME,
        html: '去广告',
        icon: '<text x="50%" y="50%" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">AD</text>',
        tooltip: adFilterTooltip(blockAdEnabled),
        onClick() {
          const newVal = !blockAdEnabled;
          try {
            localStorage.setItem('enable_blockad', String(newVal));
            if (artPlayerRef.current) {
              resumeTimeRef.current = artPlayerRef.current.currentTime;
              destroyPlayer();
            }
            setBlockAdEnabled(newVal);
          } catch (_) {
            // ignore
          }
          return adFilterTooltip(newVal);
        },
      },
      ...buildSkipSettings(),
      ...buildSubtitleSettings(() => artPlayerRef.current),
      {
        html: '自动连播',
        tooltip: autoNextEnabled ? '已开启' : '已关闭',
        onClick: function () {
          return toggleAutoNext() ? '已开启' : '已关闭';
        },
      },
      {
        html: '快捷键',
        tooltip: '查看',
        onClick: function () {
          setShowShortcuts((prev) => !prev);
          return '';
        },
      },
      {
        html: '删除跳过配置',
        onClick: function () {
          clearSkipConfig();
          return '';
        },
      },
    ],
    onReady: () => setError(null),
    onSaveProgress: () => saveProgress(),
    onTick: (player: any) => {
      applySkipRules(player, player.currentTime || 0, player.duration || 0);
      saveProgressOnTick();
    },
    onNextEpisode: () => handleNextEpisode(),
    onEnded: () => {
      const d = detailRef.current;
      const idx = currentEpisodeIndexRef.current;
      if (!d?.episodes || idx >= d.episodes.length - 1) return;
      if (autoNextEnabled) {
        setNextEpisodeCountdown({
          index: idx + 1,
          left: AUTO_NEXT_SECONDS,
        });
      }
    },
    onCanPlay: () => {
      setIsVideoLoading(false);
      setPlaybackFailure(null);
    },
    onInvalidEpisode: (message: string) => setError(message),
    onSourceBroken: (_player: any, data: any) => {
      void handlePlaybackFailure(describeHlsError(data));
    },
  });

  if (loading) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 动画影院图标 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center'>
                <div className='text-white text-4xl'>🎬</div>
                {/* 旋转光环 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
              </div>
            </div>

            {/* 加载消息 */}
            <p className='text-xl font-semibold text-gray-800 dark:text-gray-200 animate-pulse'>
              {loadingMessage}
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 错误图标 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>😵</div>
                {/* 脉冲效果 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl opacity-20 animate-pulse'></div>
              </div>

              {/* 浮动错误粒子 */}
              <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                <div className='absolute top-2 left-2 w-2 h-2 bg-red-400 rounded-full animate-bounce'></div>
                <div
                  className='absolute top-4 right-4 w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce'
                  style={{ animationDelay: '0.5s' }}
                ></div>
                <div
                  className='absolute bottom-3 left-6 w-1 h-1 bg-yellow-400 rounded-full animate-bounce'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
            </div>

            {/* 错误信息 */}
            <div className='space-y-4 mb-8'>
              <h2 className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
                哎呀，出现了一些问题
              </h2>
              <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4'>
                <p className='text-red-600 dark:text-red-400 font-medium'>
                  {error}
                </p>
              </div>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                请检查网络连接或尝试刷新页面
              </p>
            </div>

            {/* 操作按钮 */}
            <div className='space-y-3'>
              <button
                onClick={() =>
                  videoTitle
                    ? router.push(`/search?q=${encodeURIComponent(videoTitle)}`)
                    : router.back()
                }
                className='w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                {videoTitle ? '🔍 返回搜索' : '← 返回上页'}
              </button>

              <button
                onClick={() => window.location.reload()}
                className='w-full px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200'
              >
                🔄 重新尝试
              </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/play'>
      <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
        {/* 第一行：影片标题 */}
        <div className='py-1'>
          <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
            {videoTitle || '影片标题'}
            {totalEpisodes > 1 && (
              <span className='text-gray-500 dark:text-gray-400'>
                {` > 第 ${currentEpisodeIndex + 1} 集`}
              </span>
            )}
          </h1>
        </div>
        {/* 第二行：播放器和选集 */}
        <div className='space-y-2'>
          {/* 折叠控制 - 仅在 lg 及以上屏幕显示 */}
          <div className='hidden lg:flex justify-end'>
            <button
              onClick={() =>
                setIsEpisodeSelectorCollapsed(!isEpisodeSelectorCollapsed)
              }
              className='group relative flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-all duration-200'
              title={
                isEpisodeSelectorCollapsed ? '显示选集面板' : '隐藏选集面板'
              }
            >
              <svg
                className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                  isEpisodeSelectorCollapsed ? 'rotate-180' : 'rotate-0'
                }`}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M9 5l7 7-7 7'
                />
              </svg>
              <span className='text-xs font-medium text-gray-600 dark:text-gray-300'>
                {isEpisodeSelectorCollapsed ? '显示' : '隐藏'}
              </span>

              {/* 精致的状态指示点 */}
              <div
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full transition-all duration-200 ${
                  isEpisodeSelectorCollapsed
                    ? 'bg-orange-400 animate-pulse'
                    : 'bg-green-400'
                }`}
              ></div>
            </button>
          </div>

          <div
            className={`grid gap-4 lg:h-[500px] xl:h-[650px] 2xl:h-[750px] transition-all duration-300 ease-in-out ${
              isEpisodeSelectorCollapsed
                ? 'grid-cols-1'
                : 'grid-cols-1 md:grid-cols-4'
            }`}
          >
            {/* 播放器 */}
            <div
              className={`h-full transition-all duration-300 ease-in-out rounded-xl border border-white/0 dark:border-white/30 ${
                isEpisodeSelectorCollapsed ? 'col-span-1' : 'md:col-span-3'
              }`}
            >
              <div className='relative w-full h-[300px] lg:h-full'>
                <div
                  ref={artRef}
                  className='bg-black w-full h-full rounded-xl overflow-hidden shadow-lg'
                ></div>

                {/* 换源加载蒙层 */}
                {isVideoLoading && !playbackFailure && (
                  <LoadingOverlay
                    message={
                      videoLoadingStage === 'sourceChanging'
                        ? '🔄 切换播放源...'
                        : '🔄 视频加载中...'
                    }
                  />
                )}

                {/* 后台测速找到更快的源 */}
                {fasterSource && !playbackFailure && (
                  <FasterSourceTip
                    sourceName={
                      fasterSource.source.source_name ||
                      fasterSource.source.source
                    }
                    quality={fasterSource.testResult.quality}
                    loadSpeed={fasterSource.testResult.loadSpeed}
                    onSwitch={() => void switchToSource(fasterSource.source)}
                    onDismiss={() => setFasterSource(null)}
                  />
                )}

                {/* 自动换源也失败：说明原因并给出补救入口 */}
                {playbackFailure && (
                  <PlaybackFailurePanel
                    message={playbackFailure.message}
                    triedSourceNames={playbackFailure.triedSourceNames}
                    totalSources={availableSources.length}
                    onRetry={reloadCurrentSource}
                    onOpenSourceSwitcher={() => {
                      setPlaybackFailure(null);
                      setIsEpisodeSelectorCollapsed(false);
                    }}
                  />
                )}

                {/* 播完一集：自动连播倒计时 */}
                {nextEpisodeCountdown && !playbackFailure && (
                  <NextEpisodeCountdown
                    nextEpisodeNumber={nextEpisodeCountdown.index + 1}
                    secondsLeft={nextEpisodeCountdown.left}
                    totalSeconds={AUTO_NEXT_SECONDS}
                    onPlayNow={() =>
                      handleEpisodeChange(nextEpisodeCountdown.index)
                    }
                    onCancel={() => setNextEpisodeCountdown(null)}
                  />
                )}

                {/* 快捷键说明 */}
                {showShortcuts && (
                  <ShortcutHelpPanel onClose={() => setShowShortcuts(false)} />
                )}
              </div>
            </div>

            {/* 选集和换源 - 在移动端始终显示，在 lg 及以上可折叠 */}
            <div
              className={`h-[300px] lg:h-full md:overflow-hidden transition-all duration-300 ease-in-out ${
                isEpisodeSelectorCollapsed
                  ? 'md:col-span-1 lg:hidden lg:opacity-0 lg:scale-95'
                  : 'md:col-span-1 lg:opacity-100 lg:scale-100'
              }`}
            >
              <EpisodeSelector
                totalEpisodes={totalEpisodes}
                value={currentEpisodeIndex + 1}
                onChange={handleEpisodeChange}
                onSourceChange={handleSourceChange}
                currentSource={currentSource}
                currentId={currentId}
                videoTitle={searchTitle || videoTitle}
                availableSources={availableSources}
                sourceSearchLoading={sourceSearchLoading}
                sourceSearchError={sourceSearchError}
                precomputedVideoInfo={precomputedVideoInfo}
              />
            </div>
          </div>
        </div>

        {/* 详情展示 */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          {/* 文字区 */}
          <div className='md:col-span-3'>
            <div className='p-6 flex flex-col min-h-0'>
              {/* 标题 */}
              <h1 className='text-3xl font-bold mb-2 tracking-wide flex items-center flex-shrink-0 text-center md:text-left w-full'>
                {videoTitle || '影片标题'}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite();
                  }}
                  className='ml-3 flex-shrink-0 hover:opacity-80 transition-opacity'
                >
                  <FavoriteIcon filled={favorited} />
                </button>
              </h1>

              {/* 关键信息行 */}
              <div className='flex flex-wrap items-center gap-3 text-base mb-4 opacity-80 flex-shrink-0'>
                {detail?.class && (
                  <span className='text-green-600 font-semibold'>
                    {detail.class}
                  </span>
                )}
                {(detail?.year || videoYear) && (
                  <span>{detail?.year || videoYear}</span>
                )}
                {detail?.source_name && (
                  <span className='border border-gray-500/60 px-2 py-[1px] rounded'>
                    {detail.source_name}
                  </span>
                )}
                {detail?.type_name && <span>{detail.type_name}</span>}
              </div>
              {/* 剧情简介 */}
              {detail?.desc && (
                <div
                  className='mt-0 text-base leading-relaxed opacity-90 overflow-y-auto pr-2 flex-1 min-h-0 scrollbar-hide'
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {detail.desc}
                </div>
              )}
            </div>
          </div>

          {/* 封面展示 */}
          <div className='hidden md:block md:col-span-1 md:order-first'>
            <div className='pl-0 py-4 pr-6'>
              <div className='bg-gray-300 dark:bg-gray-700 aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden'>
                {videoCover ? (
                  <img
                    src={processImageUrl(videoCover)}
                    alt={videoTitle}
                    className='w-full h-full object-cover'
                  />
                ) : (
                  <span className='text-gray-600 dark:text-gray-400'>
                    封面图片
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

// FavoriteIcon 组件
const FavoriteIcon = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return (
      <svg
        className='h-7 w-7'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
          fill='#ef4444' /* Tailwind red-500 */
          stroke='#ef4444'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    );
  }
  return (
    <Heart className='h-7 w-7 stroke-[1] text-gray-600 dark:text-gray-300' />
  );
};

export default function PlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageClient />
    </Suspense>
  );
}
