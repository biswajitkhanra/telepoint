// mobile/src/components/admin/RiskBreakdownCard.tsx
// Risk & Portfolio Vulnerability card: Expected Loss, NPA, and Closed Accounts

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react-native';
import { JellyCard } from '../JellyCard';
import { Radius, Spacing } from '../../constants/design';

interface RiskBreakdownCardProps {
  expectedLossCount: number;
  expectedLossAmount: number;
  npaCount: number;
  settledCount: number;
  completedCount: number;
}

export const RiskBreakdownCard: React.FC<RiskBreakdownCardProps> = ({
  expectedLossCount,
  expectedLossAmount,
  npaCount,
  settledCount,
  completedCount,
}) => {
  return (
    <JellyCard accentColor="#E11D48" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <ShieldAlert size={18} color="#E11D48" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>RISK & AT-RISK CAPITAL</Text>
          <Text style={styles.subtitle}>Loans with 3+ months overdue & defaulted books</Text>
        </View>
      </View>

      <View style={styles.grid}>
        <View style={styles.box}>
          <Text style={styles.boxLabel}>EXPECTED LOSS (3M+)</Text>
          <Text style={styles.boxValueRed}>₹{Math.round(expectedLossAmount).toLocaleString('en-IN')}</Text>
          <Text style={styles.boxSub}>{expectedLossCount} delinquent accounts</Text>
        </View>

        <View style={styles.box}>
          <Text style={styles.boxLabel}>NPA / WRITTEN OFF</Text>
          <Text style={styles.boxValueRed}>{npaCount}</Text>
          <Text style={styles.boxSub}>Defaulter accounts</Text>
        </View>
      </View>

      <View style={styles.terminalRow}>
        <View style={styles.termCol}>
          <Text style={styles.termLabel}>SETTLED EARLY</Text>
          <Text style={styles.termVal}>{settledCount} accounts</Text>
        </View>
        <View style={styles.termCol}>
          <Text style={styles.termLabel}>FULLY RECOVERED</Text>
          <Text style={[styles.termVal, { color: '#059669' }]}>{completedCount} accounts</Text>
        </View>
      </View>
    </JellyCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFE4E6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  box: {
    flex: 1,
    backgroundColor: '#FFF1F2',
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  boxLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9F1239',
  },
  boxValueRed: {
    fontSize: 16,
    fontWeight: '900',
    color: '#E11D48',
    marginVertical: 3,
  },
  boxSub: {
    fontSize: 10,
    color: '#9F1239',
  },
  terminalRow: {
    flexDirection: 'row',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  termCol: {
    flex: 1,
  },
  termLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94A3B8',
  },
  termVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 1,
  },
});
