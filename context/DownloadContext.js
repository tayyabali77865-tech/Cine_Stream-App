import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import * as FileSystem from 'expo-file-system';
import { ToastAndroid } from 'react-native';
import notifee, { AndroidImportance } from '@notifee/react-native';

const DownloadContext = createContext(null);

export function useDownloadContext() {
  return useContext(DownloadContext);
}

export function DownloadProvider({ children }) {
  const [activeDownloads, setActiveDownloads] = useState([]);
  const downloadStatsRef = useRef({});

  useEffect(() => {
    async function setupNotifee() {
      await notifee.requestPermission();
      await notifee.createChannel({
        id: 'downloads',
        name: 'Download Progress',
        vibration: false,
        importance: AndroidImportance.LOW, // Low importance so it doesn't pop-up heads-up repeatedly
      });
    }
    setupNotifee();
  }, []);

  const formatTime = (seconds) => {
    if (!isFinite(seconds) || seconds < 0) return 'Calculating...';
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
  };

  const startDownload = useCallback(async (mediaInfo, downloadUrl, headers = {}) => {
    const downloadId = mediaInfo.isTvShow 
      ? `${mediaInfo.id}_S${mediaInfo.season}E${mediaInfo.episode}`
      : `${mediaInfo.id}_movie`;

    const existing = activeDownloads.find(d => d.id === downloadId);
    if (existing) {
      ToastAndroid.show('Already downloading this item.', ToastAndroid.SHORT);
      return;
    }

    const safeTitle = (mediaInfo.title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = mediaInfo.isTvShow 
      ? `${safeTitle}_s${mediaInfo.season}e${mediaInfo.episode}.mp4`
      : `${safeTitle}.mp4`;
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;

    ToastAndroid.show('Download Started in Background!', ToastAndroid.LONG);

    // Create Notification
    let notificationId = null;
    try {
      notificationId = await notifee.displayNotification({
        title: `Downloading ${mediaInfo.title}...`,
        body: 'Starting...',
        android: {
          channelId: 'downloads',
          onlyAlertOnce: true,
          progress: { max: 100, current: 0 },
        },
      });
    } catch (e) {
      console.error('[Notifee] Error creating notification:', e);
    }

    downloadStatsRef.current[downloadId] = {
      startTime: Date.now(),
      lastBytes: 0,
      lastTime: Date.now(),
      notificationId
    };

    const callback = (downloadProgress) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
      const progress = totalBytesExpectedToWrite > 0 ? totalBytesWritten / totalBytesExpectedToWrite : 0;
      const downloadedMB = (totalBytesWritten / (1024 * 1024)).toFixed(1);
      const totalMB = (totalBytesExpectedToWrite / (1024 * 1024)).toFixed(1);

      const stats = downloadStatsRef.current[downloadId];
      if (!stats) return; // Download was cancelled

      const now = Date.now();
      const timeDiff = (now - stats.lastTime) / 1000;
      let remainingTime = 'Calculating...';

      if (timeDiff > 1) { 
        const bytesDiff = totalBytesWritten - stats.lastBytes;
        const bytesPerSec = bytesDiff / timeDiff;
        
        if (bytesPerSec > 0 && totalBytesExpectedToWrite > totalBytesWritten) {
          const bytesRemaining = totalBytesExpectedToWrite - totalBytesWritten;
          const secondsRemaining = bytesRemaining / bytesPerSec;
          remainingTime = formatTime(secondsRemaining);
          stats.cachedRemainingTime = remainingTime;
        } else {
          remainingTime = stats.cachedRemainingTime || 'Calculating...';
        }
        
        stats.lastTime = now;
        stats.lastBytes = totalBytesWritten;

        // Update Notification
        if (stats.notificationId) {
          const p = Math.round(progress * 100);
          notifee.displayNotification({
            id: stats.notificationId,
            title: `Downloading ${mediaInfo.title}`,
            body: `${p}% • ${remainingTime} left`,
            android: {
              channelId: 'downloads',
              onlyAlertOnce: true,
              progress: { max: 100, current: p },
            },
          }).catch(() => {});
        }

      } else {
        remainingTime = stats.cachedRemainingTime || 'Calculating...';
      }

      setActiveDownloads(prev => prev.map(item => {
        if (item.id === downloadId) {
          return { ...item, progress, downloadedMB, totalMB, remainingTime };
        }
        return item;
      }));
    };

    const resumable = FileSystem.createDownloadResumable(downloadUrl, fileUri, { headers }, callback);

    const newDownload = {
      id: downloadId,
      title: mediaInfo.title,
      isTvShow: mediaInfo.isTvShow,
      season: mediaInfo.season,
      episode: mediaInfo.episode,
      progress: 0,
      downloadedMB: 0,
      totalMB: 0,
      remainingTime: 'Starting...',
      resumable,
      status: 'downloading',
      fileUri
    };
    
    setActiveDownloads(prev => [...prev, newDownload]);

    try {
      const result = await resumable.downloadAsync();
      
      if (result && result.status === 200) {
        ToastAndroid.show(`Download Complete: ${mediaInfo.title}`, ToastAndroid.LONG);
        setActiveDownloads(prev => prev.map(item => 
          item.id === downloadId ? { ...item, status: 'completed', progress: 1, remainingTime: 'Complete' } : item
        ));

        // Update Notification to Complete
        const nid = downloadStatsRef.current[downloadId]?.notificationId;
        if (nid) {
          notifee.displayNotification({
            id: nid,
            title: 'Download Complete',
            body: `${mediaInfo.title} is ready to watch offline!`,
            android: { channelId: 'downloads' },
          });
        }
      } else {
        throw new Error('Server returned non-200 status');
      }
    } catch (e) {
      console.warn('Download error:', e);
      ToastAndroid.show('Download Failed!', ToastAndroid.LONG);
      setActiveDownloads(prev => prev.map(item => 
        item.id === downloadId ? { ...item, status: 'error', remainingTime: 'Failed' } : item
      ));

      // Error Notification
      const nid = downloadStatsRef.current[downloadId]?.notificationId;
      if (nid) {
        notifee.displayNotification({
          id: nid,
          title: 'Download Failed',
          body: `Failed to download ${mediaInfo.title}`,
          android: { channelId: 'downloads' },
        });
      }
    }
  }, [activeDownloads]);

  const cancelDownload = useCallback(async (downloadId) => {
    const item = activeDownloads.find(d => d.id === downloadId);
    if (item && item.resumable && item.status === 'downloading') {
      try { await item.resumable.cancelAsync(); } catch (e) {}
    }
    setActiveDownloads(prev => prev.filter(d => d.id !== downloadId));
    
    // Cancel Notification
    const nid = downloadStatsRef.current[downloadId]?.notificationId;
    if (nid) {
      notifee.cancelNotification(nid);
    }
    
    delete downloadStatsRef.current[downloadId];
  }, [activeDownloads]);

  const clearCompleted = useCallback(() => {
    setActiveDownloads(prev => prev.filter(d => d.status === 'downloading'));
  }, []);

  return (
    <DownloadContext.Provider value={{ activeDownloads, startDownload, cancelDownload, clearCompleted }}>
      {children}
    </DownloadContext.Provider>
  );
}
