import React, { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Animated,
  Modal
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { apiService } from '../services/apiService';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import HomeSection from '../components/HomeSection';
import { useSmartlinkAd } from '../context/SmartlinkAdContext';

const { width } = Dimensions.get('window');
const gridItemWidth = (width - 80) / 5;

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
const EpisodeButton = memo(({ epNum, onPress, isGridItem }) => (
  <TouchableOpacity
    style={[styles.episodeSquare, isGridItem && { width: gridItemWidth, height: gridItemWidth }]}
    activeOpacity={0.7}
    onPress={onPress}
  >
    <Text style={styles.episodeSquareText}>{padEpisodeNumber(epNum)}</Text>
  </TouchableOpacity>
));

// ─── Details Screen ───────────────────────────────────────────────────────────

export default function DetailsScreen({ route, navigation }) {
  const isFocused = useIsFocused();
  const { id } = route.params;
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAllEpisodesModal, setShowAllEpisodesModal] = useState(false);
  const [showSeeMore, setShowSeeMore] = useState(false);
  
  const { showAdIfReady } = useSmartlinkAd();

  const handleTextLayout = useCallback((e) => {
    if (e.nativeEvent.lines.length >= 3) {
      setShowSeeMore(true);
    }
  }, []);

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
        console.log('[DetailsScreen] Loaded details trailer:', data ? data.trailer : 'no data');
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
        showAdIfReady(() =>
          navigation.navigate('Player', {
            id: details.id,
            title: details.title,
            season: selectedSeason.se,
            episode: epNum,
            defaultLanguage: details.audioLanguages && details.audioLanguages[0],
            seasons: details.seasons,
          }), 'GENERAL', true
        );
    }
    return episodePressHandlersRef.current[key];
  }, [navigation, details, selectedSeason, showAdIfReady]);

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
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Trailer Video Player instead of Poster Image */}
      <View style={styles.posterContainer}>
        {details.trailer ? (
          <>
            <Video
              source={{
                uri: details.trailer,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'Referer': 'https://netmirror.global/'
                }
              }}
              style={styles.poster}
              resizeMode={ResizeMode.COVER}
              shouldPlay={isFocused}
              isMuted={isMuted}
              isLooping={true}
              useNativeControls={false}
              onError={(err) => console.warn('[DetailsScreen] Trailer load error:', err)}
            />
            {/* Red Trailer Badge */}
            <View style={styles.trailerBadge}>
              <Text style={styles.trailerBadgeText}>TRAILER</Text>
            </View>
            {/* Sound Toggle Overlay Button */}
            <TouchableOpacity
              style={styles.soundButton}
              activeOpacity={0.7}
              onPress={() => setIsMuted(prev => !prev)}
            >
              <Ionicons
                name={isMuted ? "volume-mute" : "volume-high"}
                size={18}
                color="#FFF"
              />
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.noTrailerContainer}>
            <Ionicons name="videocam-off-outline" size={48} color="#4B5563" />
            <Text style={styles.noTrailerText}>Trailer not found</Text>
          </View>
        )}
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
            onPress={() => showAdIfReady(() => 
              navigation.navigate('Player', {
                id: details.id,
                title: details.title,
                defaultLanguage: details.audioLanguages && details.audioLanguages[0],
              }), 'GENERAL', true
            )}
          >
            <Text style={styles.playButtonText}>▶ Play Movie</Text>
          </TouchableOpacity>
        ) : (
          // TV Show Custom Season/Episode Selector
          <View style={styles.tvSelectorContainer}>
            {/* Season Dropdown Selector (Matching PlayerScreen style) */}
            <View style={{ marginBottom: 16 }}>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={handleSeasonToggle}
                activeOpacity={0.7}
              >
                <Text style={styles.pickerBtnText}>
                  Season {selectedSeason ? String(selectedSeason.se).padStart(2, '0') : '01'}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#FFF" />
              </TouchableOpacity>
            </View>

            {/* Horizontal Scrolling Episodes List */}
            <Text style={styles.epTitle}>Episodes</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.episodeScrollRow}
            >
              <TouchableOpacity
                style={[styles.episodeSquare, { backgroundColor: '#E50914' }]}
                activeOpacity={0.7}
                onPress={() => setShowAllEpisodesModal(true)}
              >
                <Text style={[styles.episodeSquareText, { color: '#ffffff' }]}>All</Text>
              </TouchableOpacity>
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
        <Text
          style={styles.description}
          numberOfLines={isExpanded ? undefined : 3}
          onTextLayout={handleTextLayout}
        >
          {details.description}
        </Text>
        {showSeeMore && (
          <TouchableOpacity
            style={styles.seeMoreBtn}
            onPress={() => setIsExpanded(prev => !prev)}
            activeOpacity={0.7}
          >
            <Text style={styles.seeMoreText}>
              {isExpanded ? 'View Less' : 'View More'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ marginTop: 10, marginHorizontal: -20 }}>
          <HomeSection
            title="Dubbed Languages"
            filter="Latest"
            category={details.type === 'TV Show' ? 'Series' : details.country === 'Japan' ? 'Anime' : 'Movies'}
            navigation={navigation}
            fetchSimilarTitle={details.title ? details.title.replace(/\[.*?\]/g, '').replace(/\bS\d+(-\bS\d+)?\b/gi, '').trim() : ''}
            strictMatchTitle={details.title ? details.title.replace(/\[.*?\]/g, '').replace(/\bS\d+(-\bS\d+)?\b/gi, '').trim() : ''}
            excludeId={details.id}
            hideViewAll={true}
          />
        </View>
      </View>
    </ScrollView>

      {details?.seasons?.length > 0 && (
        <Modal
          visible={showAllEpisodesModal}
          transparent={true}
          animationType="none"
          onRequestClose={() => setShowAllEpisodesModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>All Episodes</Text>
                <TouchableOpacity onPress={() => setShowAllEpisodesModal(false)}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.allEpisodesGrid}>
                {episodesForSelectedSeason.map((epNum) => (
                  <EpisodeButton
                    key={epNum}
                    epNum={epNum}
                    isGridItem={true}
                    onPress={() => {
                      setShowAllEpisodesModal(false);
                      getEpisodeHandler(epNum)();
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Season Selection Modal ── */}
      <Modal
        visible={showSeasonDropdown}
        transparent={true}
        animationType="none"
        onRequestClose={() => setShowSeasonDropdown(false)}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setShowSeasonDropdown(false)}>
          <View style={styles.modalBox}>
            <Text style={styles.seasonModalTitle}>Select Season</Text>
            <ScrollView style={{ width: '100%', maxHeight: 300 }}>
              {details?.seasons?.map((sItem) => (
                <TouchableOpacity
                  key={sItem.se}
                  style={styles.seasonRow}
                  onPress={() => handleSeasonSelect(sItem)}
                >
                  <Text style={[styles.seasonText, selectedSeason && selectedSeason.se === sItem.se && styles.activeSeasonText]}>
                    Season {String(sItem.se).padStart(2, '0')}
                  </Text>
                  {selectedSeason && selectedSeason.se === sItem.se && <Ionicons name="checkmark-circle" size={20} color="#E50914" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.cancelRow} onPress={() => setShowSeasonDropdown(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
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
    height: width * 0.56, // 16:9 aspect ratio
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
    marginTop: 0, // Removed overlapping negative margin
    backgroundColor: '#09090C',
    paddingTop: 16, // Adjusted padding to fit nicely below trailer
    zIndex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  langBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  langBadgeText: {
    color: '#D1D5DB',
    fontSize: 11,
    fontWeight: '600',
  },
  typeBadge: {
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  typeBadgeText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '700',
  },
  playButton: {
    backgroundColor: '#E50914',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    elevation: 5,
  },
  playButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Outfit_500Medium',
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pickerBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 6,
  },
  overlay: {
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center', 
    alignItems: 'center',
  },
  modalBox: {
    width: '86%',
    backgroundColor: '#1A1A22',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  seasonModalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  seasonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  seasonText: {
    fontSize: 16,
    color: '#D1D5DB',
    fontWeight: '500',
  },
  activeSeasonText: {
    color: '#FFF',
    fontWeight: '700',
  },
  cancelRow: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#121212',
    height: '60%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontFamily: 'Outfit_700Bold',
  },
  allEpisodesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-start',
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
    marginTop: 8,
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
    marginBottom: 12,
    zIndex: 10,
  },
  dropdownWrapper: {
    position: 'relative',
    marginBottom: 16,
    zIndex: 100,
  },
  dropdownBtn: {
    width: 120,
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  dropdownBtnText: {
    color: '#E5E7EB',
    fontSize: 13,
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
    gap: 10,
  },
  episodeSquare: {
    width: 46,
    height: 46,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  episodeSquareText: {
    color: '#FFF',
    fontSize: 14,
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
  },
  noTrailerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15151A',
  },
  noTrailerText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  soundButton: {
    position: 'absolute',
    bottom: 12, // Adjusted placement coordinate since overlap is removed
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  trailerBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: '#E50914',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
  },
  trailerBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  seeMoreBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  seeMoreText: {
    color: '#E50914',
    fontSize: 14,
    fontWeight: '700',
  }
});
