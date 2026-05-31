import { NextResponse } from "next/server";
import { authenticateUser, createSessionToken, setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const input = (await request.json()) as Record<string, string>;
  const user = await authenticateUser(input.email ?? "", input.password ?? "");
  if (!user) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  const response = NextResponse.json({ user });
  setSessionCookie(response, createSessionToken(user.id));
  return response;
}
