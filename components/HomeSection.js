import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { apiService, getCachedImageUri } from '../services/apiService';

const SKELETON_DATA = Array.from({ length: 4 }, (_, i) => ({ id: `skeleton-${i}` }));

const LANGUAGES = ['Hindi', 'English', 'Tamil', 'Telugu', 'Korean', 'Japanese', 'Malayalam', 'Bengali', 'Kannada', 'Punjabi', 'Spanish', 'French', 'Marathi', 'Arabic', 'Urdu', 'Chinese'];

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
    if (item.badge && item.badge.trim() !== '') {
      return item.badge.trim();
    }
    if (item.country && item.country.trim() !== '') {
      return item.country.trim();
    }
  }
  return null;
}

function getDisplayBadge(item) {
  const typeLower = (item.type || '').toLowerCase();
  if (typeLower === 'tv show' || typeLower === 'tv' || typeLower === 'series') {
    return 'TV Show';
  }
  return 'Movie';
}

const MediaCardSmall = memo(({ item, onPress }) => {
  const badgeType = getDisplayBadge(item);
  const langBadge = detectLanguage(item);
  const [posterUri, setPosterUri] = React.useState(
    getCachedImageUri(item.poster || item.backdrop_path || item.poster_path)
  );
  return (
  <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
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
          // If wsrv.nl proxy fails, try original URL directly
          const origUrl = item.poster || item.backdrop_path || item.poster_path;
          if (origUrl && posterUri !== origUrl) {
            setPosterUri(origUrl);
          }
        }}
      />
      <View style={styles.badgeContainer}>
        <Text style={styles.badgeText}>{badgeType}</Text>
      </View>
      {langBadge && (
        <View style={styles.langBadgeContainer}>
          <Text style={styles.langBadgeText}>{langBadge}</Text>
        </View>
      )}
    </View>
    <Text style={styles.movieTitle} numberOfLines={1}>{item.title}</Text>
  </TouchableOpacity>
)});

export default function HomeSection({ title, filter, category, navigation, fetchSimilarTitle, excludeId, strictMatchTitle, hideViewAll }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const getBaseTitle = (t) => {
    if (!t) return '';
    return t.replace(/\[.*?\]/g, '').replace(/\bS\d+(-\bS\d+)?\b/gi, '').trim();
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      let accumulatedData = [];
      let currentPage = 0;
      let reachedEnd = false;
      const seen = new Set();
      const seenTitles = new Set();
      if (excludeId) seen.add(String(excludeId)); // Ensure we never show the excluded item
      
      // Fetch up to 4 pages to accumulate 10 valid items
      while (accumulatedData.length < 10 && currentPage < 4 && !reachedEnd) {
        let rawData;
        if (fetchSimilarTitle) {
          rawData = await apiService.getSimilarMedia(fetchSimilarTitle, currentPage);
        } else {
          rawData = await apiService.getTrendingMedia(currentPage, filter, category);
        }
        
        if (!rawData || rawData.length === 0) {
          reachedEnd = true;
          break;
        }
        
        let filteredData = rawData;
        
        if (strictMatchTitle) {
          const strictLower = strictMatchTitle.toLowerCase();
          filteredData = filteredData.filter(item => getBaseTitle(item.title).toLowerCase() === strictLower);
        } else if (category !== 'All') {
          filteredData = filteredData.filter(item => {
            const typeLower = (item.type || item.media_type || '').toLowerCase();
            if (category === 'Movies') return typeLower === 'movie' || typeLower === 'movie/';
            if (category === 'Series') return typeLower === 'tv show' || typeLower === 'tv' || typeLower === 'series';
            return true;
          });
        }
        
        const uniqueData = filteredData.filter(item => {
          if (!item.id || !item.title || seen.has(String(item.id))) return false;
          
          const titleLower = item.title.trim().toLowerCase();
          if (seenTitles.has(titleLower)) return false; // Filter 100% duplicate exact titles
          
          seen.add(String(item.id));
          seenTitles.add(titleLower);
          return true;
        });

        let newAccumulated = [...accumulatedData, ...uniqueData];
        
        if (strictMatchTitle) {
          // Sort Hindi first
          newAccumulated.sort((a, b) => {
            const aHindi = a.title.toLowerCase().includes('[hindi]') ? 1 : 0;
            const bHindi = b.title.toLowerCase().includes('[hindi]') ? 1 : 0;
            return bHindi - aHindi;
          });
        }
        
        accumulatedData = newAccumulated;
        currentPage++;
      }

      setData(accumulatedData.slice(0, 10)); // Max 10 items
    } catch (e) {
      console.warn('Failed to load section:', filter, e);
    } finally {
      setLoading(false);
    }
  }, [filter, category]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!loading && data.length === 0) return null;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>{title || filter}</Text>
        {!hideViewAll && (
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => navigation.navigate('ViewAll', { filter, category })}
          >
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
           <ActivityIndicator size="small" color="#E50914" />
        </View>
      ) : (
        <FlatList
          horizontal
          data={data}
          keyExtractor={item => String(item.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <MediaCardSmall
              item={item}
              onPress={() => navigation.navigate('Details', { id: item.id })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  viewAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
  },
  viewAllText: {
    color: '#E50914',
    fontSize: 12,
    fontWeight: 'bold',
  },
  loaderContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingHorizontal: 12,
  },
  card: {
    width: 120,
    marginHorizontal: 4,
  },
  posterWrapper: {
    width: '100%',
    aspectRatio: 2 / 3,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#15151A',
  },
  poster: {
    width: '100%',
    height: '100%',
  },
  badgeContainer: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(229, 9, 20, 0.95)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: 'bold',
  },
  langBadgeContainer: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.95)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  langBadgeText: {
    color: '#FFF',
    fontSize: 8,
    fontWeight: 'bold',
  },
  movieTitle: {
    color: '#F3F4F6',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
  },
});
