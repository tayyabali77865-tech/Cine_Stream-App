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
  Keyboard,
  Animated,
  ScrollView,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { apiService, getCachedImageUri } from '../services/apiService';
import { Ionicons } from '@expo/vector-icons';


const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;
const CARD_POSTER_HEIGHT = Math.round(COLUMN_WIDTH * 1.5);
const CARD_TITLE_HEIGHT = 8 + 14 + 4;
const CARD_TOTAL_HEIGHT = CARD_POSTER_HEIGHT + CARD_TITLE_HEIGHT + 20;

const LANGUAGES = [
  'Hindi', 'English', 'Tamil', 'Telugu', 'Korean', 'Japanese',
  'Malayalam', 'Bengali', 'Kannada', 'Punjabi', 'Spanish',
  'French', 'Marathi', 'Arabic', 'Urdu', 'Chinese'
];

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function cleanSearchQuery(query) {
  const cleaned = query.replace(/\s+in\s+hindi|\s+hindi\s+dubbed|\s+hindi/gi, '').trim();
  return cleaned || query.trim();
}

function detectLanguage(item) {
  const title = typeof item === 'string' ? item : (item?.title || '');
  if (!title) {
    if (item?.badge && item.badge.trim() !== '') return item.badge.trim();
    if (item?.country && item.country.trim() !== '') return item.country.trim();
    return null;
  }
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
  const titleLower = title.toLowerCase();
  for (const lang of LANGUAGES) {
    if (titleLower.includes(lang.toLowerCase())) return lang;
  }
  if (typeof item === 'object') {
    if (item.badge && item.badge.trim() !== '') return item.badge.trim();
    if (item.country && item.country.trim() !== '') return item.country.trim();
  }
  return null;
}

function getDisplayBadge(item) {
  const typeLower = (item.type || '').toLowerCase();
  if (typeLower === 'tv show' || typeLower === 'tv' || typeLower === 'series') return 'TV Show';
  return 'Movie';
}

function getCoreTitle(title) {
  if (!title) return '';
  let cleaned = title.toLowerCase();
  cleaned = cleaned.replace(/\[.*?\]/g, ' ').replace(/\(.*?\)/g, ' ');
  const noiseWords = [
    /\bin hindi\b/g, /\bin english\b/g, /\bhindi dubbed\b/g, /\benglish dubbed\b/g,
    /\bhindi\b/g, /\benglish\b/g, /\bdubbed\b/g, /\bmulti audio\b/g, /\borg audio\b/g,
    /\bdual audio\b/g, /\borg\b/g, /\bweb-dl\b/g, /\bhdtv\b/g, /\bmulti\b/g,
    /\bsubbed\b/g, /\bsub\b/g, /\bseason\s*\d+\b/g, /\bs\d+\b/g, /\bpart\s*\d+\b/g
  ];
  noiseWords.forEach(pattern => { cleaned = cleaned.replace(pattern, ' '); });
  return cleaned.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
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

function cleanTitleForMatching(title) {
  if (!title) return '';
  return title.toLowerCase()
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getStringSimilarity(title, query) {
  if (!title || !query) return 0;
  const t = cleanTitleForMatching(title);
  const q = cleanTitleForMatching(query);
  if (t === q) return 100.0;
  if (t.startsWith(q)) return 50.0 + (q.length / t.length) * 10.0;
  if (t.includes(q)) return 10.0 + (q.length / t.length) * 5.0;
  const tWords = t.split(' ');
  const qWords = q.split(' ');
  let matches = 0;
  qWords.forEach(qw => { if (tWords.includes(qw)) matches++; });
  return matches / Math.max(tWords.length, qWords.length);
}

function sortMediaList(list, queryOrFilter) {
  return [...list].sort((a, b) => {
    const aHindi = a.title.toLowerCase().includes('hindi');
    const bHindi = b.title.toLowerCase().includes('hindi');
    if (aHindi && !bHindi) return -1;
    if (!aHindi && bHindi) return 1;
    const ratingA = parseFloat(a.rating) || 0;
    const ratingB = parseFloat(b.rating) || 0;
    if (ratingA !== ratingB) return ratingB - ratingA;
    const simA = getStringSimilarity(a.title, queryOrFilter);
    const simB = getStringSimilarity(b.title, queryOrFilter);
    return simB - simA;
  });
}

const SKELETON_DATA = Array.from({ length: 6 }, (_, i) => ({ id: `skeleton-${i}` }));

const SkeletonCard = memo(({ pulseAnim }) => (
  <View style={[styles.card, { paddingVertical: 12 }]}>
    <Animated.View style={[styles.posterWrapper, { opacity: pulseAnim, backgroundColor: '#16161A' }]} />
    <View style={{ flex: 1, paddingHorizontal: 12 }}>
      <Animated.View style={[{ height: 14, borderRadius: 4, backgroundColor: '#16161A', width: '80%', marginBottom: 8 }, { opacity: pulseAnim }]} />
      <Animated.View style={[{ height: 12, borderRadius: 4, backgroundColor: '#16161A', width: '55%' }, { opacity: pulseAnim }]} />
    </View>
  </View>
));

const MediaCard = memo(({ item, onPress }) => {
  const badgeType = getDisplayBadge(item);
  const langBadge = detectLanguage(item);
  const year = item.releaseDate ? item.releaseDate.split('-')[0] : null;
  const rating = parseFloat(item.rating) || 0;
  const isTV = badgeType === 'TV Show';
  const [posterUri, setPosterUri] = React.useState(getCachedImageUri(item.poster));

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
      {/* Poster */}
      <View style={styles.posterWrapper}>
        <ExpoImage
          source={{ uri: posterUri }}
          style={styles.poster}
          contentFit="cover"
          transition={150}
          priority="high"
          cachePolicy="memory-disk"
          recyclingKey={item.poster}
          onError={() => {
            if (item.poster && posterUri !== item.poster) {
              setPosterUri(item.poster);
            }
          }}
        />
        {langBadge && (
          <View style={styles.langBadgeContainer}>
            <Text style={styles.langBadgeText}>{langBadge}</Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text style={styles.movieTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.metaRow}>
          <Ionicons
            name={isTV ? 'tv-outline' : 'film-outline'}
            size={12}
            color="#9CA3AF"
            style={{ marginRight: 4 }}
          />
          {rating > 0 && (
            <>
              <Ionicons name="star" size={11} color="#F59E0B" style={{ marginRight: 2 }} />
              <Text style={styles.metaText}>{rating.toFixed(1)}</Text>
              <Text style={styles.metaDot}> | </Text>
            </>
          )}
          {year && <Text style={styles.metaText}>{year}</Text>}
          {item.country ? <Text style={styles.metaDot}> | {item.country}</Text> : null}
          {langBadge ? <Text style={styles.metaDot}> | {langBadge}</Text> : null}
        </View>
      </View>

      {/* Play button */}
      <View style={styles.playBtn}>
        <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.5)" />
      </View>
    </TouchableOpacity>
  );
});

const ListFooter = memo(({ loadingMore }) => {
  if (!loadingMore) return null;
  return <ActivityIndicator size="small" color="#E50914" style={styles.footerIndicator} />;
});

export default function SearchScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [didYouMeanResults, setDidYouMeanResults] = useState([]);
  const [searchMediaList, setSearchMediaList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [searchLanguage, setSearchLanguage] = useState('All');
  const [hasSearched, setHasSearched] = useState(false);
  const [viewingResults, setViewingResults] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const searchInputRef = useRef(null);
  const isTypingRef = useRef(false);
  const searchQueryRef = useRef('');
  const searchMediaListRef = useRef([]);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const suggestionsOpacity = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef(null);

  searchMediaListRef.current = searchMediaList;

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

  useEffect(() => {
    if (searchInputRef.current) {
      setTimeout(() => searchInputRef.current.focus(), 100);
    }
  }, []);

  useEffect(() => {
    const shouldShow = suggestions.length > 0 && !viewingResults;
    if (shouldShow) {
      setShowSuggestions(true);
      Animated.timing(suggestionsOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(suggestionsOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShowSuggestions(false));
    }
  }, [suggestions.length, viewingResults]);

  const triggerSearch = useCallback(async (text) => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    try {
      setIsOffline(false);
      setLoading(true);
      setHasMore(false);
      hasMoreRef.current = false;
      setSearchLanguage('All');
      setHasSearched(true);
      setViewingResults(true);
      setDidYouMeanResults([]);
      
      let allResults = [];
      let pageNum = 0;
      const maxSearchPages = 8;
      
      while (pageNum < maxSearchPages) {
        const pageData = await apiService.searchMedia(cleanSearchQuery(trimmed), pageNum);
        if (!pageData || pageData.length === 0) break;
        allResults = [...allResults, ...pageData];
        if (pageData.length < 30) break;
        pageNum++;
      }
      
      const currentQuery = searchQueryRef.current.trim();
      if (currentQuery === '' || currentQuery !== trimmed) return;
      
      const uniqueResults = sortMediaList(makeUnique(allResults, true), trimmed);
      setSearchMediaList(uniqueResults);
      setPage(0);

      // If no results found, fetch Did You Mean suggestions for results page too
      if (uniqueResults.length === 0) {
        try {
          const dym = await apiService.getDidYouMean(cleanSearchQuery(trimmed));
          setDidYouMeanResults(dym || []);
        } catch (_) {
          setDidYouMeanResults([]);
        }
      }
    } catch (e) {
      setIsOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback((text) => {
    isTypingRef.current = true;
    setSearchQuery(text);
    searchQueryRef.current = text;
  }, []);

  const fetchSuggestions = useCallback(async (queryToFetch) => {
    try {
      const trimmed = queryToFetch.trim();
      if (trimmed.length >= 2) {
        const cleaned = cleanSearchQuery(trimmed);
        const promises = [
          apiService.searchMedia(cleaned, 0),
          apiService.searchMedia(cleaned, 1),
          apiService.searchMedia(cleaned, 2)
        ];
        const results = await Promise.all(promises);
        let data = [];
        results.forEach(res => {
          if (res && res.length > 0) data = [...data, ...res];
        });
        if (data.length > 0) {
          const sortedData = [...data].sort((a, b) => {
            const aHindi = a.title.toLowerCase().includes('hindi');
            const bHindi = b.title.toLowerCase().includes('hindi');
            if (aHindi && !bHindi) return -1;
            if (!aHindi && bHindi) return 1;
            return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
          });
          const titles = Array.from(new Set(sortedData.map(item => item.title)));
          setSuggestions(titles);
        } else {
          try {
            const dymSuggestions = await apiService.getDidYouMean(cleaned);
            if (dymSuggestions && dymSuggestions.length > 0) {
              setSuggestions(dymSuggestions.map(title => `Did you mean: ${title}`));
            } else {
              setSuggestions([]);
            }
          } catch (err) {
            setSuggestions([]);
          }
        }
      } else {
        setSuggestions([]);
      }
    } catch (e) {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    if (!isTypingRef.current) return;
    if (searchQuery.trim() === '') {
      setSuggestions([]);
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      fetchSuggestions(searchQuery);
    }, 450);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, fetchSuggestions]);

  const loadSearchMore = useCallback(async (query, targetPage) => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    try {
      setLoadingMore(true);
      loadingMoreRef.current = true;
      const startTime = Date.now();
      let currentPage = targetPage;
      let accumulatedData = [];
      const targetCount = 10;
      const maxPages = 15;

      while (accumulatedData.length < targetCount && currentPage <= maxPages) {
        const data = await apiService.searchMedia(cleanSearchQuery(query), currentPage);
        if (data.length === 0) {
          setHasMore(false);
          hasMoreRef.current = false;
          break;
        }
        const existingIds = new Set(searchMediaListRef.current.map(item => item.id));
        const newUniqueItems = data.filter(
          item => !existingIds.has(item.id) && !accumulatedData.some(a => a.id === item.id)
        );
        accumulatedData = [...accumulatedData, ...newUniqueItems];
        if (accumulatedData.length >= targetCount) break;
        currentPage++;
      }
      const elapsed = Date.now() - startTime;
      if (elapsed < 600) {
        await new Promise(resolve => setTimeout(resolve, 600 - elapsed));
      }
      if (accumulatedData.length > 0) {
        setSearchMediaList(prev => sortMediaList(makeUnique([...prev, ...accumulatedData], true), query));
        setPage(currentPage);
      } else {
        setHasMore(false);
        hasMoreRef.current = false;
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    isTypingRef.current = false;
    setSearchQuery('');
    searchQueryRef.current = '';
    setSuggestions([]);
    setSearchMediaList([]);
    setDidYouMeanResults([]);
    setHasSearched(false);
    setViewingResults(false);
    if (searchInputRef.current) searchInputRef.current.focus();
  }, []);

  // Back button: if viewing results, go back to suggestions page
  const handleBack = useCallback(() => {
    if (viewingResults) {
      setViewingResults(false);
      setHasSearched(false);
      setSearchMediaList([]);
      setDidYouMeanResults([]);
      isTypingRef.current = true;
      if (searchQueryRef.current.trim().length >= 2) {
        fetchSuggestions(searchQueryRef.current);
      }
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    } else {
      navigation.goBack();
    }
  }, [viewingResults, navigation]);

  const filteredSearchList = useMemo(() => {
    if (searchLanguage === 'All') return searchMediaList;
    return searchMediaList.filter(item => {
      const detected = detectLanguage(item.title);
      if (searchLanguage === 'Original') return detected === 'Original';
      return detected?.toLowerCase() === searchLanguage.toLowerCase();
    });
  }, [searchMediaList, searchLanguage]);

  const dynamicSearchLanguages = useMemo(() => {
    if (searchMediaList.length === 0) return ['All'];
    const foundLanguages = new Set();
    searchMediaList.forEach(item => {
      const lang = detectLanguage(item) || 'Original';
      if (lang) foundLanguages.add(lang);
    });
    return ['All', ...Array.from(foundLanguages)];
  }, [searchMediaList]);

  const renderCard = useCallback(({ item }) => {
    if (item._placeholder) return null;
    return (
      <MediaCard
        item={item}
        onPress={() => navigation.navigate('Details', { id: item.id })}
      />
    );
  }, [navigation]);

  const paddedMediaList = filteredSearchList;

  const listEmpty = useMemo(() => (
    hasSearched && !loading ? (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyText}>No results found for "{searchQuery}".</Text>
        {didYouMeanResults.length > 0 && (
          <View style={styles.dymContainer}>
            <Text style={styles.dymHeading}>Did you mean?</Text>
            {didYouMeanResults.map((title, i) => (
              <TouchableOpacity
                key={i}
                style={styles.dymItem}
                activeOpacity={0.7}
                onPress={() => {
                  Keyboard.dismiss();
                  searchInputRef.current?.blur();
                  setSearchQuery(title);
                  searchQueryRef.current = title;
                  triggerSearch(title);
                }}
              >
                <Ionicons name="search-outline" size={14} color="#E50914" style={{ marginRight: 8 }} />
                <Text style={styles.dymItemText}>{title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    ) : null
  ), [hasSearched, loading, didYouMeanResults, searchQuery]);

  const renderSkeletonItem = useCallback(() => (
    <SkeletonCard pulseAnim={pulseAnim} />
  ), [pulseAnim]);

  return (
    <View style={styles.container}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.searchContainer}>
          <TextInput
            ref={searchInputRef}
            placeholder="Search"
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={handleSearch}
            returnKeyType="search"
            onFocus={() => {
              if (viewingResults) {
                setViewingResults(false);
                isTypingRef.current = true;
                if (searchQueryRef.current.trim().length >= 2) {
                  fetchSuggestions(searchQueryRef.current);
                }
              }
            }}
            onSubmitEditing={() => {
              Keyboard.dismiss();
              searchInputRef.current?.blur();
              isTypingRef.current = false;
              triggerSearch(searchQuery);
            }}
            style={styles.searchInput}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity style={styles.clearSearchBtn} onPress={handleClearSearch} activeOpacity={0.7}>
              <Text style={styles.clearSearchText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.searchBtnIcon}
          onPress={() => {
            Keyboard.dismiss();
            searchInputRef.current?.blur();
            isTypingRef.current = false;
            triggerSearch(searchQuery);
          }}
        >
          <Ionicons name="search" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Suggestions Dropdown */}
      {showSuggestions && (
        <Animated.View style={[styles.suggestionsContainer, { opacity: suggestionsOpacity }]}>
          <ScrollView 
            style={{flex: 1}}
            contentContainerStyle={{paddingBottom: 20}}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {suggestions.map((item, index) => (
              <TouchableOpacity
              key={index}
              style={styles.suggestionRow}
              activeOpacity={0.8}
              onPress={() => {
                Keyboard.dismiss();
                searchInputRef.current?.blur();
                isTypingRef.current = false;
                let queryToSearch = item;
                if (item.startsWith('Did you mean: ')) {
                  queryToSearch = item.replace('Did you mean: ', '');
                }
                setSearchQuery(queryToSearch);
                searchQueryRef.current = queryToSearch;
                triggerSearch(queryToSearch);
              }}
            >
              <Ionicons name="search-outline" size={15} color="#9CA3AF" style={{ marginRight: 10 }} />
              <Text style={styles.suggestionText} numberOfLines={1}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        </Animated.View>
      )}

      {/* Filter Menu */}
      {hasSearched && searchMediaList.length > 0 && (
        <View style={styles.filterMenuContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
            data={dynamicSearchLanguages}
            keyExtractor={item => item}
            renderItem={({ item: langName }) => {
              const isSelected = searchLanguage === langName;
              return (
                <TouchableOpacity
                  style={[styles.filterPill, isSelected && styles.filterPillActive]}
                  activeOpacity={0.7}
                  onPress={() => setSearchLanguage(langName)}
                >
                  <Text style={[styles.filterPillText, isSelected && styles.filterPillTextActive]}>
                    {langName}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Results */}
      {loading ? (
        <FlatList
          key="skeleton-list"
          data={SKELETON_DATA}
          numColumns={1}
          contentContainerStyle={styles.listContainer}
          renderItem={renderSkeletonItem}
          keyExtractor={item => item.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      ) : (
        <FlatList
          key="media-list"
          data={paddedMediaList}
          renderItem={renderCard}
          keyExtractor={item => item.id}
          numColumns={1}
          contentContainerStyle={[styles.listContainer, { paddingBottom: 20 }]}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          initialNumToRender={10}
          ListEmptyComponent={listEmpty}
          onEndReached={() => loadSearchMore(searchQuery, page)}
          onEndReachedThreshold={0.3}
          ListFooterComponent={<ListFooter loadingMore={loadingMore} />}
          extraData={loadingMore}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090C',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: StatusBar.currentHeight || 0,
    backgroundColor: '#0F0F14',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
    marginLeft: -8,
  },
  searchContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  searchInput: {
    height: 44,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 40,
    color: '#F3F4F6',
    fontSize: 14,
  },
  clearSearchBtn: {
    position: 'absolute',
    right: 12,
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
  searchBtnIcon: {
    width: 36,
    height: 36,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E50914',
    borderRadius: 18,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: (StatusBar.currentHeight || 0) + 72,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#15151A',
    zIndex: 999,
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
  filterMenuContainer: {
    marginBottom: 16,
    marginTop: 10,
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
    paddingHorizontal: 0,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  posterWrapper: {
    width: 72,
    height: 90,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#15151A',
    flexShrink: 0,
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  langBadgeContainer: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  langBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  cardInfo: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  movieTitle: {
    color: '#F3F4F6',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  metaDot: {
    color: '#6B7280',
    fontSize: 12,
  },
  playBtn: {
    paddingLeft: 8,
    flexShrink: 0,
  },
  centerContainer: {
    marginTop: 40,
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
  footerIndicator: {
    marginVertical: 16,
  },
  dymContainer: {
    marginTop: 24,
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 24,
  },
  dymHeading: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  dymItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    backgroundColor: 'rgba(229, 9, 20, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(229, 9, 20, 0.2)',
    width: '100%',
  },
  dymItemText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
});
