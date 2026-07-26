import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  FlatList,  // kept in import list for compatibility but not used — removing below
  Animated
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { apiService } from '../services/apiService';
import { AdBanner300x250 } from '../components/AdBanner';

const { width } = Dimensions.get('window');

// ─── Pure Helpers (module-level — zero allocation per render) ────────────────

/**
 * Pads episode numbers to 2 digits, e.g. "3" -> "03"
 */
function padEpisodeNumber(numStr) {
  const parsed = parseInt(numStr, 10);
  if (isNaN(parsed)) return numStr;
  return parsed < 10 ? `0${parsed}` : String(parsed);
}

// ─── Episode Button ───────────────────────────────────────────────────────────

// Memoized episode button — only re-renders if epNum, season, or onPress changes
const EpisodeButton = memo(({ epNum, onPress }) => (
  <TouchableOpacity
    style={styles.episodeSquare}
    activeOpacity={0.7}
    onPress={onPress}
  >
    <Text style={styles.episodeSquareText}>{padEpisodeNumber(epNum)}</Text>
  </TouchableOpacity>
));

// ─── Details Screen ───────────────────────────────────────────────────────────

export default function DetailsScreen({ route, navigation }) {
  const { id } = route.params;
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);

  // ── Animated values as refs — no extra state slot, stops on unmount ──────
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const pulseLoopRef = useRef(null);

  // ── Pulse animation ───────────────────────────────────────────────────────
  useEffect(() => {
    if (loading) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.7, duration: 850, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 850, useNativeDriver: true }),
        ])
      );
      pulseLoopRef.current = loop;
      loop.start();
    } else {
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
        pulseLoopRef.current = null;
      }
    }

    return () => {
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
        pulseLoopRef.current = null;
      }
    };
  }, [loading, pulseAnim]);

  // ── Data Load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const loadDetails = async () => {
      try {
        setLoading(true);
        const data = await apiService.getMediaDetails(id);
        if (cancelled) return;
        setDetails(data);
        if (data && data.seasons && data.seasons.length > 0) {
          setSelectedSeason(data.seasons[0]);
        }
      } catch (e) {
        if (!cancelled) console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDetails();
    return () => { cancelled = true; };
  }, [id]);

  // ── Memoized Derived Values ───────────────────────────────────────────────

  const isTvShow = useMemo(
    () => !!(details && details.seasons && details.seasons.length > 0),
    [details]
  );

  const episodesForSelectedSeason = useMemo(() => {
    if (!selectedSeason) return [];
    if (selectedSeason.allEp && selectedSeason.allEp.trim() !== '') {
      return selectedSeason.allEp.split(',').map(val => val.trim()).filter(Boolean);
    }
    // Fallback: generate sequence up to ep count
    const total = selectedSeason.ep || 1;
    const eps = [];
    for (let i = 1; i <= total; i++) eps.push(String(i));
    return eps;
  }, [selectedSeason]);

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const handleSeasonToggle = useCallback(() => {
    setShowSeasonDropdown(prev => !prev);
  }, []);

  const handleSeasonSelect = useCallback((sItem) => {
    setSelectedSeason(sItem);
    setShowSeasonDropdown(false);
  }, []);

  // Pre-build stable onPress handlers for episodes keyed by epNum + season
  // so EpisodeButton memo is effective.
  const episodePressHandlersRef = useRef({});

  const getEpisodeHandler = useCallback((epNum) => {
    const key = `s${selectedSeason?.se}_e${epNum}`;
    if (!episodePressHandlersRef.current[key]) {
      episodePressHandlersRef.current[key] = () =>
        navigation.navigate('Player', {
          id: details.id,
          title: details.title,
          season: selectedSeason.se,
          episode: epNum,
          defaultLanguage: details.audioLanguages && details.audioLanguages[0],
        });
    }
    return episodePressHandlersRef.current[key];
  }, [navigation, details, selectedSeason]);

  // Clear handler cache when season changes to avoid stale closures
  useEffect(() => {
    episodePressHandlersRef.current = {};
  }, [selectedSeason]);

  // ── Loading Skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Animated.View style={[styles.skeletonBanner, { opacity: pulseAnim }]} />
        <View style={styles.contentContainer}>
          <Animated.View style={[styles.skeletonLine, { width: '80%', height: 26, marginBottom: 16, opacity: pulseAnim }]} />
          <View style={styles.badgeRow}>
            <Animated.View style={[styles.skeletonBadge, { opacity: pulseAnim }]} />
            <Animated.View style={[styles.skeletonBadge, { opacity: pulseAnim }]} />
          </View>
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Poster Image */}
      <View style={styles.posterContainer}>
        <ExpoImage
          source={{ uri: details.poster }}
          style={styles.poster}
          contentFit="cover"
          transition={250}
          cachePolicy="memory-disk"
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
            onPress={() => navigation.navigate('Player', {
              id: details.id,
              title: details.title,
              defaultLanguage: details.audioLanguages && details.audioLanguages[0],
            })}
          >
            <Text style={styles.playButtonText}>▶ Play Movie</Text>
          </TouchableOpacity>
        ) : (
          // TV Show Custom Season/Episode Selector
          <View style={styles.tvSelectorContainer}>
            {/* Season Dropdown Selector */}
            <View style={styles.dropdownWrapper}>
              <TouchableOpacity
                style={styles.dropdownBtn}
                activeOpacity={0.8}
                onPress={handleSeasonToggle}
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
                        onPress={() => handleSeasonSelect(sItem)}
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
                <EpisodeButton
                  key={epNum}
                  epNum={epNum}
                  onPress={getEpisodeHandler(epNum)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        <Text style={styles.sectionTitle}>Overview</Text>
        <Text style={styles.description}>{details.description}</Text>
        <AdBanner300x250 />
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    height: width * 0.9,
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
    color: '#F87171',
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
