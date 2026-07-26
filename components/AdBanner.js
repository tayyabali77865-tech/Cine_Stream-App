import React from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

// Standard mobile user agent to prevent Adsterra from blocking the webview request
const MOBILE_USER_AGENT = Platform.select({
  android: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  default: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
});

// The verified domain in your Adsterra panel
const BASE_URL = 'https://cinestream.watch';

export function AdBanner300x250() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: transparent;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        <script type="text/javascript">
          atOptions = {
            'key' : '8d2d71d511245419b703c77e7805e213',
            'format' : 'iframe',
            'height' : 250,
            'width' : 300,
            'params' : {}
          };
        </script>
        <script type="text/javascript" src="https://www.highperformanceformat.com/8d2d71d511245419b703c77e7805e213/invoke.js"></script>
      </body>
    </html>
  `;

  return (
    <View style={styles.banner300x250}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: BASE_URL }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        scalesPageToFit={true}
        userAgent={MOBILE_USER_AGENT}
        mixedContentMode="always"
      />
    </View>
  );
}

export function AdBanner728x90() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          body {
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: transparent;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        <script type="text/javascript">
          atOptions = {
            'key' : 'e4a05adf80ab2cb129adfd7080b699c2',
            'format' : 'iframe',
            'height' : 90,
            'width' : 728,
            'params' : {}
          };
        </script>
        <script type="text/javascript" src="https://www.highperformanceformat.com/e4a05adf80ab2cb129adfd7080b699c2/invoke.js"></script>
      </body>
    </html>
  `;

  const adWidth = 728;
  const adHeight = 90;
  const screenWidth = width - 32;
  const scale = screenWidth < adWidth ? screenWidth / adWidth : 1;

  return (
    <View style={[styles.container728, { width: screenWidth, height: adHeight * scale }]}>
      <View style={{ width: adWidth, height: adHeight, transform: [{ scale }], transformOrigin: 'top left' }}>
        <WebView
          originWhitelist={['*']}
          source={{ html, baseUrl: BASE_URL }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          scrollEnabled={false}
          scalesPageToFit={true}
          userAgent={MOBILE_USER_AGENT}
          mixedContentMode="always"
        />
      </View>
    </View>
  );
}

export function AdBannerNative() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          body {
            margin: 0;
            padding: 0;
            background-color: transparent;
            display: flex;
            justify-content: center;
            align-items: center;
          }
        </style>
      </head>
      <body>
        <script async="async" data-cfasync="false" src="https://pl30550860.effectivecpmnetwork.com/9eabd5370394a4bf238074ed4cc60368/invoke.js"></script>
        <div id="container-9eabd5370394a4bf238074ed4cc60368"></div>
      </body>
    </html>
  `;

  return (
    <View style={styles.nativeBanner}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: BASE_URL }}
        style={styles.webview}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        userAgent={MOBILE_USER_AGENT}
        mixedContentMode="always"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  webview: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  banner300x250: {
    width: 300,
    height: 250,
    alignSelf: 'center',
    marginVertical: 15,
    backgroundColor: 'transparent',
  },
  container728: {
    alignSelf: 'center',
    marginVertical: 15,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  nativeBanner: {
    width: '100%',
    height: 150,
    alignSelf: 'center',
    marginVertical: 15,
    backgroundColor: 'transparent',
  }
});
