import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/dbFetch';

// ─────────────────────────────────────────────────────────────────────────────
// One-click full portal backup (admin only).
//
//   GET /api/admin/full-backup  → a single .json file containing every row of
//                                 every table (customers, retailers, EMIs,
//                                 payments, fines, broadcasts, logins, logs).
//
// This is the on-demand counterpart to the automatic 12-hour GitHub backup
// (see app/api/backup/route.ts). It lets a super-admin download a complete,
// self-contained snapshot of the whole portal at any moment, straight from the
// dashboard, with no token or external setup. The downloaded file can be kept
// safely offline and used to restore/inspect the data later.
//
// Auth: must be signed in as a super_admin. Retailers and the public get 403.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

// Every portal table → the column used for stable paging. Kept in sync with the
// whitelist in app/api/backup/route.ts so both backups cover exactly the same
// complete set of data.
const TABLES: Record<string, string> = {
  profiles:              'user_id',
  retailers:             'id',
  customers:             'id',
  emi_schedule:          'id',
  payment_requests:      'id',
  payment_request_items: 'id',
  fine_settings:         'id',
  fine_history:          'id',
  broadcast_messages:    'id',
  customer_app_tokens:   'id',
  audit_log:             'id',
};

export async function GET(_req: NextRequest) {
  // ── Authorize: signed-in super_admin only ────────────────────────────────
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Dump every table, fully paginated, into one snapshot object ───────────
  const svc = createServiceClient();
  const generated_at = new Date().toISOString();

  const tables: Record<
    string,
    { count: number; columns: string[]; rows: Record<string, unknown>[] }
  > = {};

  for (const [name, orderBy] of Object.entries(TABLES)) {
    const rows = await fetchAllPaged<Record<string, unknown>>((from, to) =>
      svc.from(name).select('*').order(orderBy, { ascending: true }).range(from, to),
    );
    tables[name] = {
      count: rows.length,
      columns: rows.length ? Object.keys(rows[0]) : [],
      rows,
    };
  }

  const snapshot = {
    portal: 'TelePoint',
    kind: 'full-backup',
    generated_at,
    table_count: Object.keys(tables).length,
    total_rows: Object.values(tables).reduce((n, t) => n + t.count, 0),
    tables,
  };

  // Date-stamped filename so multiple downloads never collide.
  const stamp = generated_at.slice(0, 19).replace(/[:T]/g, '-');
  const filename = `telepoint-full-backup-${stamp}.json`;

  return new NextResponse(JSON.stringify(snapshot, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
