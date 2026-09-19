import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';

const LAST_UPDATE_KEY = '@last_prompted_update_url';

export const checkAndPromptUpdate = async (apkUrl) => {
  // Only run on Android and if a valid HTTP URL is provided
  if (Platform.OS !== 'android' || !apkUrl || typeof apkUrl !== 'string' || !apkUrl.startsWith('http')) {
    return;
  }

  try {
    // BUG FIX: Actually check if we have already prompted the user for this specific update URL
    const lastPromptedUrl = await AsyncStorage.getItem(LAST_UPDATE_KEY);
    if (lastPromptedUrl === apkUrl) {
      return; // User already dismissed this specific update
    }

    const fileUri = `${FileSystem.documentDirectory}cinestream-update.apk`;

    // 1. Silent Background Download (No toasts, no interruptions)
    const downloadRes = await FileSystem.downloadAsync(apkUrl, fileUri);
    
    // 2. Validate that it's actually an APK and not an HTML error page or placeholder link
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    
    // A real React Native APK is usually > 15MB. If it's less than 2MB, it's definitely not a valid update APK.
    if (downloadRes.status === 200 && fileInfo.size > 2000000) {
      Alert.alert(
        "Update Ready 🚀",
        "A new version of CineStream has been downloaded and is ready to install.",
        [
          { 
            text: "Later", 
            style: "cancel",
            onPress: async () => {
              // Only mark as prompted if they explicitly click Later
              await AsyncStorage.setItem(LAST_UPDATE_KEY, apkUrl);
            }
          },
          {
            text: "Update Now",
            onPress: async () => {
              // Mark as prompted so it doesn't loop if they cancel the installation screen
              await AsyncStorage.setItem(LAST_UPDATE_KEY, apkUrl);
              try {
                const contentUri = await FileSystem.getContentUriAsync(downloadRes.uri);
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                  data: contentUri,
                  flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                  type: 'application/vnd.android.package-archive',
                });
              } catch (intentErr) {
                // Fallback for older Android / SDKs
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                  data: downloadRes.uri,
                  flags: 1,
                  type: 'application/vnd.android.package-archive',
                });
              }
            }
          }
        ],
        { cancelable: false }
      );
    }
  } catch (error) {
    console.error('[UpdateService] Error:', error.message);
  }
};
