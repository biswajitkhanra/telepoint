import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Linking,
} from 'react-native';
import {
  User,
  Phone,
  Shield,
  Smartphone,
  Bell,
  LogOut,
  ExternalLink,
  ChevronRight,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { Card3D } from '../components/Card3D';
import { THEME } from '../config';

export const ProfileScreen = () => {
  const { customer, pushToken, logout, isLoading } = useAuth();

  if (!customer) return null;

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Sign Out Confirmation',
      'Your session is locked to this device for security. To re-login later, you will need your registered Mobile or Aadhaar number. Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <Card3D style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatarBox}>
              {customer.customer_photo_url ? (
                <Image source={{ uri: customer.customer_photo_url }} style={styles.avatarImg} />
              ) : (
                <User size={30} color="#60A5FA" />
              )}
            </View>
            <View style={styles.profileMeta}>
              <Text style={styles.profileName}>{customer.customer_name}</Text>
              <Text style={styles.profileCode}>
                {customer.customer_code || `Code: ${customer.id.slice(0, 8)}`}
              </Text>
              <Text style={styles.profilePhone}>+91 {customer.mobile}</Text>
            </View>
          </View>
        </Card3D>

        {/* Device & Hardware Info */}
        <Card3D style={styles.card}>
          <Text style={styles.cardTitle}>Registered Device</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Model Number</Text>
            <Text style={styles.infoValue}>{customer.model_no || 'Smartphone'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Device IMEI</Text>
            <Text style={styles.infoValue}>{customer.imei}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Loan Status</Text>
            <Text style={[styles.infoValue, { color: '#10B981' }]}>{customer.status}</Text>
          </View>
        </Card3D>

        {/* Security & Notifications */}
        <Card3D style={styles.card}>
          <Text style={styles.cardTitle}>Push Notifications & Security</Text>
          <View style={styles.infoRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Bell size={14} color="#60A5FA" />
              <Text style={styles.infoLabel}>Push Reminders</Text>
            </View>
            <Text style={[styles.infoValue, { color: pushToken ? '#10B981' : '#F59E0B' }]}>
              {pushToken ? 'Active & Synced' : 'Simulated / Standby'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Shield size={14} color="#10B981" />
              <Text style={styles.infoLabel}>Data Protection</Text>
            </View>
            <Text style={styles.infoValue}>Bank Grade AES-256</Text>
          </View>
          <View style={styles.infoRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Shield size={14} color="#3B82F6" />
              <Text style={styles.infoLabel}>Session Lockdown</Text>
            </View>
            <Text style={[styles.infoValue, { color: '#34D399' }]}>
              Active (Until Clear App Data)
            </Text>
          </View>
        </Card3D>

        {/* Retailer Support */}
        {customer.retailer && (
          <Card3D style={styles.card}>
            <Text style={styles.cardTitle}>Retailer Support</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Store Name</Text>
              <Text style={styles.infoValue}>{customer.retailer.name}</Text>
            </View>
            {customer.retailer.mobile && (
              <TouchableOpacity
                style={styles.callSupportBtn}
                onPress={() => Linking.openURL(`tel:${customer.retailer?.mobile}`)}
              >
                <Phone size={15} color="#60A5FA" />
                <Text style={styles.callSupportText}>Call: {customer.retailer.mobile}</Text>
              </TouchableOpacity>
            )}
          </Card3D>
        )}

        {/* Sign Out Button */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.logoutBtn}
          onPress={handleLogout}
          disabled={isLoading}
        >
          <LogOut size={18} color="#EF4444" />
          <Text style={styles.logoutBtnText}>Sign Out from Device</Text>
        </TouchableOpacity>

        <Text style={styles.appVersionText}>Telepoint Android Mobile App v1.0.0</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg.darkest,
    paddingTop: 54,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  profileCard: {
    marginBottom: 14,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  profileMeta: {
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  profileCode: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  profilePhone: {
    color: '#94A3B8',
    fontSize: 13,
  },
  card: {
    marginBottom: 14,
  },
  cardTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  infoLabel: {
    color: '#64748B',
    fontSize: 13,
  },
  infoValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  callSupportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  callSupportText: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    marginVertical: 10,
  },
  logoutBtnText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
  },
  appVersionText: {
    color: '#475569',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
});
