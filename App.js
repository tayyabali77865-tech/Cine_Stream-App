import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, StatusBar, Animated, ActivityIndicator, Image } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, TransitionPresets } from '@react-navigation/stack';
import { enableScreens } from 'react-native-screens';
import HomeScreen from './screens/HomeScreen';
import DetailsScreen from './screens/DetailsScreen';
import PlayerScreen from './screens/PlayerScreen';
import ViewAllScreen from './screens/ViewAllScreen';
import SearchScreen from './screens/SearchScreen';
import DownloadsScreen from './screens/DownloadsScreen';
import { SmartlinkAdProvider } from './context/SmartlinkAdContext';
import { DownloadProvider } from './context/DownloadContext';
import { trackScreenView } from './services/AnalyticsService';

// Enable native screen containers
enableScreens(true);

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createStackNavigator();

const NAVIGATOR_SCREEN_OPTIONS = {
  headerStyle: {
    backgroundColor: '#0F0F14',
    borderBottomWidth: 0,
    shadowColor: 'transparent',
  },
  headerTintColor: '#F3F4F6',
  headerTitleStyle: {
    fontWeight: 'bold',
  },
  cardStyle: { backgroundColor: '#09090C' },
};

import { registerForPushNotificationsAsync, sendPushTokenToServer } from './services/PushNotificationService';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const routeNameRef = useRef();
  const navigationRef = useRef();

  // Initialize Push Notifications
  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        sendPushTokenToServer(token);
      }
    });
  }, []);

  useEffect(() => {
    // Hide native splash screen and let our animated custom splash screen take over
    SplashScreen.hideAsync().catch(() => {});

    // Fade in the logo and text
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Show splash screen for 2.5 seconds total
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setShowSplash(false);
      });
    }, 2100);

    return () => clearTimeout(timer);
  }, [fadeAnim]);

  return (
    <>
      {showSplash ? (
        <View style={styles.splashContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#09090C" />
          <Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
            <Image
              source={require('./assets/icon.png')}
              style={styles.splashLogo}
              resizeMode="contain"
            />
            <Text style={styles.appTitle}>
              <Text style={{ color: '#E50914' }}>Cine</Text>Stream
            </Text>
            <Text style={styles.madeByText}>Made By Tayyab</Text>
            <ActivityIndicator size="small" color="#E50914" style={{ marginTop: 24 }} />
          </Animated.View>
        </View>
      ) : (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SmartlinkAdProvider>
            <DownloadProvider>
                <NavigationContainer
                  ref={navigationRef}
                  onReady={() => {
                    routeNameRef.current = navigationRef.current.getCurrentRoute().name;
                    trackScreenView(routeNameRef.current);
                  }}
                  onStateChange={async () => {
                    const previousRouteName = routeNameRef.current;
                    const currentRouteName = navigationRef.current.getCurrentRoute().name;
                    if (previousRouteName !== currentRouteName) {
                      trackScreenView(currentRouteName);
                    }
                    routeNameRef.current = currentRouteName;
                  }}
                >
                  <Stack.Navigator
                    initialRouteName="Home"
                    screenOptions={NAVIGATOR_SCREEN_OPTIONS}
                  >
                    <Stack.Screen
                      name="Home"
                      component={HomeScreen}
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="Details"
                      component={DetailsScreen}
                      options={{ title: 'Media Info' }}
                    />
                    <Stack.Screen
                      name="Player"
                      component={PlayerScreen}
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="Search"
                      component={SearchScreen}
                      options={{ 
                        headerShown: false,
                        ...TransitionPresets.ModalSlideFromBottomIOS,
                        presentation: 'transparentModal',
                      }}
                    />
                    <Stack.Screen
                      name="Downloads"
                      component={DownloadsScreen}
                      options={{ headerShown: false }}
                    />
                    <Stack.Screen
                      name="ViewAll"
                      component={ViewAllScreen}
                      options={{ headerShown: false }}
                    />
                  </Stack.Navigator>
                </NavigationContainer>
            </DownloadProvider>
          </SmartlinkAdProvider>
        </GestureHandlerRootView>
      )}
    </>
  );
}


const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#09090C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashLogo: {
    width: 100,
    height: 100,
    marginBottom: 16,
    borderRadius: 20,
  },
  appTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#F3F4F6',
    letterSpacing: 2,
    marginBottom: 8,
  },
  madeByText: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '600',
    letterSpacing: 1,
  },
});
