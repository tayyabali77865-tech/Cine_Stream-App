import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, SafeAreaView, Platform, StatusBar } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView } from 'react-native-webview';
import { checkAndPromptUpdate } from '../services/UpdateService';

const SmartlinkAdContext = createContext(null);

export function useSmartlinkAd() {
  return useContext(SmartlinkAdContext);
}

const GLOBAL_INTERVAL = 5 * 60; // 300 seconds (5 minutes)
const PLAYER_INTERVAL = 10 * 60; // 600 seconds (10 minutes)
const GLOBAL_TIMER_KEY = '@smartlink_global_timer';
const PLAYER_TIMER_KEY = '@smartlink_player_timer';

const SMARTLINK_URLS = [
  'https://floodingfibre.com/bk04dped?key=c6ad1ebb2747d9a055c2b772fd444eb7',
  'https://floodingfibre.com/hbt4r32b?key=948a450a348f4cf449c6a66d46e8d422',
  'https://floodingfibre.com/jtm9mjv7i?key=0d4f7f0be23c88461796ee7296136ac4'
];

export function SmartlinkAdProvider({ children }) {
  const [globalTimer, setGlobalTimer] = useState(GLOBAL_INTERVAL);
  const [playerTimer, setPlayerTimer] = useState(PLAYER_INTERVAL);
  const [isPlayerActive, setIsPlayerActive] = useState(false);
  
  const [isAdVisible, setIsAdVisible] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [currentUrl, setCurrentUrl] = useState('');
  
  const pendingActionRef = useRef(null);
  const adCloseTimerRef = useRef(null);
  
  // Refs for setInterval access
  const globalTimerRef = useRef(GLOBAL_INTERVAL);
  const playerTimerRef = useRef(PLAYER_INTERVAL);
  const isPlayerActiveRef = useRef(false);
  const isAdVisibleRef = useRef(false);

  // Sync state to refs
  useEffect(() => { isPlayerActiveRef.current = isPlayerActive; }, [isPlayerActive]);
  useEffect(() => { isAdVisibleRef.current = isAdVisible; }, [isAdVisible]);
  
  // Load saved timers on mount
  useEffect(() => {
    // Check for OTA Updates silently on startup
    const checkUpdates = async () => {
      try {
        const AD_CONFIG_URLS = [
          'https://cinestream-app-production-640b.up.railway.app/api/ad-config',
          'http://192.168.0.40:8000/api/ad-config',
          'http://10.0.2.2:8000/api/ad-config',
        ];
        for (const url of AD_CONFIG_URLS) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (res.ok) {
              const data = await res.json();
              if (data && data.appUpdateLink) {
                checkAndPromptUpdate(data.appUpdateLink);
              }
              break; // Stop checking other URLs if this one succeeds
            }
          } catch (err) {
            // Try next
          }
        }
      } catch (e) {
        console.warn('OTA Check failed', e);
      }
    };
    checkUpdates();

    AsyncStorage.multiGet([GLOBAL_TIMER_KEY, PLAYER_TIMER_KEY]).then((values) => {
      const gTimer = values.find(v => v[0] === GLOBAL_TIMER_KEY)?.[1];
      const pTimer = values.find(v => v[0] === PLAYER_TIMER_KEY)?.[1];
      if (gTimer) {
        const val = parseInt(gTimer, 10);
        setGlobalTimer(val);
        globalTimerRef.current = val;
      }
      if (pTimer) {
        const val = parseInt(pTimer, 10);
        setPlayerTimer(val);
        playerTimerRef.current = val;
      }
    });
  }, []);

  const triggerAd = (actionFn, executeInstantly = false) => {
    if (isAdVisibleRef.current) {
      if (actionFn) actionFn(); // Execute action instantly if an ad is already blocking the screen
      return;
    }
    const randomUrl = SMARTLINK_URLS[Math.floor(Math.random() * SMARTLINK_URLS.length)];
    setCurrentUrl(randomUrl);
    
    if (executeInstantly && actionFn) {
      actionFn();
      pendingActionRef.current = null;
    } else {
      pendingActionRef.current = actionFn;
    }
    
    setCountdown(5);
    setIsAdVisible(true);
    
    adCloseTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(adCloseTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Master Timer loop for Automatic Popups
  useEffect(() => {
    let saveCounter = 0;
    
    const ticker = setInterval(() => {
      // Pause automatic timers while an ad is currently visible
      if (isAdVisibleRef.current) return;

      if (isPlayerActiveRef.current) {
        playerTimerRef.current -= 1;
        if (playerTimerRef.current <= 0) {
          playerTimerRef.current = PLAYER_INTERVAL;
          triggerAd(null, false); // trigger automatic popup
        }
        setPlayerTimer(playerTimerRef.current);
      } else {
        globalTimerRef.current -= 1;
        if (globalTimerRef.current <= 0) {
          globalTimerRef.current = GLOBAL_INTERVAL;
          triggerAd(null, false); // trigger automatic popup
        }
        setGlobalTimer(globalTimerRef.current);
      }
      
      // Save to async storage every 10 seconds to persist timers across restarts
      saveCounter++;
      if (saveCounter >= 10) {
        saveCounter = 0;
        AsyncStorage.multiSet([
          [GLOBAL_TIMER_KEY, globalTimerRef.current.toString()],
          [PLAYER_TIMER_KEY, playerTimerRef.current.toString()]
        ]);
      }
    }, 1000);

    return () => clearInterval(ticker);
  }, []);

  // Intercept button clicks
  const showAdIfReady = (actionFn, actionType = 'GENERAL', executeInstantly = false) => {
    if (actionType === 'PLAYER_ACTION') {
      if (playerTimerRef.current < 60) {
        // Less than 1 minute remaining for automatic popup, skip this click ad
        if (actionFn) actionFn();
        return;
      }
    }
    // No cooldown for click ads, always trigger
    triggerAd(actionFn, executeInstantly);
  };

  const handleCloseAd = () => {
    if (countdown > 0) return; 
    setIsAdVisible(false);
    
    if (pendingActionRef.current) {
      pendingActionRef.current();
      pendingActionRef.current = null;
    }
  };

  const onShouldStartLoadWithRequest = (request) => {
    return request.url.startsWith('http');
  };

  return (
    <SmartlinkAdContext.Provider value={{ showAdIfReady, setIsPlayerActive }}>
      {children}
      <Modal
        visible={isAdVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          if (countdown === 0) handleCloseAd();
        }}
      >
        <SafeAreaView style={styles.container}>
          <StatusBar hidden />
          {currentUrl ? (
            <WebView
              source={{ uri: currentUrl }}
              style={styles.webview}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#E50914" />
                </View>
              )}
              onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              allowsInlineMediaPlayback={true}
            />
          ) : null}

          <View style={styles.controlsContainer}>
            {countdown > 0 ? (
              <View style={styles.timerBadge}>
                <Text style={styles.timerText}>Skip in {countdown}s</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.closeButton} onPress={handleCloseAd}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </SafeAreaView>
      </Modal>
    </SmartlinkAdContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#09090C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlsContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : 20,
    right: 20,
    zIndex: 9999,
  },
  timerBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  timerText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  closeButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  closeText: { color: '#fff', fontSize: 18, fontWeight: 'bold', lineHeight: 20 }
});
