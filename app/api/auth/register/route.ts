import { NextResponse } from "next/server";
import { createSessionToken, registerUser, setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as Record<string, string>;
    if (!input.email || !input.password || input.password.length < 8 || !input.displayName || !input.githubUsername) {
      return NextResponse.json({ error: "Complete every field. Passwords need at least 8 characters." }, { status: 400 });
    }
    const user = await registerUser(input as {
      email: string;
      password: string;
      displayName: string;
      githubUsername: string;
    });
    const response = NextResponse.json({ user });
    setSessionCookie(response, createSessionToken(user.id));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create account." }, { status: 400 });
  }
}
