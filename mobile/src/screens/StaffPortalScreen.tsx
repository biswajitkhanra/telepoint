// mobile/src/screens/StaffPortalScreen.tsx
// Native Premium Staff Console (Retailer & Admin) + Optional Webview Workspace
// IDFC Clarity + Jupiter Delight: High-performance native operations with live MTD stats & instant actions
// 100% Data Fidelity with Supabase Backend + Squash & Stretch Jelly Physics

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  RotateCw,
  LogOut,
  Smartphone,
  Shield,
  ExternalLink,
  Globe,
  Layers,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { TelepointLogo } from '../components/TelepointLogo';
import { PressableScale } from '../components/PressableScale';
import { PORTAL_BASE_URL } from '../config';
import { Colors } from '../constants/colors';
import { Spacing, Radius, Shadow } from '../constants/design';
import { RetailerConsoleView } from './RetailerConsoleView';
import { AdminConsoleView } from './AdminConsoleView';

type StaffViewMode = 'native' | 'web';

export const StaffPortalScreen = () => {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 28 : 0);
  const { setRolePreference, staffRole, logoutStaff, staffUser } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const [viewMode, setViewMode] = useState<StaffViewMode>('native');
  const [canGoBack, setCanGoBack] = useState(false);
  const [webLoading, setWebLoading] = useState(false);

  const defaultStaffUrl =
    staffRole === 'admin' ? `${PORTAL_BASE_URL}/admin` : `${PORTAL_BASE_URL}/retailer`;
  const [currentUrl, setCurrentUrl] = useState(defaultStaffUrl);

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

  const handleOpenWebRoute = (path: string = '') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const target = path ? `${PORTAL_BASE_URL}${path}` : defaultStaffUrl;
    setCurrentUrl(target);
    setViewMode('web');
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
          style: 'destructive',
          onPress: async () => {
            if (webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                  document.cookie.split(";").forEach(function(c) { 
                    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
                  });
                } catch(e) {}
                true;
              `);
            }
            await logoutStaff();
          },
        },
      ]
    );
  };

  const handleSwitchToCustomer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Switch to Customer',
      'Do you want to switch this app to Customer / Borrower mode?',
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

      {/* Top Application Header */}
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <View style={styles.headerLeft}>
          {viewMode === 'web' ? (
            <PressableScale onPress={handleGoBack} style={styles.iconBtn} scaleTo={0.88}>
              <ArrowLeft size={18} color="#0F172A" />
            </PressableScale>
          ) : (
            <View style={styles.logoBox}>
              <TelepointLogo size={28} />
            </View>
          )}

          <View style={styles.titleCol}>
            <Text style={styles.headerTitle}>
              {staffRole === 'admin' ? 'TELEPOINT ADMIN' : 'TELEPOINT RETAILER'}
            </Text>
            <View style={styles.liveRow}>
              <View
                style={[
                  styles.liveDot,
                  { backgroundColor: staffRole === 'admin' ? '#8B5CF6' : '#10B981' },
                ]}
              />
              <Text style={styles.headerSub}>
                {viewMode === 'native' ? 'NATIVE APP CONSOLE' : 'DESKTOP WORKSPACE'}
              </Text>
            </View>
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.headerRight}>
          {/* View Mode Toggle Pill */}
          <PressableScale
            onPress={() => {
              Haptics.selectionAsync();
              setViewMode(prev => (prev === 'native' ? 'web' : 'native'));
            }}
            style={styles.modeTogglePill}
            scaleTo={0.93}
          >
            {viewMode === 'native' ? (
              <>
                <Globe size={13} color="#1A6FD6" />
                <Text style={styles.modeToggleText}>Desktop</Text>
              </>
            ) : (
              <>
                <Smartphone size={13} color="#10B981" />
                <Text style={styles.modeToggleTextActive}>App View</Text>
              </>
            )}
          </PressableScale>

          {/* Switch Staff Account */}
          <PressableScale
            onPress={handleSignOutOrSwitchUser}
            style={styles.switchAccountBtn}
            scaleTo={0.92}
          >
            <LogOut size={13} color="#2563EB" />
            <Text style={styles.switchAccountText}>Switch</Text>
          </PressableScale>

          {/* Switch to Customer shortcut */}
          <PressableScale
            onPress={handleSwitchToCustomer}
            style={styles.customerModeBtn}
            scaleTo={0.92}
          >
            <Smartphone size={13} color="#059669" />
            <Text style={styles.customerModeText}>Customer</Text>
          </PressableScale>
        </View>
      </View>

      {/* Main View Mode Selector */}
      {viewMode === 'native' ? (
        staffRole === 'admin' ? (
          <AdminConsoleView
            onOpenWebFallback={() => handleOpenWebRoute('/admin')}
            onSwitchAccount={handleSignOutOrSwitchUser}
            onSwitchToCustomer={handleSwitchToCustomer}
          />
        ) : (
          <RetailerConsoleView
            onOpenWebFallback={() => handleOpenWebRoute('/retailer')}
            onSwitchAccount={handleSignOutOrSwitchUser}
            onSwitchToCustomer={handleSwitchToCustomer}
          />
        )
      ) : (
        /* Fallback Desktop Workspace WebView with Native Header Controls */
        <View style={styles.webContainer}>
          <View style={styles.webToolbar}>
            <PressableScale onPress={handleGoBack} style={styles.webToolBtn} scaleTo={0.9}>
              <ArrowLeft size={16} color="#64748B" />
              <Text style={styles.webToolText}>Back to App</Text>
            </PressableScale>

            <Text style={styles.webUrlText} numberOfLines={1}>
              {currentUrl}
            </Text>

            <PressableScale onPress={handleReload} style={styles.webToolBtn} scaleTo={0.9}>
              <RotateCw size={15} color="#64748B" />
            </PressableScale>
          </View>

          {webLoading && (
            <View style={styles.webLoadingOverlay}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.webLoadingText}>Connecting to portal...</Text>
            </View>
          )}

          <WebView
            ref={webViewRef}
            source={{ uri: currentUrl }}
            style={styles.webView}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            startInLoadingState
            onNavigationStateChange={nav => setCanGoBack(nav.canGoBack)}
            onLoadStart={() => setWebLoading(true)}
            onLoadEnd={() => setWebLoading(false)}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.md,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    ...Shadow.sm,
    zIndex: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  logoBox: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleCol: {
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    gap: 4,
  },
  modeToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1A6FD6',
  },
  modeToggleTextActive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  switchAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 4,
  },
  switchAccountText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },
  customerModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 4,
  },
  customerModeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  webToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  webToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    gap: 4,
  },
  webToolText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  webUrlText: {
    flex: 1,
    fontSize: 11,
    color: '#94A3B8',
    marginHorizontal: 8,
  },
  webLoadingOverlay: {
    position: 'absolute',
    top: 45,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    gap: 8,
  },
  webLoadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  webView: {
    flex: 1,
  },
});
