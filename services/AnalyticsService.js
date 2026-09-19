import { Platform } from 'react-native';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ? process.env.EXPO_PUBLIC_POSTHOG_API_KEY.trim() : null;
const POSTHOG_HOST = 'https://us.i.posthog.com/capture/';

// Generate or retrieve a random distinct ID for this installation
let distinctId = null;

async function getDistinctId() {
  if (distinctId) return distinctId;
  try {
    const savedId = await AsyncStorage.getItem('@posthog_distinct_id');
    if (savedId) {
      distinctId = savedId;
      return distinctId;
    }
    distinctId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    await AsyncStorage.setItem('@posthog_distinct_id', distinctId);
    return distinctId;
  } catch (e) {
    return 'user_fallback_' + Date.now();
  }
}

export const trackEvent = async (eventName, properties = {}) => {
  if (!POSTHOG_API_KEY) {
    console.warn('[Analytics] POSTHOG_API_KEY is not defined in .env! Tracking disabled.');
    return;
  }

  try {
    const id = await getDistinctId();
    const payload = {
      api_key: POSTHOG_API_KEY,
      event: eventName,
      distinct_id: id,
      properties: {
        $lib: 'custom-fetch',
        $os: Platform.OS,
        $os_version: Platform.Version,
        $app_version: Application.nativeApplicationVersion,
        ...properties,
      },
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(POSTHOG_HOST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    
    if (!response.ok) {
       console.warn('[Analytics] PostHog API error:', await response.text());
    }
  } catch (error) {
    console.warn('[Analytics] Failed to send event to PostHog:', error.message);
  }
};

export const trackScreenView = (screenName) => {
  return trackEvent('$pageview', {
    $current_url: screenName,
  });
};
