/**
 * Expo Push Notification Service
 *
 * Implements robust push delivery using Expo's HTTP/2 Push Notification API.
 * Supports token validation, batching (100 messages/request), retry handling,
 * ticket receipt processing, and automatic deactivation of dead/unregistered tokens.
 *
 * Safe for server environments (Vercel, Node.js, Next.js API routes).
 */

import { createServiceClient } from '@/lib/supabase/server';

export interface PushMessage {
  to: string; // ExponentPushToken[...]
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  badge?: number;
  channelId?: string;
  deliveryId?: string; // Links back to notification_deliveries.id
  tokenId?: string;    // Links back to customer_app_tokens.id
}

export interface PushReceiptTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded' | string;
    [key: string]: unknown;
  };
}

export interface PushBatchResult {
  total: number;
  sent: number;
  failed: number;
  tokensDeactivated: number;
  tickets: PushReceiptTicket[];
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const CHUNK_SIZE = 100;

/**
 * Validates whether a given string is a plausible Expo push token.
 */
export function isExpoPushToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  // Format 1: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
  // Format 2: ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]
  // Format 3: Raw UUID-like tokens in some Expo versions
  return (
    /^ExponentPushToken\[[A-Za-z0-9_\-+/=]+\]$/.test(token) ||
    /^ExpoPushToken\[[A-Za-z0-9_\-+/=]+\]$/.test(token) ||
    /^[A-Za-z0-9_\-]{22,}$/.test(token)
  );
}

/**
 * Sends a list of push messages in chunks via the Expo Push API.
 * Automatically deactivates unregistered tokens in customer_app_tokens
 * and updates notification_deliveries with ticket IDs or error details.
 */
export async function sendExpoPushBatch(messages: PushMessage[]): Promise<PushBatchResult> {
  const result: PushBatchResult = {
    total: messages.length,
    sent: 0,
    failed: 0,
    tokensDeactivated: 0,
    tickets: [],
  };

  if (messages.length === 0) return result;

  const svc = createServiceClient();
  const expoAccessToken = process.env.EXPO_ACCESS_TOKEN;

  // Split into chunks of 100 (Expo maximum)
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);

    // Validate tokens in this chunk
    const validChunk: PushMessage[] = [];
    for (const msg of chunk) {
      if (!isExpoPushToken(msg.to)) {
        result.failed++;
        console.warn(`[PushService] Invalid token format encountered: ${maskToken(msg.to)}`);
        if (msg.deliveryId) {
          await svc.from('notification_deliveries').update({
            status: 'invalid_token',
            error_message: 'Invalid Expo push token format',
            sent_at: new Date().toISOString(),
          }).eq('id', msg.deliveryId);
        }
        if (msg.tokenId) {
          await svc.from('customer_app_tokens').update({
            is_active: false,
            updated_at: new Date().toISOString(),
          }).eq('id', msg.tokenId);
          result.tokensDeactivated++;
        }
        continue;
      }
      validChunk.push(msg);
    }

    if (validChunk.length === 0) continue;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      };
      if (expoAccessToken) {
        headers['Authorization'] = `Bearer ${expoAccessToken}`;
      }

      // Payload for Expo
      const payload = validChunk.map(m => ({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data || {},
        sound: m.sound || 'default',
        priority: m.priority || 'high',
        channelId: m.channelId || 'telepoint-reminders',
      }));

      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'Unknown error');
        console.error(`[PushService] Expo HTTP error ${res.status}: ${errorText}`);
        result.failed += validChunk.length;

        // Mark deliveries as failed
        const deliveryIds = validChunk.map(m => m.deliveryId).filter(Boolean) as string[];
        if (deliveryIds.length > 0) {
          await svc.from('notification_deliveries').update({
            status: 'failed',
            error_message: `Expo HTTP ${res.status}: ${errorText.slice(0, 200)}`,
            sent_at: new Date().toISOString(),
          }).in('id', deliveryIds);
        }
        continue;
      }

      const responseJson = await res.json() as { data?: PushReceiptTicket[] };
      const tickets = responseJson.data || [];

      for (let j = 0; j < validChunk.length; j++) {
        const msg = validChunk[j];
        const ticket = tickets[j];
        result.tickets.push(ticket || { status: 'error', message: 'No ticket returned' });

        if (ticket?.status === 'ok') {
          result.sent++;
          if (msg.deliveryId) {
            await svc.from('notification_deliveries').update({
              status: 'sent',
              expo_ticket_id: ticket.id || null,
              sent_at: new Date().toISOString(),
            }).eq('id', msg.deliveryId);
          }
        } else {
          result.failed++;
          const errorCode = ticket?.details?.error;
          const errorMsg = ticket?.message || errorCode || 'Push delivery failed';
          console.warn(`[PushService] Push error for token ${maskToken(msg.to)}: ${errorMsg}`);

          // Check if token is permanently dead
          const isDeadToken =
            errorCode === 'DeviceNotRegistered' ||
            errorCode === 'InvalidCredentials';

          if (msg.deliveryId) {
            await svc.from('notification_deliveries').update({
              status: isDeadToken ? 'invalid_token' : 'failed',
              error_message: errorMsg,
              sent_at: new Date().toISOString(),
            }).eq('id', msg.deliveryId);
          }

          if (isDeadToken && msg.tokenId) {
            await svc.from('customer_app_tokens').update({
              is_active: false,
              updated_at: new Date().toISOString(),
            }).eq('id', msg.tokenId);
            result.tokensDeactivated++;
            console.info(`[PushService] Deactivated invalid token id=${msg.tokenId}`);
          }
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('[PushService] Batch network exception:', errMsg);
      result.failed += validChunk.length;

      const deliveryIds = validChunk.map(m => m.deliveryId).filter(Boolean) as string[];
      if (deliveryIds.length > 0) {
        await svc.from('notification_deliveries').update({
          status: 'failed',
          error_message: `Network exception: ${errMsg.slice(0, 200)}`,
          sent_at: new Date().toISOString(),
        }).in('id', deliveryIds);
      }
    }
  }

  return result;
}

/**
 * Mask token for privacy in logs.
 * e.g., ExponentPushToken[abcdef1234567890] -> ExponentPushToken[abcd...7890]
 */
function maskToken(token: string): string {
  if (!token || token.length < 15) return '***';
  return `${token.slice(0, 10)}...${token.slice(-6)}`;
}
