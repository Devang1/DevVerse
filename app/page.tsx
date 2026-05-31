"use client";

import { Canvas } from "@react-three/fiber";
import { Building2, ExternalLink, GitFork, Github, Globe, Linkedin, Loader2, Map, MapPin, MessageCircle, Search, Send, Star, Trophy, UserPlus, Users, X } from "lucide-react";
import { motion } from "framer-motion";
import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DevVerseScene } from "@/components/devverse-scene";
import { AccountPanel } from "@/components/account-panel";
import { useKingdomStore } from "@/components/kingdom-store";
import type { WorldResponse } from "@/lib/github-world";
import type { ChatMessage, PublicUser } from "@/lib/auth";

export default function Home() {
  const [query, setQuery] = useState("");
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState("");
  const [friendStatus, setFriendStatus] = useState<"none" | "pending_sent" | "pending_received" | "friends">("none");
  const [friendError, setFriendError] = useState("");
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [friendRequests, setFriendRequests] = useState<PublicUser[]>([]);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [showFriendList, setShowFriendList] = useState(true);
  const [activeChatPeerId, setActiveChatPeerId] = useState("");
  const requestVersion = useRef(0);
  const cities = useKingdomStore((state) => state.cities);
  const activeCity = useKingdomStore((state) => state.activeCity);
  const selected = useKingdomStore((state) => state.selected);
  const selectedRepo = useKingdomStore((state) => state.selectedRepo);
  const selectedCity = useKingdomStore((state) => state.selectedCity);
  const isLoading = useKingdomStore((state) => state.isLoading);
  const error = useKingdomStore((state) => state.error);
  const setCities = useKingdomStore((state) => state.setCities);
  const setActiveCity = useKingdomStore((state) => state.setActiveCity);
  const setLoading = useKingdomStore((state) => state.setLoading);
  const setError = useKingdomStore((state) => state.setError);
  const setSelectedRepo = useKingdomStore((state) => state.setSelectedRepo);
  const setMobileMove = useKingdomStore((state) => state.setMobileMove);

  const active = useMemo(
    () => cities.find((city) => city.login === activeCity) ?? cities[0],
    [activeCity, cities]
  );

  const loadWorld = useCallback(
    async (username?: string) => {
      const version = ++requestVersion.current;
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          username ? `/api/github-world?user=${encodeURIComponent(username)}` : "/api/github-world"
        );
        if (!response.ok) throw new Error("GitHub did not return a world.");
        const data = (await response.json()) as WorldResponse;
        if (version !== requestVersion.current) return;
        setCities(data.cities);
        if (username && data.cities[0]) setActiveCity(data.cities[0].login);
      } catch (requestError) {
        if (version !== requestVersion.current) return;
        setError(requestError instanceof Error ? requestError.message : "Could not load GitHub data.");
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [setActiveCity, setCities, setError, setLoading]
  );

  useEffect(() => {
    void loadWorld();
  }, [loadWorld]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim()) void loadWorld(query.trim());
  }

  const loadProfileCity = useCallback((username: string) => {
    void loadWorld(username);
  }, [loadWorld]);

  const selectedPeerId = selectedCity?.registeredProfile?.userId ?? "";
  const activeChatPeer = friends.find((friend) => friend.id === activeChatPeerId) ?? null;
  const chatPeerId = messagesOpen ? activeChatPeerId : selectedPeerId;

  const loadFriends = useCallback(async () => {
    if (!currentUser) {
      setFriends([]);
      setFriendRequests([]);
      setActiveChatPeerId("");
      return;
    }
    const response = await fetch("/api/friends");
    if (!response.ok) return;
    const data = await response.json();
    setFriends(data.friends ?? []);
    setFriendRequests(data.requests ?? []);
    setActiveChatPeerId((peerId) => {
      if (peerId && (data.friends ?? []).some((friend: PublicUser) => friend.id === peerId)) return peerId;
      return data.friends?.[0]?.id ?? "";
    });
  }, [currentUser]);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  const loadConversation = useCallback(async (peerId: string) => {
    if (!peerId || !currentUser) return;
    setChatError("");
    try {
      const response = await fetch(`/api/chat?peerId=${encodeURIComponent(peerId)}`);
      const data = await response.json();
      if (!response.ok) {
        setChatMessages([]);
        setChatError(data.error ?? "Could not load chat.");
        return;
      }
      setChatMessages(data.messages ?? []);
    } catch {
      setChatMessages([]);
      setChatError("Could not load chat.");
    }
  }, [currentUser]);

  useEffect(() => {
    setChatDraft("");
    setChatMessages([]);
    setFriendStatus("none");
    setFriendError("");
    if (selectedPeerId && selectedPeerId !== currentUser?.id) {
      void fetch(`/api/friends?friendId=${encodeURIComponent(selectedPeerId)}`)
        .then((response) => response.json())
        .then((data) => {
          const status = data.status === "friends" || data.status === "pending_sent" || data.status === "pending_received"
            ? data.status
            : "none";
          setFriendStatus(status);
          if (status === "friends") void loadConversation(selectedPeerId);
        })
        .catch(() => setFriendStatus("none"));
    }
  }, [currentUser?.id, loadConversation, selectedPeerId]);

  useEffect(() => {
    if (messagesOpen && activeChatPeerId) void loadConversation(activeChatPeerId);
  }, [activeChatPeerId, loadConversation, messagesOpen]);

  async function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatPeerId || !chatDraft.trim()) return;
    setChatError("");
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientId: chatPeerId, body: chatDraft })
    });
    const data = await response.json();
    if (!response.ok) {
      setChatError(data.error ?? "Could not send message.");
      return;
    }
    setChatDraft("");
    setChatMessages((messages) => [...messages, data.message]);
  }

  async function addSelectedFriend() {
    if (!selectedPeerId) return;
    setFriendError("");
    const response = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId: selectedPeerId, action: "request" })
    });
    const data = await response.json();
    if (!response.ok) {
      setFriendError(data.error ?? "Could not add friend.");
      return;
    }
    setFriendStatus(data.status ?? "none");
    void loadFriends();
  }

  async function acceptRequest(friendId: string) {
    setFriendError("");
    const response = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId, action: "accept" })
    });
    const data = await response.json();
    if (!response.ok) {
      setFriendError(data.error ?? "Could not accept request.");
      return;
    }
    setFriendStatus(data.status ?? "friends");
    await loadFriends();
    setActiveChatPeerId(friendId);
    setMessagesOpen(true);
  }

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#a8d4e4] text-stone-50">
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 8, 18], fov: 52 }}
          dpr={[1, 1.35]}
          gl={{ alpha: false, antialias: true, powerPreference: "high-performance" }}
          shadows
        >
          <DevVerseScene />
        </Canvas>
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 p-2 sm:p-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel pointer-events-auto flex items-center gap-2 rounded-lg px-3 py-2 sm:gap-3 sm:px-4 sm:py-3"
          >
            <img src="/logo.png" alt="DevVerse logo" className="h-8 w-8 shrink-0 rounded-md object-cover sm:h-9 sm:w-9" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold sm:text-lg">DevVerse World</h1>
              <p className="hidden text-xs text-stone-300 sm:block">Live cities generated from public GitHub data</p>
            </div>
          </motion.div>

          <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:flex">
          <form onSubmit={handleSearch} className="glass-panel pointer-events-auto flex min-w-0 rounded-lg p-1">
            <label className="sr-only" htmlFor="github-user">GitHub username</label>
            <input
              id="github-user"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a GitHub city"
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-stone-400 sm:w-60"
            />
            <button
              type="submit"
              className="grid h-9 w-9 place-items-center rounded-md bg-copper text-white transition hover:bg-[#e38a46]"
              aria-label="Search GitHub city"
              title="Search GitHub city"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </button>
          </form>
          <button
            onClick={() => setMessagesOpen(true)}
            className="glass-panel pointer-events-auto flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm transition hover:bg-black/70"
            aria-label="Open messages"
          >
            <MessageCircle className="h-4 w-4 text-aqua" />
            <span className="hidden sm:inline">Messages</span>
            {friendRequests.length > 0 && (
              <span className="rounded-full bg-copper px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {friendRequests.length}
              </span>
            )}
          </button>
          <AccountPanel onGithubChange={loadProfileCity} onUserChange={setCurrentUser} />
          </div>
        </div>
      </header>

      {messagesOpen && (
        <div className="pointer-events-auto fixed inset-0 z-30 grid place-items-center bg-black/45 p-2 sm:p-4">
          <div className="glass-panel flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div>
                <h2 className="text-lg font-semibold">Messages</h2>
                <p className="text-xs text-stone-400">Only accepted friends can message each other.</p>
              </div>
              <button onClick={() => setMessagesOpen(false)} className="hud-button" aria-label="Close messages">
                <X className="h-4 w-4" />
              </button>
            </div>
            {!currentUser ? (
              <div className="p-4 text-sm text-stone-300">Sign in or create a profile to view friends and messages.</div>
            ) : (
              <div className="grid min-h-0 flex-1 md:grid-cols-[18rem_1fr]">
                <div className="min-h-0 overflow-auto border-b border-white/10 p-3 md:border-b-0 md:border-r">
                  <button
                    onClick={() => setShowFriendList((value) => !value)}
                    className="mb-3 flex w-full items-center justify-center gap-2 rounded-md bg-copper px-3 py-2 text-sm font-medium transition hover:bg-[#e38a46]"
                  >
                    <Users className="h-4 w-4" />
                    {showFriendList ? "Hide my friends" : "Show my friends"}
                  </button>
                  <div className="mb-4">
                    <p className="mb-2 text-xs uppercase text-stone-400">Friend requests</p>
                    {friendRequests.length ? friendRequests.map((request) => (
                      <div key={request.id} className="mb-2 rounded-md border border-white/10 bg-white/[0.04] p-2">
                        <p className="truncate text-sm font-medium">{friendName(request)}</p>
                        <p className="truncate text-xs text-aqua">@{request.profile.githubUsername}</p>
                        <button
                          onClick={() => acceptRequest(request.id)}
                          className="mt-2 w-full rounded-md border border-aqua/30 bg-aqua/10 px-3 py-1.5 text-xs font-medium text-aqua transition hover:bg-aqua/20 hover:text-white"
                        >
                          Accept request
                        </button>
                      </div>
                    )) : (
                      <p className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-stone-400">No pending requests.</p>
                    )}
                  </div>
                  {showFriendList && (
                    <div>
                      <p className="mb-2 text-xs uppercase text-stone-400">My friends</p>
                      {friends.length ? friends.map((friend) => (
                        <button
                          key={friend.id}
                          onClick={() => setActiveChatPeerId(friend.id)}
                          className={`mb-2 w-full rounded-md border p-2 text-left transition ${
                            activeChatPeerId === friend.id
                              ? "border-copper/80 bg-copper/20"
                              : "border-white/10 bg-white/[0.04] hover:bg-white/[0.09]"
                          }`}
                        >
                          <span className="block truncate text-sm font-medium">{friendName(friend)}</span>
                          <span className="block truncate text-xs text-aqua">@{friend.profile.githubUsername}</span>
                        </button>
                      )) : (
                        <p className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-stone-400">
                          No accepted friends yet. Open a registered city and send a request.
                        </p>
                      )}
                    </div>
                  )}
                  {friendError && <p className="mt-2 text-xs text-red-200">{friendError}</p>}
                </div>
                <div className="flex min-h-[22rem] flex-col p-4">
                  {activeChatPeer ? (
                    <>
                      <div className="border-b border-white/10 pb-3">
                        <p className="text-xs uppercase text-stone-400">Chatting with</p>
                        <h3 className="text-lg font-semibold">{friendName(activeChatPeer)}</h3>
                        <p className="text-sm text-aqua">@{activeChatPeer.profile.githubUsername}</p>
                      </div>
                      <div className="min-h-0 flex-1 space-y-2 overflow-auto py-3 pr-1">
                        {chatMessages.length ? chatMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`max-w-[82%] rounded-md px-3 py-2 text-sm leading-5 ${
                              message.senderId === currentUser.id
                                ? "ml-auto bg-copper/30 text-white"
                                : "bg-white/[0.07] text-stone-200"
                            }`}
                          >
                            {message.body}
                          </div>
                        )) : (
                          <p className="text-sm text-stone-400">No messages yet.</p>
                        )}
                      </div>
                      <form onSubmit={sendChat} className="flex gap-2 border-t border-white/10 pt-3">
                        <input
                          value={chatDraft}
                          onChange={(event) => setChatDraft(event.target.value)}
                          maxLength={600}
                          placeholder="Message your friend"
                          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-aqua"
                        />
                        <button className="grid h-10 w-10 place-items-center rounded-md bg-copper transition hover:bg-[#e38a46]" aria-label="Send message">
                          <Send className="h-4 w-4" />
                        </button>
                      </form>
                      {chatError && <p className="mt-2 text-xs text-red-200">{chatError}</p>}
                    </>
                  ) : (
                    <div className="grid flex-1 place-items-center text-center text-sm text-stone-400">
                      Accept a request or choose a friend to start messaging.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <aside className="pointer-events-none absolute bottom-3 left-3 top-24 z-10 hidden w-64 sm:block">
          <div className="glass-panel pointer-events-auto max-h-full overflow-auto rounded-lg p-3">
          <div className="mb-3 flex items-center gap-2 text-xs uppercase text-stone-300">
            <Users className="h-4 w-4 text-aqua" />
            Developer cities
          </div>
          <div className="space-y-1">
            {!cities.length && !isLoading && (
              <p className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-stone-300">
                No registered users yet. Create a profile to become the first city.
              </p>
            )}
            {cities.map((city) => (
              <button
                key={city.login}
                onClick={() => setActiveCity(city.login)}
                className={`w-full rounded-md border px-3 py-2 text-left transition ${
                  city.login === active?.login
                    ? "border-copper/80 bg-copper/20"
                    : "border-white/10 bg-white/[0.05] hover:bg-white/[0.1]"
                }`}
              >
                <span className="block truncate text-sm font-medium">@{city.login}</span>
                <span className="mt-1 block text-xs text-stone-300">
                  {city.publicRepos} repos · {city.totalStars.toLocaleString()} stars
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <MobileMovementControls onMove={setMobileMove} />

      <section className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-2 pb-[8.25rem] sm:p-5">
        <div className="mx-auto flex max-w-7xl items-end justify-end gap-3 sm:pl-72">
          <div className="glass-panel pointer-events-auto hidden rounded-lg px-4 py-3 text-sm text-stone-200 lg:block">
            <div className="mb-1 flex items-center gap-2 text-xs uppercase text-stone-400">
              <Map className="h-4 w-4 text-moss" />
              Move your character
            </div>
            <span className="font-medium text-white">WASD</span> or arrow keys · hold{" "}
            <span className="font-medium text-white">Shift</span> to run
          </div>

          <motion.div
            key={active?.login ?? "loading"}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel pointer-events-auto max-h-[34dvh] w-full overflow-auto rounded-lg p-3 sm:max-h-[72dvh] sm:max-w-sm sm:p-4"
          >
            {selectedRepo ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-stone-400">Repository building</p>
                    <h2 className="mt-1 break-words text-lg font-semibold">{selectedRepo.name}</h2>
                    <p className="mt-1 text-sm text-aqua">{selectedRepo.language ?? "Mixed stack"}</p>
                  </div>
                  <button
                    onClick={() => setSelectedRepo(null)}
                    className="hud-button shrink-0"
                    aria-label="Close repository details"
                    title="Close repository details"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-3 text-sm leading-5 text-stone-300">
                  {selectedRepo.description ?? "No repository description is available on GitHub."}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-stone-300">
                  <span className="rounded border border-white/10 bg-white/[0.04] px-2 py-1">
                    {selectedRepo.language ?? "Mixed"}
                  </span>
                  <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-[#e5b14c]" /> {selectedRepo.stars.toLocaleString()}</span>
                  <span className="flex items-center gap-1"><GitFork className="h-3.5 w-3.5 text-aqua" /> {selectedRepo.forks.toLocaleString()}</span>
                </div>
                <p className="mt-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-stone-300">
                  Building height follows stars. Color shows the main language. Click a building to inspect the repo here.
                </p>
                <a
                  href={selectedRepo.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-copper px-4 py-2 text-sm font-medium text-white transition hover:bg-[#e38a46]"
                >
                  <Github className="h-4 w-4" /> Open repository <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </>
            ) : selectedCity ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-stone-400">City hall profile</p>
                    <h2 className="mt-1 text-xl font-semibold">
                      {selectedCity.registeredProfile?.displayName ?? selectedCity.name}
                    </h2>
                    <p className="text-sm text-aqua">@{selectedCity.login}</p>
                  </div>
                  <a
                    href={selectedCity.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hud-button shrink-0"
                    aria-label="Open GitHub profile"
                    title="Open GitHub profile"
                  >
                    <Github className="h-4 w-4" />
                  </a>
                </div>
                <p className="mt-3 text-sm leading-5 text-stone-300">
                  {selectedCity.registeredProfile?.bio ||
                    selectedCity.bio ||
                    "This city is generated from a public GitHub profile. Registered users can add portfolio and coding links."}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-300">
                  <span className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1">
                    <Building2 className="h-3.5 w-3.5 text-copper" /> {selectedCity.publicRepos.toLocaleString()} repos
                  </span>
                  <span className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1">
                    <Star className="h-3.5 w-3.5 text-[#e5b14c]" /> {selectedCity.totalStars.toLocaleString()} stars
                  </span>
                  {(selectedCity.registeredProfile?.location || selectedCity.location) && (
                    <span className="col-span-2 flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1">
                      <MapPin className="h-3.5 w-3.5 text-aqua" /> {selectedCity.registeredProfile?.location || selectedCity.location}
                    </span>
                  )}
                </div>
                {selectedCity.registeredProfile ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <ProfileLink href={selectedCity.registeredProfile.portfolioUrl} icon={<Globe className="h-3.5 w-3.5" />} label="Portfolio" />
                    <ProfileLink href={selectedCity.registeredProfile.linkedinUrl} icon={<Linkedin className="h-3.5 w-3.5" />} label="LinkedIn" />
                    <ProfileLink href={selectedCity.registeredProfile.leetcodeUrl} icon={<Trophy className="h-3.5 w-3.5" />} label="LeetCode" />
                    <ProfileLink href={selectedCity.registeredProfile.codechefUrl || selectedCity.registeredProfile.hackerrankUrl} icon={<ExternalLink className="h-3.5 w-3.5" />} label="Coding" />
                  </div>
                ) : (
                  <p className="mt-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs leading-5 text-stone-300">
                    No DevVerse profile is linked to this GitHub user yet. Registered profiles are stored in PostgreSQL when `DATABASE_URL` is configured.
                  </p>
                )}
                <p className="mt-3 truncate border-t border-white/10 pt-3 text-xs text-stone-400">
                  Top stack: {selectedCity.topLanguages.join(" / ") || "Mixed stack"}
                </p>
                {currentUser && selectedCity.registeredProfile && selectedCity.registeredProfile.userId !== currentUser.id && (
                  <div className="mt-3">
                    <button
                      onClick={addSelectedFriend}
                      disabled={friendStatus === "friends" || friendStatus === "pending_sent"}
                      className={`flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
                        friendStatus === "friends"
                          ? "border border-aqua/30 bg-aqua/10 text-aqua"
                          : friendStatus === "pending_sent"
                            ? "border border-white/10 bg-white/[0.06] text-stone-300"
                          : "bg-copper text-white hover:bg-[#e38a46]"
                      }`}
                    >
                      <UserPlus className="h-4 w-4" />
                      {friendStatus === "friends"
                        ? "Friends"
                        : friendStatus === "pending_sent"
                          ? "Request sent"
                          : friendStatus === "pending_received"
                            ? "Accept in Messages"
                            : "Add Friend"}
                    </button>
                    {friendError && <p className="mt-2 text-xs text-red-200">{friendError}</p>}
                  </div>
                )}
                <div className="mt-3 rounded-md border border-white/10 bg-white/[0.04] p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase text-stone-400">
                    <MessageCircle className="h-3.5 w-3.5 text-aqua" />
                    Chat
                  </div>
                  {!currentUser ? (
                    <p className="text-xs leading-5 text-stone-300">Sign in to message registered users.</p>
                  ) : !selectedCity.registeredProfile ? (
                    <p className="text-xs leading-5 text-stone-300">This city is not linked to a registered DevVerse profile.</p>
                  ) : selectedCity.registeredProfile.userId === currentUser.id ? (
                    <p className="text-xs leading-5 text-stone-300">This is your city. Other registered users can message you here.</p>
                  ) : friendStatus !== "friends" ? (
                    <p className="text-xs leading-5 text-stone-300">
                      Send a friend request and wait for acceptance before messaging this user.
                    </p>
                  ) : (
                    <>
                      <div className="max-h-28 space-y-2 overflow-auto pr-1">
                        {chatMessages.length ? chatMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`rounded-md px-2 py-1 text-xs leading-5 ${
                              message.senderId === currentUser.id
                                ? "ml-6 bg-copper/25 text-white"
                                : "mr-6 bg-white/[0.07] text-stone-200"
                            }`}
                          >
                            {message.body}
                          </div>
                        )) : (
                          <p className="text-xs text-stone-400">No messages yet. Say hello.</p>
                        )}
                      </div>
                      <form onSubmit={sendChat} className="mt-2 flex gap-2">
                        <input
                          value={chatDraft}
                          onChange={(event) => setChatDraft(event.target.value)}
                          maxLength={600}
                          placeholder="Message this user"
                          className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-white outline-none focus:border-aqua"
                        />
                        <button className="grid h-9 w-9 place-items-center rounded-md bg-copper transition hover:bg-[#e38a46]" aria-label="Send message">
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </form>
                      {chatError && <p className="mt-2 text-xs text-red-200">{chatError}</p>}
                    </>
                  )}
                </div>
              </>
            ) : error ? (
              <p className="text-sm text-red-200">{error}</p>
            ) : active ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase text-stone-400">Selected city</p>
                    <h2 className="mt-1 text-xl font-semibold">{active.name}</h2>
                    <p className="text-sm text-aqua">@{active.login}</p>
                  </div>
                  <a
                    href={active.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="hud-button shrink-0"
                    aria-label="Open GitHub profile"
                    title="Open GitHub profile"
                  >
                    <Github className="h-4 w-4" />
                  </a>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-5 text-stone-300">
                  {active.bio ?? "This public GitHub city is generated from repositories and languages."}
                </p>
                <div className="mt-3 flex gap-4 text-xs text-stone-300">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-copper" /> {active.publicRepos} repos
                  </span>
                  <span>{active.followers.toLocaleString()} followers</span>
                </div>
                <p className="mt-3 truncate border-t border-white/10 pt-3 text-xs text-stone-400">
                  Inspecting: {selected}
                </p>
              </>
            ) : (
              <div className="text-sm leading-6 text-stone-300">
                {isLoading ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading registered cities...</span>
                ) : (
                  <span>No registered cities yet. Sign in or create a DevVerse profile to appear here.</span>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </section>
    </main>
  );
}

function friendName(user: PublicUser) {
  return user.profile.displayName || user.profile.githubUsername || user.email;
}

function MobileMovementControls({
  onMove
}: {
  onMove: (mobileMove: { x: number; z: number; running?: boolean }) => void;
}) {
  const stopMoving = () => onMove({ x: 0, z: 0, running: false });
  const startMoving = (x: number, z: number, running = false) => {
    onMove({ x, z, running });
  };

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 grid grid-cols-3 gap-2 sm:hidden">
      <div />
      <MoveButton label="Move forward" onStart={() => startMoving(0, -1)} onStop={stopMoving}>
        ^
      </MoveButton>
      <div />
      <MoveButton label="Move left" onStart={() => startMoving(-1, 0)} onStop={stopMoving}>
        &lt;
      </MoveButton>
      <MoveButton label="Run forward" onStart={() => startMoving(0, -1, true)} onStop={stopMoving}>
        Run
      </MoveButton>
      <MoveButton label="Move right" onStart={() => startMoving(1, 0)} onStop={stopMoving}>
        &gt;
      </MoveButton>
      <div />
      <MoveButton label="Move backward" onStart={() => startMoving(0, 1)} onStop={stopMoving}>
        v
      </MoveButton>
      <div />
    </div>
  );
}

function MoveButton({
  children,
  label,
  onStart,
  onStop
}: {
  children: ReactNode;
  label: string;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="pointer-events-auto grid h-12 w-12 select-none place-items-center rounded-lg border border-white/15 bg-black/55 text-sm font-semibold text-white shadow-lg backdrop-blur-md active:scale-95 active:bg-copper"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onStart();
      }}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      onPointerLeave={onStop}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}

function ProfileLink({
  href,
  icon,
  label
}: {
  href: string;
  icon: ReactNode;
  label: string;
}) {
  if (!href) {
    return (
      <span className="flex items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-stone-500">
        {icon} {label}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-center gap-1 rounded-md border border-aqua/30 bg-aqua/10 px-3 py-2 text-aqua transition hover:bg-aqua/20 hover:text-white"
    >
      {icon} {label}
    </a>
  );
}
