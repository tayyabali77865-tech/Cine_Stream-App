import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  Dimensions
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { apiService } from '../services/apiService';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

// ─── screen dimensions ───────────────────────────────────────────────────────

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const VIDEO_HEIGHT = Math.round(SCREEN_HEIGHT * 0.40); // 40% of screen height

// ─── helpers ────────────────────────────────────────────────────────────────

const sanitizeFilename = (str) => str.replace(/[^a-zA-Z0-9_\-\.]/g, '_').substring(0, 80);

const formatEta = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s < 10 ? '0' : ''}${s}s`;
};

// ────────────────────────────────────────────────────────────────────────────

export default function PlayerScreen({ route, navigation }) {
  const { id, title, season, episode, defaultLanguage } = route.params;

  // ── stream state ──
  const [streamSources, setStreamSources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeLanguage] = useState(defaultLanguage || 'Hindi');

  // ── download UI state ──
  const [showQualityModal, setShowQualityModal] = useState(false);
  const [qualitiesLoading, setQualitiesLoading] = useState(false);
  const [qualities, setQualities] = useState([]);   // [{quality, size, url}]
  const [qualityError, setQualityError] = useState(null);

  // ── active download state ──
  const [downloading, setDownloading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [offlinePaused, setOfflinePaused] = useState(false);
  const [progress, setProgress] = useState(0);          // 0–1
  const [downloadedMB, setDownloadedMB] = useState(0);
  const [totalMB, setTotalMB] = useState(0);
  const [speedMB, setSpeedMB] = useState('0.0');
  const [eta, setEta] = useState('--');
  const [selectedQuality, setSelectedQuality] = useState(null); // {quality, size, url}
  const [downloadReferer, setDownloadReferer] = useState(null);

  // ── refs (no re-render needed) ──
  const downloadRef = useRef(null);        // FileSystem.DownloadResumable
  const resumeSnapshotRef = useRef(null);  // saved from pauseAsync()
  const lastTs = useRef(0);
  const lastBytes = useRef(0);
  const offlineTimerRef = useRef(null);

  // ── derived ──
  const videoTitle = title
    ? (season
      ? `${title} - S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
      : title)
    : 'Video';

  // ── mount / unmount ──────────────────────────────────────────────────────
  useEffect(() => {
    loadStream();

    const backAction = () => {
      if (downloading) {
        Alert.alert(
          'Active Download',
          'Leaving will cancel the current download. Continue?',
          [
            { text: 'Stay', style: 'cancel' },
            { text: 'Cancel & Exit', style: 'destructive', onPress: () => { cancelDownload(); navigation.goBack(); } }
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
      if (downloadRef.current) {
        downloadRef.current.cancelAsync().catch(() => {});
      }
    };
  }, []);

  // ── stream loader ────────────────────────────────────────────────────────
  const loadStream = async () => {
    try {
      setLoading(true);
      setError(null);
      const sources = await apiService.getStreamSources(id, season, episode, activeLanguage);
      setStreamSources(sources);
    } catch (e) {
      console.error('[Player] stream error:', e);
      setError('Could not load stream. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── quality loader ───────────────────────────────────────────────────────
  const openDownloadModal = async () => {
    setShowQualityModal(true);
    setQualitiesLoading(true);
    setQualityError(null);
    setQualities([]);

    // 1. Try pre-fetched qualities from stream sources load (instant & reliable)
    if (streamSources && streamSources.qualities && streamSources.qualities.length > 0) {
      console.log('[Player] using pre-resolved download qualities');
      setQualities(streamSources.qualities);
      setDownloadReferer(streamSources.referer || null);
      setQualitiesLoading(false);
      return;
    }

    // 2. Fetch from endpoint as backup
    try {
      const data = await apiService.getDownloadQualities(id, season || '', episode || '', activeLanguage);
      if (data.qualities && data.qualities.length > 0) {
        setQualities(data.qualities);
        setDownloadReferer(data.referer || null);
        setQualitiesLoading(false);
        return;
      }
    } catch (e) {
      console.warn('[Player] API qualities fetch failed, trying fallback:', e.message);
    }

    // 3. Ultimate Fallback: use currently playing videoUrl
    if (streamSources && streamSources.videoUrl) {
      console.log('[Player] falling back to active streaming video URL');
      const qualityMatch = streamSources.videoUrl.match(/(\d{3,4}p)/i);
      const qualityLabel = qualityMatch ? qualityMatch[1].toUpperCase() : '720P';
      setQualities([{
        quality: qualityLabel,
        size: 'Auto',
        url: streamSources.videoUrl
      }]);
      setDownloadReferer(streamSources.referer || null);
    } else {
      setQualityError('Could not fetch download options for this video.');
    }
    setQualitiesLoading(false);
  };

  // ── progress callback factory ────────────────────────────────────────────
  const makeCallback = (estBytes) => (progressData) => {
    const written = progressData.totalBytesWritten || 0;
    const expected = progressData.totalBytesExpectedToWrite > 0
      ? progressData.totalBytesExpectedToWrite
      : estBytes;

    const prog = expected > 0 ? Math.min(written / expected, 1) : 0;
    setProgress(prog);
    setDownloadedMB(+(written / (1024 * 1024)).toFixed(1));
    setTotalMB(+(expected / (1024 * 1024)).toFixed(1));

    const now = Date.now();
    const dt = (now - lastTs.current) / 1000;
    if (dt >= 0.8) {
      const db = written - lastBytes.current;
      const spd = db / dt / (1024 * 1024);
      setSpeedMB(spd.toFixed(1));
      if (spd > 0) setEta(formatEta((expected - written) / (spd * 1024 * 1024)));
      lastTs.current = now;
      lastBytes.current = written;
    }
  };

  // ── start download ───────────────────────────────────────────────────────
  const startDownload = async (quality) => {
    setShowQualityModal(false);

    // Request permission FIRST
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Storage permission is needed to save videos to your gallery.');
      return;
    }

    setSelectedQuality(quality);
    setDownloading(true);
    setIsPaused(false);
    setOfflinePaused(false);
    setProgress(0);
    setDownloadedMB(0);
    setTotalMB(0);
    setSpeedMB('0.0');
    setEta('--');
    resumeSnapshotRef.current = null;

    // Estimate bytes from size string (e.g. "764.2 MB", "1.2 GB")
    const estBytes = parseSizeToBytes(quality.size);

    const ext = quality.url.split('?')[0].split('.').pop()?.split('/').pop() || 'mp4';
    const fileUri = `${FileSystem.documentDirectory}${sanitizeFilename(videoTitle)}_${quality.quality}.${ext}`;

    lastTs.current = Date.now();
    lastBytes.current = 0;

    const cb = makeCallback(estBytes);

    const referer = downloadReferer || 'https://netmirror.global/';
    downloadRef.current = FileSystem.createDownloadResumable(
      quality.url,
      fileUri,
      {
        headers: {
          Referer: referer,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
      },
      cb
    );

    await runDownload(fileUri);
  };

  // ── core download runner (called by start + resume) ──────────────────────
  const runDownload = async (fileUri) => {
    try {
      const result = await downloadRef.current.downloadAsync();
      if (result && result.uri) {
        await MediaLibrary.saveToLibraryAsync(result.uri);
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        setDownloading(false);
        setProgress(1);
        Alert.alert('✅ Download Complete', `"${videoTitle}" saved to your gallery!`);
      }
    } catch (e) {
      // Network may have dropped — save resume snapshot and poll
      console.warn('[Download] interrupted:', e.message);
      await handleInterruption(fileUri);
    }
  };

  // ── interruption handler ─────────────────────────────────────────────────
  const handleInterruption = async (fileUri) => {
    setOfflinePaused(true);
    setSpeedMB('0.0');
    setEta('Waiting for network...');
    clearOfflineTimer();

    offlineTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch('https://www.google.com', { method: 'HEAD' });
        if (res.ok || res.status < 500) {
          clearOfflineTimer();
          setOfflinePaused(false);
          // Rebuild resumable from saved snapshot
          const snap = resumeSnapshotRef.current;
          if (snap && fileUri) {
            downloadRef.current = new FileSystem.DownloadResumable(
              snap.url,
              snap.fileUri,
              snap.options,
              makeCallback(parseSizeToBytes(selectedQuality?.size || '0')),
              snap.resumeData
            );
            await runDownload(fileUri);
          }
        }
      } catch (_) { /* still offline */ }
    }, 4000);
  };

  const clearOfflineTimer = () => {
    if (offlineTimerRef.current) {
      clearInterval(offlineTimerRef.current);
      offlineTimerRef.current = null;
    }
  };

  // ── pause ────────────────────────────────────────────────────────────────
  const pauseDownload = async () => {
    if (!downloadRef.current) return;
    try {
      // pauseAsync() returns the resumable snapshot; store it
      const snapshot = await downloadRef.current.pauseAsync();
      resumeSnapshotRef.current = snapshot;
      setIsPaused(true);
      setSpeedMB('0.0');
      setEta('Paused');
    } catch (e) {
      console.error('[Download] pause error:', e);
    }
  };

  // ── resume ───────────────────────────────────────────────────────────────
  const resumeDownload = async () => {
    const snap = resumeSnapshotRef.current;
    if (!snap) return;
    setIsPaused(false);
    setOfflinePaused(false);
    lastTs.current = Date.now();

    const estBytes = parseSizeToBytes(selectedQuality?.size || '0');
    downloadRef.current = new FileSystem.DownloadResumable(
      snap.url,
      snap.fileUri,
      snap.options,
      makeCallback(estBytes),
      snap.resumeData
    );
    await runDownload(snap.fileUri);
  };

  // ── cancel ───────────────────────────────────────────────────────────────
  const cancelDownload = async () => {
    clearOfflineTimer();
    if (downloadRef.current) {
      try { await downloadRef.current.cancelAsync(); } catch (_) {}
    }
    downloadRef.current = null;
    resumeSnapshotRef.current = null;
    setDownloading(false);
    setIsPaused(false);
    setOfflinePaused(false);
    setProgress(0);
    setSelectedQuality(null);
    setDownloadedMB(0);
    setTotalMB(0);
    setSpeedMB('0.0');
    setEta('--');
  };

  // ── utility: parse size string → bytes ───────────────────────────────────
  const parseSizeToBytes = (sizeStr = '') => {
    const m = sizeStr.match(/([\d.]+)\s*(GB|MB|KB)/i);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const u = m[2].toUpperCase();
    if (u === 'GB') return n * 1024 * 1024 * 1024;
    if (u === 'MB') return n * 1024 * 1024;
    if (u === 'KB') return n * 1024;
    return 0;
  };

  // ── render guards ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#E50914" />
        <Text style={styles.statusText}>Loading stream…</Text>
      </View>
    );
  }

  if (error || !streamSources) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Stream error.'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* ── Video Player ── */}
      <Video
        source={{
          uri: streamSources.videoUrl,
          headers: {
            Referer: streamSources.referer,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        }}
        style={styles.video}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        onError={(err) => {
          console.error('[Player] video error:', err);
          setError('Playback failed. The session may have expired.');
        }}
      />

      {/* ── Info + Download Panel ── */}
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
      </ScrollView>

      {/* ── Close Button ── */}
      <TouchableOpacity
        id="close-player-button"
        style={styles.closeBtn}
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
        activeOpacity={0.7}
      >
        <Text style={styles.closeBtnText}>✕  Close</Text>
      </TouchableOpacity>

      {/* ── Quality Selection Modal ── */}
      <Modal
        visible={showQualityModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowQualityModal(false)}
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

            {!qualitiesLoading && !qualityError && qualities.map((q, i) => (
              <TouchableOpacity
                key={i}
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
              onPress={() => setShowQualityModal(false)}
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

            {/* Bar */}
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
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050507' },

  video: { width: '100%', height: VIDEO_HEIGHT },

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

  mediaTitle: {
    fontSize: 20, fontWeight: '800', color: '#FFF', marginBottom: 6,
  },
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

  // Modal
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
  modalSub: {
    fontSize: 12, color: '#6B7280',
    textAlign: 'center', marginBottom: 20,
  },
  modalLoading: { alignItems: 'center', paddingVertical: 20 },
  modalLoadingText: { color: '#9CA3AF', marginTop: 8, fontSize: 13 },
  qualityError: {
    color: '#EF4444', textAlign: 'center',
    fontSize: 13, paddingVertical: 16,
  },
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

  // Progress
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
});
