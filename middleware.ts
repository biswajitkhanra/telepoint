import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth needed
  const publicRoutes = ['/login', '/customer', '/receipt', '/api/receipt'];
  if (publicRoutes.some(r => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // API routes that don't need a Supabase session — they do their own auth.
  // /api/backup is the database backup feed: it authenticates with the
  // BACKUP_TOKEN secret (Authorization: Bearer / ?token=), not a login cookie,
  // so it must skip the session check below — otherwise the unauthenticated
  // backup job gets redirected to the HTML /login page and the GitHub Action /
  // Google Sheet sees "<!DOCTYPE …" instead of JSON.
  if (
    pathname.startsWith('/api/customer-login') ||
    pathname.startsWith('/api/backup')
  ) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Role-based route protection
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const role = profile?.role;

  if (pathname.startsWith('/admin') && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/retailer', request.url));
  }

  if (pathname.startsWith('/retailer') && role !== 'retailer') {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  if (pathname.startsWith('/noc') && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/admin', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
