import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import { Platform, Alert, Linking, AppState, ToastAndroid } from 'react-native';

const UPDATE_NOTIF_CHANNEL = 'app_updates';
const UPDATE_NOTIF_ID = 'apk_update_progress';
const UPDATE_CATEGORY_ID = 'apk_update_ready_category';

let isListeningToNotification = false;
let appStateSubscription = null;

// ── Notification channel & categories setup (Android) ────────────────────────
async function setupUpdateNotifChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(UPDATE_NOTIF_CHANNEL, {
      name: 'App Updates',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250],
      sound: null,
    });

    // Define notification actions: "Install Now" and "Later"
    await Notifications.setNotificationCategoryAsync(UPDATE_CATEGORY_ID, [
      {
        identifier: 'INSTALL_NOW_ACTION',
        buttonTitle: 'Install Now',
        options: {
          opensAppToForeground: true,
        },
      },
      {
        identifier: 'LATER_ACTION',
        buttonTitle: 'Later',
        options: {
          opensAppToForeground: false,
        },
      },
    ]);
  } catch (e) {
    console.warn('[UpdateService] Channel/Category setup error:', e.message);
  }
}

// ── Clear cached update URL ───────────────────────────────────────────────────
export const clearUpdateCache = async () => {
  // Empty helper if needed
};

// ── Launch APK Installer ──────────────────────────────────────────────────────
export const installApk = async (fileUri, fallbackUrl) => {
  try {
    const contentUri = await FileSystem.getContentUriAsync(fileUri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: 'application/vnd.android.package-archive',
    });
  } catch (intentErr) {
    console.warn('[UpdateService] IntentLauncher contentUri failed, trying raw fileUri:', intentErr);
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: fileUri,
        flags: 1,
        type: 'application/vnd.android.package-archive',
      });
    } catch (e2) {
      console.warn('[UpdateService] IntentLauncher raw fileUri failed:', e2);
      if (fallbackUrl) {
        Linking.openURL(fallbackUrl).catch(() => {});
      }
    }
  }
};

// ── Show Install Popup in App (Only "Install Now", NO "Later") ───────────────
export const showInstallPrompt = (fileUri, apkUrl) => {
  if (Platform.OS === 'android') {
    try {
      ToastAndroid.show('🚀 Update ready to install!', ToastAndroid.SHORT);
    } catch (e) {}
  }

  const doPrompt = () => {
    Alert.alert(
      '🚀 Update Ready!',
      'A new version of CineStream has been downloaded and is ready to install.',
      [
        {
          text: 'Install Now',
          onPress: () => {
            installApk(fileUri, apkUrl);
          },
        },
      ],
      { cancelable: false }
    );
  };

  if (AppState.currentState === 'active') {
    doPrompt();
  } else {
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }
    appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        if (appStateSubscription) {
          appStateSubscription.remove();
          appStateSubscription = null;
        }
        doPrompt();
      }
    });
  }
};

// ── Setup Notification Action Listener (Install Now vs Later) ────────────────
function setupNotificationTapListener(fileUri, apkUrl) {
  if (isListeningToNotification) return;
  isListeningToNotification = true;

  try {
    Notifications.addNotificationResponseReceivedListener(async (response) => {
      const actionId = response.actionIdentifier;
      
      // If user tapped "Later" action on notification
      if (actionId === 'LATER_ACTION') {
        try {
          await Notifications.dismissNotificationAsync(UPDATE_NOTIF_ID);
        } catch (e) {}
        return; // Closes notification. Next time app opens, popup will still show!
      }

      // If user tapped "Install Now" action or tapped notification body
      if (
        actionId === 'INSTALL_NOW_ACTION' ||
        actionId === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        await installApk(fileUri, apkUrl);
      }
    });
  } catch (e) {}
}

// ── Main entry: called on app startup from SmartlinkAdContext ─────────────────
export const checkAndPromptUpdate = async (apkUrl) => {
  if (
    Platform.OS !== 'android' ||
    !apkUrl ||
    typeof apkUrl !== 'string' ||
    !apkUrl.startsWith('http')
  ) {
    return;
  }

  try {
    await setupUpdateNotifChannel();

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }

    const fileUri = `${FileSystem.documentDirectory}cinestream-update.apk`;

    setupNotificationTapListener(fileUri, apkUrl);

    // ── Check if APK is ALREADY downloaded ───────────────────────────────────
    // If user clicked Later previously or downloaded already:
    // Show popup immediately every time app opens without re-downloading!
    try {
      const existingInfo = await FileSystem.getInfoAsync(fileUri);
      if (existingInfo && existingInfo.exists && existingInfo.size > 5000000) {
        console.log('[UpdateService] Cached APK found (' + (existingInfo.size / (1024 * 1024)).toFixed(1) + ' MB). Prompting popup immediately.');
        showInstallPrompt(fileUri, apkUrl);
        return;
      }
    } catch (e) {}

    // ── Step 1: Start background download notification ───────────────────────
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: UPDATE_NOTIF_ID,
        content: {
          title: '📦 CineStream Update',
          body: 'Downloading new version... 0%',
          autoDismiss: false,
          sticky: true,
          data: { type: 'apk_update' },
        },
        trigger: null,
        android: { channelId: UPDATE_NOTIF_CHANNEL },
      });
    } catch (e) {}

    // ── Step 2: Download with progress ───────────────────────────────────────
    let lastNotifPct = -10;

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

        if (pct >= lastNotifPct + 10 || pct === 100) {
          lastNotifPct = pct;
          try {
            await Notifications.scheduleNotificationAsync({
              identifier: UPDATE_NOTIF_ID,
              content: {
                title: '📦 CineStream Update',
                body: `Downloading... ${pct}% (${downloadedMB} / ${totalMB} MB)`,
                autoDismiss: false,
                sticky: pct < 100,
                data: { type: 'apk_update' },
              },
              trigger: null,
              android: { channelId: UPDATE_NOTIF_CHANNEL },
            });
          } catch (e) {}
        }
      }
    );

    await downloadResumable.downloadAsync();

    // ── Step 3: Validate downloaded file ─────────────────────────────────────
    const fileInfo = await FileSystem.getInfoAsync(fileUri).catch(() => null);
    if (!fileInfo || !fileInfo.exists || fileInfo.size < 2000000) {
      console.warn('[UpdateService] Downloaded file invalid or smaller than 2MB');
      Linking.openURL(apkUrl).catch(() => {});
      return;
    }

    // ── Step 4: Download complete — notification with "Install Now" & "Later" buttons
    try {
      await Notifications.dismissNotificationAsync(UPDATE_NOTIF_ID);
    } catch (e) {}

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: UPDATE_NOTIF_ID,
        content: {
          title: '✅ CineStream Update Downloaded!',
          body: 'Update is ready to install.',
          categoryIdentifier: UPDATE_CATEGORY_ID, // Adds "Install Now" & "Later" action buttons!
          autoDismiss: false,
          sticky: false,
          data: { type: 'apk_ready', fileUri },
        },
        trigger: null,
        android: { channelId: UPDATE_NOTIF_CHANNEL },
      });
    } catch (e) {}

    // ── Step 5: Show in-app popup (Only "Install Now", NO "Later") ───────────
    showInstallPrompt(fileUri, apkUrl);
  } catch (error) {
    console.warn('[UpdateService] Error:', error.message);
  }
};
