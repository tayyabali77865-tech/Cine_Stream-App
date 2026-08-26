import React, { useEffect, useState, useCallback, useRef, memo, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  StatusBar,
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

function detectLanguage(title) {
  if (!title) return 'Original';
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
  return 'Original';
}

function getDisplayBadge(item, activeCategory) {
  const typeLower = (item.type || '').toLowerCase();
  if (typeLower === 'tv show' || typeLower === 'tv' || typeLower === 'series') {
    return 'TV Show';
  }
  return 'Movie';
}

const MediaCard = memo(({ posterUri, title, type, onPress }) => (
  <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
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

const ListFooter = memo(({ loadingMore }) => {
  if (!loadingMore) return null;
  return <ActivityIndicator size="small" color="#E50914" style={styles.footerIndicator} />;
});

export default function ViewAllScreen({ route, navigation }) {
  const { category = 'All', filter = 'Trending' } = route.params || {};

  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadData = useCallback(async (pageNum) => {
    try {
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);

      const rawData = await apiService.getTrendingMedia(pageNum, filter, category);
      
      let filteredData = rawData;
      if (category !== 'All') {
        filteredData = filteredData.filter(item => {
          const typeLower = (item.type || '').toLowerCase();
          if (category === 'Movies') return typeLower === 'movie' || typeLower === 'movie/';
          if (category === 'Series') return typeLower === 'tv show' || typeLower === 'tv' || typeLower === 'series';
          return true;
        });
      }

      if (filteredData.length === 0) {
        setHasMore(false);
      } else {
        setMediaList(prev => {
          const newItems = pageNum === 0 ? filteredData : [...prev, ...filteredData];
          const seen = new Set();
          return newItems.filter(item => {
            if (!item.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
        });
        setPage(pageNum + 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [category, filter]);

  useEffect(() => {
    loadData(0);
  }, [loadData]);

  const handleLoadMore = () => {
    if (!loading && !loadingMore && hasMore) {
      loadData(page);
    }
  };

  const pressHandlersRef = useRef({});

  const renderCard = useCallback(({ item }) => {
    if (item._placeholder) {
      return <View style={styles.card} />;
    }
    if (!pressHandlersRef.current[item.id]) {
      pressHandlersRef.current[item.id] = () => navigation.navigate('Details', { id: item.id });
    }
    const badgeType = getDisplayBadge(item, category);
    return (
      <MediaCard
        posterUri={getCachedImageUri(item.poster)}
        title={item.title}
        type={badgeType}
        onPress={pressHandlersRef.current[item.id]}
      />
    );
  }, [navigation, category]);

  const paddedMediaList = useMemo(() => {
    if (mediaList.length % 2 === 1) {
      return [...mediaList, { id: '__placeholder__', _placeholder: true }];
    }
    return mediaList;
  }, [mediaList]);

  return (
    <View style={styles.container}>
      <StatusBar translucent={true} backgroundColor="transparent" barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{filter} - {category}</Text>
      </View>

      {loading && page === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#E50914" />
        </View>
      ) : (
        <FlatList
          data={paddedMediaList}
          renderItem={renderCard}
          keyExtractor={item => String(item.id)}
          numColumns={2}
          contentContainerStyle={styles.listContainer}
          columnWrapperStyle={styles.columnWrapper}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={<ListFooter loadingMore={loadingMore} />}
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
  backButton: {
    padding: 8,
    marginRight: 8,
    marginLeft: -8,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 20,
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
  footerIndicator: {
    marginVertical: 16,
  },
});
