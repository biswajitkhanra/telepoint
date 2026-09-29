import React, { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, TouchableOpacity, BackHandler, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { PORTAL_BASE_URL } from '../config';
import { Colors } from '../constants/colors';

/**
 * Staff (admin / retailer) surface = the real TelePoint web portal, loaded in a
 * WebView. This guarantees the staff app is EXACTLY the web app — every screen,
 * every number, every feature — with zero data-drift and nothing to keep in
 * sync. The staff sign in with their normal web credentials inside the WebView
 * (Supabase session cookies persist in the WebView), so auth is identical too.
 *
 * The customer app stays fully native; only the staff build uses this.
 */
export const WebPortalScreen = () => {
  const webRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const canGoBack = useRef(false);

  // Hardware back navigates the web history first, then falls through to exit.
  React.useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack.current) { webRef.current?.goBack(); return true; }
      return false;
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
            source={{ uri: `${PORTAL_BASE_URL}/login` }}
            onNavigationStateChange={onNav}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => { setFailed(true); setLoading(false); }}
            onHttpError={() => { /* keep showing page; server renders its own errors */ }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
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
