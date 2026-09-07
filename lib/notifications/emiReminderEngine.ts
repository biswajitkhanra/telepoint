/**
 * Automatic EMI Reminder Engine
 *
 * Scans active customer portfolios for EMIs due in the next 0 to 5 days
 * based on India Standard Time (IST / Asia/Kolkata).
 *
 * Features:
 *   • Guaranteed idempotency: Runs safely multiple times a day without duplicates.
 *   • Deterministic key: emi_reminder:<customer_id>:<emi_id>:<YYYY-MM-DD_IST>
 *   • Dynamic message formatting based on days remaining (Due Today, Due Tomorrow, Due in X days).
 *   • Dispatches to all active devices registered for that customer.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { todayIST, addDaysIST, diffDaysIST, formatShortDateIST } from '@/lib/ist';
import { formatCurrency } from '@/lib/formatters';
import { sendExpoPushBatch, PushMessage } from './expoPushService';

export interface EmiReminderRunResult {
  dateIST: string;
  totalEligible: number;
  duplicatesSkipped: number;
  notificationsQueued: number;
  sent: number;
  failed: number;
  tokensDeactivated: number;
}

export async function runEmiRemindersDaily(): Promise<EmiReminderRunResult> {
  const svc = createServiceClient();
  const today = todayIST();
  const fiveDaysLater = addDaysIST(today, 5);

  console.info(`[EmiReminderEngine] Starting run for date=${today} (lookahead to ${fiveDaysLater})`);

  const result: EmiReminderRunResult = {
    dateIST: today,
    totalEligible: 0,
    duplicatesSkipped: 0,
    notificationsQueued: 0,
    sent: 0,
    failed: 0,
    tokensDeactivated: 0,
  };

  // 1. Fetch unpaid/partially paid EMIs due between today and today + 5 days
  // where the loan is RUNNING
  const { data: emis, error: emiError } = await svc
    .from('emi_schedule')
    .select(`
      id, emi_no, due_date, amount, status, partial_paid_amount, customer_id,
      customer:customers!inner(
        id, customer_name, status, mobile, customer_code,
        tokens:customer_app_tokens(
          id, push_token, is_active, platform, device_name
        )
      )
    `)
    .in('status', ['UNPAID', 'PARTIALLY_PAID'])
    .gte('due_date', today)
    .lte('due_date', fiveDaysLater)
    .eq('customer.status', 'RUNNING');

  if (emiError) {
    console.error('[EmiReminderEngine] Failed to query upcoming EMIs:', emiError);
    throw new Error(`Failed to query upcoming EMIs: ${emiError.message}`);
  }

  if (!emis || emis.length === 0) {
    console.info('[EmiReminderEngine] No EMIs due in the next 5 days.');
    return result;
  }

  result.totalEligible = emis.length;
  console.info(`[EmiReminderEngine] Found ${emis.length} eligible upcoming EMIs.`);

  const pushMessages: PushMessage[] = [];

  for (const emi of emis) {
    const cust = emi.customer as unknown as {
      id: string;
      customer_name: string;
      customer_code?: string;
      tokens?: Array<{ id: string; push_token: string; is_active: boolean }>;
    };

    if (!cust) continue;

    // Filter active push tokens for this customer
    const activeTokens = (cust.tokens || []).filter(t => t.is_active && t.push_token);
    if (activeTokens.length === 0) {
      continue;
    }

    const daysUntilDue = diffDaysIST(emi.due_date, today);
    if (daysUntilDue < 0 || daysUntilDue > 5) {
      continue;
    }

    // Remaining installment amount (amount - partial_paid_amount)
    const remainingAmount = Math.max(0, Number(emi.amount || 0) - Math.max(0, Number(emi.partial_paid_amount || 0)));
    const formattedAmount = formatCurrency(remainingAmount);
    const dueDateFormatted = formatShortDateIST(emi.due_date);

    // Format content professionally according to specification
    let title = 'EMI Payment Reminder';
    let body = '';

    if (daysUntilDue === 0) {
      title = 'EMI Due Today!';
      body = `Your EMI #${emi.emi_no} of ${formattedAmount} is due today. Please make your payment to avoid late fines.`;
    } else if (daysUntilDue === 1) {
      title = 'EMI Due Tomorrow';
      body = `Your EMI #${emi.emi_no} of ${formattedAmount} is due tomorrow. Please make your payment on time.`;
    } else {
      title = `EMI Due in ${daysUntilDue} Days`;
      body = `Your EMI #${emi.emi_no} of ${formattedAmount} is due in ${daysUntilDue} days (Due: ${dueDateFormatted}).`;
    }

    // Data payload for in-app navigation
    const payloadData = {
      type: 'emi_reminder',
      emi_id: emi.id,
      customer_id: cust.id,
      emi_no: emi.emi_no,
      amount: remainingAmount,
      due_date: emi.due_date,
      days_until_due: daysUntilDue,
    };

    for (const token of activeTokens) {
      // Deterministic idempotency key:
      // emi_reminder:<customer_id>:<emi_id>:<token_id>:<date_IST>
      const idempotencyKey = `emi_reminder:${cust.id}:${emi.id}:${token.id}:${today}`;

      // Insert delivery record first. The UNIQUE constraint on idempotency_key
      // ensures that even if this job runs 10 times today, only one record is inserted.
      const { data: delivery, error: insertError } = await svc
        .from('notification_deliveries')
        .insert({
          notification_type: 'emi_reminder',
          customer_id: cust.id,
          emi_schedule_id: emi.id,
          token_id: token.id,
          push_token: token.push_token,
          title,
          body,
          data: payloadData,
          idempotency_key: idempotencyKey,
          status: 'pending',
        })
        .select('id')
        .maybeSingle();

      if (insertError) {
        // Postgres unique violation (23505) = already queued/sent today
        if (insertError.code === '23505') {
          result.duplicatesSkipped++;
          continue;
        }
        console.warn(`[EmiReminderEngine] Delivery insert error:`, insertError.message);
        continue;
      }

      if (delivery) {
        result.notificationsQueued++;
        pushMessages.push({
          to: token.push_token,
          title,
          body,
          data: payloadData,
          deliveryId: delivery.id,
          tokenId: token.id,
          channelId: 'telepoint-reminders',
          priority: 'high',
        });
      }
    }
  }

  console.info(`[EmiReminderEngine] Queued ${pushMessages.length} push messages (skipped ${result.duplicatesSkipped} duplicates).`);

  if (pushMessages.length > 0) {
    const batchResult = await sendExpoPushBatch(pushMessages);
    result.sent = batchResult.sent;
    result.failed = batchResult.failed;
    result.tokensDeactivated = batchResult.tokensDeactivated;
  }

  console.info(`[EmiReminderEngine] Completed: sent=${result.sent}, failed=${result.failed}, duplicatesSkipped=${result.duplicatesSkipped}`);
  return result;
}
