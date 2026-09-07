import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { Megaphone, Bell, Calendar, ChevronRight } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { Card3D } from '../components/Card3D';
import { BroadcastModal } from '../components/BroadcastModal';
import { fetchNotificationHistory } from '../services/api';
import { BroadcastItem, NotificationHistoryItem } from '../types';
import { THEME } from '../config';

export const BroadcastsScreen = () => {
  const { broadcasts, customer, refreshData } = useAuth();
  const [tab, setTab] = useState<'broadcasts' | 'notifications'>('broadcasts');
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<BroadcastItem | null>(null);

  useEffect(() => {
    loadHistory();
  }, [customer?.id]);

  async function loadHistory() {
    if (customer?.id) {
      const items = await fetchNotificationHistory(customer.id);
      setHistory(items);
    }
  }

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshData(), loadHistory()]);
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'broadcasts' && styles.tabBtnActive]}
          onPress={() => setTab('broadcasts')}
        >
          <Megaphone size={15} color={tab === 'broadcasts' ? '#FFFFFF' : '#94A3B8'} />
          <Text style={[styles.tabText, tab === 'broadcasts' && styles.tabTextActive]}>
            Announcements ({broadcasts.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, tab === 'notifications' && styles.tabBtnActive]}
          onPress={() => setTab('notifications')}
        >
          <Bell size={15} color={tab === 'notifications' ? '#FFFFFF' : '#94A3B8'} />
          <Text style={[styles.tabText, tab === 'notifications' && styles.tabTextActive]}>
            Push Alerts ({history.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'broadcasts' ? (
        <FlatList
          data={broadcasts}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Megaphone size={36} color="#475569" />
              <Text style={styles.emptyTitle}>No Active Announcements</Text>
              <Text style={styles.emptySubtitle}>
                Announcements from your retailer or Telepoint will appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Card3D style={styles.card} onPress={() => setSelectedBroadcast(item)}>
              <View style={styles.broadcastHeader}>
                <View style={styles.senderPill}>
                  <Text style={styles.senderText}>{item.sender_name || 'TELEPOINT'}</Text>
                </View>
                <View style={styles.dateRow}>
                  <Calendar size={12} color="#64748B" />
                  <Text style={styles.dateText}>
                    Until {new Date(item.expires_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              {item.image_url ? (
                <Image source={{ uri: item.image_url }} style={styles.previewImage} resizeMode="cover" />
              ) : null}

              <Text style={styles.messageText} numberOfLines={3}>
                {item.message}
              </Text>

              <View style={styles.viewMoreRow}>
                <Text style={styles.viewMoreText}>Tap to view details</Text>
                <ChevronRight size={14} color="#60A5FA" />
              </View>
            </Card3D>
          )}
        />
      ) : (
        <FlatList
          data={history}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Bell size={36} color="#475569" />
              <Text style={styles.emptyTitle}>No Push Alerts Yet</Text>
              <Text style={styles.emptySubtitle}>
                Automatic EMI reminders and store push alerts will appear here.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Card3D style={styles.card}>
              <View style={styles.broadcastHeader}>
                <View style={[styles.senderPill, item.notification_type === 'emi_reminder' ? styles.pillReminder : styles.pillBroadcast]}>
                  <Text style={styles.senderText}>
                    {item.notification_type === 'emi_reminder' ? 'EMI REMINDER' : 'BROADCAST'}
                  </Text>
                </View>
                <Text style={styles.dateText}>
                  {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>

              <Text style={styles.notifTitle}>{item.title}</Text>
              <Text style={styles.notifBody}>{item.body}</Text>
            </Card3D>
          )}
        />
      )}

      <BroadcastModal
        broadcast={selectedBroadcast}
        visible={!!selectedBroadcast}
        onClose={() => setSelectedBroadcast(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg.darkest,
    paddingTop: 54,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    marginHorizontal: 18,
    borderRadius: 16,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabBtnActive: {
    backgroundColor: '#2563EB',
  },
  tabText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  card: {
    marginBottom: 12,
  },
  broadcastHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  senderPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pillReminder: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  pillBroadcast: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  senderText: {
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    color: '#64748B',
    fontSize: 11,
  },
  previewImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: 10,
  },
  messageText: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  viewMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  viewMoreText: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '600',
  },
  notifTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  notifBody: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
});
