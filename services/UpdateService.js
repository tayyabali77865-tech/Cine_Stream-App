import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const LAST_UPDATE_KEY = '@last_prompted_update_url';

export const checkAndPromptUpdate = async (apkUrl) => {
  if (Platform.OS !== 'android' || !apkUrl || typeof apkUrl !== 'string' || !apkUrl.startsWith('http')) {
    return;
  }

  try {
    const lastPromptedUrl = await AsyncStorage.getItem(LAST_UPDATE_KEY);
    
    // Prevent annoying the user on every app open if they already saw the prompt for this specific update.
    if (lastPromptedUrl === apkUrl) {
      console.log('[UpdateService] Update prompt already shown for this URL. Skipping.');
      return;
    }

    console.log('[UpdateService] New update link detected. Downloading in background...');
    const fileUri = `${FileSystem.documentDirectory}cinestream-update.apk`;

    // Download the APK
    const downloadRes = await FileSystem.downloadAsync(apkUrl, fileUri);
    
    if (downloadRes.status === 200) {
      console.log('[UpdateService] Download complete. Prompting installation.');
      
      // Mark this URL as prompted so we don't download it again if they decline
      await AsyncStorage.setItem(LAST_UPDATE_KEY, apkUrl);

      // Launch the Android package installer
      try {
        const contentUri = await FileSystem.getContentUriAsync(downloadRes.uri);
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
          type: 'application/vnd.android.package-archive',
        });
      } catch (intentErr) {
        // Fallback for older Expo SDKs if getContentUriAsync is not supported
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: downloadRes.uri,
          flags: 1,
          type: 'application/vnd.android.package-archive',
        });
      }
    } else {
      console.warn('[UpdateService] Failed to download APK. HTTP Status:', downloadRes.status);
    }
  } catch (error) {
    console.error('[UpdateService] Error checking/downloading update:', error.message);
  }
};
