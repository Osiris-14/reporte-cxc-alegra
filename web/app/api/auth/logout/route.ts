import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** Borra la cookie de sesión y redirige a /login. */
export async function POST(req: Request) {
  // 303 para que el navegador cambie el POST del formulario por un GET a /login.
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
