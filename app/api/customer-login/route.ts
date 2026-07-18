import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Curated customer payload for the read-only customer portal.
// `customer_code` (migration 025) is requested first; if the column is not
// deployed yet the query is retried without it so login never breaks.
const CUSTOMER_COLS = `
  id, retailer_id, customer_name, father_name, aadhaar, mobile,
  alternate_number_1, alternate_number_2,
  model_no, imei, purchase_value, down_payment, disburse_amount,
  purchase_date, emi_due_day, emi_amount, emi_tenure,
  first_emi_charge_amount, first_emi_charge_paid_at,
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
  const body = await req.json();
  const { aadhaar, mobile, customer_id } = body as { aadhaar?: string; mobile?: string; customer_id?: string };

  const serviceClient = createServiceClient();

  // Direct load by customer_id (from multi-loan selection)
  if (customer_id) {
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

    return NextResponse.json({ customer, emis: emis || [], breakdown, broadcasts: broadcasts || [] });
  }

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
    customer,
    emis: emis || [],
    breakdown,
    broadcasts: broadcasts || [],
  });
}
