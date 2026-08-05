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
  Animated,
  LayoutAnimation,
  UIManager,
  Platform,
  Alert
} from 'react-native';

if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}
import { Image as ExpoImage } from 'expo-image';
import { apiService, getCachedImageUri } from '../services/apiService';
import { Ionicons } from '@expo/vector-icons';
import { AdBanner728x90 } from '../components/AdBanner';

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
// Filters per category
const FILTER_LIST_ALL = ['Trending', 'Latest', 'Hollywood', 'Bollywood', 'Korean', 'Chinese', 'South Indian'];
const FILTER_LIST_ANIME = ['Trending', 'Latest', 'Hindi', 'English'];
const CATEGORY_LIST = ['All', 'Movies', 'Series', 'Anime'];

// Helper: get filters for the active category
function getFilterList(category) {
  if (category === 'Anime') return FILTER_LIST_ANIME;
  return FILTER_LIST_ALL;
}

// Language detection list — module-level constant
const LANGUAGES = [
  'Hindi', 'English', 'Tamil', 'Telugu', 'Korean', 'Japanese',
  'Malayalam', 'Bengali', 'Kannada', 'Punjabi', 'Spanish',
  'French', 'Marathi', 'Arabic', 'Urdu', 'Chinese'
];

const SEARCH_LANGUAGES = ['All', 'Hindi', 'English', 'Original', 'Tamil', 'Bengali', 'Telugu', 'Malayalam'];

// ─── Pure Utility Functions (module-level — zero allocation per render) ──────

/**
 * Returns language detected from title string.
 * Pure function — no closures, safe to call anywhere.
 */
function detectLanguage(title) {
  if (!title) return 'Original';

  // 1. Try to find bracketed language suffix: e.g. [Hindi], (English), [Hindi-English]
  const bracketMatch = title.match(/[\[\()]([a-zA-Z\s\-]+)[\]\)]\s*$/);
  if (bracketMatch) {
    const candidate = bracketMatch[1].trim();
    const candidateLower = candidate.toLowerCase();
    for (const lang of LANGUAGES) {
      if (candidateLower.includes(lang.toLowerCase())) {
        return candidate.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('-');
      }
    }
  }

  // 2. Fallback to normal title scanning
  const titleLower = title.toLowerCase();
  for (const lang of LANGUAGES) {
    if (titleLower.includes(lang.toLowerCase())) return lang;
  }
  return 'Original';
}

function getDisplayBadge(item, activeCategory) {
  const typeLower = (item.type || '').toLowerCase();
  if (typeLower === 'tv show' || typeLower === 'tv' || typeLower === 'series') {
    return 'TV Show';
  }
  return 'Movie';
}

function getCoreTitle(title) {
  if (!title) return '';
  let cleaned = title.toLowerCase();
  cleaned = cleaned.replace(/\[.*?\]/g, ' ');
  cleaned = cleaned.replace(/\(.*?\)/g, ' ');

  const noiseWords = [
    /\bin hindi\b/g,
    /\bin english\b/g,
    /\bhindi dubbed\b/g,
    /\benglish dubbed\b/g,
    /\bhindi\b/g,
    /\benglish\b/g,
    /\bdubbed\b/g,
    /\bmulti audio\b/g,
    /\borg audio\b/g,
    /\bdual audio\b/g,
    /\borg\b/g,
    /\bweb-dl\b/g,
    /\bhdtv\b/g,
    /\bmulti\b/g,
    /\bsubbed\b/g,
    /\bsub\b/g,
    /\bseason\s*\d+\b/g,
    /\bs\d+\b/g,
    /\bpart\s*\d+\b/g
  ];

  noiseWords.forEach(pattern => {
    cleaned = cleaned.replace(pattern, ' ');
  });

  return cleaned.replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function makeUnique(list, isSearch = false) {
  const seenIds = new Set();
  const seenTitles = new Set();
  return list.filter(item => {
    if (!item || !item.id) return false;
    const itemId = String(item.id);
    if (seenIds.has(itemId)) return false;
    seenIds.add(itemId);

    if (!isSearch && item.title) {
      const coreTitle = getCoreTitle(item.title);
      if (seenTitles.has(coreTitle)) return false;
      seenTitles.add(coreTitle);
    }
    return true;
  });
}

function applyClientSideFilter(list, filterName, categoryName) {
  let filtered = list;

  if (categoryName !== 'All') {
    filtered = filtered.filter(item => {
      const typeLower = (item.type || '').toLowerCase();
      const titleLower = item.title.toLowerCase();

      if (categoryName === 'Movies') {
        return typeLower === 'movie' || typeLower === 'movie/';
      }
      if (categoryName === 'Series') {
        return typeLower === 'tv show' || typeLower === 'tv' || typeLower === 'series';
      }
      if (categoryName === 'Anime') {
        return true;
      }
      return true;
    });
  }

  if (filterName !== 'Latest' && filterName !== 'Trending') {
    filtered = filtered.filter(item => {
      const titleLower = item.title.toLowerCase();
      const langLower = (item.language || '').toLowerCase();

      // Language and Regional filters are already filtered on the server, so we trust server results
      if (filterName === 'Hindi' || filterName === 'English' || filterName === 'Bollywood' || filterName === 'Hollywood' || filterName === 'Korean' || filterName === 'Chinese') {
        return true;
      }

      // South Indian regional filter
      if (filterName === 'South Indian') {
        return titleLower.includes('tamil') ||
          titleLower.includes('telugu') ||
          titleLower.includes('malayalam') ||
          titleLower.includes('kannada') ||
          langLower.includes('tamil') ||
          langLower.includes('telugu') ||
          langLower.includes('malayalam') ||
          langLower.includes('kannada');
      }
      return true;
    });
  }

  return filtered;
}

/**
 * Clean title helper to strip bracket metadata like [Hindi], (Dubbed)
 * and normalize string format for accurate fuzzy calculations.
 */
function cleanTitleForMatching(title) {
  if (!title) return '';
  return title.toLowerCase()
    .replace(/\[.*?\]/g, '') // Remove brackets [Hindi], [English]
    .replace(/\(.*?\)/g, '') // Remove parentheses (Dubbed)
    .replace(/[^a-z0-9\s]/g, '') // Strip special characters
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

/**
 * Weighted priority matching utility.
 * Returns score between 0 and 100+ based on similarity & exact matching.
 */
function getStringSimilarity(title, query) {
  if (!title || !query) return 0;
  const t = cleanTitleForMatching(title);
  const q = cleanTitleForMatching(query);

  if (t === q) return 100.0; // 100% Exact match (excluding metadata brackets)

  if (t.startsWith(q)) {
    // High priority for starts-with (e.g. "Naruto" in "Naruto: Shippuden")
    return 50.0 + (q.length / t.length) * 10.0;
  }

  if (t.includes(q)) {
    // Medium priority for substring match
    return 10.0 + (q.length / t.length) * 5.0;
  }

  // Fallback to token (word) intersection matching
  const tWords = t.split(' ');
  const qWords = q.split(' ');
  let matches = 0;
  qWords.forEach(qw => {
    if (tWords.includes(qw)) matches++;
  });
  return matches / Math.max(tWords.length, qWords.length);
}

function sortMediaList(list, isSearchActive, queryOrFilter) {
  if (isSearchActive && queryOrFilter) {
    return [...list].sort((a, b) => {
      const simA = getStringSimilarity(a.title, queryOrFilter);
      const simB = getStringSimilarity(b.title, queryOrFilter);

      // Descending order of similarity (100% match, then 99%, then 98% etc.)
      if (simB !== simA) return simB - simA;

      // Fallback to rating if similarity is exactly equal
      const ratingA = parseFloat(a.rating) || 0;
      const ratingB = parseFloat(b.rating) || 0;
      return ratingB - ratingA;
    });
  }

  return [...list].sort((a, b) => {
    // Always sort by rating first (highest first)
    const ratingA = parseFloat(a.rating) || 0;
    const ratingB = parseFloat(b.rating) || 0;
    if (ratingB !== ratingA) return ratingB - ratingA;

    // Secondary: language priority (Hindi > English > others > Original)
    const langA = detectLanguage(a.title);
    const langB = detectLanguage(b.title);
    const getPriority = (lang) => {
      if (lang === 'Hindi') return 1;
      if (lang === 'English') return 2;
      if (lang === 'Original') return 4;
      return 3;
    };
    return getPriority(langA) - getPriority(langB);
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
        source={{ uri: posterUri }}
        style={styles.poster}
        contentFit="cover"
        transition={150}
        priority="high"
        cachePolicy="memory-disk"
        recyclingKey={posterUri}
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
  const [searchLanguage, setSearchLanguage] = useState('All');
  const [showSearchFilterMenu, setShowSearchFilterMenu] = useState(false);
  const [activeFilter, setActiveFilter] = useState('Trending');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [activeCategory, setActiveCategory] = useState('All');
  const [showSidebar, setShowSidebar] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const isTypingRef = useRef(false);
  const [searchMediaList, setSearchMediaList] = useState([]);
  const searchMediaListRef = useRef(searchMediaList);
  const searchInputRef = useRef(null);
  // ── Animated values as refs — no state slot used, no extra re-render ──
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const slideAnim = useRef(new Animated.Value(250)).current;

  // ── Sync refs for request guarding (prevents concurrent/race page loads) ──
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const mediaListRef = useRef(mediaList);
  const hasMoreRef = useRef(hasMore);
  const pageRef = useRef(page);
  const isSearchingRef = useRef(isSearching);
  const searchQueryRef = useRef(searchQuery);
  const activeFilterRef = useRef(activeFilter);
  const activeCategoryRef = useRef(activeCategory);

  mediaListRef.current = mediaList;
  searchMediaListRef.current = searchMediaList;
  hasMoreRef.current = hasMore;
  pageRef.current = page;
  isSearchingRef.current = isSearching;
  activeFilterRef.current = activeFilter;
  activeCategoryRef.current = activeCategory;

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
    const hasMoreVal = hasMoreRef.current;
    console.log(`[LoadMore] loadTrendingData triggered. targetPage: ${targetPage}, isLoadMore: ${isLoadMore}, loadingMore: ${loadingMoreRef.current}, loading: ${loadingRef.current}, hasMore: ${hasMoreVal}`);
    if (isLoadMore && (loadingMoreRef.current || !hasMoreVal)) {
      console.log(`[LoadMore] loadTrendingData returned early. loadingMoreRef: ${loadingMoreRef.current}, hasMore: ${hasMoreVal}`);
      return;
    }
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

      const startTime = Date.now();
      let currentPage = targetPage;
      let accumulatedData = [];
      const targetCount = isLoadMore ? 10 : 10; 
      let reachedEnd = false;

      // 1. Fetch the first page individually to save latency
      try {
        const rawData = await apiService.getTrendingMedia(currentPage, currentFilter, currentCategory);
        if (rawData && rawData.length > 0) {
          currentPage++;
          const filteredData = applyClientSideFilter(rawData, currentFilter, currentCategory);
          const existingIds = new Set(isLoadMore ? mediaListRef.current.map(item => item.id) : []);
          const newUniqueItems = filteredData.filter(
            item => !existingIds.has(item.id) && !accumulatedData.some(a => a.id === item.id)
          );
          accumulatedData = [...accumulatedData, ...newUniqueItems];

          if (accumulatedData.length >= targetCount) {
            accumulatedData = accumulatedData.slice(0, targetCount);
            reachedEnd = true;
          }
        } else {
          setHasMore(false);
          reachedEnd = true;
        }
      } catch (firstPageErr) {
        console.warn(`[LoadMore] First page fetch error for page ${currentPage}:`, firstPageErr.message);
        if (!isLoadMore) {
          throw firstPageErr; // Re-throw if it's the initial page load to show offline screen
        }
        reachedEnd = true; // Stop current batch if loading more failed, but keep scroll active
      }

      // 2. Fetch pages sequentially until we get at least 10 unique elements
      while (accumulatedData.length < targetCount && !reachedEnd) {
        console.log(`[LoadMore] Fetching page ${currentPage} sequentially for exact batch`);
        try {
          const pageData = await apiService.getTrendingMedia(currentPage, currentFilter, currentCategory);
          if (!pageData || pageData.length === 0) {
            setHasMore(false);
            reachedEnd = true;
            break;
          }

          const filteredData = applyClientSideFilter(pageData, currentFilter, currentCategory);
          
          const existingIds = new Set(isLoadMore ? mediaListRef.current.map(item => String(item.id)) : []);
          const existingTitles = new Set(isLoadMore ? mediaListRef.current.map(item => getCoreTitle(item.title)) : []);

          const newUniqueItems = [];
          for (const item of filteredData) {
            if (!item || !item.id) continue;
            const itemId = String(item.id);
            const coreTitle = getCoreTitle(item.title);

            if (existingIds.has(itemId) || newUniqueItems.some(a => String(a.id) === itemId)) {
              continue;
            }
            if (item.title && (existingTitles.has(coreTitle) || newUniqueItems.some(a => getCoreTitle(a.title) === coreTitle))) {
              continue; 
            }

            newUniqueItems.push(item);
          }

          // Only stop if the backend returns absolutely 0 results
          if (pageData.length === 0) {
            setHasMore(false);
            reachedEnd = true;
            break;
          }

          accumulatedData = [...accumulatedData, ...newUniqueItems];
          currentPage++;
        } catch (loopPageErr) {
          console.warn(`[LoadMore] Loop page fetch error for page ${currentPage}:`, loopPageErr.message);
          reachedEnd = true;
          break;
        }
      }

      // Enforce target count of 10 items
      if (accumulatedData.length >= targetCount) {
        accumulatedData = accumulatedData.slice(0, targetCount);
      }

      // Enforce even length at the end in case we broke early
      if (accumulatedData.length % 2 !== 0) {
        accumulatedData = accumulatedData.slice(0, -1);
      }

      const elapsed = Date.now() - startTime;
      if (isLoadMore && elapsed < 800) {
        await new Promise(resolve => setTimeout(resolve, 800 - elapsed));
      }

      if (accumulatedData.length === 0 && targetPage === 0) {
        setHasMore(false);
      }

      if (targetPage === 0 && !isLoadMore) {
        setMediaList(sortMediaList(accumulatedData, false, currentFilter));
      } else if (accumulatedData.length > 0) {
        const sortedNewBatch = sortMediaList(accumulatedData, false, currentFilter);
        setMediaList(prev => [...prev, ...sortedNewBatch]);
      }
      setPage(currentPage);
    } catch (e) {
      console.error(e);
      if (!isLoadMore) setIsOffline(true);
    } finally {
      setLoading(false);
      loadingRef.current = false;
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, [activeFilter, activeCategory]);

  // ─── Search ───────────────────────────────────────────────────────────────

  const triggerSearch = useCallback(async (text) => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setIsSearching(false);
      return;
    }
    try {
      setIsOffline(false);
      setIsSearching(true);
      setLoading(true);
      loadingRef.current = true;
      setHasMore(false); // Disable Load More pagination for search
      setSearchLanguage('All'); // Reset search language to 'All' on new search
      setShowSearchFilterMenu(false); // Hide the language menu
      console.log(`[Search] Triggering search API for query: "${trimmed}"`);

      let allResults = [];
      let pageNum = 0;
      const maxSearchPages = 8; // Fetch up to 8 pages of results at once

      while (pageNum < maxSearchPages) {
        console.log(`[Search] Fetching page ${pageNum} for query: "${trimmed}"`);
        const pageData = await apiService.searchMedia(trimmed, pageNum);
        if (!pageData || pageData.length === 0) {
          break;
        }
        allResults = [...allResults, ...pageData];
        if (pageData.length < 30) {
          break;
        }
        pageNum++;
      }

      console.log(`[Search] Combined results count: ${allResults.length}`);

      // ✅ Discard results if the search query was cleared or changed in-flight
      const currentQuery = searchQueryRef.current.trim();
      if (currentQuery === '') {
        console.log(`[Search] Query was cleared in-flight. Discarding results.`);
        return;
      }
      if (currentQuery !== trimmed) {
        console.log(`[Search] Query changed to "${currentQuery}" in-flight. Discarding results for "${trimmed}".`);
        return;
      }

      setSearchMediaList(sortMediaList(makeUnique(allResults, true), true, trimmed));
      setPage(0);
    } catch (e) {
      console.error('[Search] Error:', e);
      setIsOffline(true);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [activeFilter, activeCategory, loadTrendingData]);

  const handleSearch = useCallback((text) => {
    isTypingRef.current = true;
    setSearchQuery(text);
    searchQueryRef.current = text;
  }, []);

  // Debounced search suggestions effect — only fetches suggestions, does not auto-search
  useEffect(() => {
    if (!isTypingRef.current) {
      return;
    }

    if (searchQuery.trim() === '') {
      setSuggestions([]);
      if (isSearching) {
        setIsSearching(false);
        isSearchingRef.current = false;
        setSearchLanguage('All');
        setShowSearchFilterMenu(false);
        // Restore trending/home pagination properties
        setHasMore(true);
        hasMoreRef.current = true;
        // Sync page number count with actual downloaded items
        const currentDataLength = mediaListRef.current.length;
        const restoredPage = Math.max(1, Math.ceil(currentDataLength / 10)); 
        setPage(restoredPage);
        pageRef.current = restoredPage;
      }
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      try {
        const trimmed = searchQuery.trim();
        if (trimmed.length >= 2) {
          const data = await apiService.searchMedia(trimmed, 0);
          if (data && data.length > 0) {
            const titles = Array.from(new Set(data.map(item => item.title))).slice(0, 6);
            setSuggestions(titles);
          } else {
            setSuggestions([]);
          }
        } else {
          setSuggestions([]);
        }
      } catch (e) {
        setSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(delayDebounceFn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const loadSearchMore = useCallback(async (query, targetPage) => {
    const hasMoreVal = hasMoreRef.current;
    console.log(`[LoadMore] loadSearchMore triggered. query: "${query}", targetPage: ${targetPage}, loadingMoreRef: ${loadingMoreRef.current}, hasMore: ${hasMoreVal}`);
    if (loadingMoreRef.current || !hasMoreVal) return;
    try {
      setLoadingMore(true);
      loadingMoreRef.current = true;

      const startTime = Date.now();
      let currentPage = targetPage;
      let accumulatedData = [];
      const targetCount = 10;
      const maxPages = 15;

      while (accumulatedData.length < targetCount && currentPage <= maxPages) {
        const data = await apiService.searchMedia(query, currentPage);
        if (data.length === 0) {
          setHasMore(false);
          break;
        }

        // Deduplicate with existing list and accumulated batch
        const existingIds = new Set(searchMediaListRef.current.map(item => item.id));
        const newUniqueItems = data.filter(
          item => !existingIds.has(item.id) && !accumulatedData.some(a => a.id === item.id)
        );

        accumulatedData = [...accumulatedData, ...newUniqueItems];

        if (accumulatedData.length >= targetCount) {
          break;
        }

        currentPage++;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed < 600) {
        await new Promise(resolve => setTimeout(resolve, 600 - elapsed));
      }

      if (accumulatedData.length > 0) {
        setSearchMediaList(prev => sortMediaList(makeUnique([...prev, ...accumulatedData], true), true, query));
        setPage(currentPage);
      } else {
        setHasMore(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    const loadingVal = loading;
    const loadingMoreVal = loadingMore;
    const hasMoreVal = hasMoreRef.current;
    const pageVal = pageRef.current;
    const isSearchingVal = isSearchingRef.current;
    const searchQueryVal = searchQueryRef.current;
    const activeFilterVal = activeFilterRef.current;
    const activeCategoryVal = activeCategoryRef.current;

    console.log(`[LoadMore] handleLoadMore invoked. loading: ${loadingVal}, loadingMore: ${loadingMoreVal}, hasMore: ${hasMoreVal}, page: ${pageVal}, isSearching: ${isSearchingVal}`);
    if (loadingVal || loadingMoreVal || !hasMoreVal) {
      console.log(`[LoadMore] handleLoadMore ignored due to guards.`);
      return;
    }
    const nextPage = pageVal;
    if (isSearchingVal) {
      loadSearchMore(searchQueryVal, nextPage);
    } else {
      loadTrendingData(nextPage, true, activeFilterVal, activeCategoryVal);
    }
  }, [loading, loadingMore, loadSearchMore, loadTrendingData]);

  // ─── Filter / Category Selection ─────────────────────────────────────────

  const selectFilter = useCallback((filterName) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveFilter(filterName);
    setShowFilterMenu(false);
    loadTrendingData(0, false, filterName, activeCategory);
  }, [activeCategory, loadTrendingData]);

  const selectCategory = useCallback((categoryName) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveCategory(categoryName);
    setShowSidebar(false);
    setSearchQuery(''); // Reset search input query
    searchQueryRef.current = '';
    setIsSearching(false); // Disable search mode
    setSearchLanguage('All');
    setShowSearchFilterMenu(false);
    loadTrendingData(0, false, activeFilter, categoryName);
  }, [activeFilter, loadTrendingData]);

  // Memoized search filtered list
  const filteredSearchList = useMemo(() => {
    if (!isSearching) return [];
    console.log(`[SearchFilter] Filtering ${searchMediaList.length} items with lang: "${searchLanguage}"`);
    if (searchLanguage === 'All') return searchMediaList;
    const filtered = searchMediaList.filter(item => {
      const detected = detectLanguage(item.title);
      if (searchLanguage === 'Original') {
        return detected === 'Original';
      }
      return detected.toLowerCase() === searchLanguage.toLowerCase();
    });
    console.log(`[SearchFilter] Filtered result count: ${filtered.length}`);
    return filtered;
  }, [searchMediaList, isSearching, searchLanguage]);

  // Dynamically calculate the languages present in search results
  const dynamicSearchLanguages = useMemo(() => {
    if (!isSearching || searchMediaList.length === 0) return ['All'];
    const foundLanguages = new Set();
    searchMediaList.forEach(item => {
      const lang = detectLanguage(item.title);
      if (lang) foundLanguages.add(lang);
    });
    return ['All', ...Array.from(foundLanguages).sort()];
  }, [searchMediaList, isSearching]);

  // ─── Render Helpers ───────────────────────────────────────────────────────

  // Stable per-item press handlers — keyed by item.id so memo(MediaCard) works.
  const pressHandlersRef = useRef({});

  const renderCard = useCallback(({ item }) => {
    // Placeholder item for even-column padding — renders invisible filler
    if (item._placeholder) {
      return <View style={styles.card} />;
    }
    if (!pressHandlersRef.current[item.id]) {
      pressHandlersRef.current[item.id] = () => navigation.navigate('Details', { id: item.id });
    }
    const badgeType = getDisplayBadge(item, activeCategory);
    return (
      <MediaCard
        posterUri={getCachedImageUri(item.poster)}
        title={item.title}
        type={badgeType}
        onPress={pressHandlersRef.current[item.id]}
      />
    );
  }, [navigation, activeCategory]);

  // Pad list to even count so last row always shows 2 cards
  const paddedMediaList = useMemo(() => {
    const list = isSearching ? filteredSearchList : mediaList;
    if (list.length % 2 === 1) {
      return [...list, { id: '__placeholder__', _placeholder: true }];
    }
    return list;
  }, [mediaList, isSearching, filteredSearchList]);

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

  const handleClearSearch = useCallback(() => {
    isTypingRef.current = false;
    setSearchQuery('');
    searchQueryRef.current = '';
    setSearchLanguage('All');
    setShowSearchFilterMenu(false);
    setSuggestions([]);
    
    if (isSearching) {
      setIsSearching(false);
      isSearchingRef.current = false;
      // Restore trending/home pagination properties
      setHasMore(true);
      hasMoreRef.current = true;
      // Sync page number count with actual downloaded items
      const currentDataLength = mediaListRef.current.length;
      const restoredPage = Math.max(1, Math.ceil(currentDataLength / 10)); 
      setPage(restoredPage);
      pageRef.current = restoredPage;
    }

    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearching]);

  const handleToggleFilterMenu = useCallback(
    () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowFilterMenu(prev => !prev);
    },
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
      </View>

      {/* Search Input Bar with Cross Clear Icon and Search Button */}
      <View style={styles.searchContainer}>
        <TextInput
          ref={searchInputRef}
          placeholder="Search Movie, Series or Anime"
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={handleSearch}
          onSubmitEditing={() => {
            isTypingRef.current = false;
            setSuggestions([]);
            triggerSearch(searchQuery);
          }}
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
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => {
            isTypingRef.current = false;
            setSuggestions([]);
            triggerSearch(searchQuery);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="search" size={18} color="#FFF" />
        </TouchableOpacity>

        {/* Suggestions Dropdown Overlay */}
        {suggestions.length > 0 && (
          <View style={styles.suggestionsContainer}>
            {suggestions.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.suggestionRow}
                activeOpacity={0.8}
                onPress={() => {
                  isTypingRef.current = false;
                  setSearchQuery(item);
                  searchQueryRef.current = item;
                  setSuggestions([]);
                  triggerSearch(item);
                }}
              >
                <Ionicons name="search-outline" size={15} color="#9CA3AF" style={{ marginRight: 10 }} />
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <AdBanner728x90 />

      {/* Search Filter Horizontal Pill Selector Panel - Always visible when searching */}
      {isSearching && (
        <View style={styles.filterMenuContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {dynamicSearchLanguages.map((langName) => {
              const isSelected = searchLanguage === langName;
              return (
                <TouchableOpacity
                  key={langName}
                  style={[styles.filterPill, isSelected && styles.filterPillActive]}
                  activeOpacity={0.7}
                  onPress={() => setSearchLanguage(langName)}
                >
                  <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>
                    {langName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Filter Horizontal Pill Selector Panel - Always visible when not searching */}
      {!isSearching && (
        <View style={styles.filterMenuContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            {getFilterList(activeCategory).map((filterName) => {
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
          data={paddedMediaList}
          renderItem={renderCard}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={[styles.listContainer, { paddingBottom: 85 }]}
          columnWrapperStyle={styles.columnWrapper}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={30}
          windowSize={8}
          initialNumToRender={10}
          ListEmptyComponent={listEmpty}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={<ListFooter loadingMore={loadingMore} />}
          extraData={loadingMore}
        />
      )}

      {/* Bottom Footer Tab Navigation Bar */}
      <View style={styles.footerTabBar}>
        {[
          { key: 'All', label: 'Home', iconNameActive: 'home', iconNameInactive: 'home-outline' },
          { key: 'Movies', label: 'Movie', iconNameActive: 'film', iconNameInactive: 'film-outline' },
          { key: 'Series', label: 'Tv Show', iconNameActive: 'tv', iconNameInactive: 'tv-outline' },
          { key: 'Anime', label: 'Anime', iconNameActive: 'sparkles', iconNameInactive: 'sparkles-outline' }
        ].map((item) => {
          const isSelected = activeCategory === item.key;
          const currentIcon = isSelected ? item.iconNameActive : item.iconNameInactive;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.footerTabButton, isSelected && styles.footerTabButtonActive]}
              activeOpacity={0.8}
              onPress={() => selectCategory(item.key)}
            >
              <Ionicons
                name={currentIcon}
                size={22}
                color={isSelected ? '#E50914' : '#9CA3AF'}
              />
              <Text style={[styles.footerTabText, isSelected && styles.footerTabTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
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
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    paddingRight: 90,
    color: '#F3F4F6',
    fontSize: 14,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 68,
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
  searchBtn: {
    position: 'absolute',
    right: 24,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E50914',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionsContainer: {
    position: 'absolute',
    top: 62,
    left: 16,
    right: 16,
    backgroundColor: '#15151A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#262630',
  },
  suggestionText: {
    color: '#F3F4F6',
    fontSize: 14,
    flex: 1,
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
    backgroundColor: 'rgba(229, 9, 20, 0.15)',
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
  footerTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: '#0F0F14',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 5,
    elevation: 10,
  },
  footerTabButton: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
  },
  footerTabButtonActive: {
    borderTopWidth: 2,
    borderColor: '#E50914',
  },
  footerTabText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    fontWeight: '500',
  },
  footerTabTextActive: {
    color: '#E50914',
    fontWeight: 'bold',
  },
});
