import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadPortfolio } from '@/lib/portfolioData';
import { computeAnalysis } from '@/lib/analysis';

// GET /api/admin/analysis?month=9&year=2026[&fresh=1]
// Month vs same month last year from the FULL customers + emi_schedule tables
// (imported history included), for the Analytics tab and the Reports
// "this month vs last year" card. Replaces the get_emi_analysis RPC so the
// numbers no longer depend on which migrations were applied.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).single();
  if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const month = Number(sp.get('month'));
  const year = Number(sp.get('year'));
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: 'Valid month (1-12) and year required' }, { status: 400 });
  }

  try {
    const p = await loadPortfolio(null, sp.get('fresh') === '1');
    return NextResponse.json(
      computeAnalysis(p.customers, p.emis, p.retailers, month, year),
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    );
  } catch (e) {
    console.error('analysis failed:', e);
    return NextResponse.json({ error: 'Could not compute analysis' }, { status: 500 });
  }
}
