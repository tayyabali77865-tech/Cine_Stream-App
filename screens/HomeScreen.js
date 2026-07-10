import React, { useEffect, useState, useCallback, useRef, memo, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  ScrollView,
  Animated
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { apiService } from '../services/apiService';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;

// Card height is deterministic: poster (aspectRatio 2/3) + title + margin
const CARD_POSTER_HEIGHT = Math.round(COLUMN_WIDTH * 1.5);
const CARD_TITLE_HEIGHT = 8 + 14 + 4; // marginTop + fontSize + paddingH
const CARD_TOTAL_HEIGHT = CARD_POSTER_HEIGHT + CARD_TITLE_HEIGHT + 20; // +marginBottom

// Skeleton dummy items — module-level constant, never re-created
const SKELETON_DATA = Array.from({ length: 6 }, (_, i) => ({ id: `skeleton-${i}` }));

// Filter and category lists — module-level constants
const FILTER_LIST = ['Trending', 'Latest', 'Hollywood', 'Bollywood', 'Korean', 'Chinese', 'South Indian'];
const CATEGORY_LIST = ['All', 'Movies', 'Series', 'Anime'];

// Language detection list — module-level constant
const LANGUAGES = [
  'Hindi', 'English', 'Tamil', 'Telugu', 'Korean', 'Japanese',
  'Malayalam', 'Bengali', 'Kannada', 'Punjabi', 'Spanish',
  'French', 'Marathi', 'Arabic', 'Urdu', 'Chinese'
];

// ─── Pure Utility Functions (module-level — zero allocation per render) ──────

/**
 * Returns language detected from title string.
 * Pure function — no closures, safe to call anywhere.
 */
function detectLanguage(title) {
  if (!title) return 'Original';
  const titleLower = title.toLowerCase();
  for (const lang of LANGUAGES) {
    if (titleLower.includes(lang.toLowerCase())) return lang;
  }
  return 'Original';
}

function makeUnique(list) {
  const seenIds = new Set();
  return list.filter(item => {
    if (!item || !item.id || seenIds.has(item.id)) return false;
    seenIds.add(item.id);
    return true;
  });
}

function applyClientSideFilter(list, filterName, categoryName) {
  let filtered = list;

  if (categoryName !== 'All') {
    filtered = filtered.filter(item => {
      const typeLower = (item.type || '').toLowerCase();
      const titleLower = item.title.toLowerCase();
      const countryLower = (item.country || '').toLowerCase();
      const channelLower = (item.channel || '').toLowerCase();

      if (categoryName === 'Movies') {
        return typeLower === 'movie' && countryLower !== 'japan' && !channelLower.includes('anime') && !titleLower.includes('anime');
      }
      if (categoryName === 'Series') {
        return typeLower === 'tv show' && countryLower !== 'japan' && !channelLower.includes('anime') && !titleLower.includes('anime');
      }
      if (categoryName === 'Anime') {
        return countryLower === 'japan' ||
               channelLower.includes('anime') ||
               titleLower.includes('anime') ||
               titleLower.includes('naruto') ||
               titleLower.includes('boruto') ||
               titleLower.includes('jujutsu') ||
               titleLower.includes('one piece') ||
               titleLower.includes('demon slayer');
      }
      return true;
    });
  }

  if (filterName !== 'Latest' && filterName !== 'Trending') {
    filtered = filtered.filter(item => {
      const titleLower = item.title.toLowerCase();
      const countryLower = (item.country || '').toLowerCase();

      if (filterName === 'Bollywood') {
        return countryLower === 'india' &&
               !titleLower.includes('tamil') &&
               !titleLower.includes('telugu') &&
               !titleLower.includes('malayalam') &&
               !titleLower.includes('kannada');
      }
      if (filterName === 'Hollywood') {
        return countryLower !== 'india' &&
               countryLower !== 'korea' &&
               countryLower !== 'china' &&
               countryLower !== 'japan' &&
               !titleLower.includes('korean') &&
               !titleLower.includes('chinese') &&
               !titleLower.includes('japanese');
      }
      if (filterName === 'Korean') {
        return countryLower === 'korea' || countryLower === 'south korea' || titleLower.includes('korean');
      }
      if (filterName === 'Chinese') {
        return countryLower === 'china' || countryLower === 'hong kong' || titleLower.includes('chinese');
      }
      if (filterName === 'South Indian') {
        return countryLower === 'india' && (
          titleLower.includes('tamil') ||
          titleLower.includes('telugu') ||
          titleLower.includes('malayalam') ||
          titleLower.includes('kannada')
        );
      }
      return true;
    });
  }

  return filtered;
}

function sortMediaList(list, isSearchActive, activeFilter) {
  return [...list].sort((a, b) => {
    const langA = detectLanguage(a.title);
    const langB = detectLanguage(b.title);

    const getPriority = (lang) => {
      if (lang === 'Hindi') return 1;
      if (lang === 'English') return 2;
      if (lang === 'Original') return 4;
      return 3;
    };

    const priorityA = getPriority(langA);
    const priorityB = getPriority(langB);

    if (priorityA !== priorityB) return priorityA - priorityB;

    if (isSearchActive || activeFilter !== 'Trending') {
      const ratingA = a.rating || 0;
      const ratingB = b.rating || 0;
      if (ratingB !== ratingA) return ratingB - ratingA;
    }

    return 0;
  });
}

// ─── getItemLayout for 2-column FlatList ──────────────────────────────────────
// React Native can skip layout measurement when this is provided — major perf win.

const getItemLayout = (_, index) => {
  const rowIndex = Math.floor(index / 2);
  return {
    length: CARD_TOTAL_HEIGHT,
    offset: CARD_TOTAL_HEIGHT * rowIndex,
    index,
  };
};

// ─── Skeleton Item ────────────────────────────────────────────────────────────

// Renders a single skeleton card. Defined outside component so memo works properly.
const SkeletonCard = memo(({ pulseAnim }) => (
  <View style={styles.card}>
    <Animated.View style={[styles.posterWrapper, styles.skeletonPoster, { opacity: pulseAnim }]} />
    <Animated.View style={[styles.movieTitle, styles.skeletonText, { opacity: pulseAnim }]} />
  </View>
));

// ─── Media Card ───────────────────────────────────────────────────────────────

// Memoized card — posterUri is a string so shallow comparison in memo works perfectly.
// Passing `item.poster` as a string prevents ExpoImage source object from being
// recreated every render, which was the primary cause of MediaCard busting its memo.
const MediaCard = memo(({ posterUri, title, type, onPress }) => (
  <TouchableOpacity
    style={styles.card}
    activeOpacity={0.8}
    onPress={onPress}
  >
    <View style={styles.posterWrapper}>
      <ExpoImage
        source={posterUri}
        style={styles.poster}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
      />
      <View style={styles.badgeContainer}>
        <Text style={styles.badgeText}>{type}</Text>
      </View>
      <View style={styles.langBadgeContainer}>
        <Text style={styles.langBadgeText}>{detectLanguage(title)}</Text>
      </View>
    </View>
    <Text style={styles.movieTitle} numberOfLines={1}>{title}</Text>
  </TouchableOpacity>
));

// ─── Footer Component ─────────────────────────────────────────────────────────

// Keep as a named class reference — passed directly as ListFooterComponent prop.
// Do NOT wrap in useMemo as JSX — passing a new element reference triggers full
// FlatList diffs. Instead, pass the component and use extraData to control updates.
const ListFooter = memo(({ loadingMore }) => {
  if (!loadingMore) return null;
  return <ActivityIndicator size="small" color="#E50914" style={styles.footerIndicator} />;
});

// ─── Home Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeFilter, setActiveFilter] = useState('Trending');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [showSidebar, setShowSidebar] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  // ── Animated values as refs — no state slot used, no extra re-render ──
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const slideAnim = useRef(new Animated.Value(250)).current;

  // ── Sync refs for request guarding (prevents concurrent/race page loads) ──
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);

  // ── Keep a ref to the current animation loop so we can stop it cleanly ──
  const pulseLoopRef = useRef(null);

  // ── Pulse animation — start/stop based on loading flag ───────────────────
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
      // Stop the animation loop to release the native driver reference
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
        pulseLoopRef.current = null;
      }
    }

    // Cleanup on unmount
    return () => {
      if (pulseLoopRef.current) {
        pulseLoopRef.current.stop();
        pulseLoopRef.current = null;
      }
    };
  }, [loading, pulseAnim]);

  // ── Initial data load ────────────────────────────────────────────────────
  useEffect(() => {
    loadTrendingData(0, false, 'Trending', 'All');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sidebar Animations ───────────────────────────────────────────────────

  const openSidebar = useCallback(() => {
    setShowSidebar(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const closeSidebar = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 250,
      duration: 220,
      useNativeDriver: true,
    }).start(() => setShowSidebar(false));
  }, [slideAnim]);

  // ─── Data Loading ─────────────────────────────────────────────────────────

  const loadTrendingData = useCallback(async (
    targetPage = 0,
    isLoadMore = false,
    currentFilter = activeFilter,
    currentCategory = activeCategory
  ) => {
    if (isLoadMore && (loadingMoreRef.current || !hasMore)) return;
    if (!isLoadMore && loadingRef.current && targetPage === 0) return;

    try {
      setIsOffline(false);
      if (isLoadMore) {
        setLoadingMore(true);
        loadingMoreRef.current = true;
      } else {
        setLoading(true);
        loadingRef.current = true;
        setHasMore(true);
      }

      const rawData = await apiService.getTrendingMedia(targetPage, currentFilter, currentCategory);
      const filteredData = applyClientSideFilter(rawData, currentFilter, currentCategory);

      if (rawData.length === 0) {
        setHasMore(false);
      } else {
        const maxPages = currentCategory === 'Anime' ? 12 : 5;
        if (filteredData.length === 0 && rawData.length > 0 && targetPage < maxPages) {
          await new Promise(resolve => setTimeout(resolve, 800));
          await loadTrendingData(targetPage + 1, isLoadMore, currentFilter, currentCategory);
          return;
        }
        if (targetPage === 0) {
          setMediaList(sortMediaList(makeUnique(filteredData), false, currentFilter));
        } else {
          const sortedNewBatch = sortMediaList(filteredData, false, currentFilter);
          setMediaList(prev => makeUnique([...prev, ...sortedNewBatch]));
        }
        setPage(targetPage);
      }
    } catch (e) {
      console.error(e);
      if (!isLoadMore) setIsOffline(true);
    } finally {
      setLoading(false);
      loadingRef.current = false;
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
    // loadingMore and hasMore are intentionally not in deps — they are read as
    // guard flags at the top; stale closure is fine here (acts like a snapshot guard).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter, activeCategory, hasMore]);

  // ─── Search ───────────────────────────────────────────────────────────────

  const triggerSearch = useCallback(async (text) => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setIsSearching(false);
      loadTrendingData(0, false, activeFilter, activeCategory);
      return;
    }
    try {
      setIsOffline(false);
      setIsSearching(true);
      setLoading(true);
      loadingRef.current = true;
      setHasMore(true);
      const data = await apiService.searchMedia(trimmed, 0);
      setMediaList(sortMediaList(makeUnique(data), true, activeFilter));
      setPage(0);
    } catch (e) {
      console.error(e);
      setIsOffline(true);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [activeFilter, activeCategory, loadTrendingData]);

  const handleSearch = useCallback((text) => {
    setSearchQuery(text);
  }, []);

  // Debounced search effect — fixed dependency array
  useEffect(() => {
    if (searchQuery.trim() === '') {
      if (isSearching) {
        setIsSearching(false);
        loadTrendingData(0, false, activeFilter, activeCategory);
      }
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      triggerSearch(searchQuery);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
    // isSearching intentionally omitted — we only want to react to searchQuery changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const loadSearchMore = useCallback(async (query, targetPage) => {
    if (loadingMoreRef.current || !hasMore) return;
    try {
      setLoadingMore(true);
      loadingMoreRef.current = true;
      const data = await apiService.searchMedia(query, targetPage);
      if (data.length === 0) {
        setHasMore(false);
      } else {
        const sortedNewBatch = sortMediaList(data, true, activeFilter);
        setMediaList(prev => makeUnique([...prev, ...sortedNewBatch]));
        setPage(targetPage);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [hasMore, activeFilter]);

  const handleLoadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    if (isSearching) {
      loadSearchMore(searchQuery, nextPage);
    } else {
      loadTrendingData(nextPage, true, activeFilter, activeCategory);
    }
  }, [loading, loadingMore, hasMore, page, isSearching, searchQuery, loadSearchMore, loadTrendingData, activeFilter, activeCategory]);

  // ─── Filter / Category Selection ─────────────────────────────────────────

  const selectFilter = useCallback((filterName) => {
    setActiveFilter(filterName);
    setShowFilterMenu(false);
    loadTrendingData(0, false, filterName, activeCategory);
  }, [activeCategory, loadTrendingData]);

  const selectCategory = useCallback((categoryName) => {
    setActiveCategory(categoryName);
    setShowSidebar(false);
    loadTrendingData(0, false, activeFilter, categoryName);
  }, [activeFilter, loadTrendingData]);

  // ─── Render Helpers ───────────────────────────────────────────────────────

  // Stable per-item press handlers — keyed by item.id so memo(MediaCard) works.
  const pressHandlersRef = useRef({});

  const renderCard = useCallback(({ item }) => {
    if (!pressHandlersRef.current[item.id]) {
      pressHandlersRef.current[item.id] = () => navigation.navigate('Details', { id: item.id });
    }
    // Pass individual scalar/string props so MediaCard memo shallow-comparison works.
    // Passing the whole `item` object would always look "new" if the list array changed.
    return (
      <MediaCard
        posterUri={item.poster}
        title={item.title}
        type={item.type}
        onPress={pressHandlersRef.current[item.id]}
      />
    );
  }, [navigation]);

  // Pass ListFooter CLASS (not JSX element) as ListFooterComponent.
  // Use extraData so FlatList re-renders the footer when loadingMore flips,
  // without triggering a diff of every row.
  // (Passing JSX element via useMemo still changes the reference and causes full diffs.)

  // Memoized empty state
  const listEmpty = useMemo(() => (
    <View style={styles.centerContainer}>
      <Text style={styles.emptyText}>No results found in Netmirror.</Text>
    </View>
  ), []);

  // ─── Skeleton Render ──────────────────────────────────────────────────────

  const renderSkeletonItem = useCallback(() => (
    <SkeletonCard pulseAnim={pulseAnim} />
  ), [pulseAnim]);

  // ─── Retry Handler ────────────────────────────────────────────────────────

  const handleRetry = useCallback(() => {
    setIsOffline(false);
    if (isSearching) {
      triggerSearch(searchQuery);
    } else {
      loadTrendingData(0, false, activeFilter, activeCategory);
    }
  }, [isSearching, searchQuery, triggerSearch, loadTrendingData, activeFilter, activeCategory]);

  const handleClearSearch = useCallback(() => handleSearch(''), [handleSearch]);

  const handleToggleFilterMenu = useCallback(
    () => setShowFilterMenu(prev => !prev),
    []
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />

      {/* Custom Top App Header */}
      <View style={styles.appHeader}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoCine}>Cine</Text>
          <Text style={styles.logoStream}>Stream</Text>
        </View>
        <TouchableOpacity
          style={styles.menuIconBtn}
          activeOpacity={0.7}
          onPress={openSidebar}
        >
          <Text style={styles.menuIconText}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input Bar with Cross Clear Icon */}
      <View style={styles.searchContainer}>
        <TextInput
          placeholder="Search Movie, Series or Anime"
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={handleSearch}
          style={styles.searchInput}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity
            style={styles.clearSearchBtn}
            onPress={handleClearSearch}
            activeOpacity={0.7}
          >
            <Text style={styles.clearSearchText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Header Row with Filter Button */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionHeader}>
          {isSearching ? `Search Results` : `${activeCategory} - ${activeFilter}`}
        </Text>
        {!isSearching && (
          <TouchableOpacity
            style={styles.filterBtn}
            activeOpacity={0.7}
            onPress={handleToggleFilterMenu}
          >
            <Text style={styles.filterBtnText}>Filters ☰</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Horizontal Pill Selector Panel */}
      {showFilterMenu && !isSearching && (
        <View style={styles.filterMenuContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {FILTER_LIST.map((filterName) => {
              const isSelected = activeFilter === filterName;
              return (
                <TouchableOpacity
                  key={filterName}
                  style={[styles.filterPill, isSelected && styles.filterPillActive]}
                  activeOpacity={0.7}
                  onPress={() => selectFilter(filterName)}
                >
                  <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>
                    {filterName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {isOffline ? (
        <View style={styles.centerContainer}>
          <Text style={styles.offlineIconText}>📶</Text>
          <Text style={styles.offlineTitleText}>Connection Failed</Text>
          <Text style={styles.offlineSubText}>Please check your internet or retry connecting to the server.</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            activeOpacity={0.8}
            onPress={handleRetry}
          >
            <Text style={styles.retryBtnText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <FlatList
          key="skeleton-list"
          data={SKELETON_DATA}
          numColumns={2}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={renderSkeletonItem}
          keyExtractor={item => item.id}
        />
      ) : (
        <FlatList
          key="media-list"
          data={mediaList}
          renderItem={renderCard}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={styles.columnWrapper}
          removeClippedSubviews={false}
          maxToRenderPerBatch={6}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          initialNumToRender={6}
          ListEmptyComponent={listEmpty}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={ListFooter}
          extraData={loadingMore}
        />
      )}

      {/* Sidebar Navigation Drawer Overlay */}
      {showSidebar && (
        <View style={styles.sidebarOverlay}>
          <TouchableOpacity
            style={styles.sidebarBackdrop}
            activeOpacity={1}
            onPress={closeSidebar}
          />
          <Animated.View style={[styles.sidebarContent, { transform: [{ translateX: slideAnim }] }]}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.sidebarTitle}>Menu</Text>
              <TouchableOpacity onPress={closeSidebar} style={styles.closeSidebarBtn}>
                <Text style={styles.closeSidebarText}>✕</Text>
              </TouchableOpacity>
            </View>

            {CATEGORY_LIST.map((cat) => {
              const isSelected = activeCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.sidebarOption, isSelected && styles.sidebarOptionActive]}
                  onPress={() => selectCategory(cat)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sidebarOptionText, isSelected && styles.sidebarOptionTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090C',
  },
  appHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: StatusBar.currentHeight || 0,
    backgroundColor: '#0F0F14',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoCine: {
    color: '#E50914',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  logoStream: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  menuIconBtn: {
    padding: 8,
  },
  menuIconText: {
    color: '#FFF',
    fontSize: 24,
  },
  sidebarOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    flexDirection: 'row',
  },
  sidebarBackdrop: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sidebarContent: {
    width: 250,
    backgroundColor: '#0F0F14',
    paddingTop: 50,
    paddingHorizontal: 20,
    borderLeftWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingBottom: 12,
  },
  sidebarTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeSidebarBtn: {
    padding: 4,
  },
  closeSidebarText: {
    color: '#9CA3AF',
    fontSize: 18,
  },
  sidebarOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  sidebarOptionActive: {
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
    borderLeftWidth: 3,
    borderColor: '#E50914',
  },
  sidebarOptionText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },
  sidebarOptionTextActive: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    height: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingLeft: 16,
    paddingRight: 42,
    color: '#F3F4F6',
    fontSize: 14,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 28,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearSearchText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionHeader: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '700',
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.3)',
  },
  filterBtnText: {
    color: '#E50914',
    fontSize: 12,
    fontWeight: '700',
  },
  filterMenuContainer: {
    marginBottom: 16,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  filterPillActive: {
    backgroundColor: '#E50914',
    borderColor: '#E50914',
  },
  filterPillText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#FFF',
    fontWeight: '700',
  },
  listContainer: {
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  card: {
    width: COLUMN_WIDTH,
    marginBottom: 20,
  },
  posterWrapper: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#15151A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    elevation: 5,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  badgeContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(229, 9, 20, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  langBadgeContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  langBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  movieTitle: {
    color: '#F3F4F6',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 4,
  },
  centerContainer: {
    flex: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 15,
  },
  skeletonPoster: {
    backgroundColor: '#16161A',
    borderWidth: 0,
  },
  skeletonText: {
    backgroundColor: '#16161A',
    height: 14,
    borderRadius: 4,
    marginTop: 10,
    width: '75%',
  },
  offlineIconText: {
    fontSize: 48,
    marginBottom: 16,
  },
  offlineTitleText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  offlineSubText: {
    color: '#9CA3AF',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 24,
    lineHeight: 18,
  },
  retryBtn: {
    backgroundColor: '#E50914',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    elevation: 2,
  },
  retryBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  footerIndicator: {
    marginVertical: 16,
  },
});
