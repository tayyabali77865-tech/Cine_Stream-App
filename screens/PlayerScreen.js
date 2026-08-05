import React, { useEffect, useRef, useCallback, useReducer } from 'react';
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
import { AdBanner300x250, SmartLinkAdModal } from '../components/AdBanner';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as NavigationBar from 'expo-navigation-bar';

// ─── Screen Dimensions ────────────────────────────────────────────────────────

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');
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
  const { id, title, season, episode, defaultLanguage } = route.params;

  const activeLanguage = defaultLanguage || 'Hindi';

  // ── Reducers replace multiple useState calls ──────────────────────────────
  const [streamState, dispatchStream] = useReducer(streamReducer, INITIAL_STREAM_STATE);
  const [dlState, dispatchDl] = useReducer(downloadReducer, INITIAL_DOWNLOAD_STATE);
  const [qualityState, dispatchQuality] = useReducer(qualityReducer, INITIAL_QUALITY_STATE);

  // ── Custom Player UI States ──────────────────────────────────────────────
  const [playbackStatus, setPlaybackStatus] = React.useState(null);
  const [controlsVisible, setControlsVisible] = React.useState(true);
  const [isLocked, setIsLocked] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isLandscape, setIsLandscape] = React.useState(false);
  const [isSeeking, setIsSeeking] = React.useState(false);
  const [seekPosition, setSeekPosition] = React.useState(0);
  const [adVisible, setAdVisible] = React.useState(false);
  const [adUrl, setAdUrl] = React.useState("https://omg10.com/4/11503019");

  const handleAdClose = useCallback(() => {
    setAdVisible(false);
  }, []);

  React.useEffect(() => {
    setAdUrl("https://omg10.com/4/11503019");
    const timer = setTimeout(() => {
      setAdVisible(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

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
  const videoTitle = title
    ? (season
      ? `${title} - S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
      : title)
    : 'Video';

  // ── Load stream on parameters change ──────────────────────────────────────
  useEffect(() => {
    loadStream();
  }, [loadStream]);

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

  const toggleFullscreen = useCallback(() => {
    resetControlsTimer();
    setIsFullscreen(prev => !prev);
  }, [resetControlsTimer]);

  const toggleRotate = useCallback(async () => {
    resetControlsTimer();
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsLandscape(false);
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
        setIsLandscape(true);
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
      const sources = await apiService.getStreamSources(id, season, episode, activeLanguage);
      dispatchStream({ type: 'SUCCESS', sources });
    } catch (e) {
      console.error('[Player] stream error:', e);
      dispatchStream({ type: 'ERROR', error: 'Could not load stream. Please try again.' });
    }
  }, [id, season, episode, activeLanguage]);

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
      const data = await apiService.getDownloadQualities(id, season || '', episode || '', activeLanguage);
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
  }, [streamState.sources, id, season, episode, activeLanguage]);

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
    setAdUrl("https://omg10.com/4/11503004");
    setAdVisible(true);

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
    if (referer && referer.trim() !== '') {
      downloadHeaders['Referer'] = referer;
    } else if (referer === undefined) {
      downloadHeaders['Referer'] = 'https://netmirror.global/';
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
  }, [videoTitle, qualityState.referer, makeCallback, setAdUrl, setAdVisible]);

  // ── Core Download Runner ──────────────────────────────────────────────────
  const runDownload = useCallback(async (fileUri) => {
    try {
      const result = await downloadRef.current.downloadAsync();
      if (result && result.uri) {
        await MediaLibrary.saveToLibraryAsync(result.uri);
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        dispatchDl({ type: 'COMPLETE' });
        Alert.alert('✅ Download Complete', `"${videoTitle}" saved to your gallery!`);
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
        <Text style={styles.statusText}>Loading stream…</Text>
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
            ref={videoRef}
            source={{
              uri: sources.videoUrl,
              headers: {
                ...(sources.referer ? { Referer: sources.referer } : {}),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              }
            }}
            style={isFullscreen ? styles.videoFullscreen : styles.video}
            useNativeControls={false} // Disable standard system overlay controls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            bufferConfig={{
              maxBufferMs: 30000,
              minBufferMs: 2500,
              bufferForPlaybackMs: 1200,
              bufferForPlaybackAfterRebufferMs: 2000
            }}
            onPlaybackStatusUpdate={(status) => {
              if (!isSeeking) setPlaybackStatus(status);
            }}
            onError={(err) => {
              console.error('[Player] video error:', err);
              // Report broken link to backend database
              const mediaType = season ? 'TV Show' : 'Movie';
              apiService.reportPlaybackError(id, title, mediaType, season || '', episode || '')
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

                    {(!playbackStatus || !playbackStatus.isLoaded || isBuffering) ? (
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
                    <TouchableOpacity style={styles.bottomActionBtn} onPress={toggleFullscreen}>
                      <Ionicons name={isFullscreen ? "contract" : "expand"} size={18} color="#FFF" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.bottomActionBtn} onPress={toggleRotate}>
                      <MaterialIcons name="screen-rotation" size={18} color="#FFF" />
                    </TouchableOpacity>
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

          <TouchableOpacity
            id="download-button"
            style={[styles.dlBtn, downloading && styles.dlBtnDisabled]}
            onPress={openDownloadModal}
            disabled={downloading}
            activeOpacity={0.8}
          >
            <Text style={styles.dlBtnText}>⬇  Download Video</Text>
          </TouchableOpacity>
          <AdBanner300x250 />
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
                // Use quality string as key — more stable than array index
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

      {/* ── Download Progress Card ── */}
      {downloading && (
        <View style={styles.progressContainer}>
          <View style={styles.progressCard}>
            <Text style={styles.progressTitle} numberOfLines={1}>{videoTitle}</Text>
            <Text style={styles.progressQuality}>{selectedQuality?.quality} · {selectedQuality?.size}</Text>

            {/* Progress Bar */}
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <Text style={styles.statsText}>
                {Math.round(progress * 100)}%  ·  {downloadedMB} MB / {totalMB} MB
              </Text>
              <Text style={styles.statsText}>{speedMB} MB/s</Text>
            </View>
            <Text style={styles.etaText}>
              {offlinePaused
                ? '⚠️  No connection — auto-resuming when restored…'
                : isPaused
                  ? 'Paused'
                  : `ETA: ${eta}`}
            </Text>

            {/* Controls */}
            <View style={styles.controls}>
              {!isPaused && !offlinePaused ? (
                <TouchableOpacity id="pause-download" style={styles.ctrlBtn} onPress={pauseDownload}>
                  <Text style={styles.ctrlText}>Pause</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  id="resume-download"
                  style={[styles.ctrlBtn, styles.resumeBtn]}
                  onPress={resumeDownload}
                  disabled={offlinePaused}
                >
                  <Text style={styles.ctrlText}>Resume</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity id="cancel-download" style={[styles.ctrlBtn, styles.cancelBtn]} onPress={cancelDownload}>
                <Text style={styles.ctrlText}>✕  Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <SmartLinkAdModal
        visible={adVisible}
        onClose={handleAdClose}
        adUrl={adUrl}
      />
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
  mediaTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', marginBottom: 6 },
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
  progressContainer: {
    position: 'absolute', bottom: 20, left: 0, right: 0,
    backgroundColor: 'rgba(5,5,7,0.9)',
    paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  progressCard: {
    backgroundColor: '#13131A', borderRadius: 16,
    padding: 16, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    elevation: 8, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 6,
  },
  progressTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', marginBottom: 2 },
  progressQuality: { fontSize: 12, color: '#A855F7', fontWeight: '600', marginBottom: 12 },
  barTrack: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3, overflow: 'hidden', marginBottom: 8,
  },
  barFill: { height: '100%', backgroundColor: '#E50914', borderRadius: 3 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  statsText: { color: '#E5E7EB', fontSize: 12, fontWeight: '500' },
  etaText: { color: '#9CA3AF', fontSize: 11, marginBottom: 14 },
  controls: { flexDirection: 'row', gap: 8 },
  ctrlBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.07)',
    paddingVertical: 11, borderRadius: 10, alignItems: 'center',
  },
  resumeBtn: { backgroundColor: '#16A34A' },
  cancelBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)',
  },
  ctrlText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
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
});
