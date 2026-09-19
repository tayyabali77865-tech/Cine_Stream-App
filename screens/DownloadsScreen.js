import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDownloadContext } from '../context/DownloadContext';

export default function DownloadsScreen({ navigation }) {
  const { activeDownloads, cancelDownload, clearCompleted } = useDownloadContext();

  const renderItem = ({ item }) => {
    const isCompleted = item.status === 'completed';
    const isError = item.status === 'error';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            {item.isTvShow && (
              <Text style={styles.subtitle}>S{item.season} E{item.episode}</Text>
            )}
          </View>
          {!isCompleted && !isError && (
            <TouchableOpacity onPress={() => cancelDownload(item.id)} style={styles.cancelBtn}>
              <Ionicons name="close" size={20} color="#FF5252" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${item.progress * 100}%` }]} />
          </View>
          
          <View style={styles.progressTextRow}>
            <Text style={styles.progressText}>
              {isCompleted ? '100%' : `${Math.round(item.progress * 100)}%`} ({item.downloadedMB} MB {item.totalMB > 0 ? `/ ${item.totalMB} MB` : ''})
            </Text>
            <Text style={styles.etaText}>
              {item.remainingTime}
            </Text>
          </View>
        </View>

        {isCompleted && (
          <Text style={styles.statusCompleted}>✅ Download Finished</Text>
        )}
        {isError && (
          <Text style={styles.statusError}>❌ Download Failed</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={28} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Downloads</Text>
        {activeDownloads.some(d => d.status === 'completed' || d.status === 'error') && (
          <TouchableOpacity onPress={clearCompleted} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {activeDownloads.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cloud-download-outline" size={64} color="#333" />
          <Text style={styles.emptyText}>No active downloads.</Text>
        </View>
      ) : (
        <FlatList
          data={activeDownloads}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
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
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a24',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    marginLeft: 16,
  },
  clearBtn: {
    padding: 8,
    backgroundColor: '#1a1a24',
    borderRadius: 8,
  },
  clearBtnText: {
    color: '#00E676',
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#9CA3AF',
    marginTop: 16,
    fontSize: 16,
  },
  card: {
    backgroundColor: '#111116',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1a1a24',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    maxWidth: 250,
  },
  subtitle: {
    color: '#00E676',
    fontSize: 14,
    marginTop: 4,
  },
  cancelBtn: {
    padding: 4,
    backgroundColor: '#FF525220',
    borderRadius: 8,
  },
  progressContainer: {
    marginTop: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#1a1a24',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#00E676',
    borderRadius: 3,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressText: {
    color: '#9CA3AF',
    fontSize: 12,
  },
  etaText: {
    color: '#00E676',
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusCompleted: {
    color: '#00E676',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 12,
  },
  statusError: {
    color: '#FF5252',
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 12,
  }
});
