import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, BackHandler, RefreshControl, ScrollView, AppState, type AppStateStatus, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { PORTAL_BASE_URL } from '../config';
import { Colors } from '../constants/colors';

/**
 * Staff (admin / retailer) surface = the real TelePoint web portal in a WebView.
 * The staff sign in with their normal web credentials; the Supabase session is
 * kept in cookies that persist across app restarts.
 *
 * SESSION PERSISTENCE (the "retailer keeps getting logged out" fix):
 *   1. We load the portal ROOT ("/"), NOT "/login". The root page (and the
 *      middleware) route by the CURRENT session — an authenticated staff member
 *      is sent straight to /admin or /retailer, and only a genuinely signed-out
 *      user reaches /login. Previously we always opened /login, so even a valid
 *      persisted session showed the login form and looked "logged out".
 *   2. On every background/inactive transition we FLUSH the Android WebView
 *      cookie store to disk, so the Supabase auth cookie survives an app kill or
 *      reboot instead of being lost with the process. Best-effort + guarded, so
 *      it degrades cleanly when the cookie module is unavailable.
 */
export const WebPortalScreen = () => {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const canGoBack = useRef(false);

  // Persist WebView cookies to disk so the session survives app kill / reboot.
  const flushCookies = () => {
    if (Platform.OS !== 'android') return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@react-native-cookies/cookies');
      const CookieManager = mod?.default ?? mod;
      CookieManager?.flush?.();
    } catch {
      /* cookie module not present — WebView still persists on its own schedule */
    }
  };

  // Hardware back navigates the web history first, then falls through to exit.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) { webRef.current?.goBack(); return true; }
      return false;
    });
    return () => sub.remove();
  }, []);

  // Flush cookies whenever the app leaves the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'background' || s === 'inactive') flushCookies();
    });
    return () => sub.remove();
  }, []);

  const onNav = (nav: WebViewNavigation) => { canGoBack.current = nav.canGoBack; };

  const reload = () => { setFailed(false); setLoading(true); webRef.current?.reload(); };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {failed ? (
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
        >
          <Text style={styles.errTitle}>Can’t reach the portal</Text>
          <Text style={styles.errBody}>Check your internet connection and try again.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={reload} activeOpacity={0.85}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          <WebView
            ref={webRef}
            // Portal ROOT — routes by the current session (see note above).
            source={{ uri: `${PORTAL_BASE_URL}/` }}
            onNavigationStateChange={onNav}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => { setLoading(false); flushCookies(); }}
            onError={() => { setFailed(true); setLoading(false); }}
            onHttpError={() => { /* keep showing page; server renders its own errors */ }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            incognito={false}
            cacheEnabled
            pullToRefreshEnabled
            startInLoadingState={false}
            allowsBackForwardNavigationGestures
            setSupportMultipleWindows={false}
            style={styles.web}
          />
          {loading && (
            <View style={styles.loadingOverlay} pointerEvents="none">
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          )}
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bgBase },
  web: { flex: 1, backgroundColor: Colors.bgBase },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgBase,
  },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  errTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  errBody: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  retryBtn: { marginTop: 12, backgroundColor: Colors.primary, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 12 },
  retryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
