import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findUserByToken, sessionCookieName, updateUserProfile, type DeveloperProfile } from "@/lib/auth";

export async function GET() {
  const user = await findUserByToken(cookies().get(sessionCookieName())?.value);
  return NextResponse.json({ user });
}

export async function PUT(request: Request) {
  const user = await findUserByToken(cookies().get(sessionCookieName())?.value);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const profile = (await request.json()) as DeveloperProfile;
  if (!profile.displayName.trim() || !profile.githubUsername.trim()) {
    return NextResponse.json({ error: "Display name and GitHub username are required." }, { status: 400 });
  }
  const updated = await updateUserProfile(user.id, profile);
  return NextResponse.json({ user: updated });
}
