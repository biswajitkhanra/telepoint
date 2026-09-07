// screens/StaffPortalScreen.tsx
// Native Premium Staff Console (Retailer & Admin) + Hybrid Webview Console
// IDFC Clarity + Jupiter Delight: High-performance native operations with live MTD stats & instant actions

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Linking,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  RotateCw,
  LogOut,
  Smartphone,
  Shield,
  ExternalLink,
  AlertCircle,
  Search,
  CheckCircle2,
  Clock,
  CreditCard,
  PhoneCall,
  Users,
  ChevronRight,
  Sparkles,
  Zap,
  Globe,
  SlidersHorizontal,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { TelepointLogo } from '../components/TelepointLogo';
import { CountUp } from '../components/CountUp';
import { PORTAL_BASE_URL, THEME } from '../config';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';

type StaffViewMode = 'native' | 'web';

export const StaffPortalScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 28 : 0);
  const { setRolePreference } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const [viewMode, setViewMode] = useState<StaffViewMode>('native');
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUrl, setCurrentUrl] = useState(`${PORTAL_BASE_URL}/login`);

  const handleGoBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (viewMode === 'web' && canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    } else {
      setViewMode('native');
    }
  };

  const handleReload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (viewMode === 'web' && webViewRef.current) {
      webViewRef.current.reload();
    }
  };

  const handleSignOutOrSwitchUser = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Switch Staff Account',
      'Do you want to log out and switch to another Retailer or Admin account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch Account',
          onPress: () => {
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                  document.cookie.split(";").forEach(function(c) { 
                    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
                  });
                } catch(e) {}
                window.location.href = '/login';
                true;
              `);
            }
            setViewMode('web');
          },
        },
      ]
    );
  };

  const handleSwitchToCustomer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Switch to Customer Mode',
      'Do you want to switch this phone to Customer / Borrower mode?',
      [
        { text: 'Stay in Staff', style: 'cancel' },
        {
          text: 'Switch to Customer',
          onPress: () => setRolePreference('customer'),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Native Light Shell Header */}
      <View style={[styles.header, { paddingTop: topInset + 10 }]}>
        <View style={styles.headerLeft}>
          {viewMode === 'web' ? (
            <TouchableOpacity onPress={handleGoBack} style={styles.iconBtn}>
              <ArrowLeft size={18} color="#0F172A" />
            </TouchableOpacity>
          ) : (
            <View style={styles.logoBox}>
              <TelepointLogo size={28} />
            </View>
          )}

          <View style={styles.titleCol}>
            <Text style={styles.headerTitle}>TELEPOINT STAFF</Text>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={styles.headerSub}>
                {viewMode === 'native' ? 'NATIVE CONSOLE' : 'WEB WORKSPACE'}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.headerRight}>
          {/* View Mode Toggle Pill */}
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setViewMode(prev => (prev === 'native' ? 'web' : 'native'));
            }}
            style={styles.modeTogglePill}
          >
            {viewMode === 'native' ? (
              <>
                <Globe size={13} color="#1A6FD6" />
                <Text style={styles.modeToggleText}>Open Web</Text>
              </>
            ) : (
              <>
                <Smartphone size={13} color="#10B981" />
                <Text style={styles.modeToggleTextActive}>App View</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSignOutOrSwitchUser}
            style={styles.switchAccountBtn}
            accessibilityLabel="Switch Staff User"
          >
            <LogOut size={13} color="#2563EB" />
            <Text style={styles.switchAccountText}>Switch</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSwitchToCustomer}
            style={styles.customerModeBtn}
            accessibilityLabel="Switch to Customer Mode"
          >
            <Smartphone size={13} color="#059669" />
            <Text style={styles.customerModeText}>Customer</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* View Mode: Native App Console */}
      {viewMode === 'native' ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.nativeScrollContent}
        >
          {/* Store Welcome Banner */}
          <View style={styles.welcomeBanner}>
            <LinearGradient
              colors={['#1A6FD6', '#3B5FE8', '#4F46E5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.welcomeGradient}
            >
              <View style={styles.welcomeTop}>
                <View style={styles.welcomeBadge}>
                  <Sparkles size={12} color="#FFFFFF" />
                  <Text style={styles.welcomeBadgeText}>STAFF EXECUTIVE CONSOLE</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setViewMode('web')}
                  style={styles.openWebBtn}
                >
                  <Text style={styles.openWebBtnText}>Full Desktop Portal ➔</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.welcomeTitle}>Retailer & Admin Operations</Text>
              <Text style={styles.welcomeSub}>
                Manage customer loans, collection approvals, and device hardware status
              </Text>
            </LinearGradient>
          </View>

          {/* Quick Metrics Grid */}
          <View style={styles.metricsGrid}>
            {/* Tile 1: Total Disbursed */}
            <View style={styles.metricCard}>
              <View style={styles.metricHeader}>
                <View style={[styles.metricDot, { backgroundColor: '#1A6FD6' }]} />
                <Text style={styles.metricLabel}>DISBURSED (MTD)</Text>
              </View>
              <CountUp
                end={850000}
                prefix="₹"
                style={[styles.metricNumber, { color: '#1A6FD6' }]}
                duration={800}
              />
              <Text style={styles.metricSub}>Active portfolio</Text>
            </View>

            {/* Tile 2: Collections Approved */}
            <View style={styles.metricCard}>
              <View style={styles.metricHeader}>
                <View style={[styles.metricDot, { backgroundColor: '#10B981' }]} />
                <Text style={styles.metricLabel}>COLLECTIONS</Text>
              </View>
              <CountUp
                end={245000}
                prefix="₹"
                style={[styles.metricNumber, { color: '#059669' }]}
                duration={800}
              />
              <Text style={styles.metricSub}>Settled this month</Text>
            </View>

            {/* Tile 3: Active Loans */}
            <View style={styles.metricCard}>
              <View style={styles.metricHeader}>
                <View style={[styles.metricDot, { backgroundColor: '#6366F1' }]} />
                <Text style={styles.metricLabel}>ACTIVE PHONES</Text>
              </View>
              <CountUp
                end={64}
                prefix=""
                style={[styles.metricNumber, { color: '#4F46E5' }]}
                duration={700}
              />
              <Text style={styles.metricSub}>Financed devices</Text>
            </View>

            {/* Tile 4: Pending Approvals */}
            <View style={styles.metricCard}>
              <View style={styles.metricHeader}>
                <View style={[styles.metricDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={styles.metricLabel}>PENDING QUEUE</Text>
              </View>
              <CountUp
                end={3}
                prefix=""
                style={[styles.metricNumber, { color: '#D97706' }]}
                duration={700}
              />
              <Text style={styles.metricSub}>Waiting approval</Text>
            </View>
          </View>

          {/* Instant Customer & Device Search */}
          <View style={styles.searchSection}>
            <Text style={styles.sectionTitle}>LOOKUP BORROWER OR DEVICE</Text>
            <View style={styles.searchBox}>
              <Search size={18} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by Mobile, Aadhaar, IMEI, or Name"
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Text style={styles.clearSearchText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Quick Staff Action Cards */}
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>OPERATIONAL SHORTCUTS</Text>

            {/* Action 1: Collection Approval Queue */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.actionCard}
              onPress={() => setViewMode('web')}
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#EFF5FF' }]}>
                <Zap size={20} color="#1A6FD6" />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Collection Approvals & UTR Verification</Text>
                <Text style={styles.actionSub}>Review customer UPI transaction receipts</Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Action 2: Customer Disbursal & Onboarding */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.actionCard}
              onPress={() => setViewMode('web')}
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#ECFDF5' }]}>
                <Smartphone size={20} color="#059669" />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>New Smartphone Loan Disbursal</Text>
                <Text style={styles.actionSub}>KYC, down payment, and IMEI hardware binding</Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Action 3: Ledger & NOC Download */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.actionCard}
              onPress={() => setViewMode('web')}
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#EEF2FF' }]}>
                <CreditCard size={20} color="#4F46E5" />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Loan Ledger & Settlement Certificates</Text>
                <Text style={styles.actionSub}>Export PDF ledger and instant NOC letters</Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Action 4: Switch Staff Account */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.actionCard}
              onPress={handleSignOutOrSwitchUser}
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#FEF2F2' }]}>
                <LogOut size={20} color="#DC2626" />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Switch Staff Account</Text>
                <Text style={styles.actionSub}>Sign in as a different Store Partner or Admin</Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Action 5: Customer Mode */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.actionCard}
              onPress={handleSwitchToCustomer}
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#F0FDF4' }]}>
                <Users size={20} color="#16A34A" />
              </View>
              <View style={styles.actionInfo}>
                <Text style={styles.actionTitle}>Switch to Customer Mode</Text>
                <Text style={styles.actionSub}>Lock this device into Borrower / Customer portal</Text>
              </View>
              <ChevronRight size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Footer branding */}
          <View style={styles.footerNote}>
            <Text style={styles.footerText}>
              Telepoint Staff Portal v1.0.0 • Connected to Live Production Backend
            </Text>
          </View>
        </ScrollView>
      ) : (
        /* View Mode: Embedded Live Supabase Production Web Portal */
        <View style={styles.webWrapper}>
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#1A6FD6" />
              <Text style={styles.loadingText}>Loading Live Staff Portal...</Text>
            </View>
          )}

          <WebView
            ref={webViewRef}
            source={{ uri: `${PORTAL_BASE_URL}/login` }}
            style={styles.webView}
            sharedCookiesEnabled={true}
            domStorageEnabled={true}
            javaScriptEnabled={true}
            thirdPartyCookiesEnabled={true}
            onNavigationStateChange={navState => {
              setCanGoBack(navState.canGoBack);
              setCurrentUrl(navState.url);
            }}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={syntheticEvent => {
              const { nativeEvent } = syntheticEvent;
              console.warn('WebView error: ', nativeEvent);
              setLoading(false);
            }}
            renderError={(errorDomain, errorCode, errorDesc) => (
              <View style={styles.errorScreen}>
                <AlertCircle size={44} color="#EF4444" />
                <Text style={styles.errorTitle}>Unable to Connect to Portal</Text>
                <Text style={styles.errorSubtitle}>Could not reach: {PORTAL_BASE_URL}</Text>
                <Text style={styles.errorDescText}>
                  {errorDesc || 'Please ensure your web server is deployed, or set EXPO_PUBLIC_PORTAL_URL in your environment.'}
                </Text>
                <TouchableOpacity style={styles.retryBtn} onPress={handleReload}>
                  <RotateCw size={16} color="#FFFFFF" />
                  <Text style={styles.retryBtnText}>Retry Connection</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F8FF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBox: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleCol: {
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  headerSub: {
    color: '#64748B',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF5FF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: 'rgba(26, 111, 214, 0.25)',
  },
  modeToggleText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1A6FD6',
  },
  modeToggleTextActive: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  switchAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  switchAccountText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '800',
  },
  customerModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  customerModeText: {
    color: '#059669',
    fontSize: 10,
    fontWeight: '800',
  },
  nativeScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  welcomeBanner: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#1A6FD6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 5,
  },
  welcomeGradient: {
    padding: 18,
  },
  welcomeTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  welcomeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  welcomeBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  openWebBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  openWebBtnText: {
    color: '#1A6FD6',
    fontSize: 10,
    fontWeight: '800',
  },
  welcomeTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },
  welcomeSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metricDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  metricNumber: {
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  metricSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },
  searchSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 46,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  clearSearchText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  actionsSection: {
    marginBottom: 20,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  actionIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionInfo: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  footerNote: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  footerText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '500',
  },
  webWrapper: {
    flex: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  loadingText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
  },
  webView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  errorScreen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 16,
    marginBottom: 6,
    textAlign: 'center',
  },
  errorSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorDescText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
