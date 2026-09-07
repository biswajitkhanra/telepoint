import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Linking,
  Modal,
} from 'react-native';
import {
  User,
  Phone,
  Shield,
  Smartphone,
  Bell,
  LogOut,
  ChevronRight,
  Repeat,
  Sparkles,
  Check,
  X,
  Layers,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../context/AuthContext';
import { Card3D } from '../components/Card3D';
import { THEME } from '../config';
import { MultiLoanCustomer } from '../types';

export const ProfileScreen = () => {
  const { customer, pushToken, logout, isLoading, allLoans, switchActiveLoan, resetRolePreference } = useAuth();
  const [switchModalVisible, setSwitchModalVisible] = useState(false);
  const [switchingLoanId, setSwitchingLoanId] = useState<string | null>(null);

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

  const handleSwitchRole = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Switch App Mode',
      'Do you want to switch to the Retailer & Admin Staff Portal? You can return to Customer mode anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch to Staff Mode',
          onPress: async () => {
            await resetRolePreference();
          },
        },
      ]
    );
  };

  const handleSelectLoan = async (loanId: string) => {
    if (loanId === customer.id) {
      setSwitchModalVisible(false);
      return;
    }
    try {
      setSwitchingLoanId(loanId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await switchActiveLoan(loanId);
    } finally {
      setSwitchingLoanId(null);
      setSwitchModalVisible(false);
    }
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
                <User size={30} color="#2563EB" />
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

        {/* Multi-Loan Switcher Section (if user has 2+ devices/loans under same number) */}
        {allLoans.length > 1 && (
          <Card3D style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Linked Device Loans</Text>
                <Text style={styles.cardSubtitle}>
                  {allLoans.length} active devices linked to your phone number
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.switchPillBtn}
                onPress={() => setSwitchModalVisible(true)}
              >
                <Repeat size={13} color="#2563EB" />
                <Text style={styles.switchPillText}>Switch</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.activeLoanRow}>
              <Smartphone size={18} color="#2563EB" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.activeLoanName}>{customer.model_no || 'Current Device'}</Text>
                <Text style={styles.activeLoanImei}>IMEI: {customer.imei}</Text>
              </View>
              <View style={styles.currentTag}>
                <Text style={styles.currentTagText}>ACTIVE</Text>
              </View>
            </View>
          </Card3D>
        )}

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
            <Text style={[styles.infoValue, { color: '#059669' }]}>{customer.status}</Text>
          </View>
        </Card3D>

        {/* Security & Notifications */}
        <Card3D style={styles.card}>
          <Text style={styles.cardTitle}>Security & Notifications</Text>
          <View style={styles.infoRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Bell size={14} color="#2563EB" />
              <Text style={styles.infoLabel}>Push Reminders</Text>
            </View>
            <Text style={[styles.infoValue, { color: pushToken ? '#059669' : '#D97706' }]}>
              {pushToken ? 'Active & Synced' : 'Ready'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Shield size={14} color="#059669" />
              <Text style={styles.infoLabel}>Data Protection</Text>
            </View>
            <Text style={styles.infoValue}>Bank Grade AES-256</Text>
          </View>
          <View style={styles.infoRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Shield size={14} color="#2563EB" />
              <Text style={styles.infoLabel}>Permanent Device Lockdown</Text>
            </View>
            <Text style={[styles.infoValue, { color: '#059669' }]}>
              Locked (Until App Data Cleared)
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
                <Phone size={15} color="#2563EB" />
                <Text style={styles.callSupportText}>Call: {customer.retailer.mobile}</Text>
              </TouchableOpacity>
            )}
          </Card3D>
        )}

        {/* Switch App Mode Button (Staff / Retailer / Admin Switch) */}
        <TouchableOpacity
          activeOpacity={0.85}
          style={styles.switchRoleBtn}
          onPress={handleSwitchRole}
        >
          <Layers size={18} color="#2563EB" />
          <Text style={styles.switchRoleBtnText}>Switch App Mode (Retailer / Admin)</Text>
        </TouchableOpacity>

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

        <Text style={styles.appVersionText}>Telepoint Android Mobile App v1.0.0 • Connected to Live Supabase</Text>
      </ScrollView>

      {/* Switch Financed Device Modal */}
      <Modal
        visible={switchModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSwitchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalSheetTitle}>Switch Financed Device</Text>
                <Text style={styles.modalSheetSubtitle}>
                  Select which active EMI device loan you wish to view
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSwitchModalVisible(false)}
                style={styles.closeBtn}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {allLoans.map((loan: MultiLoanCustomer) => {
                const isCurrent = loan.id === customer.id;
                const isSwitching = switchingLoanId === loan.id;
                return (
                  <TouchableOpacity
                    key={loan.id}
                    activeOpacity={0.8}
                    style={[
                      styles.loanOptionCard,
                      isCurrent && styles.loanOptionCardActive,
                    ]}
                    onPress={() => handleSelectLoan(loan.id)}
                    disabled={isSwitching}
                  >
                    <View style={styles.loanOptionIconBox}>
                      <Smartphone size={20} color={isCurrent ? '#2563EB' : '#64748B'} />
                    </View>
                    <View style={styles.loanOptionInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.loanOptionModel}>
                          {loan.model_no || 'Smartphone'}
                        </Text>
                        {isCurrent && (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>CURRENT</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.loanOptionImei}>IMEI: {loan.imei}</Text>
                      <Text style={styles.loanOptionStatus}>Status: {loan.status || 'ACTIVE'}</Text>
                    </View>

                    <View style={styles.loanOptionRight}>
                      {isCurrent ? (
                        <View style={styles.activeCheckCircle}>
                          <Check size={14} color="#FFFFFF" />
                        </View>
                      ) : (
                        <ChevronRight size={18} color="#94A3B8" />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg.darkest, // #F8FAFC
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
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.2)',
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
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2,
  },
  profileCode: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  profilePhone: {
    color: '#64748B',
    fontSize: 13,
  },
  card: {
    marginBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  cardSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: -4,
  },
  switchPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderColor: 'rgba(37, 99, 235, 0.2)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  switchPillText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '700',
  },
  activeLoanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  activeLoanName: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  activeLoanImei: {
    color: '#64748B',
    fontSize: 11,
  },
  currentTag: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  currentTagText: {
    color: '#059669',
    fontSize: 9,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.05)',
  },
  infoLabel: {
    color: '#64748B',
    fontSize: 13,
  },
  infoValue: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  callSupportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 11,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  callSupportText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '700',
  },
  switchRoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    marginTop: 6,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  switchRoleBtnText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '800',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    marginBottom: 10,
  },
  logoutBtnText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '700',
  },
  appVersionText: {
    color: '#94A3B8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalSheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    padding: 4,
  },
  loanOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    marginBottom: 10,
  },
  loanOptionCardActive: {
    borderColor: '#2563EB',
    backgroundColor: 'rgba(37, 99, 235, 0.04)',
  },
  loanOptionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  loanOptionInfo: {
    flex: 1,
  },
  loanOptionModel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  currentBadge: {
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  currentBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2563EB',
  },
  loanOptionImei: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  loanOptionStatus: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },
  loanOptionRight: {
    marginLeft: 8,
  },
  activeCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
