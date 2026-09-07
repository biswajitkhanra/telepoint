import React from 'react';
import { Modal, View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { X, Megaphone, Calendar } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BroadcastItem } from '../types';

interface BroadcastModalProps {
  broadcast: BroadcastItem | null;
  visible: boolean;
  onClose: () => void;
}

export const BroadcastModal: React.FC<BroadcastModalProps> = ({ broadcast, visible, onClose }) => {
  if (!broadcast) return null;

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Top Bevel Highlight */}
          <View style={styles.topBevel} />

          <LinearGradient
            colors={['#1E293B', '#0F172A']}
            style={styles.gradient}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <View style={styles.iconCircle}>
                  <Megaphone size={18} color="#F59E0B" />
                </View>
                <View>
                  <Text style={styles.senderName}>
                    {broadcast.sender_name || 'Telepoint Announcement'}
                  </Text>
                  <Text style={styles.senderRole}>
                    {broadcast.sender_role ? broadcast.sender_role.toUpperCase() : 'OFFICIAL'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scrollBody} showsVerticalScrollIndicator={false}>
              {/* Optional Broadcast Image */}
              {broadcast.image_url ? (
                <View style={styles.imageContainer}>
                  <Image
                    source={{ uri: broadcast.image_url }}
                    style={styles.broadcastImage}
                    resizeMode="cover"
                  />
                </View>
              ) : null}

              {/* Message Body */}
              <Text style={styles.messageText}>{broadcast.message}</Text>

              {/* Expiry meta */}
              <View style={styles.expiryRow}>
                <Calendar size={12} color="#64748B" />
                <Text style={styles.expiryText}>
                  Valid until: {new Date(broadcast.expires_at).toLocaleDateString()}
                </Text>
              </View>
            </ScrollView>

            {/* Action button */}
            <TouchableOpacity onPress={onClose} style={styles.actionBtn}>
              <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                style={styles.btnGradient}
              >
                <Text style={styles.btnText}>Understood</Text>
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '80%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    elevation: 20,
  },
  topBevel: {
    height: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.4)',
  },
  gradient: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  senderName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  senderRole: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  scrollBody: {
    maxHeight: 320,
    marginVertical: 4,
  },
  imageContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  broadcastImage: {
    width: '100%',
    height: 180,
  },
  messageText: {
    color: '#E2E8F0',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  expiryText: {
    color: '#64748B',
    fontSize: 12,
  },
  actionBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 10,
  },
  btnGradient: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
