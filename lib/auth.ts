import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

export type DeveloperProfile = {
  displayName: string;
  githubUsername: string;
  bio: string;
  location: string;
  portfolioUrl: string;
  linkedinUrl: string;
  leetcodeUrl: string;
  codechefUrl: string;
  hackerrankUrl: string;
  repoSelectionMode: "all" | "selected";
  selectedRepoIds: number[];
};

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  profile: DeveloperProfile;
};

export type PublicUser = Omit<StoredUser, "passwordHash">;

export type RegisteredDeveloperProfile = DeveloperProfile & {
  userId: string;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
};

export type FriendshipStatus = "none" | "pending_sent" | "pending_received" | "friends";
type FriendshipState = "pending" | "accepted";
export type Friendship = {
  userId: string;
  friendId: string;
  status: FriendshipState;
  createdAt: string;
};

const DATA_PATH = path.join(process.cwd(), "data", "users.json");
const CHAT_DATA_PATH = path.join(process.cwd(), "data", "chats.json");
const FRIEND_DATA_PATH = path.join(process.cwd(), "data", "friends.json");
const COOKIE_NAME = "devverse_session";
const TOKEN_MAX_AGE = 60 * 60 * 24 * 14;
const DATABASE_URL = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === "production";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function normalizeProfile(profile: Partial<DeveloperProfile>): DeveloperProfile {
  return {
    displayName: profile.displayName?.trim() ?? "",
    githubUsername: profile.githubUsername?.trim() ?? "",
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    portfolioUrl: profile.portfolioUrl ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
    leetcodeUrl: profile.leetcodeUrl ?? "",
    codechefUrl: profile.codechefUrl ?? "",
    hackerrankUrl: profile.hackerrankUrl ?? "",
    repoSelectionMode: profile.repoSelectionMode === "selected" ? "selected" : "all",
    selectedRepoIds: Array.isArray(profile.selectedRepoIds)
      ? profile.selectedRepoIds.map(Number).filter(Number.isFinite)
      : []
  };
}

function publicUser(user: StoredUser): PublicUser {
  const { passwordHash: _, ...rest } = user;
  return { ...rest, profile: normalizeProfile(rest.profile) };
}

function getPool() {
  if (!DATABASE_URL) return null;
  pool ??= new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}

export function getDatabasePool() {
  return getPool();
}

async function ensureSchema() {
  const db = getPool();
  if (!db) return;
  schemaReady ??= db.query(`
    CREATE TABLE IF NOT EXISTS devverse_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      profile JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS devverse_users_github_username_idx
      ON devverse_users (LOWER(profile->>'githubUsername'));

    CREATE TABLE IF NOT EXISTS devverse_messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES devverse_users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES devverse_users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS devverse_messages_pair_idx
      ON devverse_messages (sender_id, recipient_id, created_at);

    CREATE TABLE IF NOT EXISTS devverse_friendships (
      user_id TEXT NOT NULL REFERENCES devverse_users(id) ON DELETE CASCADE,
      friend_id TEXT NOT NULL REFERENCES devverse_users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'accepted',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, friend_id),
      CHECK (user_id <> friend_id),
      CHECK (status IN ('pending', 'accepted'))
    );
    ALTER TABLE devverse_friendships
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted';

    CREATE TABLE IF NOT EXISTS devverse_github_city_cache (
      username TEXT PRIMARY KEY,
      city JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `).then(() => undefined);
  await schemaReady;
}

export async function ensureDatabaseSchema() {
  await ensureSchema();
}

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  profile: DeveloperProfile;
};

type MessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: Date | string;
};

type FriendshipRow = {
  user_id: string;
  friend_id: string;
  status: FriendshipState;
  created_at: Date | string;
};

function rowToUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    profile: normalizeProfile(row.profile)
  };
}

function rowToMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    recipientId: row.recipient_id,
    body: row.body,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString()
  };
}

function rowToFriendship(row: FriendshipRow): Friendship {
  return {
    userId: row.user_id,
    friendId: row.friend_id,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString()
  };
}

async function readUsers(): Promise<StoredUser[]> {
  const db = getPool();
  if (db) {
    await ensureSchema();
    const result = await db.query<UserRow>("SELECT id, email, password_hash, profile FROM devverse_users ORDER BY created_at ASC");
    return result.rows.map(rowToUser);
  }
  try {
    return (JSON.parse(await readFile(DATA_PATH, "utf8")) as StoredUser[]).map((user) => ({
      ...user,
      profile: normalizeProfile(user.profile)
    }));
  } catch {
    return [];
  }
}

async function writeUsers(users: StoredUser[]) {
  if (getPool()) throw new Error("writeUsers is only available for local JSON storage.");
  if (isProduction) throw new Error("Set DATABASE_URL in production. Local JSON storage is development-only.");
  await mkdir(path.dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(users, null, 2), "utf8");
}

async function readMessages(): Promise<ChatMessage[]> {
  try {
    return JSON.parse(await readFile(CHAT_DATA_PATH, "utf8")) as ChatMessage[];
  } catch {
    return [];
  }
}

async function writeMessages(messages: ChatMessage[]) {
  if (isProduction && !getPool()) throw new Error("Set DATABASE_URL in production. Local JSON storage is development-only.");
  await mkdir(path.dirname(CHAT_DATA_PATH), { recursive: true });
  await writeFile(CHAT_DATA_PATH, JSON.stringify(messages, null, 2), "utf8");
}

async function readFriendships(): Promise<Friendship[]> {
  try {
    const friendships = JSON.parse(await readFile(FRIEND_DATA_PATH, "utf8")) as Array<Friendship | Omit<Friendship, "status">>;
    return friendships.map((friendship) => ({
      ...friendship,
      status: "status" in friendship ? friendship.status : "accepted"
    }));
  } catch {
    return [];
  }
}

async function writeFriendships(friendships: Friendship[]) {
  if (isProduction && !getPool()) throw new Error("Set DATABASE_URL in production. Local JSON storage is development-only.");
  await mkdir(path.dirname(FRIEND_DATA_PATH), { recursive: true });
  await writeFile(FRIEND_DATA_PATH, JSON.stringify(friendships, null, 2), "utf8");
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password: string, passwordHash: string) {
  const [salt, expected] = passwordHash.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function getSecret() {
  return process.env.AUTH_SECRET ?? "devverse-local-development-secret";
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function createSessionToken(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: Date.now() + TOKEN_MAX_AGE * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token?: string) {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId: string;
      expiresAt: number;
    };
    return parsed.expiresAt > Date.now() ? parsed.userId : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: Response, token: string) {
  response.headers.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TOKEN_MAX_AGE}`
  );
}

export function clearSessionCookie(response: Response) {
  response.headers.append("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function sessionCookieName() {
  return COOKIE_NAME;
}

export async function findUserByToken(token?: string): Promise<PublicUser | null> {
  const userId = readSessionToken(token);
  if (!userId) return null;
  const db = getPool();
  if (db) {
    await ensureSchema();
    const result = await db.query<UserRow>(
      "SELECT id, email, password_hash, profile FROM devverse_users WHERE id = $1 LIMIT 1",
      [userId]
    );
    const row = result.rows[0];
    return row ? publicUser(rowToUser(row)) : null;
  }
  const user = (await readUsers()).find((candidate) => candidate.id === userId);
  if (!user) return null;
  return publicUser(user);
}

export async function listRegisteredUsers(): Promise<PublicUser[]> {
  return (await readUsers()).map(publicUser);
}

export async function findRegisteredProfileByGithubUsername(githubUsername: string): Promise<RegisteredDeveloperProfile | null> {
  const username = githubUsername.trim().toLowerCase();
  if (!username) return null;
  const db = getPool();
  if (db) {
    await ensureSchema();
    const result = await db.query<{ id: string; profile: DeveloperProfile }>(
      "SELECT id, profile FROM devverse_users WHERE LOWER(profile->>'githubUsername') = $1 LIMIT 1",
      [username]
    );
    return result.rows[0] ? { userId: result.rows[0].id, ...normalizeProfile(result.rows[0].profile) } : null;
  }
  const user = (await readUsers()).find((candidate) => candidate.profile.githubUsername.toLowerCase() === username);
  return user ? { userId: user.id, ...normalizeProfile(user.profile) } : null;
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName: string;
  githubUsername: string;
}) {
  const email = input.email.trim().toLowerCase();
  const user: StoredUser = {
    id: randomBytes(12).toString("hex"),
    email,
    passwordHash: hashPassword(input.password),
    profile: {
      displayName: input.displayName.trim(),
      githubUsername: input.githubUsername.trim(),
      bio: "",
      location: "",
      portfolioUrl: "",
      linkedinUrl: "",
      leetcodeUrl: "",
      codechefUrl: "",
      hackerrankUrl: "",
      repoSelectionMode: "all",
      selectedRepoIds: []
    }
  };
  const db = getPool();
  if (db) {
    await ensureSchema();
    try {
      await db.query(
        "INSERT INTO devverse_users (id, email, password_hash, profile) VALUES ($1, $2, $3, $4)",
        [user.id, user.email, user.passwordHash, user.profile]
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "23505") {
        throw new Error("An account already exists.");
      }
      throw error;
    }
    return publicUser(user);
  }
  const users = await readUsers();
  if (users.some((candidate) => candidate.email === email)) throw new Error("An account already exists.");
  users.push(user);
  await writeUsers(users);
  return publicUser(user);
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const db = getPool();
  if (db) {
    await ensureSchema();
    const result = await db.query<UserRow>(
      "SELECT id, email, password_hash, profile FROM devverse_users WHERE email = $1 LIMIT 1",
      [normalizedEmail]
    );
    const row = result.rows[0];
    if (!row) return null;
    const user = rowToUser(row);
    return verifyPassword(password, user.passwordHash) ? publicUser(user) : null;
  }
  const user = (await readUsers()).find((candidate) => candidate.email === normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  return publicUser(user);
}

export async function updateUserProfile(userId: string, profile: DeveloperProfile) {
  const normalizedProfile = normalizeProfile(profile);
  const db = getPool();
  if (db) {
    await ensureSchema();
    const result = await db.query<UserRow>(
      `UPDATE devverse_users
       SET profile = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, password_hash, profile`,
      [userId, normalizedProfile]
    );
    const row = result.rows[0];
    return row ? publicUser(rowToUser(row)) : null;
  }
  const users = await readUsers();
  const user = users.find((candidate) => candidate.id === userId);
  if (!user) return null;
  user.profile = normalizedProfile;
  await writeUsers(users);
  return publicUser(user);
}

export async function getConversation(userId: string, peerId: string): Promise<ChatMessage[]> {
  if ((await getFriendshipStatus(userId, peerId)) !== "friends") {
    throw new Error("You can only message accepted friends.");
  }

  const db = getPool();
  if (db) {
    await ensureSchema();
    const result = await db.query<MessageRow>(
      `SELECT id, sender_id, recipient_id, body, created_at
       FROM devverse_messages
       WHERE (sender_id = $1 AND recipient_id = $2)
          OR (sender_id = $2 AND recipient_id = $1)
       ORDER BY created_at ASC
       LIMIT 100`,
      [userId, peerId]
    );
    return result.rows.map(rowToMessage);
  }

  return (await readMessages())
    .filter(
      (message) =>
        (message.senderId === userId && message.recipientId === peerId) ||
        (message.senderId === peerId && message.recipientId === userId)
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-100);
}

export async function sendChatMessage(senderId: string, recipientId: string, body: string): Promise<ChatMessage> {
  const cleanBody = body.trim().slice(0, 600);
  if (!cleanBody) throw new Error("Message cannot be empty.");
  if (senderId === recipientId) throw new Error("You cannot message yourself.");
  if ((await getFriendshipStatus(senderId, recipientId)) !== "friends") {
    throw new Error("You can only message accepted friends.");
  }

  const message: ChatMessage = {
    id: randomBytes(12).toString("hex"),
    senderId,
    recipientId,
    body: cleanBody,
    createdAt: new Date().toISOString()
  };

  const db = getPool();
  if (db) {
    await ensureSchema();
    await db.query(
      "INSERT INTO devverse_messages (id, sender_id, recipient_id, body, created_at) VALUES ($1, $2, $3, $4, $5)",
      [message.id, senderId, recipientId, message.body, message.createdAt]
    );
    return message;
  }

  const users = await readUsers();
  if (!users.some((user) => user.id === senderId) || !users.some((user) => user.id === recipientId)) {
    throw new Error("Both users must be registered.");
  }
  const messages = await readMessages();
  messages.push(message);
  await writeMessages(messages);
  return message;
}

export async function getFriendshipStatus(userId: string, friendId: string): Promise<FriendshipStatus> {
  if (!userId || !friendId || userId === friendId) return "none";
  const db = getPool();
  if (db) {
    await ensureSchema();
    const result = await db.query<{ user_id: string; status: FriendshipState }>(
      `SELECT user_id, status
       FROM devverse_friendships
       WHERE (user_id = $1 AND friend_id = $2)
          OR (user_id = $2 AND friend_id = $1)
       ORDER BY status = 'accepted' DESC
       LIMIT 1`,
      [userId, friendId]
    );
    const friendship = result.rows[0];
    if (!friendship) return "none";
    if (friendship.status === "accepted") return "friends";
    return friendship.user_id === userId ? "pending_sent" : "pending_received";
  }
  const friendships = await readFriendships();
  const friendship = friendships.find(
    (candidate) =>
      (candidate.userId === userId && candidate.friendId === friendId) ||
      (candidate.userId === friendId && candidate.friendId === userId)
  );
  if (!friendship) return "none";
  if (friendship.status === "accepted") return "friends";
  return friendship.userId === userId ? "pending_sent" : "pending_received";
}

export async function listFriendData(userId: string): Promise<{ friends: PublicUser[]; requests: PublicUser[] }> {
  const db = getPool();
  if (db) {
    await ensureSchema();
    const [friendsResult, requestsResult] = await Promise.all([
      db.query<UserRow>(
        `SELECT u.id, u.email, u.password_hash, u.profile
         FROM devverse_friendships f
         JOIN devverse_users u ON u.id = f.friend_id
         WHERE f.user_id = $1 AND f.status = 'accepted'
         ORDER BY LOWER(u.profile->>'displayName') ASC`,
        [userId]
      ),
      db.query<UserRow>(
        `SELECT u.id, u.email, u.password_hash, u.profile
         FROM devverse_friendships f
         JOIN devverse_users u ON u.id = f.user_id
         WHERE f.friend_id = $1 AND f.status = 'pending'
         ORDER BY f.created_at ASC`,
        [userId]
      )
    ]);
    return {
      friends: friendsResult.rows.map((row) => publicUser(rowToUser(row))),
      requests: requestsResult.rows.map((row) => publicUser(rowToUser(row)))
    };
  }

  const [users, friendships] = await Promise.all([readUsers(), readFriendships()]);
  const byId = new Map(users.map((candidate) => [candidate.id, candidate]));
  const friends = friendships
    .filter((friendship) => friendship.userId === userId && friendship.status === "accepted")
    .map((friendship) => byId.get(friendship.friendId))
    .filter((friend): friend is StoredUser => Boolean(friend))
    .map(publicUser);
  const requests = friendships
    .filter((friendship) => friendship.friendId === userId && friendship.status === "pending")
    .map((friendship) => byId.get(friendship.userId))
    .filter((friend): friend is StoredUser => Boolean(friend))
    .map(publicUser);
  return { friends, requests };
}

export async function requestFriend(userId: string, friendId: string): Promise<FriendshipStatus> {
  if (userId === friendId) throw new Error("You cannot add yourself as a friend.");

  const db = getPool();
  if (db) {
    await ensureSchema();
    const existingStatus = await getFriendshipStatus(userId, friendId);
    if (existingStatus === "friends") return "friends";
    if (existingStatus === "pending_received") return acceptFriendRequest(userId, friendId);
    if (existingStatus === "pending_sent") return "pending_sent";
    await db.query(
      `INSERT INTO devverse_friendships (user_id, friend_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT DO NOTHING`,
      [userId, friendId]
    );
    return "pending_sent";
  }

  const users = await readUsers();
  if (!users.some((user) => user.id === userId) || !users.some((user) => user.id === friendId)) {
    throw new Error("Both users must be registered.");
  }

  const friendships = await readFriendships();
  const existingStatus = await getFriendshipStatus(userId, friendId);
  if (existingStatus === "friends") return "friends";
  if (existingStatus === "pending_received") return acceptFriendRequest(userId, friendId);
  if (existingStatus === "pending_sent") return "pending_sent";
  friendships.push({ userId, friendId, status: "pending", createdAt: new Date().toISOString() });
  await writeFriendships(friendships);
  return "pending_sent";
}

export async function acceptFriendRequest(userId: string, requesterId: string): Promise<FriendshipStatus> {
  if (userId === requesterId) throw new Error("You cannot add yourself as a friend.");

  const db = getPool();
  if (db) {
    await ensureSchema();
    const result = await db.query(
      `UPDATE devverse_friendships
       SET status = 'accepted'
       WHERE user_id = $2 AND friend_id = $1 AND status = 'pending'`,
      [userId, requesterId]
    );
    if (!result.rowCount) throw new Error("No friend request was found.");
    await db.query(
      `INSERT INTO devverse_friendships (user_id, friend_id, status)
       VALUES ($1, $2, 'accepted')
       ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'accepted'`,
      [userId, requesterId]
    );
    return "friends";
  }

  const users = await readUsers();
  if (!users.some((user) => user.id === userId) || !users.some((user) => user.id === requesterId)) {
    throw new Error("Both users must be registered.");
  }

  const friendships = await readFriendships();
  const createdAt = new Date().toISOString();
  const pendingRequest = friendships.find(
    (friendship) =>
      friendship.userId === requesterId && friendship.friendId === userId && friendship.status === "pending"
  );
  if (!pendingRequest) throw new Error("No friend request was found.");
  pendingRequest.status = "accepted";
  let reciprocal = friendships.find((friendship) => friendship.userId === userId && friendship.friendId === requesterId);
  if (reciprocal) {
    reciprocal.status = "accepted";
  } else {
    reciprocal = { userId, friendId: requesterId, status: "accepted", createdAt };
    friendships.push(reciprocal);
  }
  await writeFriendships(friendships);
  return "friends";
}
