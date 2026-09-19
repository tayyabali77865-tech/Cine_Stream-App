import { Platform } from 'react-native';
import * as Application from 'expo-application';

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
const POSTHOG_HOST = 'https://us.i.posthog.com/capture/';

// Generate a random distinct ID for this installation
let distinctId = null;

function getDistinctId() {
  if (distinctId) return distinctId;
  // Use a combination of timestamp and random math for a simple distinct id
  distinctId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
  return distinctId;
}

export const trackEvent = async (eventName, properties = {}) => {
  if (!POSTHOG_API_KEY) return;

  try {
    const payload = {
      api_key: POSTHOG_API_KEY,
      event: eventName,
      properties: {
        distinct_id: getDistinctId(),
        $lib: 'custom-fetch',
        $os: Platform.OS,
        $os_version: Platform.Version,
        $app_version: Application.nativeApplicationVersion,
        ...properties,
      },
      timestamp: new Date().toISOString(),
    };

    await fetch(POSTHOG_HOST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('[Analytics] Failed to send event to PostHog:', error.message);
  }
};

export const trackScreenView = (screenName) => {
  return trackEvent('$pageview', {
    $current_url: screenName,
  });
};
