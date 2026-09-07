/**
 * Broadcast Push Notification Engine
 *
 * Handles push notification delivery when a broadcast is created by Admin or Retailer.
 * Respects:
 *   • Single Customer Targeting: target_customer_id = X → ONLY customer X receives push.
 *   • Retailer-Wide Targeting: target_retailer_id = R → ALL eligible customers of R receive push.
 *   • Expiration checks: Does not deliver expired broadcasts.
 *   • Idempotency: broadcast:<broadcast_id>:<customer_id>:<token_id>
 */

import { createServiceClient } from '@/lib/supabase/server';
import { sendExpoPushBatch, PushMessage } from './expoPushService';

export interface BroadcastPushResult {
  broadcastId: string;
  recipientsFound: number;
  notificationsQueued: number;
  duplicatesSkipped: number;
  sent: number;
  failed: number;
  tokensDeactivated: number;
}

export interface BroadcastRow {
  id: string;
  message: string;
  image_url?: string | null;
  target_retailer_id: string;
  target_customer_id?: string | null;
  expires_at: string;
  sender_name?: string;
  sender_role?: string;
}

export async function dispatchBroadcastPush(broadcast: BroadcastRow): Promise<BroadcastPushResult> {
  const svc = createServiceClient();
  const result: BroadcastPushResult = {
    broadcastId: broadcast.id,
    recipientsFound: 0,
    notificationsQueued: 0,
    duplicatesSkipped: 0,
    sent: 0,
    failed: 0,
    tokensDeactivated: 0,
  };

  // 1. Verify expiration
  if (new Date(broadcast.expires_at).getTime() <= Date.now()) {
    console.warn(`[BroadcastPush] Broadcast ${broadcast.id} is already expired. Skipping push.`);
    return result;
  }

  // 2. Determine target customer(s)
  let customerIds: string[] = [];

  if (broadcast.target_customer_id) {
    // Single customer targeting
    customerIds = [broadcast.target_customer_id];
  } else {
    // Retailer-wide targeting
    const { data: customers, error } = await svc
      .from('customers')
      .select('id')
      .eq('retailer_id', broadcast.target_retailer_id)
      .eq('status', 'RUNNING');

    if (error) {
      console.error('[BroadcastPush] Error querying retailer customers:', error);
      return result;
    }
    customerIds = (customers || []).map(c => c.id);
  }

  if (customerIds.length === 0) {
    console.info(`[BroadcastPush] No target customers found for broadcast ${broadcast.id}`);
    return result;
  }

  // 3. Query active push tokens for these customers
  const { data: tokens, error: tokenError } = await svc
    .from('customer_app_tokens')
    .select('id, customer_id, push_token, is_active')
    .in('customer_id', customerIds)
    .eq('is_active', true)
    .not('push_token', 'is', null);

  if (tokenError) {
    console.error('[BroadcastPush] Error querying customer push tokens:', tokenError);
    return result;
  }

  if (!tokens || tokens.length === 0) {
    console.info(`[BroadcastPush] No active push devices registered for target customers.`);
    return result;
  }

  result.recipientsFound = tokens.length;

  // 4. Format title & content
  const senderTitle = broadcast.sender_name ? `${broadcast.sender_name}` : 'Telepoint';
  const title = `Message from ${senderTitle}`;
  const body = broadcast.message.length > 140 ? `${broadcast.message.slice(0, 137)}...` : broadcast.message;

  const payloadData = {
    type: 'broadcast',
    broadcast_id: broadcast.id,
    image_url: broadcast.image_url || null,
    sender_name: broadcast.sender_name,
  };

  const pushMessages: PushMessage[] = [];

  for (const token of tokens) {
    // Idempotency key: broadcast:<broadcast_id>:<customer_id>:<token_id>
    const idempotencyKey = `broadcast:${broadcast.id}:${token.customer_id}:${token.id}`;

    const { data: delivery, error: insertError } = await svc
      .from('notification_deliveries')
      .insert({
        notification_type: 'broadcast',
        customer_id: token.customer_id,
        broadcast_id: broadcast.id,
        token_id: token.id,
        push_token: token.push_token!,
        title,
        body,
        data: payloadData,
        idempotency_key: idempotencyKey,
        status: 'pending',
      })
      .select('id')
      .maybeSingle();

    if (insertError) {
      if (insertError.code === '23505') {
        result.duplicatesSkipped++;
        continue;
      }
      console.warn(`[BroadcastPush] Delivery insert error:`, insertError.message);
      continue;
    }

    if (delivery) {
      result.notificationsQueued++;
      pushMessages.push({
        to: token.push_token!,
        title,
        body,
        data: payloadData,
        deliveryId: delivery.id,
        tokenId: token.id,
        channelId: 'telepoint-broadcasts',
        priority: 'high',
      });
    }
  }

  if (pushMessages.length > 0) {
    const batchResult = await sendExpoPushBatch(pushMessages);
    result.sent = batchResult.sent;
    result.failed = batchResult.failed;
    result.tokensDeactivated = batchResult.tokensDeactivated;
  }

  console.info(`[BroadcastPush] Broadcast ${broadcast.id} push complete: queued=${result.notificationsQueued}, sent=${result.sent}, failed=${result.failed}`);
  return result;
}
