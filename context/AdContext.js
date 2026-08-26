import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

import { checkAndPromptUpdate } from '../services/UpdateService';

// ─── Ad Context ───────────────────────────────────────────────────────────────
// Remote ad config system — fetches ad settings from server on startup.
// Old users get ads without needing to update the app.

const AdContext = createContext({
  adsEnabled: false,
  adConfig: null,
  loading: true,
});

export function useAds() {
  return useContext(AdContext);
}

// How often to re-check ad config (5 minutes)
const AD_CONFIG_REFRESH_INTERVAL = 5 * 60 * 1000;

// Server URLs — matches apiService.js fallback chain
const AD_CONFIG_URLS = [
  'https://cinestream-app-production-640b.up.railway.app/api/ad-config',
  'http://192.168.0.40:8000/api/ad-config',
  'http://10.0.2.2:8000/api/ad-config',
];

async function fetchAdConfig() {
  for (const url of AD_CONFIG_URLS) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (_) {
      // Try next URL
    }
  }
  return null;
}

export function AdProvider({ children }) {
  const [adsEnabled, setAdsEnabled] = useState(false);
  const [adConfig, setAdConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  const loadAdConfig = async () => {
    try {
      const config = await fetchAdConfig();
      if (config) {
        setAdsEnabled(config.adsEnabled === true);
        setAdConfig(config);
        
        // Check for OTA updates
        if (config.appUpdateLink) {
          checkAndPromptUpdate(config.appUpdateLink);
        }
      }
    } catch (_) {
      // Silently fail — no ads shown if server unreachable
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load on startup
    loadAdConfig();

    // Periodically refresh config (catches remote changes without app restart)
    intervalRef.current = setInterval(loadAdConfig, AD_CONFIG_REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <AdContext.Provider value={{ adsEnabled, adConfig, loading }}>
      {children}
    </AdContext.Provider>
  );
}
