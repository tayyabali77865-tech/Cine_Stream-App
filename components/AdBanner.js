import React from 'react';
import { View, StyleSheet, Dimensions, Platform, Linking } from 'react-native';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

// Standard mobile user agent to prevent ad networks from blocking the webview request
const MOBILE_USER_AGENT = Platform.select({
  android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  default: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
});

const BASE_URL = 'https://cinestream.watch';

// Monetag Ads HTML content (Vignette, Popunder, In-Page Push)
const MONETAG_HTML = `
  <!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <script src="https://5gvci.com/act/files/tag.min.js?z=11462739" data-cfasync="false" async></script>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: transparent;
          overflow: hidden;
        }
      </style>
    </head>
    <body>
      <script>(function(s){s.dataset.zone='11462755',s.src='https://nap5k.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))</script>
      <script>(function(s){s.dataset.zone='11462747',s.src='https://n6wxm.com/vignette.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))</script>
    </body>
  </html>
`;

// Return null for standard banners to avoid rendering empty blank spaces,
// as the user's Monetag tags are background overlays (Vignette, Push Notifications, Popunders)
export function AdBanner300x250() {
  return null;
}

export function AdBanner728x90() {
  return null;
}

export function AdBannerNative() {
  return null;
}

// Global background handler to execute the Monetag overlay/background tags
export function BackgroundAdHandler() {
  return (
    <View style={styles.backgroundAd} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        source={{
          html: MONETAG_HTML,
          baseUrl: BASE_URL,
          headers: {
            'Referer': 'https://cinestream.watch/',
            'Origin': 'https://cinestream.watch'
          }
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        databaseEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        userAgent={MOBILE_USER_AGENT}
        mixedContentMode="always"
        onConsoleMessage={(event) => {
          console.log('[Ad WebView Console]', event.nativeEvent.message);
        }}
        onError={(syntheticEvent) => {
          console.warn('[Ad WebView Error]', syntheticEvent.nativeEvent);
        }}
        onHttpError={(syntheticEvent) => {
          console.warn('[Ad WebView HTTP Error]', syntheticEvent.nativeEvent.statusCode, syntheticEvent.nativeEvent.description);
        }}
        onShouldStartLoadWithRequest={(request) => {
          // If it is a sub-frame (like an iframe or internal script request), let it load inside the WebView
          if (request.isTopFrame === false) {
            return true;
          }

          // Open any top-level external ad redirects in the user's default browser instead of inside the app
          if (request.url !== 'about:blank' && !request.url.startsWith('data:') && request.url !== BASE_URL + '/') {
            Linking.openURL(request.url).catch(() => {});
            return false;
          }
          return true;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backgroundAd: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 100,
    height: 100,
    opacity: 0.01,
    zIndex: -1,
  }
});
