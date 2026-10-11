import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, Linking } from 'react-native';

const LAST_UPDATE_KEY = '@last_prompted_update_url';
const UPDATE_NOTIF_CHANNEL = 'app_updates';

// ── Notification channel setup (Android) ─────────────────────────────────────
async function setupUpdateNotifChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(UPDATE_NOTIF_CHANNEL, {
      name: 'App Updates',
      importance: Notifications.AndroidImportance.LOW,  // Low = no sound, stays in tray
      vibrationPattern: [0],
    });
  } catch (e) {}
}

// ── Clear cached update URL (call to re-show popup for testing) ───────────────
export const clearUpdateCache = async () => {
  await AsyncStorage.removeItem(LAST_UPDATE_KEY);
};

// ── Main entry: called on app startup from SmartlinkAdContext ─────────────────
export const checkAndPromptUpdate = async (apkUrl) => {
  // Android only, valid HTTP URL required
  if (
    Platform.OS !== 'android' ||
    !apkUrl ||
    typeof apkUrl !== 'string' ||
    !apkUrl.startsWith('http')
  ) {
    return;
  }

  try {
    // Skip if user already dismissed this specific version
    const lastUrl = await AsyncStorage.getItem(LAST_UPDATE_KEY);
    if (lastUrl === apkUrl) return;

    // Setup notification channel
    await setupUpdateNotifChannel();

    // Request notification permission if not already granted
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }

    // ── Step 1: Show "Downloading update..." notification ─────────────────────
    let notifId = null;
    try {
      notifId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📦 CineStream Update',
          body: 'Downloading new version... 0%',
          autoDismiss: false,
          sticky: true,
          data: { type: 'apk_update' },
        },
        trigger: null,
        identifier: 'apk_update_progress',
        android: { channelId: UPDATE_NOTIF_CHANNEL },
      });
    } catch (e) {
      notifId = 'apk_update_progress';
    }

    const fileUri = `${FileSystem.documentDirectory}cinestream-update.apk`;

    // ── Step 2: Download with progress notification ───────────────────────────
    let lastNotifPct = -10; // Track last notified %, update every 10%

    const downloadResumable = FileSystem.createDownloadResumable(
      apkUrl,
      fileUri,
      {},
      async (downloadProgress) => {
        const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
        if (totalBytesExpectedToWrite <= 0) return;

        const pct = Math.floor((totalBytesWritten / totalBytesExpectedToWrite) * 100);
        const downloadedMB = (totalBytesWritten / (1024 * 1024)).toFixed(1);
        const totalMB = (totalBytesExpectedToWrite / (1024 * 1024)).toFixed(1);

        // Update notification every 10%
        if (pct >= lastNotifPct + 10 || pct === 100) {
          lastNotifPct = pct;
          try {
            await Notifications.scheduleNotificationAsync({
              identifier: notifId || 'apk_update_progress',
              content: {
                title: '📦 CineStream Update',
                body: `Downloading... ${pct}% (${downloadedMB} / ${totalMB} MB)`,
                autoDismiss: false,
                sticky: true,
                data: { type: 'apk_update' },
              },
              trigger: null,
              android: { channelId: UPDATE_NOTIF_CHANNEL },
            });
          } catch (e) {}
        }
      }
    );

    const downloadResult = await downloadResumable.downloadAsync();

    // ── Step 3: Validate downloaded file ─────────────────────────────────────
    if (!downloadResult || downloadResult.status !== 200) {
      // Update notification to "Failed"
      _updateNotif(notifId, '❌ Update Failed', 'Could not download update. Tap to retry.');
      Linking.openURL(apkUrl).catch(() => {});
      return;
    }

    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists || fileInfo.size < 2000000) {
      // Not a real APK — open in browser
      _updateNotif(notifId, '⬇️ Update Available', 'Tap to open download link.');
      Linking.openURL(apkUrl).catch(() => {});
      return;
    }

    // ── Step 4: Download complete — update notification + show popup ──────────
    // Dismiss progress notification
    try {
      await Notifications.dismissNotificationAsync(notifId || 'apk_update_progress');
    } catch (e) {}

    // Show "Ready to install" notification
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✅ Update Downloaded!',
          body: 'New CineStream version is ready. Tap Install to update.',
          autoDismiss: true,
          data: { type: 'apk_ready' },
        },
        trigger: null,
        android: { channelId: UPDATE_NOTIF_CHANNEL },
      });
    } catch (e) {}

    // ── Step 5: Show install popup ────────────────────────────────────────────
    Alert.alert(
      '🚀 Update Ready!',
      'A new version of CineStream has been downloaded and is ready to install.',
      [
        {
          text: 'Later',
          style: 'cancel',
          onPress: async () => {
            await AsyncStorage.setItem(LAST_UPDATE_KEY, apkUrl);
          },
        },
        {
          text: 'Install Now',
          onPress: async () => {
            await AsyncStorage.setItem(LAST_UPDATE_KEY, apkUrl);
            try {
              const contentUri = await FileSystem.getContentUriAsync(downloadResult.uri);
              await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                data: contentUri,
                flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
                type: 'application/vnd.android.package-archive',
              });
            } catch (intentErr) {
              try {
                await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                  data: downloadResult.uri,
                  flags: 1,
                  type: 'application/vnd.android.package-archive',
                });
              } catch (e2) {
                Linking.openURL(apkUrl).catch(() => {});
              }
            }
          },
        },
      ],
      { cancelable: false }
    );
  } catch (error) {
    console.warn('[UpdateService] Error:', error.message);
  }
};

// Helper: update notification text
async function _updateNotif(notifId, title, body) {
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: notifId || 'apk_update_progress',
      content: { title, body, autoDismiss: true },
      trigger: null,
      android: { channelId: UPDATE_NOTIF_CHANNEL },
    });
  } catch (e) {}
}
