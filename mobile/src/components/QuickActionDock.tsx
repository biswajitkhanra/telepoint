import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import {
  Zap,
  Receipt,
  PhoneCall,
  HelpCircle,
} from 'lucide-react-native';
import { THEME, SPRING_CONFIG } from '../config';

interface QuickActionDockProps {
  onPayUpi: () => void;
  onViewReceipts: () => void;
  retailerPhone?: string;
  retailerName?: string;
}

export const QuickActionDock: React.FC<QuickActionDockProps> = ({
  onPayUpi,
  onViewReceipts,
  retailerPhone,
  retailerName,
}) => {
  const handleCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!retailerPhone) {
      Alert.alert('Store Helpline', 'Retailer phone number is not listed for this loan.');
      return;
    }
    Linking.openURL(`tel:${retailerPhone}`);
  };

  const handleHelp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Telepoint EMI Guidelines',
      '• Due Date: EMIs must be paid on or before the due date.\n• Late Fine: Unpaid EMIs incur daily late penalty charges.\n• Receipts: Instant digital slips are generated upon payment.\n\nNeed support? Contact your retailer store manager.',
      [{ text: 'Got it' }]
    );
  };

  const ActionButton = ({
    icon,
    label,
    gradientColors,
    onPress,
  }: {
    icon: React.ReactNode;
    label: string;
    gradientColors: [string, string];
    onPress: () => void;
  }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;

    const pressIn = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Animated.spring(scaleAnim, {
        toValue: 0.92,
        tension: SPRING_CONFIG.touchDown.tension,
        friction: SPRING_CONFIG.touchDown.friction,
        useNativeDriver: true,
      }).start();
    };

    const pressOut = () => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: SPRING_CONFIG.touchUp.tension,
        friction: SPRING_CONFIG.touchUp.friction,
        useNativeDriver: true,
      }).start();
    };

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={styles.actionItem}
      >
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            {icon}
          </LinearGradient>
        </Animated.View>
        <Text style={styles.actionLabel}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.dockHeader}>FINTECH QUICK ACTIONS</Text>
      <View style={styles.dockRow}>
        <ActionButton
          icon={<Zap size={22} color="#FFFFFF" />}
          label="Pay UPI"
          gradientColors={['#2563EB', '#1D4ED8']}
          onPress={onPayUpi}
        />

        <ActionButton
          icon={<Receipt size={22} color="#FFFFFF" />}
          label="Receipts"
          gradientColors={['#059669', '#047857']}
          onPress={onViewReceipts}
        />

        <ActionButton
          icon={<PhoneCall size={22} color="#FFFFFF" />}
          label="Call Store"
          gradientColors={['#D97706', '#B45309']}
          onPress={handleCall}
        />

        <ActionButton
          icon={<HelpCircle size={22} color="#FFFFFF" />}
          label="Help"
          gradientColors={['#4F46E5', '#4338CA']}
          onPress={handleHelp}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  dockHeader: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 12,
    marginLeft: 4,
  },
  dockRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  actionItem: {
    alignItems: 'center',
    width: 70,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  actionLabel: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
