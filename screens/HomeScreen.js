import React, { useEffect, useState, useCallback, memo } from 'react';
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

const { width } = Dimensions.get('window');
const columnWidth = (width - 48) / 2;

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
  const [slideAnim] = useState(new Animated.Value(250));
  const [isOffline, setIsOffline] = useState(false);
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
    loadTrendingData(0, false, activeFilter, activeCategory);
  }, []);

  const openSidebar = () => {
    setShowSidebar(true);
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true
    }).start();
  };

  const closeSidebar = () => {
    Animated.timing(slideAnim, {
      toValue: 250,
      duration: 220,
      useNativeDriver: true
    }).start(() => {
      setShowSidebar(false);
    });
  };

  const makeUnique = (list) => {
    const seenIds = new Set();
    return list.filter(item => {
      if (!item || !item.id || seenIds.has(item.id)) {
        return false;
      }
      seenIds.add(item.id);
      return true;
    });
  };

  const applyClientSideFilter = (list, filterName, categoryName) => {
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
  };

  const loadTrendingData = async (targetPage = 0, isLoadMore = false, currentFilter = activeFilter, currentCategory = activeCategory) => {
    if (isLoadMore && (loadingMore || !hasMore)) return;
    try {
      setIsOffline(false);
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
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
          setMediaList(sortMediaList(makeUnique(filteredData)));
        } else {
          const sortedNewBatch = sortMediaList(filteredData);
          setMediaList(prev => makeUnique([...prev, ...sortedNewBatch]));
        }
        setPage(targetPage);
      }
    } catch (e) {
      console.error(e);
      if (!isLoadMore) {
        setIsOffline(true);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleSearch = (text) => {
    setSearchQuery(text);
  };

  const triggerSearch = async (text) => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setIsSearching(false);
      loadTrendingData(0, false, activeFilter, activeCategory);
    } else {
      try {
        setIsOffline(false);
        setIsSearching(true);
        setLoading(true);
        setHasMore(true);
        const data = await apiService.searchMedia(trimmed, 0);
        setMediaList(sortMediaList(makeUnique(data)));
        setPage(0);
      } catch (e) {
        console.error(e);
        setIsOffline(true);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    // If search query is empty, reset search state and load initial trending data
    if (searchQuery.trim() === '') {
      setIsSearching(false);
      // Only reload if we were previously searching
      if (isSearching) {
        loadTrendingData(0, false, activeFilter, activeCategory);
      }
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      triggerSearch(searchQuery);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const loadSearchMore = async (query, targetPage) => {
    if (loadingMore || !hasMore) return;
    try {
      setLoadingMore(true);
      const data = await apiService.searchMedia(query, targetPage);
      if (data.length === 0) {
        setHasMore(false);
      } else {
        const sortedNewBatch = sortMediaList(data);
        setMediaList(prev => makeUnique([...prev, ...sortedNewBatch]));
        setPage(targetPage);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleLoadMore = () => {
    if (loading || loadingMore || !hasMore) return;
    const nextPage = page + 1;
    if (isSearching) {
      loadSearchMore(searchQuery, nextPage);
    } else {
      loadTrendingData(nextPage, true, activeFilter, activeCategory);
    }
  };

  const selectFilter = (filterName) => {
    setActiveFilter(filterName);
    setShowFilterMenu(false);
    loadTrendingData(0, false, filterName, activeCategory);
  };

  const selectCategory = (categoryName) => {
    setActiveCategory(categoryName);
    setShowSidebar(false);
    loadTrendingData(0, false, activeFilter, categoryName);
  };

  const detectLanguage = useCallback((title) => {
    if (!title) return 'Original';
    const titleLower = title.toLowerCase();
    const languages = [
      'Hindi', 'English', 'Tamil', 'Telugu', 'Korean', 'Japanese', 
      'Malayalam', 'Bengali', 'Kannada', 'Punjabi', 'Spanish', 
      'French', 'Marathi', 'Arabic', 'Urdu', 'Chinese'
    ];
    for (const lang of languages) {
      if (titleLower.includes(lang.toLowerCase())) {
        return lang;
      }
    }
    return 'Original';
  }, []);

  const sortMediaList = (list) => {
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

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      const isSearchActive = searchQuery.trim() !== '';
      if (isSearchActive || activeFilter !== 'Trending') {
        const ratingA = a.rating || 0;
        const ratingB = b.rating || 0;
        if (ratingB !== ratingA) {
          return ratingB - ratingA;
        }
      }

      return 0;
    });
  };

  const renderSkeleton = () => {
    const dummyData = Array.from({ length: 6 }, (_, i) => ({ id: `skeleton-${i}` }));
    return (
      <FlatList
        data={dummyData}
        numColumns={2}
        contentContainerStyle={styles.listContainer}
        columnWrapperStyle={styles.columnWrapper}
        renderItem={() => (
          <View style={styles.card}>
            <Animated.View style={[styles.posterWrapper, styles.skeletonPoster, { opacity: pulseAnim }]} />
            <Animated.View style={[styles.movieTitle, styles.skeletonText, { opacity: pulseAnim }]} />
          </View>
        )}
        keyExtractor={item => item.id}
      />
    );
  };

  const renderCard = useCallback(({ item }) => (
    <MediaCard
      item={item}
      onPress={() => navigation.navigate('Details', { id: item.id })}
      detectLanguage={detectLanguage}
    />
  ), [navigation, detectLanguage]);

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
            onPress={() => handleSearch('')}
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
            onPress={() => setShowFilterMenu(!showFilterMenu)}
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
            {['Trending', 'Latest', 'Hollywood', 'Bollywood', 'Korean', 'Chinese', 'South Indian'].map((filterName) => {
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
            onPress={() => {
              setIsOffline(false);
              if (isSearching) {
                triggerSearch(searchQuery);
              } else {
                loadTrendingData(0, false, activeFilter, activeCategory);
              }
            }}
          >
            <Text style={styles.retryBtnText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        renderSkeleton()
      ) : (
        <FlatList
          data={mediaList}
          renderItem={renderCard}
          keyExtractor={item => item.id}
          numColumns={2}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={styles.columnWrapper}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={30}
          windowSize={10}
          initialNumToRender={8}
          ListEmptyComponent={
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>No results found in Netmirror.</Text>
            </View>
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={() => {
            if (!loadingMore) return null;
            return <ActivityIndicator size="small" color="#E50914" style={{ marginVertical: 16 }} />;
          }}
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
              <TouchableOpacity 
                onPress={closeSidebar} 
                style={styles.closeSidebarBtn}
              >
                <Text style={styles.closeSidebarText}>✕</Text>
              </TouchableOpacity>
            </View>
            
            {['All', 'Movies', 'Series', 'Anime'].map((cat) => {
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

// Memoized card component — prevents unnecessary re-renders during list scroll/load
const MediaCard = memo(({ item, onPress, detectLanguage }) => (
  <TouchableOpacity
    style={styles.card}
    activeOpacity={0.8}
    onPress={onPress}
  >
    <View style={styles.posterWrapper}>
      <ExpoImage
        source={{ uri: item.poster }}
        style={styles.poster}
        contentFit="cover"
        transition={150}
        cachePolicy="memory-disk"
      />
      <View style={styles.badgeContainer}>
        <Text style={styles.badgeText}>{item.type}</Text>
      </View>
      <View style={styles.langBadgeContainer}>
        <Text style={styles.langBadgeText}>{detectLanguage(item.title)}</Text>
      </View>
    </View>
    <Text style={styles.movieTitle} numberOfLines={1}>{item.title}</Text>
  </TouchableOpacity>
));

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
    width: columnWidth,
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
    backgroundColor: 'rgba(229, 9, 20, 0.95)', // Theme Red
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
    backgroundColor: 'rgba(16, 185, 129, 0.95)', // Emerald green
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
  loadingText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 14,
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
});
