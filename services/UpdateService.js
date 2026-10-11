import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, Linking, ToastAndroid } from 'react-native';

const LAST_UPDATE_KEY = '@last_prompted_update_url';

export const checkAndPromptUpdate = async (apkUrl) => {
  // Only run on Android with a valid HTTP URL
  if (Platform.OS !== 'android' || !apkUrl || typeof apkUrl !== 'string' || !apkUrl.startsWith('http')) {
    return;
  }

  try {
    // Don't prompt again if user already dismissed THIS specific version
    const lastPromptedUrl = await AsyncStorage.getItem(LAST_UPDATE_KEY);
    if (lastPromptedUrl === apkUrl) {
      return;
    }

    const fileUri = `${FileSystem.documentDirectory}cinestream-update.apk`;

    // Show a small toast so user knows something is happening in background
    ToastAndroid.show('Checking for update...', ToastAndroid.SHORT);

    // Silent background download
    const downloadCallback = FileSystem.createDownloadResumable(
      apkUrl,
      fileUri,
      {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        // Optional: show progress toast every 25%
        const pct = Math.floor(progress * 100);
        if (pct === 25 || pct === 50 || pct === 75) {
          ToastAndroid.show(`Downloading update: ${pct}%`, ToastAndroid.SHORT);
        }
      }
    );

    const downloadRes = await downloadCallback.downloadAsync();

    // Validate the downloaded file is a real APK (> 2MB)
    const fileInfo = await FileSystem.getInfoAsync(fileUri);

    if (downloadRes && downloadRes.status === 200 && fileInfo.size > 2000000) {
      // ✅ Download complete — NOW show the popup
      Alert.alert(
        '🚀 Update Ready!',
        'A new version of CineStream has been downloaded and is ready to install.',
        [
          {
            text: 'Later',
            style: 'cancel',
            onPress: async () => {
              await AsyncStorage.setItem(LAST_UPDATE_KEY, apkUrl);
            }
          },
          {
            text: 'Install Now',
            onPress: async () => {
              await AsyncStorage.setItem(LAST_UPDATE_KEY, apkUrl);
              try {
                const contentUri = await FileSystem.getContentUriAsync(downloadRes.uri);
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                  data: contentUri,
                  flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                  type: 'application/vnd.android.package-archive',
                });
              } catch (intentErr) {
                // Fallback for older Android versions
                try {
                  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                    data: downloadRes.uri,
                    flags: 1,
                    type: 'application/vnd.android.package-archive',
                  });
                } catch (e2) {
                  // Last resort: open in browser
                  Linking.openURL(apkUrl).catch(() => {});
                }
              }
            }
          }
        ],
        { cancelable: false }
      );
    } else if (downloadRes && downloadRes.status === 200) {
      // Downloaded but too small — not a real APK, open in browser
      Linking.openURL(apkUrl).catch(() => {});
    }
  } catch (error) {
    // If download fails silently, don't spam the user
    console.warn('[UpdateService] Background download failed:', error.message);
  }
};
