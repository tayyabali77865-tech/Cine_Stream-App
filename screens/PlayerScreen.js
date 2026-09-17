import React, { useEffect, useRef, useCallback, useReducer } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
  BackHandler,
  Modal,
  Alert,
  ScrollView,
  Dimensions,
  Platform
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { apiService } from '../services/apiService';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as NavigationBar from 'expo-navigation-bar';
import { useSmartlinkAd } from '../context/SmartlinkAdContext';

// ─── Screen Dimensions ────────────────────────────────────────────────────────

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
const gridItemWidth = (SCREEN_WIDTH - 80) / 5;
const VIDEO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.40);

// Helper: format milliseconds to hh:mm:ss / mm:ss
const formatTime = (ms) => {
  if (isNaN(ms) || ms < 0) return '0:00';
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const secsStr = secs < 10 ? `0${secs}` : secs;
  if (hrs > 0) {
    const minsStr = mins < 10 ? `0${mins}` : mins;
    return `${hrs}:${minsStr}:${secsStr}`;
  }
  return `${mins}:${secsStr}`;
};

// ─── Pure Helpers (module-level) ──────────────────────────────────────────────

const sanitizeFilename = (str) => str.replace(/[^a-zA-Z0-9_\-\.]/g, '_').substring(0, 80);

const formatEta = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
};

const parseSizeToBytes = (sizeStr = '') => {
  const m = sizeStr.match(/([\d.]+)\s*(GB|MB|KB)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = m[2].toUpperCase();
  if (u === 'GB') return n * 1024 * 1024 * 1024;
  if (u === 'MB') return n * 1024;
  if (u === 'KB') return n * 1024;
  return 0;
};

// ─── Download State Reducer ───────────────────────────────────────────────────
// Batches all download state into a single object so cancelDownload, etc.
// only triggers ONE re-render instead of 7 sequential setState calls.

const INITIAL_DOWNLOAD_STATE = {
  downloading: false,
  isPaused: false,
  offlinePaused: false,
  progress: 0,
  downloadedMB: 0,
  totalMB: 0,
  speedMB: '0.0',
  eta: '--',
  selectedQuality: null,
};

function downloadReducer(state, action) {
  switch (action.type) {
    case 'START':
      return {
        ...INITIAL_DOWNLOAD_STATE,
        downloading: true,
        selectedQuality: action.quality,
      };
    case 'CANCEL':
      return { ...INITIAL_DOWNLOAD_STATE };
    case 'PAUSE':
      return { ...state, isPaused: true, speedMB: '0.0', eta: 'Paused' };
    case 'RESUME':
      return { ...state, isPaused: false, offlinePaused: false };
    case 'INTERRUPTED':
      return { ...state, offlinePaused: true, speedMB: '0.0', eta: 'Waiting for network...' };
    case 'RESTORED':
      return { ...state, offlinePaused: false };
    case 'PROGRESS':
      return {
        ...state,
        progress: action.progress,
        downloadedMB: action.downloadedMB,
        totalMB: action.totalMB,
        speedMB: action.speedMB !== undefined ? action.speedMB : state.speedMB,
        eta: action.eta !== undefined ? action.eta : state.eta,
      };
    case 'COMPLETE':
      return { ...INITIAL_DOWNLOAD_STATE, progress: 1 };
    default:
      return state;
  }
}

// ─── Stream State Reducer ─────────────────────────────────────────────────────

const INITIAL_STREAM_STATE = { loading: true, error: null, sources: null };

function streamReducer(state, action) {
  switch (action.type) {
    case 'LOADING': return { loading: true, error: null, sources: null };
    case 'SUCCESS': return { loading: false, error: null, sources: action.sources };
    case 'ERROR': return { loading: false, error: action.error, sources: null };
    default: return state;
  }
}

// ─── Quality Modal State Reducer ──────────────────────────────────────────────

const INITIAL_QUALITY_STATE = { visible: false, loading: false, qualities: [], error: null, referer: null };

function qualityReducer(state, action) {
  switch (action.type) {
    case 'OPEN': return { visible: true, loading: true, qualities: [], error: null, referer: null };
    case 'LOADED': return { ...state, loading: false, qualities: action.qualities, referer: action.referer };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    case 'CLOSE': return { ...state, visible: false };
    default: return state;
  }
}

// ─── Player Screen ────────────────────────────────────────────────────────────

export default function PlayerScreen({ route, navigation }) {
  const { id, title, season, episode, defaultLanguage, seasons } = route.params;

  const activeLanguage = defaultLanguage || 'Hindi';

  const { showAdIfReady, setIsPlayerActive } = useSmartlinkAd();

  useFocusEffect(
    useCallback(() => {
      setIsPlayerActive(true);
      return () => {
        setIsPlayerActive(false);
      };
    }, [setIsPlayerActive])
  );

  // ── Reducers replace multiple useState calls ──────────────────────────────
  const [streamState, dispatchStream] = useReducer(streamReducer, INITIAL_STREAM_STATE);
  const [dlState, dispatchDl] = useReducer(downloadReducer, INITIAL_DOWNLOAD_STATE);
  const [qualityState, dispatchQuality] = useReducer(qualityReducer, INITIAL_QUALITY_STATE);

  // ── Custom Player UI States ──────────────────────────────────────────────
  const [playbackQuality, setPlaybackQuality] = React.useState(null);
  const [showPlaybackQualityMenu, setShowPlaybackQualityMenu] = React.useState(false);
  const [currentSeason, setCurrentSeason] = React.useState(season || null);
  const [currentEpisode, setCurrentEpisode] = React.useState(episode || null);
  const [localTitle, setLocalTitle] = React.useState(title || '');
  const [localSeasons, setLocalSeasons] = React.useState(seasons || null);
  const [showSeasonSelector, setShowSeasonSelector] = React.useState(false);
  const [showEpisodeSelector, setShowEpisodeSelector] = React.useState(false);
  const [showAllEpisodesModal, setShowAllEpisodesModal] = React.useState(false);

  const [playbackStatus, setPlaybackStatus] = React.useState(null);
  const [controlsVisible, setControlsVisible] = React.useState(true);
  const [isLocked, setIsLocked] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isLandscape, setIsLandscape] = React.useState(false);
  const [isSeeking, setIsSeeking] = React.useState(false);
  const [seekPosition, setSeekPosition] = React.useState(0);
  const [showDownloadComplete, setShowDownloadComplete] = React.useState(false);

  // ── Refs (no re-render needed) ────────────────────────────────────────────
  const videoRef = useRef(null);
  const controlsTimerRef = useRef(null);
  const downloadRef = useRef(null);
  const resumeSnapshotRef = useRef(null);
  const lastTs = useRef(0);
  const lastBytes = useRef(0);
  const offlineTimerRef = useRef(null);
  const offlineAbortRef = useRef(null); // AbortController for google HEAD check
  // Ref to current downloading flag — avoids stale closure in backAction
  const downloadingRef = useRef(false);

  // Keep downloadingRef in sync with dlState
  downloadingRef.current = dlState.downloading;

  // ── Derived ───────────────────────────────────────────────────────────────
  const videoTitle = localTitle
    ? (currentSeason
      ? `${localTitle} - S${String(currentSeason).padStart(2, '0')}E${String(currentEpisode).padStart(2, '0')}`
      : localTitle)
    : 'Video';

  const isTvShow = !!currentSeason || (localSeasons && localSeasons.length > 0);
  const downloadBtnText = isTvShow ? `Download Episode ${currentEpisode || 1}` : "Download Movie";

  const episodesForSelectedSeason = React.useMemo(() => {
    if (!localSeasons || localSeasons.length === 0 || !currentSeason) return [];
    const sObj = localSeasons.find(s => String(s.se) === String(currentSeason));
    if (!sObj) return [];
    if (sObj.allEp && sObj.allEp.trim() !== '') {
      return sObj.allEp.split(',').map(v => v.trim()).filter(Boolean);
    }
    const total = sObj.ep || 1;
    const eps = [];
    for (let i = 1; i <= total; i++) eps.push(String(i));
    return eps;
  }, [localSeasons, currentSeason]);

  // ── Fetch Details for Deep Links ──────────────────────────────────────────
  useEffect(() => {
    if (!seasons || !title) {
      apiService.getMediaDetails(id).then(details => {
        setLocalTitle(details.title);
        if (details.type === 'TV Show') {
          setLocalSeasons(details.seasons);
          if (!currentSeason && details.seasons && details.seasons.length > 0) {
            setCurrentSeason(details.seasons[details.seasons.length - 1].se);
            setCurrentEpisode(1);
          }
        }
      }).catch(e => console.log('Error fetching deep link details:', e));
    }
  }, [id, seasons, title, currentSeason]);


  // ── Mount / Unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    // Unlock auto rotation only for this screen
    ScreenOrientation.unlockAsync().catch((err) => {
      console.warn('Could not unlock screen orientation:', err);
    });

    // backAction reads downloadingRef (not stale closure over dlState.downloading)
    const backAction = () => {
      if (downloadingRef.current) {
        Alert.alert(
          'Active Download',
          'Leaving will cancel the current download. Continue?',
          [
            { text: 'Stay', style: 'cancel' },
            {
              text: 'Cancel & Exit',
              style: 'destructive',
              onPress: () => { cancelDownload(); navigation.goBack(); }
            }
          ]
        );
        return true;
      }
      navigation.goBack();
      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => {
      sub.remove();
      clearOfflineTimer();
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
      if (downloadRef.current) {
        downloadRef.current.cancelAsync().catch(() => { });
      }
      // Restore system navigation bar visibility
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync('visible').catch(() => {});
      }
      // Re-lock orientation to portrait when leaving the screen
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch((err) => {
        console.warn('Could not lock screen orientation:', err);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toggle device virtual navigation buttons dynamically depending on fullscreen mode
  useEffect(() => {
    if (Platform.OS === 'android') {
      if (isFullscreen) {
        NavigationBar.setVisibilityAsync('hidden').catch(() => {});
        NavigationBar.setBehaviorAsync('immersive-sticky').catch(() => {});
      } else {
        NavigationBar.setVisibilityAsync('visible').catch(() => {});
      }
    }
  }, [isFullscreen]);

  // ─── Custom Control Helpers ────────────────────────────────────────────────
  const resetControlsTimer = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, 3500);
  }, []);

  const handleScreenTouch = useCallback(() => {
    setControlsVisible(prev => {
      const next = !prev;
      if (next) resetControlsTimer();
      return next;
    });
  }, [resetControlsTimer]);

  const togglePlay = useCallback(async () => {
    if (!videoRef.current || !playbackStatus) return;
    resetControlsTimer();
    if (playbackStatus.isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  }, [playbackStatus, resetControlsTimer]);

  const seekDelta = useCallback(async (delta) => {
    if (!videoRef.current || !playbackStatus) return;
    resetControlsTimer();
    const newPos = Math.max(0, Math.min(playbackStatus.positionMillis + delta, playbackStatus.durationMillis || 0));
    await videoRef.current.setStatusAsync({ positionMillis: newPos });
  }, [playbackStatus, resetControlsTimer]);

  const toggleRotate = useCallback(async () => {
    resetControlsTimer();
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
        setIsFullscreen(false);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
        setIsLandscape(true);
        setIsFullscreen(true);
      }
    } catch (err) {
      console.warn('Orientation change failed:', err);
    }
  }, [isLandscape, resetControlsTimer]);

  // Initial trigger for controls hide
  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    };
  }, [resetControlsTimer]);

  // ── Stream Loader ─────────────────────────────────────────────────────────
  const loadStream = useCallback(async () => {
    try {
      dispatchStream({ type: 'LOADING' });
      setPlaybackStatus(null);
      setPlaybackQuality(null);
      setSeekPosition(0);
      
      const sources = await apiService.getStreamSources(id, currentSeason, currentEpisode, activeLanguage);
      dispatchStream({ type: 'SUCCESS', sources });

      if (sources && sources.qualities && sources.qualities.length > 0) {
        const p480 = sources.qualities.find(q => q.quality.includes('480'));
        setPlaybackQuality(p480 || sources.qualities[0]);
      } else if (sources) {
        setPlaybackQuality({ quality: 'Auto', url: sources.videoUrl });
      }
    } catch (e) {
      console.error('[Player] stream error:', e);
      dispatchStream({ type: 'ERROR', error: 'Could not load stream. Please try again.' });
    }
  }, [id, currentSeason, currentEpisode, activeLanguage]);

  // ── Load stream on parameters change ──────────────────────────────────────
  useEffect(() => {
    loadStream();
  }, [loadStream]);

  // ── Quality Loader ────────────────────────────────────────────────────────
  const openDownloadModal = useCallback(async () => {
    dispatchQuality({ type: 'OPEN' });

    // 1. Use pre-fetched qualities from stream sources (instant & reliable)
    const src = streamState.sources;
    if (src && src.qualities && src.qualities.length > 0) {
      dispatchQuality({ type: 'LOADED', qualities: src.qualities, referer: src.referer || null });
      return;
    }

    // 2. Fetch from endpoint as backup
    try {
      const data = await apiService.getDownloadQualities(id, currentSeason || '', currentEpisode || '', activeLanguage);
      if (data.qualities && data.qualities.length > 0) {
        dispatchQuality({ type: 'LOADED', qualities: data.qualities, referer: data.referer || null });
        return;
      }
    } catch (e) {
      console.warn('[Player] API qualities fetch failed, trying fallback:', e.message);
    }

    // 3. Fallback to currently playing videoUrl
    if (src && src.videoUrl) {
      const qualityMatch = src.videoUrl.match(/(\d{3,4}p)/i);
      const qualityLabel = qualityMatch ? qualityMatch[1].toUpperCase() : '720P';
      dispatchQuality({
        type: 'LOADED',
        qualities: [{ quality: qualityLabel, size: 'Auto', url: src.videoUrl }],
        referer: src.referer || null,
      });
    } else {
      dispatchQuality({ type: 'ERROR', error: 'Could not fetch download options for this video.' });
    }
  }, [streamState.sources, id, currentSeason, currentEpisode, activeLanguage]);

  // ── Progress Callback Factory ─────────────────────────────────────────────
  const makeCallback = useCallback((estBytes) => (progressData) => {
    const written = progressData.totalBytesWritten || 0;
    const expected = progressData.totalBytesExpectedToWrite > 0
      ? progressData.totalBytesExpectedToWrite
      : estBytes;
    const prog = expected > 0 ? Math.min(written / expected, 1) : 0;

    const now = Date.now();
    const dt = (now - lastTs.current) / 1000;

    if (dt >= 0.8) {
      const db = written - lastBytes.current;
      const spd = db / dt / (1024 * 1024);
      lastTs.current = now;
      lastBytes.current = written;
      dispatchDl({
        type: 'PROGRESS',
        progress: prog,
        downloadedMB: +(written / (1024 * 1024)).toFixed(1),
        totalMB: +(expected / (1024 * 1024)).toFixed(1),
        speedMB: spd.toFixed(1),
        eta: spd > 0 ? formatEta((expected - written) / (spd * 1024 * 1024)) : '--',
      });
    } else {
      // Still update progress bar even if not updating speed stats
      dispatchDl({
        type: 'PROGRESS',
        progress: prog,
        downloadedMB: +(written / (1024 * 1024)).toFixed(1),
        totalMB: +(expected / (1024 * 1024)).toFixed(1),
      });
    }
  }, []);

  // ── Start Download ────────────────────────────────────────────────────────
  const startDownload = useCallback(async (quality) => {
    dispatchQuality({ type: 'CLOSE' });
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Storage permission is needed to save videos to your gallery.');
      return;
    }

    dispatchDl({ type: 'START', quality });

    const estBytes = parseSizeToBytes(quality.size);
    const ext = quality.url.split('?')[0].split('.').pop()?.split('/').pop() || 'mp4';
    const fileUri = `${FileSystem.documentDirectory}${sanitizeFilename(videoTitle)}_${quality.quality}.${ext}`;

    lastTs.current = Date.now();
    lastBytes.current = 0;

    const referer = qualityState.referer;
    const downloadHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (quality.url.includes('hakunaymatata.com')) {
      downloadHeaders['Referer'] = 'https://movieboxonline.net/';
    } else if (referer && referer.trim() !== '') {
      downloadHeaders['Referer'] = referer;
    } else if (referer === undefined) {
      downloadHeaders['Referer'] = 'https://fmoviesunblocked.net/';
    }

    downloadRef.current = FileSystem.createDownloadResumable(
      quality.url,
      fileUri,
      {
        headers: downloadHeaders
      },
      makeCallback(estBytes)
    );

    await runDownload(fileUri);
  }, [videoTitle, qualityState.referer, makeCallback]);

  // ── Core Download Runner ──────────────────────────────────────────────────
  const runDownload = useCallback(async (fileUri) => {
    try {
      const result = await downloadRef.current.downloadAsync();
      if (result && result.uri) {
        await MediaLibrary.saveToLibraryAsync(result.uri);
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        dispatchDl({ type: 'COMPLETE' });
        setShowDownloadComplete(true);
      }
    } catch (e) {
      console.warn('[Download] interrupted:', e.message);
      await handleInterruption(fileUri);
    }
  }, [videoTitle]);

  // ── Interruption Handler ──────────────────────────────────────────────────
  const handleInterruption = useCallback(async (fileUri) => {
    dispatchDl({ type: 'INTERRUPTED' });
    clearOfflineTimer();

    offlineTimerRef.current = setInterval(async () => {
      // Use AbortController so the fetch is cancelled if component unmounts
      const controller = new AbortController();
      offlineAbortRef.current = controller;
      try {
        const res = await fetch('https://www.google.com', {
          method: 'HEAD',
          signal: controller.signal,
        });
        if (res.ok || res.status < 500) {
          clearOfflineTimer();
          dispatchDl({ type: 'RESTORED' });
          const snap = resumeSnapshotRef.current;
          if (snap && fileUri) {
            downloadRef.current = new FileSystem.DownloadResumable(
              snap.url,
              snap.fileUri,
              snap.options,
              makeCallback(parseSizeToBytes(dlState.selectedQuality?.size || '0')),
              snap.resumeData
            );
            await runDownload(fileUri);
          }
        }
      } catch (_) { /* still offline or aborted */ }
    }, 4000);
  }, [makeCallback, dlState.selectedQuality]);

  const clearOfflineTimer = useCallback(() => {
    if (offlineTimerRef.current) {
      clearInterval(offlineTimerRef.current);
      offlineTimerRef.current = null;
    }
    // Abort any in-flight HEAD check
    if (offlineAbortRef.current) {
      offlineAbortRef.current.abort();
      offlineAbortRef.current = null;
    }
  }, []);

  // ── Pause ─────────────────────────────────────────────────────────────────
  const pauseDownload = useCallback(async () => {
    if (!downloadRef.current) return;
    try {
      const snapshot = await downloadRef.current.pauseAsync();
      resumeSnapshotRef.current = snapshot;
      dispatchDl({ type: 'PAUSE' });
    } catch (e) {
      console.error('[Download] pause error:', e);
    }
  }, []);

  // ── Resume ────────────────────────────────────────────────────────────────
  const resumeDownload = useCallback(async () => {
    const snap = resumeSnapshotRef.current;
    if (!snap) return;
    dispatchDl({ type: 'RESUME' });
    lastTs.current = Date.now();

    const estBytes = parseSizeToBytes(dlState.selectedQuality?.size || '0');
    downloadRef.current = new FileSystem.DownloadResumable(
      snap.url,
      snap.fileUri,
      snap.options,
      makeCallback(estBytes),
      snap.resumeData
    );
    await runDownload(snap.fileUri);
  }, [dlState.selectedQuality, makeCallback, runDownload]);

  // ── Cancel ────────────────────────────────────────────────────────────────
  const cancelDownload = useCallback(async () => {
    clearOfflineTimer();
    if (downloadRef.current) {
      try { await downloadRef.current.cancelAsync(); } catch (_) { }
    }
    downloadRef.current = null;
    resumeSnapshotRef.current = null;
    // Single dispatch — one re-render instead of 7
    dispatchDl({ type: 'CANCEL' });
  }, [clearOfflineTimer]);

  // ── Track layout coordinate details ─────────────────────────────────────────
  const trackLayoutRef = useRef({ x: 0, width: 1 });
  const handleTrackLayout = useCallback((e) => {
    // Measure absolute screen coordinates dynamically
    e.currentTarget.measure((x, y, width, height, pageX, pageY) => {
      trackLayoutRef.current = { x: pageX, width: width || 1 };
    });
  }, []);

  const handleTouchSeek = useCallback(async (e, isEnded = false) => {
    resetControlsTimer();
    const touchX = e.nativeEvent.pageX - trackLayoutRef.current.x;
    const width = trackLayoutRef.current.width;
    
    // Bind coordinates dynamically between 0 and track width
    const pct = Math.max(0, Math.min(touchX / width, 1));
    const durationVal = playbackStatus ? playbackStatus.durationMillis || 0 : 0;
    const targetPos = Math.round(pct * durationVal);

    if (isEnded) {
      setIsSeeking(false);
      if (videoRef.current) {
        await videoRef.current.setStatusAsync({ positionMillis: targetPos });
      }
    } else {
      setIsSeeking(true);
      setSeekPosition(targetPos);
    }
  }, [playbackStatus, resetControlsTimer]);

  // ── Render Guards ─────────────────────────────────────────────────────────

  if (streamState.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E50914" />
      </View>
    );
  }

  if (streamState.error || !streamState.sources) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{streamState.error || 'Stream error.'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { sources } = streamState;
  const { downloading, isPaused, offlinePaused, progress, downloadedMB, totalMB, speedMB, eta, selectedQuality } = dlState;
  const { visible: showQualityModal, loading: qualitiesLoading, qualities, error: qualityError } = qualityState;

  // ── Render Calculations ──────────────────────────────────────────────────
  const isPlaying = playbackStatus && playbackStatus.isPlaying;
  const isBuffering = playbackStatus && playbackStatus.isBuffering && !isPlaying;
  const position = isSeeking ? seekPosition : (playbackStatus ? playbackStatus.positionMillis : 0);
  const duration = playbackStatus ? playbackStatus.durationMillis || 0 : 0;
  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  // Sizing definitions depending on landscape/portrait mode
  const playBtnSizeStyle = isLandscape ? styles.hudPlayBtnLandscape : styles.hudPlayBtnPortrait;
  const ctrlBtnSizeStyle = isLandscape ? styles.hudCtrlBtnLandscape : styles.hudCtrlBtnPortrait;

  return (
    <View style={[styles.container, isFullscreen && styles.containerFullscreen]}>
      <StatusBar barStyle="light-content" backgroundColor="#050507" translucent={false} hidden={isFullscreen} />

      {/* ── Video Player Container ── */}
      <View style={[styles.videoContainer, isFullscreen && styles.videoContainerFullscreen]}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleScreenTouch}
          style={styles.videoTouchWrapper}
        >
          <Video
            key={playbackQuality ? playbackQuality.url : sources.videoUrl}
            ref={videoRef}
            source={{
              uri: playbackQuality ? playbackQuality.url : sources.videoUrl,
              headers: {
                ...(sources.videoUrl?.includes('hakunaymatata.com') || playbackQuality?.url.includes('hakunaymatata.com') 
                  ? { Referer: 'https://movieboxonline.net/' } 
                  : (sources.referer ? { Referer: sources.referer } : {})),
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
              }
            }}
            style={isFullscreen ? styles.videoFullscreen : styles.video}
            useNativeControls={false}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            progressUpdateIntervalMillis={500}
            bufferConfig={{
              maxBufferMs: 15000,
              minBufferMs: 1500,
              bufferForPlaybackMs: 800,
              bufferForPlaybackAfterRebufferMs: 1500
            }}
            onPlaybackStatusUpdate={(status) => {
              if (!isSeeking) setPlaybackStatus(status);
            }}
            onError={(err) => {
              console.error('[Player] video error:', err);
              // Report broken link to backend database
              const mediaType = currentSeason ? 'TV Show' : 'Movie';
              apiService.reportPlaybackError(id, title, mediaType, currentSeason || '', currentEpisode || '')
                .then(success => {
                  if (success) console.log(`[Player] Successfully reported broken media ID: ${id}`);
                });
              dispatchStream({ type: 'ERROR', error: 'Playback failed. The session may have expired.' });
            }}
          />

          {/* ── Buffering Indicator Overlay ── */}
          {isBuffering && !controlsVisible && (
            <View style={styles.bufferingOverlay}>
              <ActivityIndicator size="large" color="#E50914" />
            </View>
          )}



          {/* ── Custom HUD Controls Overlay ── */}
          {controlsVisible && (
            <View style={styles.hudOverlay}>
              
              {/* Lock Mode active (Accidental touch protection) */}
              {isLocked ? (
                <View style={styles.hudContainer}>
                  {/* Top Bar showing only the Lock Button at the top-right */}
                  <View style={[styles.hudTopBar, { justifyContent: 'flex-end' }]}>
                    <TouchableOpacity
                      style={styles.lockIconTopRight}
                      onPress={() => {
                        setIsLocked(false);
                        resetControlsTimer();
                      }}
                    >
                      <Ionicons name="lock-closed" size={22} color="#E50914" />
                    </TouchableOpacity>
                  </View>
                 
                </View>
              ) : (
                <View style={styles.hudContainer}>
                  
                  {/* Top Bar (Close/Back details + Lock button at top-right) */}
                  <View style={[styles.hudTopBar, { justifyContent: 'space-between' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <TouchableOpacity
                        style={styles.hudBackBtn}
                        onPress={() => {
                          if (downloading) {
                            Alert.alert('Active Download', 'Cancel the download and exit?', [
                              { text: 'Stay', style: 'cancel' },
                              { text: 'Cancel & Exit', style: 'destructive', onPress: () => { cancelDownload(); navigation.goBack(); } }
                            ]);
                          } else if (isFullscreen) {
                            toggleRotate();
                          } else {
                            navigation.goBack();
                          }
                        }}
                      >
                        <Ionicons name="chevron-back" size={26} color="#FFF" />
                      </TouchableOpacity>
                      <Text style={styles.hudTitle} numberOfLines={1}>
                        {videoTitle}
                      </Text>
                    </View>

                    {/* Lock Button at Top Right */}
                    <TouchableOpacity 
                      style={styles.lockIconTopRight} 
                      onPress={() => {
                        setIsLocked(true);
                        resetControlsTimer();
                      }}
                    >
                      <Ionicons name="lock-open-outline" size={22} color="#FFF" />
                    </TouchableOpacity>
                  </View>

                  {/* Center Controls (Seek backward, Play/Pause, Seek forward) */}
                  <View style={styles.hudCenterControls}>
                    <TouchableOpacity style={ctrlBtnSizeStyle} onPress={() => seekDelta(-10000)}>
                      <Ionicons name="play-back" size={isLandscape ? 26 : 22} color="#FFF" />
                      <Text style={styles.seekText}>-10s</Text>
                    </TouchableOpacity>

                    {(!playbackStatus || !playbackStatus.isLoaded) ? (
                      <View style={{ width: isLandscape ? 52 : 60, height: isLandscape ? 52 : 60, alignItems: 'center', justifyContent: 'center' }}>
                        <ActivityIndicator size="large" color="#E50914" />
                      </View>
                    ) : (
                      <TouchableOpacity style={playBtnSizeStyle} onPress={togglePlay}>
                        <Ionicons name={isPlaying ? "pause" : "play"} size={isLandscape ? 36 : 28} color="#FFF" />
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={ctrlBtnSizeStyle} onPress={() => seekDelta(10000)}>
                      <Ionicons name="play-forward" size={isLandscape ? 26 : 22} color="#FFF" />
                      <Text style={styles.seekText}>+10s</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Bottom Controls Bar (Timeline progress, duration, Fullscreen & Rotate) */}
                  <View style={styles.hudBottomBar}>
                    {/* Time progress indicators */}
                    <Text style={styles.timeLabel}>{formatTime(position)}</Text>
                    
                    {/* Draggable timeline touch hitbox wrapper */}
                    <View 
                      style={styles.hudTimelineContainer}
                      onLayout={handleTrackLayout}
                      onTouchStart={(e) => handleTouchSeek(e, false)}
                      onTouchMove={(e) => handleTouchSeek(e, false)}
                      onTouchEnd={(e) => handleTouchSeek(e, true)}
                    >
                      {/* Inner visual timeline progress track */}
                      <View style={styles.hudTimelineTrack}>
                        <View style={[styles.hudTimelineFill, { width: `${progressPercent}%` }]} />
                        {/* Timeline scrub thumb handle */}
                        <View 
                          pointerEvents="none"
                          style={[styles.hudTimelineThumb, { left: `${progressPercent}%` }]} 
                        />
                      </View>
                    </View>

                    <Text style={styles.timeLabel}>{formatTime(duration)}</Text>

                    {/* Action buttons (Fullscreen & Rotate) */}
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {/* Quality Selector */}
                      {sources && sources.qualities && sources.qualities.length > 0 && (
                        <View style={{ position: 'relative', justifyContent: 'center' }}>
                          <TouchableOpacity 
                            style={styles.qualitySelectorBtn}
                            onPress={() => setShowPlaybackQualityMenu(!showPlaybackQualityMenu)}
                          >
                            <Text style={styles.qualitySelectorText}>{playbackQuality?.quality || 'Auto'}</Text>
                            <MaterialIcons name="keyboard-arrow-down" size={16} color="#FFF" />
                          </TouchableOpacity>

                          {/* Dropdown Menu */}
                          {showPlaybackQualityMenu && (
                            <View style={styles.qualityDropdownMenu}>
                              {sources.qualities.map((q, i) => (
                                <TouchableOpacity 
                                  key={i}
                                  style={styles.qualityDropdownItem}
                                  onPress={() => {
                                    showAdIfReady(() => {
                                      setPlaybackStatus(null); // Instantly triggers the loading spinner
                                      setPlaybackQuality(q);
                                      setShowPlaybackQualityMenu(false);
                                      resetControlsTimer();
                                    }, 'PLAYER_ACTION');
                                  }}
                                >
                                  <Text style={[
                                    styles.qualityDropdownText,
                                    playbackQuality?.quality === q.quality && { color: '#E50914', fontWeight: 'bold' }
                                  ]}>
                                    {q.quality}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      )}

                      <TouchableOpacity style={styles.bottomActionBtn} onPress={toggleRotate}>
                        <MaterialIcons name="screen-rotation" size={18} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  </View>

                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Info + Download Panel (Hidden in Fullscreen Mode) ── */}
      {!isFullscreen && (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <Text style={styles.mediaTitle} numberOfLines={2}>{videoTitle}</Text>
          <Text style={styles.langLabel}>
            Audio: <Text style={styles.langValue}>{activeLanguage}</Text>
          </Text>

          {downloading ? (
            <View style={styles.dlInlineCard}>
              <TouchableOpacity
                style={styles.dlInlineIconBtn}
                onPress={!isPaused && !offlinePaused ? pauseDownload : resumeDownload}
                disabled={offlinePaused}
              >
                <Ionicons name={!isPaused && !offlinePaused ? "pause" : "play"} size={22} color="#FFF" />
              </TouchableOpacity>
              
              <View style={styles.dlInlineProgressWrapper}>
                <View style={styles.dlInlineTrack}>
                  <View style={[styles.dlInlineFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={styles.dlInlineStats}>
                  {offlinePaused ? 'Waiting for connection...' : `${Math.round(progress * 100)}% • ${downloadedMB} MB / ${totalMB} MB`}
                </Text>
              </View>

              <TouchableOpacity style={styles.dlInlineIconBtn} onPress={cancelDownload}>
                <Ionicons name="close" size={24} color="#EF4444" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              id="download-button"
              style={styles.dlBtn}
              onPress={() => showAdIfReady(() => openDownloadModal())}
              activeOpacity={0.8}
            >
              <Text style={styles.dlBtnText}>{downloadBtnText}</Text>
            </TouchableOpacity>
          )}

          {/* Season and Episode Pickers */}
          {isTvShow && localSeasons && localSeasons.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.pickerBtn, { marginBottom: 16 }]}
                onPress={() => setShowSeasonSelector(true)}
              >
                <Text style={styles.pickerBtnText}>Season {String(currentSeason).padStart(2, '0')}</Text>
                <Ionicons name="chevron-down" size={16} color="#FFF" />
              </TouchableOpacity>
              
              <Text style={{ color: '#9CA3AF', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 10 }}>Episodes</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.episodeScrollRow}
              >
                <TouchableOpacity
                  style={[styles.episodeSquare, { backgroundColor: '#E50914' }]}
                  activeOpacity={0.7}
                  onPress={() => setShowAllEpisodesModal(true)}
                >
                  <Text style={[styles.episodeSquareText, { color: '#ffffff' }]}>All</Text>
                </TouchableOpacity>
                {episodesForSelectedSeason.map((epNum) => (
                  <TouchableOpacity
                    key={epNum}
                    style={[
                      styles.episodeSquare, 
                      String(currentEpisode) === String(epNum) && { borderColor: '#E50914', backgroundColor: 'rgba(229, 9, 20, 0.1)' }
                    ]}
                    activeOpacity={0.7}
                    onPress={() => showAdIfReady(() => setCurrentEpisode(epNum), 'PLAYER_ACTION')}
                  >
                    <Text style={[styles.episodeSquareText, String(currentEpisode) === String(epNum) && { color: '#E50914' }]}>
                      {String(epNum).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Quality Selection Modal ── */}
      <Modal
        visible={showQualityModal}
        transparent
        animationType="fade"
        onRequestClose={() => dispatchQuality({ type: 'CLOSE' })}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Download Quality</Text>
            <Text style={styles.modalSub} numberOfLines={1}>{videoTitle}</Text>

            {qualitiesLoading && (
              <View style={styles.modalLoading}>
                <ActivityIndicator color="#E50914" />
                <Text style={styles.modalLoadingText}>Fetching available qualities…</Text>
              </View>
            )}

            {qualityError && !qualitiesLoading && (
              <Text style={styles.qualityError}>{qualityError}</Text>
            )}

            {!qualitiesLoading && !qualityError && qualities.map((q) => (
              <TouchableOpacity
                key={q.quality}
                id={`quality-option-${q.quality}`}
                style={styles.qualityRow}
                activeOpacity={0.7}
                onPress={() => startDownload(q)}
              >
                <Text style={styles.qualityLabel}>{q.quality}</Text>
                <Text style={styles.qualitySize}>{q.size}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              id="close-quality-modal"
              style={styles.cancelRow}
              onPress={() => dispatchQuality({ type: 'CLOSE' })}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Season Selection Modal ── */}
      <Modal
        visible={showSeasonSelector}
        transparent
        animationType="none"
        onRequestClose={() => setShowSeasonSelector(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Select Season</Text>
            <ScrollView style={{ maxHeight: 250, marginTop: 12 }}>
              {localSeasons && localSeasons.map((sItem) => (
                <TouchableOpacity
                  key={sItem.se}
                  style={styles.qualityRow}
                  onPress={() => {
                    setCurrentSeason(sItem.se);
                    // Default to episode 1 when changing seasons
                    setCurrentEpisode("1");
                    setShowSeasonSelector(false);
                  }}
                >
                  <Text style={[styles.qualityLabel, currentSeason === sItem.se && { color: '#E50914' }]}>
                    Season {String(sItem.se).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.cancelRow} onPress={() => setShowSeasonSelector(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>



      {/* ── Download Complete Modal ── */}
      <Modal
        visible={showDownloadComplete}
        transparent
        animationType="none"
        onRequestClose={() => setShowDownloadComplete(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.successModal}>
            <Ionicons name="checkmark-circle" size={50} color="#10B981" style={{ marginBottom: 12 }} />
            <Text style={styles.successTitle}>Download Complete</Text>
            <Text style={styles.successMessage}>
              <Text style={{ fontWeight: '700', color: '#FFF' }}>"{videoTitle}"</Text> saved to gallery.
            </Text>
            <TouchableOpacity 
              style={styles.successBtn} 
              activeOpacity={0.8}
              onPress={() => setShowDownloadComplete(false)}
            >
              <Text style={styles.successBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── All Episodes Modal ── */}
      <Modal
        visible={showAllEpisodesModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => setShowAllEpisodesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>All Episodes</Text>
              <TouchableOpacity onPress={() => setShowAllEpisodesModal(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.allEpisodesGrid}>
              {episodesForSelectedSeason.map((epNum) => (
                <TouchableOpacity
                  key={epNum}
                  style={[
                    styles.episodeSquare,
                    { width: gridItemWidth, height: gridItemWidth },
                    String(currentEpisode) === String(epNum) && { borderColor: '#E50914', backgroundColor: 'rgba(229, 9, 20, 0.1)' }
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setShowAllEpisodesModal(false);
                    showAdIfReady(() => setCurrentEpisode(epNum), 'PLAYER_ACTION');
                  }}
                >
                  <Text style={[styles.episodeSquareText, String(currentEpisode) === String(epNum) && { color: '#E50914' }]}>
                    {String(epNum).padStart(2, '0')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050507' },
  containerFullscreen: { backgroundColor: '#000' },
  videoContainer: {
    width: '100%',
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
    position: 'relative',
    zIndex: 10,
  },
  videoContainerFullscreen: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  videoTouchWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: { width: '100%', height: '100%' },
  videoFullscreen: { width: '100%', height: '100%' },
  bufferingOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  hudOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    zIndex: 20,
  },
  hudContainer: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 16,
  },
  lockHUDWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockIconBtn: {
    padding: 18,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  lockText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 6,
  },
  hudTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  hudBackBtn: {
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 50,
    marginRight: 12,
  },
  lockIconTopRight: {
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 50,
  },
  hudTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  hudCenterControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
  },
  hudControlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 60,
  },
  hudPlayBtnPortrait: {
    backgroundColor: 'rgba(229, 9, 20, 0.85)',
    borderRadius: 30,
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  hudPlayBtnLandscape: {
    backgroundColor: 'rgba(229, 9, 20, 0.85)',
    borderRadius: 26,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  hudCtrlBtnPortrait: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
  },
  hudCtrlBtnLandscape: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 42,
  },
  seekText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 2,
  },
  hudBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
  },
  timeLabel: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  hudTimelineContainer: {
    flex: 1,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  hudTimelineTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    position: 'relative',
    width: '100%',
  },
  hudTimelineFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
  hudTimelineThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E50914',
    top: -5,
    marginLeft: -7,
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 3,
  },
  bottomActionBtn: {
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  center: {
    flex: 1,
    backgroundColor: '#050507',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  qualitySelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  qualitySelectorText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    marginRight: 2,
  },
  qualityDropdownMenu: {
    position: 'absolute',
    bottom: 35,
    left: 0,
    backgroundColor: 'rgba(20,20,25,0.95)',
    borderRadius: 8,
    paddingVertical: 4,
    minWidth: 70,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  qualityDropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  qualityDropdownText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '500',
  },
  statusText: { color: '#9CA3AF', marginTop: 12, fontSize: 14 },
  errorText: {
    color: '#EF4444', fontSize: 16, textAlign: 'center',
    marginBottom: 20, lineHeight: 22,
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8,
  },
  backBtnText: { color: '#FFF', fontWeight: 'bold' },
  closeBtn: {
    position: 'absolute', top: 24, left: 20,
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)', zIndex: 20,
  },
  closeBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  panel: {
    flex: 1, backgroundColor: '#0F0F14',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: 20,
  },
  panelContent: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 40 },
  mediaTitle: { fontSize: 18, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  langLabel: { fontSize: 13, color: '#6B7280', marginBottom: 24 },
  langValue: { color: '#E50914', fontWeight: '700' },
  dlBtn: {
    backgroundColor: '#E50914',
    paddingVertical: 16, borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  dlBtnDisabled: { backgroundColor: '#374151', shadowOpacity: 0, elevation: 0 },
  dlBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  pickerBtn: {
    flex: 0,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A22',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pickerBtnText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '600',
    marginRight: 6,
  },
  episodeScrollRow: {
    flexDirection: 'row',
    paddingRight: 16,
    gap: 10,
  },
  episodeWrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  episodeSquare: {
    width: 46,
    height: 46,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  episodeSquareText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center', alignItems: 'center',
  },
  modal: {
    width: '86%', backgroundColor: '#1A1A22',
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  modalTitle: {
    fontSize: 19, fontWeight: '800', color: '#FFF',
    textAlign: 'center', marginBottom: 4,
  },
  modalSub: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
  modalLoading: { alignItems: 'center', paddingVertical: 20 },
  modalLoadingText: { color: '#9CA3AF', marginTop: 8, fontSize: 13 },
  qualityError: { color: '#EF4444', textAlign: 'center', fontSize: 13, paddingVertical: 16 },
  qualityRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: 12, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  qualityLabel: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  qualitySize: { color: '#A855F7', fontWeight: '700', fontSize: 13 },
  cancelRow: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  cancelText: { color: '#6B7280', fontWeight: '600', fontSize: 14 },
  dlInlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 16,
    marginHorizontal: 4,
  },
  dlInlineIconBtn: {
    padding: 8,
  },
  dlInlineProgressWrapper: {
    flex: 1,
    marginHorizontal: 12,
    justifyContent: 'center',
  },
  dlInlineTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  dlInlineFill: {
    height: '100%',
    backgroundColor: '#E50914',
    borderRadius: 3,
  },
  dlInlineStats: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  fullscreenAdOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99,
  },
  fullscreenAdCard: {
    backgroundColor: '#0F0F13',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  adTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  adResumeBtn: {
    backgroundColor: '#E50914',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 14,
    width: '100%',
    alignItems: 'center',
  },
  adResumeBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  successModal: {
    width: '75%', 
    backgroundColor: '#0F0F13',
    borderRadius: 16, 
    padding: 24,
    borderWidth: 1, 
    borderColor: 'rgba(229, 9, 20, 0.3)',
    alignItems: 'center', 
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, 
    shadowRadius: 16, 
    elevation: 10,
  },
  successTitle: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: '#FFF', 
    marginBottom: 6, 
    textAlign: 'center' 
  },
  successMessage: { 
    fontSize: 13, 
    color: '#9CA3AF', 
    textAlign: 'center', 
    marginBottom: 20, 
    lineHeight: 18 
  },
  successBtn: {
    backgroundColor: '#E50914', 
    borderRadius: 8, 
    paddingVertical: 10, 
    width: '100%', 
    alignItems: 'center'
  },
  successBtnText: { 
    color: '#FFF', 
    fontSize: 14, 
    fontWeight: '700', 
    textTransform: 'uppercase', 
    letterSpacing: 0.5 
  },
  allEpisodesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
    paddingBottom: 40,
  },
  modalContent: {
    backgroundColor: '#121212',
    height: '60%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Outfit_700Bold',
  }
});
