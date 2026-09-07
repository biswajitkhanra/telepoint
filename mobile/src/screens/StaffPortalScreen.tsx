import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Haptics from 'expo-haptics';
import {
  ArrowLeft,
  RotateCw,
  LogOut,
  Smartphone,
  Shield,
  ExternalLink,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { TelepointLogo } from '../components/TelepointLogo';
import { PORTAL_BASE_URL, THEME } from '../config';

export const StaffPortalScreen = () => {
  const { setRolePreference } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUrl, setCurrentUrl] = useState(`${PORTAL_BASE_URL}/login`);

  const handleGoBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    }
  };

  const handleReload = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (webViewRef.current) {
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
              // Inject javascript to clear Supabase auth cookie / local storage and navigate to login
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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {canGoBack ? (
            <TouchableOpacity onPress={handleGoBack} style={styles.iconBtn}>
              <ArrowLeft size={20} color="#0F172A" />
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
              <Text style={styles.headerSub}>ADMIN & RETAILER PORTAL</Text>
            </View>
          </View>
        </View>

        {/* Action Controls */}
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={handleReload}
            style={styles.iconBtn}
            accessibilityLabel="Refresh Portal"
          >
            <RotateCw size={17} color="#475569" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSignOutOrSwitchUser}
            style={styles.switchAccountBtn}
            accessibilityLabel="Switch Staff User"
          >
            <LogOut size={15} color="#2563EB" />
            <Text style={styles.switchAccountText}>Switch</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSwitchToCustomer}
            style={styles.customerModeBtn}
            accessibilityLabel="Switch to Customer Mode"
          >
            <Smartphone size={15} color="#059669" />
            <Text style={styles.customerModeText}>Customer Mode</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Loading Bar */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.loadingText}>Loading Live Portal...</Text>
        </View>
      )}

      {/* Embedded Live Supabase Production Web Portal */}
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
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
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
    gap: 8,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  switchAccountText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '800',
  },
  customerModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  customerModeText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
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
});
