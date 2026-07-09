import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  Dimensions,
  FlatList,
  Animated
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { apiService } from '../services/apiService';

const { width } = Dimensions.get('window');

export default function DetailsScreen({ route, navigation }) {
  const { id } = route.params;
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(0.3));

  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.7,
            duration: 850,
            useNativeDriver: true
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 850,
            useNativeDriver: true
          })
        ])
      ).start();
    }
  }, [loading]);

  useEffect(() => {
    loadDetails();
  }, [id]);

  const loadDetails = async () => {
    try {
      setLoading(true);
      const data = await apiService.getMediaDetails(id);
      setDetails(data);
      
      // Auto-select first season if available
      if (data && data.seasons && data.seasons.length > 0) {
        setSelectedSeason(data.seasons[0]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Animated Banner Skeleton */}
        <Animated.View style={[styles.skeletonBanner, { opacity: pulseAnim }]} />
        
        <View style={styles.contentContainer}>
          {/* Animated Title Skeleton */}
          <Animated.View style={[styles.skeletonLine, { width: '80%', height: 26, marginBottom: 16, opacity: pulseAnim }]} />
          
          {/* Animated Badge Row Skeleton */}
          <View style={styles.badgeRow}>
            <Animated.View style={[styles.skeletonBadge, { opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonBadge, { opacity: pulseAnim }]} />
          </View>
          
          {/* Animated Description Lines Skeleton */}
          <View style={{ marginTop: 24 }}>
            <Animated.View style={[styles.skeletonLine, { width: '100%', height: 14, marginBottom: 8, opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonLine, { width: '100%', height: 14, marginBottom: 8, opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonLine, { width: '60%', height: 14, opacity: pulseAnim }]} />
          </View>
        </View>
      </ScrollView>
    );
  }

  if (!details) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load details.</Text>
      </View>
    );
  }

  // Parse episodes of the selected season correctly using allEp if available
  let episodesForSelectedSeason = [];
  if (selectedSeason) {
    if (selectedSeason.allEp && selectedSeason.allEp.trim() !== '') {
      episodesForSelectedSeason = selectedSeason.allEp.split(',').map(val => val.trim()).filter(Boolean);
    } else {
      // Fallback: if no allEp list, generate sequence up to ep count
      const total = selectedSeason.ep || 1;
      for (let i = 1; i <= total; i++) {
        episodesForSelectedSeason.push(String(i));
      }
    }
  }

  const isTvShow = details.seasons && details.seasons.length > 0;

  // Pads episode numbers to 2 digits, e.g. "3" -> "03"
  const padEpisodeNumber = (numStr) => {
    const parsed = parseInt(numStr, 10);
    if (isNaN(parsed)) return numStr;
    return parsed < 10 ? `0${parsed}` : String(parsed);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Poster Image */}
      <View style={styles.posterContainer}>
        <ExpoImage 
          source={{ uri: details.poster }} 
          style={styles.poster}
          contentFit="cover"
          transition={250}
        />
        <View style={styles.overlay} />
      </View>

      <View style={styles.contentContainer}>
        <Text style={styles.title}>{details.title}</Text>
        
        <View style={styles.badgeRow}>
          {(details.audioLanguages || []).map((lang, idx) => (
            <View key={idx} style={styles.langBadge}>
              <Text style={styles.langBadgeText}>{lang}</Text>
            </View>
          ))}
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{details.type}</Text>
          </View>
        </View>

        {/* Play Area / Episode Selector */}
        {!isTvShow ? (
          // Movie Play Button
          <TouchableOpacity 
            style={styles.playButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Player', { id: details.id, title: details.title, defaultLanguage: details.audioLanguages && details.audioLanguages[0] })}
          >
            <Text style={styles.playButtonText}>▶ Play Movie</Text>
          </TouchableOpacity>
        ) : (
          // TV Show Custom Season/Episode Selector (matches user's mock image)
          <View style={styles.tvSelectorContainer}>
            {/* Season Dropdown Selector */}
            <View style={styles.dropdownWrapper}>
              <TouchableOpacity 
                style={styles.dropdownBtn}
                activeOpacity={0.8}
                onPress={() => setShowSeasonDropdown(!showSeasonDropdown)}
              >
                <Text style={styles.dropdownBtnText}>
                  Season {selectedSeason ? String(selectedSeason.se).padStart(2, '0') : '01'}
                </Text>
                <Text style={styles.dropdownChevron}>▼</Text>
              </TouchableOpacity>
              
              {/* Dropdown Menu Options */}
              {showSeasonDropdown && (
                <View style={styles.dropdownMenu}>
                  <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                    {details.seasons.map((sItem) => (
                      <TouchableOpacity
                        key={sItem.se}
                        style={[
                          styles.dropdownMenuItem,
                          selectedSeason && selectedSeason.se === sItem.se && styles.dropdownMenuItemActive
                        ]}
                        onPress={() => {
                          setSelectedSeason(sItem);
                          setShowSeasonDropdown(false);
                        }}
                      >
                        <Text style={styles.dropdownMenuItemText}>
                          Season {String(sItem.se).padStart(2, '0')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Horizontal Scrolling Episodes List */}
            <Text style={styles.epTitle}>Episodes</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.episodeScrollRow}
            >
              {episodesForSelectedSeason.map((epNum) => (
                <TouchableOpacity
                  key={epNum}
                  style={styles.episodeSquare}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Player', { 
                    id: details.id, 
                    title: details.title,
                    season: selectedSeason.se, 
                    episode: epNum,
                    defaultLanguage: details.audioLanguages && details.audioLanguages[0]
                  })}
                >
                  <Text style={styles.episodeSquareText}>{padEpisodeNumber(epNum)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={styles.sectionTitle}>Overview</Text>
        <Text style={styles.description}>{details.description}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090C',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  posterContainer: {
    width: width,
    height: width * 0.9, // Shorter poster height layout
    position: 'relative',
    backgroundColor: '#15151A',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(9, 9, 12, 0.4)',
  },
  contentContainer: {
    paddingHorizontal: 20,
    marginTop: -40,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: '#09090C',
    paddingTop: 30,
    zIndex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  langBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  langBadgeText: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '600',
  },
  typeBadge: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  typeBadgeText: {
    color: '#F87171', // Light red
    fontSize: 12,
    fontWeight: '700',
  },
  playButton: {
    backgroundColor: '#E50914',
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    elevation: 5,
  },
  playButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 12,
    marginTop: 18,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    color: '#9CA3AF',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#09090C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 16,
  },
  tvSelectorContainer: {
    marginBottom: 24,
    zIndex: 10,
  },
  dropdownWrapper: {
    position: 'relative',
    marginBottom: 16,
    zIndex: 100,
  },
  dropdownBtn: {
    width: 140,
    height: 42,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  dropdownBtnText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownChevron: {
    color: '#E50914',
    fontSize: 10,
    fontWeight: 'bold',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 46,
    left: 0,
    width: 140,
    backgroundColor: '#15151A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 999,
  },
  dropdownMenuItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  dropdownMenuItemActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
  },
  dropdownMenuItemText: {
    color: '#D1D5DB',
    fontSize: 13,
    fontWeight: '500',
  },
  epTitle: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  episodeScrollRow: {
    flexDirection: 'row',
    paddingRight: 16,
  },
  episodeSquare: {
    width: 60,
    height: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  episodeSquareText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  skeletonBanner: {
    width: '100%',
    height: 300,
    backgroundColor: '#16161A',
  },
  skeletonLine: {
    backgroundColor: '#16161A',
    borderRadius: 6,
  },
  skeletonBadge: {
    width: 70,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#16161A',
    marginRight: 10,
  }
});
