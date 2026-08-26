import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Text, Dimensions, BackHandler } from 'react-native';
import { WebView } from 'react-native-webview';
import { useAds } from '../context/AdContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── Helper: Build HTML page for ad script injection ─────────────────────────
function buildAdHtml(adScript) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
        body { display: flex; align-items: center; justify-content: center; }
      </style>
    </head>
    <body>
      ${adScript}
    </body>
    </html>
  `;
}

// ─── Shared Loading Component for Ads ──────────────────────────────────────────
const AdLoading = () => (
  <View style={styles.adLoadingContainer}>
    <Text style={styles.adLoadingText}>Sponsored</Text>
  </View>
);

// ─── Banner Ad Component (300x250 or custom size) ─────────────────────────────
export function AdBanner300x250() {
  const { adsEnabled, adConfig } = useAds();

  if (!adsEnabled || !adConfig?.bannerScript) return null;

  return (
    <View style={styles.bannerContainer}>
      <WebView
        source={{ html: buildAdHtml(adConfig.bannerScript) }}
        style={styles.banner300x250}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        mixedContentMode="always"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        startInLoadingState={true}
        renderLoading={() => <AdLoading />}
        onError={() => {}}
      />
    </View>
  );
}

// ─── Banner Ad Component (728x90 Leaderboard) ─────────────────────────────────
export function AdBanner728x90() {
  const { adsEnabled, adConfig } = useAds();

  if (!adsEnabled || !adConfig?.bannerScript) return null;

  return (
    <View style={styles.bannerContainerLeader}>
      <WebView
        source={{ html: buildAdHtml(adConfig.bannerScript) }}
        style={styles.banner728x90}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        mixedContentMode="always"
        startInLoadingState={true}
        renderLoading={() => <AdLoading />}
        onError={() => {}}
      />
    </View>
  );
}

// ─── Native / Inline Ad Component ─────────────────────────────────────────────
export function AdBannerNative() {
  const { adsEnabled, adConfig } = useAds();

  if (!adsEnabled || !adConfig?.nativeScript) return null;

  return (
    <View style={styles.nativeBannerContainer}>
      <WebView
        source={{ html: buildAdHtml(adConfig.nativeScript) }}
        style={styles.nativeBanner}
        scrollEnabled={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        databaseEnabled={true}
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        mixedContentMode="always"
        onError={() => {}}
      />
    </View>
  );
}

// ─── Interstitial / Full-Screen Ad (shown between screens) ────────────────────
export function InterstitialAd({ visible, onClose }) {
  const { adsEnabled, adConfig } = useAds();
  const [showClose, setShowClose] = useState(false);
  const closeTimer = useRef(null);

  // Show close button after delay (default 5 seconds)
  useEffect(() => {
    if (visible && adsEnabled) {
      const delay = (adConfig?.interstitialCloseDelay ?? 5) * 1000;
      setShowClose(false);
      closeTimer.current = setTimeout(() => setShowClose(true), delay);
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [visible, adsEnabled, adConfig]);

  // Handle Android back button
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showClose) { onClose?.(); return true; }
      return true; // Block back if close not available yet
    });
    return () => sub.remove();
  }, [visible, showClose, onClose]);

  if (!adsEnabled || !adConfig?.interstitialScript || !visible) return null;

  return (
    <Modal visible={visible} transparent={false} animationType="fade" statusBarTranslucent>
      <View style={styles.interstitialContainer}>
        <WebView
          source={{ html: buildAdHtml(adConfig.interstitialScript) }}
          style={styles.interstitialWebView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          databaseEnabled={true}
          cacheEnabled={true}
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          mixedContentMode="always"
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          onError={() => {}}
        />
        {showClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.closeButtonText}>✕  Close Ad</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

// ─── Background Ad Handler (Push Notifications / Popunder scripts) ────────────
// Runs silently in the background — no visible UI.
export function BackgroundAdHandler() {
  const { adsEnabled, adConfig } = useAds();

  if (!adsEnabled || !adConfig?.backgroundScript) return null;

  return (
    <View style={styles.hidden}>
      <WebView
        source={{ html: buildAdHtml(adConfig.backgroundScript) }}
        style={styles.hidden}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        databaseEnabled={true}
        cacheEnabled={true}
        cacheMode="LOAD_CACHE_ELSE_NETWORK"
        mixedContentMode="always"
        onError={() => {}}
      />
    </View>
  );
}

// ─── Rewarded Ad Component ─────────────────────────────────────────────────────
// User watches a full ad → reward milta hai (HD unlock, download unlock, etc.)
// Props:
//   visible     — boolean to show/hide
//   rewardLabel — what user gets e.g. "Watch ad to unlock HD quality"
//   onRewarded  — callback fired when ad completes (give reward here)
//   onClose     — callback fired when user closes without reward
export function RewardedAd({ visible, rewardLabel, onRewarded, onClose }) {
  const { adsEnabled, adConfig } = useAds();
  const [countdown, setCountdown] = useState(0);
  const [adCompleted, setAdCompleted] = useState(false);
  const timerRef = useRef(null);
  const webviewRef = useRef(null);

  const adDuration = adConfig?.rewardedAdDuration ?? 30; // seconds

  // Reset and start countdown every time ad becomes visible
  useEffect(() => {
    if (!visible || !adsEnabled) return;

    setAdCompleted(false);
    setCountdown(adDuration);

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setAdCompleted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, adsEnabled, adDuration]);

  // Block Android back button during rewarded ad
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (adCompleted) {
        onClose?.();
      }
      return true; // Always block back — can't skip rewarded ad
    });
    return () => sub.remove();
  }, [visible, adCompleted, onClose]);

  if (!adsEnabled || !adConfig?.rewardedScript || !visible) return null;

  return (
    <Modal visible={visible} transparent={false} animationType="slide" statusBarTranslucent>
      <View style={styles.rewardedContainer}>

        {/* Ad WebView */}
        <WebView
          ref={webviewRef}
          source={{ html: buildAdHtml(adConfig.rewardedScript) }}
          style={styles.rewardedWebView}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          databaseEnabled={true}
          cacheEnabled={true}
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          mixedContentMode="always"
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          onError={() => {}}
        />

        {/* Countdown / Reward Header */}
        <View style={styles.rewardedHeader}>
          {!adCompleted ? (
            <>
              <View style={styles.countdownBadge}>
                <Text style={styles.countdownText}>{countdown}s</Text>
              </View>
              <Text style={styles.rewardedHint}>
                {rewardLabel || 'Watch ad to earn your reward'}
              </Text>
            </>
          ) : (
            /* Reward Claim Button */
            <TouchableOpacity
              style={styles.claimButton}
              onPress={() => { onRewarded?.(); }}
              activeOpacity={0.85}
            >
              <Text style={styles.claimButtonText}>🎁  Claim Reward</Text>
            </TouchableOpacity>
          )}

          {/* Skip button — only visible after ad completes (without reward) */}
          {adCompleted && (
            <TouchableOpacity style={styles.skipButton} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.skipButtonText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>

      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  adLoadingContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1C1C23',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2D2D3A',
  },
  adLoadingText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  bannerContainer: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginVertical: 4,
  },
  banner300x250: {
    width: 300,
    height: 250,
    backgroundColor: 'transparent',
  },
  bannerContainerLeader: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginVertical: 2,
  },
  banner728x90: {
    width: SCREEN_WIDTH,
    height: 90,
    backgroundColor: 'transparent',
  },
  nativeBannerContainer: {
    width: '100%',
    marginVertical: 8,
    backgroundColor: 'transparent',
  },
  nativeBanner: {
    width: '100%',
    height: 120,
    backgroundColor: 'transparent',
  },
  interstitialContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  interstitialWebView: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 44,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E50914',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  hidden: {
    width: 0,
    height: 0,
    position: 'absolute',
    opacity: 0,
  },
  // ─── Rewarded Ad Styles ─────────────────────────────────────────────────────
  rewardedContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  rewardedWebView: {
    flex: 1,
  },
  rewardedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 44,
    paddingBottom: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  countdownBadge: {
    backgroundColor: '#E50914',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  rewardedHint: {
    flex: 1,
    color: '#F3F4F6',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 12,
    opacity: 0.9,
  },
  claimButton: {
    flex: 1,
    backgroundColor: '#E50914',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E50914',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  skipButton: {
    marginLeft: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  skipButtonText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupCard: {
    width: SCREEN_WIDTH * 0.9,
    height: SCREEN_HEIGHT * 0.7,
    backgroundColor: '#1C1C24',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
  },
  popupHeader: {
    height: 48,
    backgroundColor: '#12121A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#374151',
  },
  popupCountdownText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  popupCloseBtn: {
    backgroundColor: '#E50914',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'center',
  },
  popupCloseBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  popupWebContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  popupWebView: {
    flex: 1,
  },
});

// ─── Smart Link Ad Modal Component ──────────────────────────────────────────
export function SmartLinkAdModal({ visible, onClose, adUrl }) {
  const { adsEnabled } = useAds();
  const [countdown, setCountdown] = useState(5);
  const [canClose, setCanClose] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!visible || !adsEnabled) return;

    setCanClose(false);
    setCountdown(5);

    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setCanClose(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, adsEnabled]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canClose) {
        onClose?.();
      }
      return true; // Swallows back button press
    });
    return () => sub.remove();
  }, [visible, canClose, onClose]);

  if (!adsEnabled || !visible || !adUrl) return null;

  return (
    <Modal visible={visible} transparent={true} animationType="fade" statusBarTranslucent>
      <View style={styles.modalOverlay}>
        <View style={styles.popupCard}>
          {/* Header/Controls bar */}
          <View style={styles.popupHeader}>
            {!canClose ? (
              <Text style={styles.popupCountdownText}>Ad Closes in {countdown}s</Text>
            ) : (
              <TouchableOpacity style={styles.popupCloseBtn} onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.popupCloseBtnText}>✕ Close Ad</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* WebView Container */}
          <View style={styles.popupWebContainer}>
            <WebView
              source={{ uri: adUrl }}
              style={styles.popupWebView}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              databaseEnabled={true}
              cacheEnabled={true}
              cacheMode="LOAD_CACHE_ELSE_NETWORK"
              mixedContentMode="always"
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              onError={() => {}}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

