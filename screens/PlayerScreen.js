import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ActivityIndicator, 
  TouchableOpacity, 
  StatusBar,
  BackHandler
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { apiService } from '../services/apiService';

export default function PlayerScreen({ route, navigation }) {
  const { id, season, episode, defaultLanguage } = route.params;
  const [streamSources, setStreamSources] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeLanguage, setActiveLanguage] = useState(defaultLanguage || 'Hindi');

  useEffect(() => {
    loadStreamSources(activeLanguage);
    
    const backAction = () => {
      navigation.goBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    
    return () => backHandler.remove();
  }, [id, season, episode]);

  const loadStreamSources = async (lang = activeLanguage) => {
    try {
      setLoading(true);
      setError(null);
      const sources = await apiService.getStreamSources(id, season, episode, lang);
      setStreamSources(sources);
    } catch (e) {
      console.error(e);
      setError('Could not retrieve streaming links.');
    } finally {
      setLoading(false);
    }
  };

  const handleLanguageChange = (lang) => {
    setActiveLanguage(lang);
    loadStreamSources(lang);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#E50914" />
        <Text style={styles.statusText}>Loading...</Text>
      </View>
    );
  }

  if (error || !streamSources) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error || 'Stream error.'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Expo AV Video Player with Custom Headers */}
      <Video
        source={{
          uri: streamSources.videoUrl,
          headers: {
            'Referer': streamSources.referer,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        }}
        style={styles.videoPlayer}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        onError={(err) => {
          console.error('Video Error:', err);
          setError('Failed to play the video. The session token may have expired.');
        }}
      />

      {/* Floating Close Button */}
      <TouchableOpacity 
        style={styles.closeBtn} 
        onPress={() => navigation.goBack()}
        activeOpacity={0.7}
      >
        <Text style={styles.closeBtnText}>✕ Close Player</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlayer: {
    width: '100%',
    height: 350, // Fixed height profile to guarantee a taller size on portrait screens
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  closeBtn: {
    position: 'absolute',
    top: 24,
    left: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 10,
  },
  closeBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
