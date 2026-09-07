import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { Customer, EMIScheduleItem, DueBreakdown, BroadcastItem, MultiLoanCustomer } from '../types';
import { STORAGE_KEYS } from '../config';
import { loginCustomer, registerPushToken, deactivatePushToken } from '../services/api';
import { registerForPushNotificationsAsync } from '../services/notifications';

interface AuthContextType {
  customer: Customer | null;
  emis: EMIScheduleItem[];
  breakdown: DueBreakdown | null;
  broadcasts: BroadcastItem[];
  pushToken: string | null;
  isLoading: boolean;
  deviceRole: 'customer' | 'staff' | null;
  allLoans: MultiLoanCustomer[];
  setRolePreference: (role: 'customer' | 'staff') => Promise<void>;
  resetRolePreference: () => Promise<void>;
  switchActiveLoan: (loanId: string) => Promise<void>;
  login: (params: { aadhaar?: string; mobile?: string; customer_id?: string }) => Promise<{
    multi?: boolean;
    customers?: MultiLoanCustomer[];
  }>;
  refreshData: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [emis, setEmis] = useState<EMIScheduleItem[]>([]);
  const [breakdown, setBreakdown] = useState<DueBreakdown | null>(null);
  const [broadcasts, setBroadcasts] = useState<BroadcastItem[]>([]);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deviceRole, setDeviceRole] = useState<'customer' | 'staff' | null>(null);
  const [allLoans, setAllLoans] = useState<MultiLoanCustomer[]>([]);

  // Restore saved role & session on launch
  useEffect(() => {
    async function restoreSession() {
      try {
        // Restore role preference
        const savedRole = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ROLE);
        if (savedRole === 'customer' || savedRole === 'staff') {
          setDeviceRole(savedRole);
        }

        // Restore push token if saved
        const savedToken = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN);
        if (savedToken) {
          setPushToken(savedToken);
        }

        // Restore customer session
        const saved = await AsyncStorage.getItem(STORAGE_KEYS.SESSION);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.customer?.id) {
            setCustomer(parsed.customer);
            setEmis(parsed.emis || []);
            setBreakdown(parsed.breakdown || null);
            setBroadcasts(parsed.broadcasts || []);
            if (Array.isArray(parsed.allLoans)) {
              setAllLoans(parsed.allLoans);
            }

            // Silently refresh in background and discover any additional loans
            refreshCustomer(parsed.customer.id, parsed.customer.mobile);
          }
        }
      } catch (e) {
        console.warn('[AuthContext] Session restore error:', e);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();
  }, []);

  async function setRolePreference(role: 'customer' | 'staff') {
    setDeviceRole(role);
    await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ROLE, role);
  }

  async function resetRolePreference() {
    setDeviceRole(null);
    await AsyncStorage.removeItem(STORAGE_KEYS.DEVICE_ROLE);
  }

  async function switchActiveLoan(loanId: string) {
    setIsLoading(true);
    try {
      const res = await loginCustomer({ customer_id: loanId });
      if (res.customer) {
        setCustomer(res.customer);
        setEmis(res.emis || []);
        setBreakdown(res.breakdown || null);
        setBroadcasts(res.broadcasts || []);

        await AsyncStorage.setItem(
          STORAGE_KEYS.SESSION,
          JSON.stringify({
            customer: res.customer,
            emis: res.emis,
            breakdown: res.breakdown,
            broadcasts: res.broadcasts,
            allLoans,
          })
        );
        await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_LOAN, loanId);
      }
    } catch (e) {
      console.warn('[AuthContext] Switch loan failed:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshCustomer(customerId: string, mobileNum?: string) {
    try {
      const res = await loginCustomer({ customer_id: customerId });
      if (res.customer) {
        setCustomer(res.customer);
        setEmis(res.emis || []);
        setBreakdown(res.breakdown || null);
        setBroadcasts(res.broadcasts || []);

        // Also check if multiple loans exist for this mobile number
        let updatedLoans = allLoans;
        if (mobileNum || res.customer.mobile) {
          try {
            const multiCheck = await loginCustomer({ mobile: mobileNum || res.customer.mobile });
            if (multiCheck.multi && multiCheck.customers) {
              setAllLoans(multiCheck.customers);
              updatedLoans = multiCheck.customers;
            }
          } catch (mErr) {
            // ignore multi check error
          }
        }

        await AsyncStorage.setItem(
          STORAGE_KEYS.SESSION,
          JSON.stringify({
            customer: res.customer,
            emis: res.emis,
            breakdown: res.breakdown,
            broadcasts: res.broadcasts,
            allLoans: updatedLoans,
          })
        );
      }
    } catch (e) {
      // Offline or network error: retain cached session to enforce persistent login until data cleared
      console.log('[AuthContext] Background refresh offline/failed; retaining persistent session safely:', e);
    }
  }

  async function login(params: { aadhaar?: string; mobile?: string; customer_id?: string }) {
    setIsLoading(true);
    try {
      const res = await loginCustomer(params);

      if (res.multi && res.customers) {
        setAllLoans(res.customers);
        setIsLoading(false);
        return { multi: true, customers: res.customers };
      }

      if (!res.customer) {
        throw new Error(res.error || 'Customer not found');
      }

      setCustomer(res.customer);
      setEmis(res.emis || []);
      setBreakdown(res.breakdown || null);
      setBroadcasts(res.broadcasts || []);

      // Check if other loans exist under this mobile
      let currentLoans: MultiLoanCustomer[] = allLoans;
      if (params.mobile || res.customer.mobile) {
        try {
          const multiCheck = await loginCustomer({ mobile: params.mobile || res.customer.mobile });
          if (multiCheck.multi && multiCheck.customers) {
            setAllLoans(multiCheck.customers);
            currentLoans = multiCheck.customers;
          }
        } catch (e) {
          // ignore
        }
      }

      // Persist session
      await AsyncStorage.setItem(
        STORAGE_KEYS.SESSION,
        JSON.stringify({
          customer: res.customer,
          emis: res.emis,
          breakdown: res.breakdown,
          broadcasts: res.broadcasts,
          allLoans: currentLoans,
        })
      );

      // Register push token
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          setPushToken(token);
          await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
          const deviceId = Device.osInternalBuildId || `${Device.modelName || 'device'}-${Device.osVersion}`;
          await registerPushToken({
            customer_id: res.customer.id,
            push_token: token,
            device_id: deviceId,
            device_name: Device.modelName || 'Android Device',
            platform: 'android',
            app_version: '1.0.0',
          });
        }
      } catch (tokenErr) {
        console.warn('[AuthContext] Push token setup error:', tokenErr);
      }

      setIsLoading(false);
      return {};
    } catch (err) {
      setIsLoading(false);
      throw err;
    }
  }

  async function refreshData() {
    if (!customer?.id) return;
    await refreshCustomer(customer.id);
  }

  async function logout() {
    setIsLoading(true);
    try {
      if (customer?.id && pushToken) {
        const deviceId = Device.osInternalBuildId || `${Device.modelName || 'device'}-${Device.osVersion}`;
        await deactivatePushToken({
          customer_id: customer.id,
          push_token: pushToken,
          device_id: deviceId,
        }).catch(() => {});
      }
      await AsyncStorage.multiRemove([STORAGE_KEYS.SESSION, STORAGE_KEYS.TOKEN, STORAGE_KEYS.ACTIVE_LOAN]);
      setCustomer(null);
      setEmis([]);
      setBreakdown(null);
      setBroadcasts([]);
      setAllLoans([]);
      setPushToken(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        customer,
        emis,
        breakdown,
        broadcasts,
        pushToken,
        isLoading,
        deviceRole,
        allLoans,
        setRolePreference,
        resetRolePreference,
        switchActiveLoan,
        login,
        refreshData,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
