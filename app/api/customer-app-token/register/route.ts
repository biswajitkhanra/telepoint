import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { isExpoPushToken } from '@/lib/notifications/expoPushService';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      customer_id,
      push_token,
      device_id,
      device_name,
      platform,
      app_version,
      action, // 'register' | 'logout'
    } = body as {
      customer_id?: string;
      push_token?: string;
      device_id?: string;
      device_name?: string;
      platform?: string;
      app_version?: string;
      action?: string;
    };

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    const svc = createServiceClient();

    // Verify customer exists
    const { data: customer, error: custErr } = await svc
      .from('customers')
      .select('id, customer_name, status')
      .eq('id', customer_id)
      .single();

    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // ── Handle Logout (deactivate device push token) ──────────
    if (action === 'logout') {
      let query = svc.from('customer_app_tokens').update({
        is_active: false,
        updated_at: new Date().toISOString(),
      }).eq('customer_id', customer_id);

      if (push_token) {
        query = query.eq('push_token', push_token);
      } else if (device_id) {
        query = query.eq('device_id', device_id);
      }

      await query;
      console.info(`[TokenRegister] Deactivated device token for customer ${customer_id}`);
      return NextResponse.json({ success: true, message: 'Push token deactivated' });
    }

    // ── Handle Register / Update ──────────────────────────────
    if (!push_token) {
      return NextResponse.json({ error: 'push_token is required' }, { status: 400 });
    }

    if (!isExpoPushToken(push_token)) {
      return NextResponse.json({ error: 'Invalid Expo push token format' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const effectiveDeviceId = device_id || `dev-${crypto.randomUUID().slice(0, 8)}`;

    // Check if token or device already exists for this customer
    let existingTokenRow = null;

    if (device_id) {
      const { data } = await svc
        .from('customer_app_tokens')
        .select('id')
        .eq('customer_id', customer_id)
        .eq('device_id', device_id)
        .maybeSingle();
      existingTokenRow = data;
    }

    if (!existingTokenRow && push_token) {
      const { data } = await svc
        .from('customer_app_tokens')
        .select('id')
        .eq('customer_id', customer_id)
        .eq('push_token', push_token)
        .maybeSingle();
      existingTokenRow = data;
    }

    if (existingTokenRow) {
      const { error: updateError } = await svc
        .from('customer_app_tokens')
        .update({
          push_token,
          device_id: effectiveDeviceId,
          device_name: device_name || 'Android Device',
          platform: platform || 'android',
          app_version: app_version || '1.0.0',
          is_active: true,
          last_used_at: now,
          updated_at: now,
        })
        .eq('id', existingTokenRow.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, tokenId: existingTokenRow.id, updated: true });
    }

    // Insert new multi-device token entry
    const autoLoginToken = crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36);
    const { data: newRow, error: insertError } = await svc
      .from('customer_app_tokens')
      .insert({
        customer_id,
        token: autoLoginToken,
        push_token,
        device_id: effectiveDeviceId,
        device_name: device_name || 'Android Device',
        platform: platform || 'android',
        app_version: app_version || '1.0.0',
        is_active: true,
        last_used_at: now,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, tokenId: newRow.id, registered: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[TokenRegister] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
