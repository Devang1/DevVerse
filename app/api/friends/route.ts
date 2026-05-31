import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { acceptFriendRequest, findUserByToken, getFriendshipStatus, listFriendData, requestFriend, sessionCookieName } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await findUserByToken(cookies().get(sessionCookieName())?.value);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const friendId = searchParams.get("friendId")?.trim();
  if (!friendId) {
    const data = await listFriendData(user.id);
    return NextResponse.json(data);
  }

  const status = await getFriendshipStatus(user.id, friendId);
  return NextResponse.json({ status });
}

export async function POST(request: Request) {
  const user = await findUserByToken(cookies().get(sessionCookieName())?.value);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const input = (await request.json()) as { friendId?: string; action?: "request" | "accept" };
  if (!input.friendId) return NextResponse.json({ error: "Choose a registered user." }, { status: 400 });

  try {
    const status = input.action === "accept"
      ? await acceptFriendRequest(user.id, input.friendId)
      : await requestFriend(user.id, input.friendId);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not add friend." },
      { status: 400 }
    );
  }
}
