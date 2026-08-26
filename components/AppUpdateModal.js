import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { customFetch } from '../services/apiService';

// The current version of this app build. Must be incremented before creating a new APK.
const CURRENT_VERSION_CODE = 1; 

export default function AppUpdateModal() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [config, setConfig] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const response = await customFetch('/app-config');
        if (response && response.latestVersionCode > CURRENT_VERSION_CODE) {
          setConfig(response);
          setUpdateAvailable(true);
        }
      } catch (error) {
        console.log('[UpdateCheck] Error checking for updates:', error);
      }
    };

    checkUpdate();
  }, []);

  if (!updateAvailable || !config) return null;

  const handleUpdate = async () => {
    if (!config.apkDownloadUrl || downloading) return;
    
    if (Platform.OS !== 'android') {
      alert("In-app updates are only supported on Android.");
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);

    const fileUri = `${FileSystem.documentDirectory}CineStream_Update.apk`;

    const downloadResumable = FileSystem.createDownloadResumable(
      config.apkDownloadUrl,
      fileUri,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        setDownloadProgress(progress);
      }
    );

    try {
      const { uri } = await downloadResumable.downloadAsync();
      
      // Convert to content URI so it can be installed
      const contentUri = await FileSystem.getContentUriAsync(uri);
      
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: 'application/vnd.android.package-archive',
      });
      
    } catch (err) {
      console.error("Update download/install failed", err);
      alert("Update failed to install. Please try again later.");
    } finally {
      setDownloading(false);
    }
  };

  // If forceUpdate is false, user can close it. But default is true.
  const isForced = config.forceUpdate !== false; 

  return (
    <Modal visible={updateAvailable} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Ionicons name="cloud-download-outline" size={50} color="#E50914" />
          </View>
          
          <Text style={styles.title}>Update Required</Text>
          <Text style={styles.subtitle}>
            A new version of CineStream (v{config.latestVersionName}) is available. 
            Please update to continue watching.
          </Text>

          {config.releaseNotes ? (
            <View style={styles.notesContainer}>
              <Text style={styles.notesTitle}>What's New:</Text>
              <Text style={styles.notesText}>{config.releaseNotes}</Text>
            </View>
          ) : null}

          <TouchableOpacity 
            style={[styles.button, downloading && styles.buttonDisabled]} 
            onPress={handleUpdate} 
            activeOpacity={0.8}
            disabled={downloading}
          >
            {downloading ? (
              <>
                <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.buttonText}>
                  Downloading... {Math.round(downloadProgress * 100)}%
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.buttonText}>Download Update</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFF" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>

          {!isForced && (
            <TouchableOpacity style={styles.skipButton} onPress={() => setUpdateAvailable(false)}>
              <Text style={styles.skipText}>Skip for now</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#1C1C23',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D2D3A',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  notesContainer: {
    backgroundColor: '#13131A',
    padding: 16,
    borderRadius: 8,
    width: '100%',
    marginBottom: 24,
  },
  notesTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  notesText: {
    color: '#9CA3AF',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#E50914',
    flexDirection: 'row',
    width: '100%',
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  skipButton: {
    marginTop: 16,
    padding: 8,
  },
  skipText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  }
});
