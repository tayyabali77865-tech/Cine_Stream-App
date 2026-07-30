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

// Banners disabled (returning null) to remove Adsterra ads space
export function AdBanner300x250() {
  return null;
}

export function AdBanner728x90() {
  return null;
}

export function AdBannerNative() {
  return null;
}

// Background handler to trigger Vignette and Popunder tag ads safely in the native browser
export function BackgroundAdHandler() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <script src="https://5gvci.com/act/files/tag.min.js?z=11462739" data-cfasync="false" async></script>
        <script src="https://5gvci.com/act/files/tag.min.js?z=11462890" data-cfasync="false" async></script>
      </head>
      <body>
        <script>(function(s){s.dataset.zone='11462747',s.src='https://n6wxm.com/vignette.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))</script>
        <script>(function(s){s.dataset.zone='11462755',s.src='https://nap5k.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))</script>
      </body>
    </html>
  `;

  return (
    <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: BASE_URL }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        userAgent={MOBILE_USER_AGENT}
        mixedContentMode="always"
        onShouldStartLoadWithRequest={(request) => {
          // Open any external ad redirects in the user's default browser instead of inside the app
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

const styles = StyleSheet.create({});
