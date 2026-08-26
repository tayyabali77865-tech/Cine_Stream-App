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

function detectLanguage(title) {
  if (!title) return 'Original';
  const LANGUAGES = ['Hindi', 'English', 'Tamil', 'Telugu', 'Korean', 'Japanese', 'Malayalam', 'Bengali', 'Kannada', 'Punjabi', 'Spanish', 'French', 'Marathi', 'Arabic', 'Urdu', 'Chinese'];
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

function getDisplayBadge(item) {
  const typeLower = (item.type || '').toLowerCase();
  if (typeLower === 'tv show' || typeLower === 'tv' || typeLower === 'series') {
    return 'TV Show';
  }
  return 'Movie';
}

const MediaCardSmall = memo(({ posterUri, title, type, onPress }) => (
  <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
    <View style={styles.posterWrapper}>
      <ExpoImage
        source={{ uri: posterUri }}
        style={styles.poster}
        contentFit="cover"
        transition={150}
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

export default function HomeSection({ filter, category, navigation }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      let accumulatedData = [];
      let currentPage = 0;
      let reachedEnd = false;
      const seen = new Set();
      
      // Fetch up to 4 pages to accumulate 10 valid items
      while (accumulatedData.length < 10 && currentPage < 4 && !reachedEnd) {
        const rawData = await apiService.getTrendingMedia(currentPage, filter, category);
        if (!rawData || rawData.length === 0) {
          reachedEnd = true;
          break;
        }
        
        let filteredData = rawData;
        if (category !== 'All') {
          filteredData = filteredData.filter(item => {
            const typeLower = (item.type || '').toLowerCase();
            if (category === 'Movies') return typeLower === 'movie' || typeLower === 'movie/';
            if (category === 'Series') return typeLower === 'tv show' || typeLower === 'tv' || typeLower === 'series';
            return true;
          });
        }
        
        const uniqueData = filteredData.filter(item => {
          if (!item.id || seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        accumulatedData = [...accumulatedData, ...uniqueData];
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
        <Text style={styles.sectionTitle}>{filter}</Text>
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => navigation.navigate('ViewAll', { filter, category })}
        >
          <Text style={styles.viewAllText}>View All</Text>
        </TouchableOpacity>
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
              posterUri={getCachedImageUri(item.poster)}
              title={item.title}
              type={getDisplayBadge(item)}
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
    borderRadius: 4,
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
