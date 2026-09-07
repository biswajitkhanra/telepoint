import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { role, username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tjqigwdivmcyikurpepe.supabase.co';
    const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // 1. Authenticate via Supabase Auth
    const email =
      role === 'admin'
        ? ({ TELEPOINT: 'telepoint@admin.local', telepoint: 'telepoint@admin.local' }[username] ??
          `${username}@admin.local`)
        : `${username.toLowerCase()}@tele.local`;

    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON,
      },
      body: JSON.stringify({ email, password }),
    });

    const authData = await authRes.json();
    if (!authRes.ok || !authData.user) {
      return NextResponse.json(
        { error: authData.error_description || 'Incorrect username or password' },
        { status: 401 }
      );
    }

    const svc = createServiceClient();

    // 2. Validate role
    if (role === 'admin') {
      const { data: profile } = await svc
        .from('profiles')
        .select('role')
        .eq('user_id', authData.user.id)
        .single();

      if (profile?.role !== 'super_admin') {
        return NextResponse.json(
          { error: 'User is not an authorized Super Admin' },
          { status: 403 }
        );
      }

      return NextResponse.json({
        success: true,
        role: 'admin',
        user: {
          id: authData.user.id,
          username: username.toUpperCase(),
          name: 'Super Admin',
          role: 'super_admin',
        },
        accessToken: authData.access_token,
      });
    } else {
      // Retailer role
      const { data: retailer } = await svc
        .from('retailers')
        .select('id, name, username, mobile, is_active')
        .eq('auth_user_id', authData.user.id)
        .single();

      let activeRetailer = retailer;
      if (!activeRetailer) {
        // Fallback check by username
        const { data: retByU } = await svc
          .from('retailers')
          .select('id, name, username, mobile, is_active')
          .ilike('username', username.trim())
          .single();
        activeRetailer = retByU;
      }

      if (!activeRetailer) {
        return NextResponse.json({ error: 'Retailer profile not found' }, { status: 403 });
      }

      if (activeRetailer.is_active === false) {
        return NextResponse.json({ error: 'This retailer account is deactivated' }, { status: 403 });
      }

      return NextResponse.json({
        success: true,
        role: 'retailer',
        retailer: activeRetailer,
        user: {
          id: authData.user.id,
          username: activeRetailer.username,
          name: activeRetailer.name,
          role: 'retailer',
        },
        accessToken: authData.access_token,
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Server authentication error' },
      { status: 500 }
    );
  }
}
