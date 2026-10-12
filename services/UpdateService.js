import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert, Linking, AppState, ToastAndroid } from 'react-native';

const UPDATE_NOTIF_CHANNEL = 'app_updates';
const UPDATE_NOTIF_ID = 'apk_update_progress';
const UPDATE_CATEGORY_ID = 'apk_update_ready_category';

// Storage Key for version tracking
const UPDATE_TRACKING_KEY = '@app_update_version_tracking';

let isListeningToNotification = false;
let appStateSubscription = null;
let isDownloadingUpdate = false;

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

export const clearUpdateCache = async () => {
  await AsyncStorage.removeItem(UPDATE_TRACKING_KEY);
};

// ── Semver Version Comparator (Returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal) ─
function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  const clean1 = (v1 + '').replace(/[^0-9.]/g, '');
  const clean2 = (v2 + '').replace(/[^0-9.]/g, '');
  const parts1 = clean1.split('.').map(n => parseInt(n, 10) || 0);
  const parts2 = clean2.split('.').map(n => parseInt(n, 10) || 0);
  const maxLen = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// ── Get Current Installed App Version ─────────────────────────────────────────
function getCurrentAppVersion() {
  // Use project app.json version first!
  // In Expo Go, Application.nativeApplicationVersion returns Expo Go's own app version (2.32.19) instead of CineStream's version!
  return (
    Constants.expoConfig?.version ||
    '1.0.0'
  );
}

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
export const showInstallPrompt = (fileUri, apkUrl, targetVersion) => {
  if (Platform.OS === 'android') {
    try {
      ToastAndroid.show('🚀 Update ready to install!', ToastAndroid.SHORT);
    } catch (e) {}
  }

  const doPrompt = () => {
    Alert.alert(
      `🚀 Update Ready (${targetVersion || 'New Version'})!`,
      'A new version of CineStream has been downloaded and is ready to install.',
      [
        {
          text: 'Install Now',
          onPress: async () => {
            // Mark version as installed so it never prompts again for this version
            try {
              const trackingData = {
                version: targetVersion,
                promptCount: 2,
                installed: true,
                lastPromptTime: Date.now(),
              };
              await AsyncStorage.setItem(UPDATE_TRACKING_KEY, JSON.stringify(trackingData));
            } catch (e) {}

            await installApk(fileUri, apkUrl);
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
function setupNotificationTapListener(fileUri, apkUrl, targetVersion) {
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
        return;
      }

      // If user tapped "Install Now" action or tapped notification body
      if (
        actionId === 'INSTALL_NOW_ACTION' ||
        actionId === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        try {
          const trackingData = {
            version: targetVersion,
            promptCount: 2,
            installed: true,
            lastPromptTime: Date.now(),
          };
          await AsyncStorage.setItem(UPDATE_TRACKING_KEY, JSON.stringify(trackingData));
        } catch (e) {}

        await installApk(fileUri, apkUrl);
      }
    });
  } catch (e) {}
}

// ── Check Version & 24hr Prompt Eligibility ──────────────────────────────────
// Returns { canPrompt: boolean, nextCount: number }
async function checkVersionEligibility(targetVersion) {
  try {
    const currentVersion = getCurrentAppVersion();

    // 1. If targetVersion is not greater than currently installed app version, do NOT prompt!
    // (This guarantees that once the user updates, the popup NEVER shows again for this version)
    if (compareVersions(targetVersion, currentVersion) <= 0) {
      console.log(`[UpdateService] App is already up-to-date (installed: ${currentVersion}, server: ${targetVersion})`);
      return { canPrompt: false };
    }

    // 2. Check tracking stored in AsyncStorage for targetVersion
    const raw = await AsyncStorage.getItem(UPDATE_TRACKING_KEY);
    if (!raw) {
      // First time user is seeing this version
      return { canPrompt: true, nextCount: 1 };
    }

    const data = JSON.parse(raw);

    // If admin deployed a NEW version: reset tracking completely!
    if (data.version !== targetVersion) {
      return { canPrompt: true, nextCount: 1 };
    }

    // If user already installed this version: do not prompt again!
    if (data.installed) {
      return { canPrompt: false };
    }

    // If already prompted 2 times for this version: never prompt again!
    if (data.promptCount >= 2) {
      return { canPrompt: false };
    }

    // If prompted once (promptCount === 1): check if 24 hours have passed
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    const timeSinceLast = Date.now() - (data.lastPromptTime || 0);

    if (timeSinceLast >= TWENTY_FOUR_HOURS_MS) {
      // 24 hours passed! Allow 2nd (and final) prompt
      return { canPrompt: true, nextCount: 2 };
    }

    // 24 hours have not passed yet: skip prompt
    return { canPrompt: false };
  } catch (e) {
    return { canPrompt: true, nextCount: 1 };
  }
}

// ── Helper: Record that prompt was shown for this version ────────────────────
async function recordPromptShown(targetVersion, count) {
  try {
    const trackingData = {
      version: targetVersion,
      promptCount: count,
      installed: false,
      lastPromptTime: Date.now(),
    };
    await AsyncStorage.setItem(UPDATE_TRACKING_KEY, JSON.stringify(trackingData));
  } catch (e) {}
}

// ── Main entry: called on app startup from SmartlinkAdContext ─────────────────
export const checkAndPromptUpdate = async (apkUrl, appUpdateVersion) => {
  if (
    Platform.OS !== 'android' ||
    !apkUrl ||
    typeof apkUrl !== 'string' ||
    !apkUrl.startsWith('http')
  ) {
    return;
  }

  // Target version from admin panel, default to 1.0.1 if not specified
  const targetVersion = (appUpdateVersion && typeof appUpdateVersion === 'string') 
    ? appUpdateVersion.trim() 
    : '1.0.1';

  try {
    if (isDownloadingUpdate) return;
    isDownloadingUpdate = true;

    // Step 0: Check Version & 24hr Eligibility
    const eligibility = await checkVersionEligibility(targetVersion);
    if (!eligibility.canPrompt) {
      isDownloadingUpdate = false;
      return;
    }

    await setupUpdateNotifChannel();

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }

    const fileUri = `${FileSystem.documentDirectory}cinestream-update-${targetVersion}.apk`;

    setupNotificationTapListener(fileUri, apkUrl, targetVersion);

    // ── Check if this specific version APK is ALREADY cached on phone ─────────
    try {
      const existingInfo = await FileSystem.getInfoAsync(fileUri);
      if (existingInfo && existingInfo.exists && existingInfo.size > 5000000) {
        console.log(`[UpdateService] Cached APK for v${targetVersion} found. Prompting popup immediately.`);
        await recordPromptShown(targetVersion, eligibility.nextCount);
        showInstallPrompt(fileUri, apkUrl, targetVersion);
        isDownloadingUpdate = false;
        return;
      }
    } catch (e) {}

    // ── Step 1: Start background download notification ───────────────────────
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: UPDATE_NOTIF_ID,
        content: {
          title: `📦 CineStream v${targetVersion} Update`,
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
                title: `📦 CineStream v${targetVersion} Update`,
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
          title: `✅ CineStream v${targetVersion} Downloaded!`,
          body: 'Update is ready to install.',
          categoryIdentifier: UPDATE_CATEGORY_ID,
          autoDismiss: false,
          sticky: false,
          data: { type: 'apk_ready', fileUri },
        },
        trigger: null,
        android: { channelId: UPDATE_NOTIF_CHANNEL },
      });
    } catch (e) {}

    // ── Step 5: Show in-app popup & record prompt ────────────────────────────
    await recordPromptShown(targetVersion, eligibility.nextCount);
    showInstallPrompt(fileUri, apkUrl, targetVersion);
    isDownloadingUpdate = false;
  } catch (error) {
    isDownloadingUpdate = false;
    console.warn('[UpdateService] Error:', error.message);
  }
};
