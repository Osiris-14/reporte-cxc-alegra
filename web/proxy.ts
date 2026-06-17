/**
 * proxy.ts — Protege todas las rutas exigiendo una sesión válida.
 * (Antes era middleware.ts; Next 16 renombró la convención a "proxy".)
 *
 * Excepciones (no requieren sesión): /login, /api/* y los assets de Next
 * (_next/*, favicon). Sin cookie válida -> redirect a /login.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET ?? "";
  const session = token && secret ? await verifySession(token, secret) : null;

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Intercepta todo excepto /login, /api y los assets internos de Next.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
