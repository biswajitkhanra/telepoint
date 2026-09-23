import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { issueCustomerSession, verifyCustomerSession, sessionCustomerIds } from '@/lib/customerSession';
import { clientIp, rateLimit, limited, hit } from '@/lib/rateLimit';
import { redactCustomer } from '@/lib/pii';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Once every installed mobile app sends session_token, set this to "true" so a
// bare customer_id (UUID) can no longer be used to read an account.
const REQUIRE_SESSION = process.env.CUSTOMER_ID_REQUIRES_SESSION === 'true';
const tooMany = (retry: number) => NextResponse.json(
  { error: 'Too many attempts. Please wait a minute and try again.' },
  { status: 429, headers: { 'Retry-After': String(retry) } },
);

// Curated customer payload for the read-only customer portal.
// `customer_code` (migration 025) is requested first; if the column is not
// deployed yet the query is retried without it so login never breaks.
const CUSTOMER_COLS = `
  id, retailer_id, customer_name, father_name, aadhaar, mobile,
  alternate_number_1, alternate_number_2,
  model_no, imei, purchase_value, down_payment, disburse_amount,
  purchase_date, emi_due_day, emi_amount, emi_tenure,
  first_emi_charge_amount, first_emi_charge_paid_amount, first_emi_charge_paid_at,
  customer_photo_url, status,
  retailer:retailers(name, mobile)
`;
const CUSTOMER_COLS_WITH_CODE = CUSTOMER_COLS.replace('customer_photo_url', 'customer_code, customer_photo_url');
const isMissingCodeColumn = (error: { message?: string } | null) =>
  !!error?.message && /customer_code/.test(error.message);

// Loose row shape — the select string is a runtime variable, so supabase-js
// cannot infer the row type itself.
type CustRow = Record<string, unknown> & {
  id: string;
  retailer_id: string;
  customer_name?: string;
  imei?: string;
  model_no?: string;
  mobile?: string;
  status?: string;
  emi_amount?: number;
  retailer?: unknown;
};

export async function POST(req: NextRequest) {
  let body: { aadhaar?: unknown; mobile?: unknown; customer_id?: unknown; session_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const aadhaar = typeof body.aadhaar === 'string' ? body.aadhaar : undefined;
  const mobile = typeof body.mobile === 'string' ? body.mobile : undefined;
  const customer_id = typeof body.customer_id === 'string' ? body.customer_id : undefined;
  const ip = clientIp(req);

  const serviceClient = createServiceClient();

  // Direct load by customer_id (multi-loan selection, refresh, app restore)
  if (customer_id) {
    if (!UUID_RE.test(customer_id)) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    const hasSession = verifyCustomerSession(body.session_token, customer_id);
    if (!hasSession) {
      // Legacy callers (older mobile app builds) send no token. Throttle them
      // hard so UUIDs can't be sprayed, and refuse outright in strict mode.
      if (REQUIRE_SESSION) return NextResponse.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
      const wait = rateLimit(`cid:${ip}`, 150, 10 * 60_000);
      if (wait) return tooMany(wait);
    }
    const first = await serviceClient
      .from('customers')
      .select(CUSTOMER_COLS_WITH_CODE)
      .eq('id', customer_id)
      .single();
    let customer = first.data as unknown as CustRow | null;
    if (isMissingCodeColumn(first.error)) {
      const retry = await serviceClient
        .from('customers')
        .select(CUSTOMER_COLS)
        .eq('id', customer_id)
        .single();
      customer = retry.data as unknown as CustRow | null;
    }

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const { data: emis } = await serviceClient
      .from('emi_schedule')
      .select('id, emi_no, due_date, amount, status, paid_at, mode, utr, partial_paid_amount, partial_paid_at, fine_amount, fine_waived, fine_paid_amount, fine_paid_at, collection_requested_at')
      .eq('customer_id', customer.id)
      .order('emi_no');

    const { data: breakdown } = await serviceClient.rpc('get_due_breakdown', {
      p_customer_id: customer.id,
    });

    // Fetch active broadcast messages for this customer's retailer
    const { data: broadcasts } = await serviceClient
      .from('broadcast_messages')
      .select('id, message, image_url, expires_at, sender_name, sender_role')
      .eq('target_retailer_id', customer.retailer_id)
      .or(`target_customer_id.is.null,target_customer_id.eq.${customer.id}`)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    // Re-issue so an active customer never hits the 30-day expiry.
    const ids = hasSession ? sessionCustomerIds(body.session_token) : [];
    return NextResponse.json({
      customer: redactCustomer(customer),
      emis: emis || [],
      breakdown,
      broadcasts: broadcasts || [],
      ...(hasSession ? { session_token: issueCustomerSession(ids.length ? ids : [customer.id]) } : {}),
    });
  }

  // Identifier login: only FAILED lookups count (enumeration is mostly misses),
  // 25 per 10 minutes per IP, so shared carrier IPs don't lock real customers out.
  const wait = limited(`login-miss:${ip}`, 25);
  if (wait) return tooMany(wait);

  const cleanAadhaar = (aadhaar ?? '').replace(/\D/g, '');
  const cleanMobile = (mobile ?? '').replace(/\D/g, '');

  if (!cleanAadhaar && !cleanMobile) {
    return NextResponse.json({ error: 'Provide Aadhaar or mobile number to login' }, { status: 400 });
  }
  if (cleanAadhaar && cleanAadhaar.length !== 12) {
    return NextResponse.json({ error: 'Aadhaar must be exactly 12 digits' }, { status: 400 });
  }
  if (cleanMobile && cleanMobile.length !== 10) {
    return NextResponse.json({ error: 'Mobile must be exactly 10 digits' }, { status: 400 });
  }

  const buildLookup = (cols: string) => {
    let q = serviceClient.from('customers').select(cols);
    if (cleanAadhaar) {
      q = q.eq('aadhaar', cleanAadhaar);
      if (cleanMobile) q = q.eq('mobile', cleanMobile);
    } else {
      q = q.eq('mobile', cleanMobile);
    }
    return q;
  };

  const firstLookup = await buildLookup(CUSTOMER_COLS_WITH_CODE);
  let customers = firstLookup.data as unknown as CustRow[] | null;
  let error = firstLookup.error;
  if (isMissingCodeColumn(error)) {
    const retryLookup = await buildLookup(CUSTOMER_COLS);
    customers = retryLookup.data as unknown as CustRow[] | null;
    error = retryLookup.error;
  }

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }

  if (!customers || customers.length === 0) {
    hit(`login-miss:${ip}`, 10 * 60_000);
    return NextResponse.json(
      { error: 'No matching customer found. Check your Aadhaar or Mobile number.' },
      { status: 401 }
    );
  }

  // Multi-loan support: if multiple customers found, return all of them
  if (customers.length > 1) {
    // Return list for UI to show selection
    return NextResponse.json({
      multi: true,
      session_token: issueCustomerSession(customers.map(c => c.id)),
      customers: customers.map(c => ({
        id: c.id,
        customer_name: c.customer_name,
        imei: c.imei,
        model_no: c.model_no,
        mobile: c.mobile,
        status: c.status,
        emi_amount: c.emi_amount,
        retailer: c.retailer,
      })),
    });
  }

  const customer = customers[0];

  const { data: emis } = await serviceClient
    .from('emi_schedule')
    .select('id, emi_no, due_date, amount, status, paid_at, mode, utr, partial_paid_amount, partial_paid_at, fine_amount, fine_waived, fine_paid_amount, fine_paid_at, collection_requested_at')
    .eq('customer_id', customer.id)
    .order('emi_no');

  const { data: breakdown } = await serviceClient.rpc('get_due_breakdown', {
    p_customer_id: customer.id,
  });

  // Fetch active broadcast messages for this customer's retailer
  const { data: broadcasts } = await serviceClient
    .from('broadcast_messages')
    .select('id, message, image_url, expires_at, sender_name, sender_role')
    .eq('target_retailer_id', (customer as Record<string, unknown>).retailer_id as string)
    .or(`target_customer_id.is.null,target_customer_id.eq.${(customer as Record<string, unknown>).id as string}`)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  return NextResponse.json({
    customer: redactCustomer(customer),
    emis: emis || [],
    breakdown,
    broadcasts: broadcasts || [],
    session_token: issueCustomerSession([customer.id]),
  });
}
