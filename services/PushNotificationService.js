import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Set up how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return null;
    }
    
    // Get the token that uniquely identifies this device
    try {
      // For bare workflow or custom clients, projectId needs to be specified.
      const projectId = "1a99f29d-aeac-4689-a694-afb2351a6083"; // Real EAS project ID
      try {
        const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
        token = tokenResponse.data;
      } catch (e) {
        const tokenResponse = await Notifications.getExpoPushTokenAsync();
        token = tokenResponse.data;
      }
    } catch (fallbackErr) {
      console.error('Error fetching push token:', fallbackErr);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export async function sendPushTokenToServer(token) {
  if (!token) return;

  const LIVE_URL = 'https://cinestream-app-production-640b.up.railway.app/api/register-push-token';
  
  try {
    const response = await fetch(LIVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });
    
    if (response.ok) {
      console.log('[PushNotifications] Token registered with server successfully.');
    } else {
      console.log('[PushNotifications] Server returned error when registering token.');
    }
  } catch (error) {
    console.warn('[PushNotifications] Failed to send token to server:', error.message);
  }
}
