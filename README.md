# DevVerse

DevVerse is an interactive 3D developer world built with Next.js, React Three Fiber, and Three.js. Each registered user becomes a GitHub-powered city: their public repositories turn into buildings, languages become skill markers, and other developers can explore the world with a playable character.

The app also includes developer profiles, friend requests, and friend-only messaging.

## Features

- 3D explorable world with keyboard movement.
- GitHub city generation from registered profile usernames.
- Repository buildings sized by stars and colored by primary language.
- City hall profile panel with portfolio, LinkedIn, LeetCode, CodeChef, and HackerRank links.
- Email/password registration and login.
- Editable developer profile.
- Friend request and accept flow.
- Messaging restricted to accepted friends only.
- Local JSON persistence by default, with optional PostgreSQL support.

## Tech Stack

- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS
- React Three Fiber
- Drei
- Three.js
- Zustand
- PostgreSQL via `pg` when `DATABASE_URL` is configured

## Getting Started

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```env
AUTH_SECRET=change-this-secret-for-local-development

# Optional. Without this, DevVerse stores users, friends, and chats in data/*.json.
DATABASE_URL=

# Optional. Use true for hosted Postgres providers that require SSL.
POSTGRES_SSL=false
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev
```

Starts the local development server.

```bash
npm run build
```

Creates a production build and runs type checking.

```bash
npm run start
```

Starts the production server after a successful build.

```bash
npm run lint
```

Runs Next.js linting.

## How It Works

1. A user creates a DevVerse profile and adds their GitHub username.
2. The `/api/github-world` route fetches public GitHub profile and repository data.
3. The world renderer turns each registered profile into a city.
4. Clicking buildings shows repository details.
5. Clicking a city hall shows that developer's profile.
6. Users can send friend requests from registered profile panels.
7. Messages can only be sent after the request is accepted.

## Data Storage

DevVerse supports two storage modes.

Local JSON mode:

- Used automatically when `DATABASE_URL` is empty.
- Stores data in the `data/` folder.
- Good for local development and demos.

PostgreSQL mode:

- Enabled by setting `DATABASE_URL`.
- Tables are created automatically on first use.
- Stores users, messages, and friendships in PostgreSQL.

The app uses these tables:

- `devverse_users`
- `devverse_messages`
- `devverse_friendships`

## Project Structure

```text
app/
  api/                API routes for auth, profile, GitHub world, friends, chat
  globals.css         Global styles and shared UI classes
  layout.tsx          Root layout
  page.tsx            Main app shell and HUD

components/
  account-panel.tsx   Login, register, and profile editor
  devverse-scene.tsx  Three.js world, cities, buildings, and player
  kingdom-store.ts    Shared Zustand state
  world-labels.tsx    World label helpers

lib/
  auth.ts             Auth, users, friends, messages, and persistence
  github-world.ts     Shared GitHub world types

data/
  *.json              Local development storage and GitHub cache
```

## Controls

- Move: `WASD` or arrow keys
- Run: hold `Shift`
- Inspect a city: click its city hall
- Inspect a repository: click its building

## Notes

- GitHub data is fetched from the public GitHub API and cached in `data/github-cities.json`.
- Only GitHub usernames from registered DevVerse profiles are loaded into the world.
- Friend requests must be accepted before chat is available.
- Keep `AUTH_SECRET` private in production.

## Build Check

Before shipping changes, run:

```bash
npm run build
```
# DevVerse
