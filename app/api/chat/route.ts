import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { findUserByToken, getConversation, getFriendshipStatus, sendChatMessage, sessionCookieName } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await findUserByToken(cookies().get(sessionCookieName())?.value);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const peerId = searchParams.get("peerId")?.trim();
  if (!peerId) return NextResponse.json({ error: "Choose a registered user to chat with." }, { status: 400 });

  if ((await getFriendshipStatus(user.id, peerId)) !== "friends") {
    return NextResponse.json({ error: "You can only message accepted friends." }, { status: 403 });
  }

  try {
    const messages = await getConversation(user.id, peerId);
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load chat." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const user = await findUserByToken(cookies().get(sessionCookieName())?.value);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const input = (await request.json()) as { recipientId?: string; body?: string };
  if (!input.recipientId) return NextResponse.json({ error: "Choose a registered user to chat with." }, { status: 400 });

  try {
    if ((await getFriendshipStatus(user.id, input.recipientId)) !== "friends") {
      return NextResponse.json({ error: "You can only message accepted friends." }, { status: 403 });
    }
    const message = await sendChatMessage(user.id, input.recipientId, input.body ?? "");
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not send message." },
      { status: 400 }
    );
  }
}
