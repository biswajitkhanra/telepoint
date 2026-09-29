import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, X } from 'lucide-react-native';
import { Colors } from '../constants/colors';
import { Spacing, Radius } from '../constants/design';
import type { EMIScheduleItem } from '../types';
import { computeEmiDue, reminderCopy } from '../utils/emiReminder';

/**
 * Bilingual (English + Bengali) EMI-due popup shown INSIDE the app.
 *   • Due within 5 days (not yet due): shown once per app-open for 10s.
 *   • Due today or overdue and still unpaid: shown up to 5 times a day, 5s each
 *     (counted per calendar day in storage), until the EMI is paid.
 * The app-closed case is handled separately by local notifications.
 */

const DAILY_KEY = '@telepoint_emi_reminder_daily'; // { date: 'YYYY-MM-DD', count: n }
const MAX_PER_DAY = 5;
const SHOW_MS_DUE = 5000;
const SHOW_MS_UPCOMING = 10000;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export const EmiDueReminder = ({ emis }: { emis: EMIScheduleItem[] | null | undefined }) => {
  const [visible, setVisible] = useState(false);
  const info = computeEmiDue(emis);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownThisMount = useRef(false);

  const clearTimer = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };

  const show = useCallback((ms: number) => {
    setVisible(true);
    clearTimer();
    hideTimer.current = setTimeout(() => setVisible(false), ms);
  }, []);

  const maybeShow = useCallback(async () => {
    if (!info.shouldRemind) return;
    // Upcoming (due within 5 days, not today/overdue): once per app-open, 10s.
    if (!info.dueToday && !info.overdue) {
      if (!shownThisMount.current) { shownThisMount.current = true; show(SHOW_MS_UPCOMING); }
      return;
    }
    // Due today / overdue: up to 5 times a day, 5s each.
    try {
      const raw = await AsyncStorage.getItem(DAILY_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const today = todayKey();
      const count = parsed && parsed.date === today ? Number(parsed.count) || 0 : 0;
      if (count >= MAX_PER_DAY) return;
      await AsyncStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, count: count + 1 }));
      show(SHOW_MS_DUE);
    } catch {
      // Storage unavailable — still show once so the reminder is not lost.
      if (!shownThisMount.current) { shownThisMount.current = true; show(SHOW_MS_DUE); }
    }
  }, [info.shouldRemind, info.dueToday, info.overdue, show]);

  // Show on mount and on each app foreground (each foreground counts toward the
  // daily cap for the due-today case).
  useEffect(() => {
    maybeShow();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => { if (s === 'active') maybeShow(); });
    return () => { sub.remove(); clearTimer(); };
  }, [maybeShow]);

  if (!visible) return null;
  const copy = reminderCopy(info);
  const urgent = info.dueToday || info.overdue;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.card, urgent && styles.cardUrgent]}>
          <TouchableOpacity style={styles.close} onPress={() => setVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
          <View style={[styles.badge, urgent ? styles.badgeUrgent : styles.badgeInfo]}>
            <AlertTriangle size={30} color="#fff" />
          </View>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.titleBn}>{copy.titleBn}</Text>
          <View style={styles.divider} />
          <Text style={styles.body}>{copy.body}</Text>
          <Text style={styles.bodyBn}>{copy.bodyBn}</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  card: { width: '100%', maxWidth: 380, backgroundColor: Colors.bgCard, borderRadius: Radius.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.xs, borderWidth: 1, borderColor: Colors.border },
  cardUrgent: { borderColor: Colors.danger },
  close: { position: 'absolute', top: Spacing.sm, right: Spacing.sm, padding: 4, zIndex: 2 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  badgeUrgent: { backgroundColor: Colors.danger },
  badgeInfo: { backgroundColor: Colors.warning ?? '#D97706' },
  title: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  titleBn: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  divider: { height: 1, alignSelf: 'stretch', backgroundColor: Colors.border, marginVertical: Spacing.sm },
  body: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  bodyBn: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginTop: 4 },
});
