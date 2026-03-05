import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function isDocumentRequest(request: NextRequest) {
  const acceptHeader = request.headers.get('accept') ?? '';
  const fetchDest = request.headers.get('sec-fetch-dest') ?? '';

  return acceptHeader.includes('text/html') || fetchDest === 'document';
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (isDocumentRequest(request)) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
