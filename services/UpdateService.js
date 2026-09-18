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
    const fileUri = `${FileSystem.documentDirectory}cinestream-update.apk`;

    // 1. Silent Background Download (No toasts, no interruptions)
    const downloadRes = await FileSystem.downloadAsync(apkUrl, fileUri);
    
    // 2. Download Complete -> Show Popup with "Update" button
    if (downloadRes.status === 200) {
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
