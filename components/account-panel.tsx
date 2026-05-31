"use client";

import { LogIn, LogOut, Save, UserRound, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import type { DeveloperProfile, PublicUser } from "@/lib/auth";

const emptyProfile: DeveloperProfile = {
  displayName: "",
  githubUsername: "",
  bio: "",
  location: "",
  portfolioUrl: "",
  linkedinUrl: "",
  leetcodeUrl: "",
  codechefUrl: "",
  hackerrankUrl: ""
};

export function AccountPanel({
  onGithubChange,
  onUserChange
}: {
  onGithubChange: (username: string) => void;
  onUserChange?: (user: PublicUser | null) => void;
}) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register" | "profile">("login");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", password: "", displayName: "", githubUsername: "" });
  const [profile, setProfile] = useState(emptyProfile);

  useEffect(() => {
    void fetch("/api/profile").then((response) => response.json()).then(({ user: sessionUser }) => {
      if (sessionUser) {
        setUser(sessionUser);
        setProfile(sessionUser.profile);
        onUserChange?.(sessionUser);
        onGithubChange(sessionUser.profile.githubUsername);
      }
    });
  }, [onGithubChange, onUserChange]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    setUser(data.user);
    onUserChange?.(data.user);
    setProfile(data.user.profile);
    setMode("profile");
    onGithubChange(data.user.profile.githubUsername);
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error);
    setUser(data.user);
    onUserChange?.(data.user);
    onGithubChange(data.user.profile.githubUsername);
    setOpen(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    onUserChange?.(null);
    setMode("login");
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => {
          setMode(user ? "profile" : "login");
          setOpen(true);
        }}
        className="glass-panel pointer-events-auto flex h-11 items-center gap-2 rounded-lg px-3 text-sm transition hover:bg-black/70"
      >
        <UserRound className="h-4 w-4 text-aqua" />
        {user ? user.profile.displayName : "Sign in"}
      </button>
      {open && (
        <div className="pointer-events-auto fixed inset-0 z-30 grid place-items-center bg-black/45 p-4">
          <div className="glass-panel max-h-[90vh] w-full max-w-lg overflow-auto rounded-lg p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{mode === "profile" ? "Developer profile" : mode === "login" ? "Sign in" : "Create profile"}</h2>
              <button onClick={() => setOpen(false)} className="hud-button" aria-label="Close profile"><X className="h-4 w-4" /></button>
            </div>
            {mode === "profile" ? (
              <form onSubmit={saveProfile} className="mt-4 space-y-3">
                <ProfileInput label="Display name" value={profile.displayName} onChange={(value) => setProfile({ ...profile, displayName: value })} />
                <ProfileInput label="GitHub username" value={profile.githubUsername} onChange={(value) => setProfile({ ...profile, githubUsername: value })} />
                <ProfileInput label="Location" value={profile.location} onChange={(value) => setProfile({ ...profile, location: value })} />
                <ProfileInput label="Portfolio URL" value={profile.portfolioUrl} onChange={(value) => setProfile({ ...profile, portfolioUrl: value })} />
                <ProfileInput label="LinkedIn URL" value={profile.linkedinUrl} onChange={(value) => setProfile({ ...profile, linkedinUrl: value })} />
                <ProfileInput label="LeetCode URL" value={profile.leetcodeUrl} onChange={(value) => setProfile({ ...profile, leetcodeUrl: value })} />
                <ProfileInput label="CodeChef URL" value={profile.codechefUrl} onChange={(value) => setProfile({ ...profile, codechefUrl: value })} />
                <ProfileInput label="HackerRank URL" value={profile.hackerrankUrl} onChange={(value) => setProfile({ ...profile, hackerrankUrl: value })} />
                <label className="block text-xs text-stone-300">Bio<textarea value={profile.bio} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} className="mt-1 min-h-20 w-full rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:border-aqua" /></label>
                {error && <p className="text-sm text-red-200">{error}</p>}
                <div className="flex justify-between gap-2 pt-2">
                  <button type="button" onClick={logout} className="flex items-center gap-2 text-sm text-stone-300 hover:text-white"><LogOut className="h-4 w-4" /> Log out</button>
                  <button className="flex items-center gap-2 rounded-md bg-copper px-4 py-2 text-sm font-medium hover:bg-[#e38a46]"><Save className="h-4 w-4" /> Save profile</button>
                </div>
              </form>
            ) : (
              <form onSubmit={authenticate} className="mt-4 space-y-3">
                {mode === "register" && <>
                  <ProfileInput label="Display name" value={form.displayName} onChange={(displayName) => setForm({ ...form, displayName })} />
                  <ProfileInput label="GitHub username" value={form.githubUsername} onChange={(githubUsername) => setForm({ ...form, githubUsername })} />
                </>}
                <ProfileInput label="Email" type="email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
                <ProfileInput label="Password" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
                {error && <p className="text-sm text-red-200">{error}</p>}
                <button className="flex w-full items-center justify-center gap-2 rounded-md bg-copper px-4 py-2 text-sm font-medium hover:bg-[#e38a46]"><LogIn className="h-4 w-4" /> {mode === "login" ? "Sign in" : "Create profile"}</button>
                <button type="button" onClick={() => setMode(mode === "login" ? "register" : "login")} className="w-full text-sm text-aqua hover:text-white">{mode === "login" ? "Create a new DevVerse profile" : "Already have an account? Sign in"}</button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ProfileInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="block text-xs text-stone-300">{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none focus:border-aqua" /></label>;
}
