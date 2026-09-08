import * as ExpoHaptics from 'expo-haptics';
import { Platform } from 'react-native';

export const Haptics = {
  ...ExpoHaptics,
  selectionAsync: async () => {
    if (Platform.OS === 'web') return;
    try {
      await ExpoHaptics.selectionAsync();
    } catch {}
  },
  impactAsync: async (style?: ExpoHaptics.ImpactFeedbackStyle) => {
    if (Platform.OS === 'web') return;
    try {
      await ExpoHaptics.impactAsync(style);
    } catch {}
  },
  notificationAsync: async (type?: ExpoHaptics.NotificationFeedbackType) => {
    if (Platform.OS === 'web') return;
    try {
      await ExpoHaptics.notificationAsync(type);
    } catch {}
  },
};

export const NotificationFeedbackType = ExpoHaptics.NotificationFeedbackType;
export const ImpactFeedbackStyle = ExpoHaptics.ImpactFeedbackStyle;
export default Haptics;
