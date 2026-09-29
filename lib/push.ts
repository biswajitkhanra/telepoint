import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Expo push sender. Sends a real notification to a customer's
 * registered device(s) so a LOCK/UNLOCK or broadcast wakes the app and is
 * applied promptly even when it is closed. Everything here is best-effort: a
 * failed push must never block the primary action (locking, broadcasting).
 */

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const EXPO_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Send one message to many Expo push tokens, chunked to Expo's 100/req limit. */
export async function sendExpoPush(tokens: string[], msg: PushMessage): Promise<void> {
  const valid = Array.from(new Set(
    tokens.filter((t) => typeof t === 'string' && t.startsWith('ExponentPushToken')),
  ));
  if (valid.length === 0) return;

  const messages = valid.map((to) => ({
    to,
    sound: 'default',
    title: msg.title,
    body: msg.body,
    data: msg.data ?? {},
    priority: 'high',
    channelId: 'emi-reminders',
  }));

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      await fetch(EXPO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
    } catch {
      /* best-effort — skip this chunk on network error */
    }
  }
}

/** Push to a single customer's active devices. Never throws. */
export async function pushToCustomer(svc: SupabaseClient, customerId: string, msg: PushMessage): Promise<void> {
  try {
    const { data } = await svc.from('push_tokens').select('token').eq('customer_id', customerId).eq('is_active', true);
    const tokens = (data ?? []).map((r: { token: string }) => r.token).filter(Boolean);
    await sendExpoPush(tokens, msg);
  } catch {
    /* best-effort */
  }
}

/** Push to many customers' active devices in one batch. Never throws. */
export async function pushToCustomers(svc: SupabaseClient, customerIds: string[], msg: PushMessage): Promise<void> {
  if (customerIds.length === 0) return;
  try {
    const { data } = await svc.from('push_tokens').select('token').in('customer_id', customerIds).eq('is_active', true);
    const tokens = (data ?? []).map((r: { token: string }) => r.token).filter(Boolean);
    await sendExpoPush(tokens, msg);
  } catch {
    /* best-effort */
  }
}
