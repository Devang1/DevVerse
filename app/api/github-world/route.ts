import { NextRequest, NextResponse } from "next/server";
import {
  ensureDatabaseSchema,
  findRegisteredProfileByGithubUsername,
  getDatabasePool,
  listRegisteredUsers
} from "@/lib/auth";
import type { DeveloperCity, GitHubRepo, WorldResponse } from "@/lib/github-world";

type GitHubUserResponse = {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  followers: number;
  public_repos: number;
};

type GitHubRepoResponse = {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
};

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "devverse-local-prototype",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN
    ? {
        Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      }
    : {}),
};

const REQUEST_TIMEOUT_MS = 8000;
const CITY_CACHE_TTL_MS = 1000 * 60 * 15;

type CachedCityRow = {
  city: DeveloperCity;
  fetched_at: Date | string;
};

function githubFetch(url: string) {
  return fetch(url, {
    headers,
    next: { revalidate: 900 },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

function repoScore(repo: GitHubRepo) {
  return repo.stars * 3 + repo.forks;
}

function trimCityForWorld(city: DeveloperCity): DeveloperCity {
  const repos = [...city.repos]
    .sort(
      (a, b) =>
        repoScore(b) - repoScore(a) ||
        b.stars - a.stars ||
        a.name.localeCompare(b.name)
    );

  return {
    ...city,
    repos,
    totalStars: city.repos.reduce((total, repo) => total + repo.stars, 0),
  };
}

function languageSummary(repos: GitHubRepo[]) {
  const languageCounts = repos
    .map((repo) => repo.language)
    .filter((language): language is string => Boolean(language))
    .reduce<Record<string, number>>((counts, language) => {
      counts[language] = (counts[language] ?? 0) + 1;
      return counts;
    }, {});

  return Object.entries(languageCounts)
    .sort(([, countA], [, countB]) => countB - countA)
    .slice(0, 4)
    .map(([language]) => language);
}

function applyRepoSelection(city: DeveloperCity): DeveloperCity {
  const profile = city.registeredProfile;
  const selectedRepos =
    profile?.repoSelectionMode === "selected"
      ? city.repos.filter((repo) => profile.selectedRepoIds.includes(repo.id))
      : city.repos;

  return trimCityForWorld({
    ...city,
    repos: selectedRepos,
    totalStars: selectedRepos.reduce((total, repo) => total + repo.stars, 0),
    topLanguages: languageSummary(selectedRepos)
  });
}

function cacheKey(username: string) {
  return username.trim().toLowerCase();
}

async function readCachedCity(username: string): Promise<{ city: DeveloperCity; fetchedAt: Date } | null> {
  const db = getDatabasePool();
  if (!db) return null;
  await ensureDatabaseSchema();
  const result = await db.query<CachedCityRow>(
    "SELECT city, fetched_at FROM devverse_github_city_cache WHERE username = $1 LIMIT 1",
    [cacheKey(username)]
  );
  const cached = result.rows[0];
  if (!cached) return null;
  return {
    city: trimCityForWorld(cached.city),
    fetchedAt: cached.fetched_at instanceof Date ? cached.fetched_at : new Date(cached.fetched_at)
  };
}

async function writeCachedCity(city: DeveloperCity) {
  const db = getDatabasePool();
  if (!db) return;
  await ensureDatabaseSchema();
  await db.query(
    `INSERT INTO devverse_github_city_cache (username, city, fetched_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (username)
     DO UPDATE SET city = EXCLUDED.city, fetched_at = NOW()`,
    [cacheKey(city.login), trimCityForWorld(city)]
  );
}

async function attachRegisteredProfile(
  city: DeveloperCity
): Promise<DeveloperCity> {
  return {
    ...city,
    registeredProfile: await findRegisteredProfileByGithubUsername(city.login),
  };
}

async function fetchCity(username: string): Promise<DeveloperCity | null> {
  try {
    const userResponse = await githubFetch(
      `https://api.github.com/users/${encodeURIComponent(username)}`
    );

    if (!userResponse.ok) {
      console.error(
        `GitHub user fetch failed for ${username}: ${userResponse.status}`
      );
      return null;
    }

    const user = (await userResponse.json()) as GitHubUserResponse;

    const reposResponse = await githubFetch(
      `https://api.github.com/users/${encodeURIComponent(
        username
      )}/repos?per_page=100&page=1&sort=updated`
    );

    const rawRepos: GitHubRepoResponse[] = reposResponse.ok
      ? ((await reposResponse.json()) as GitHubRepoResponse[])
      : [];

    if (!rawRepos.length && user.public_repos) {
      console.error(`No repositories returned for ${username}`);
      return null;
    }

    const repos: GitHubRepo[] = rawRepos
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .map((repo) => ({
        id: repo.id,
        name: repo.name,
        description: repo.description,
        htmlUrl: repo.html_url,
        language: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
      }));

    const registeredProfile =
      await findRegisteredProfileByGithubUsername(user.login);

    return trimCityForWorld({
      login: user.login,
      name: user.name ?? user.login,
      avatarUrl: user.avatar_url,
      htmlUrl: user.html_url,
      bio: user.bio,
      company: user.company,
      location: user.location,
      followers: user.followers,
      publicRepos: user.public_repos,
      totalStars: repos.reduce((total, repo) => total + repo.stars, 0),
      topLanguages: languageSummary(repos),
      repos,
      registeredProfile,
    });
  } catch (error) {
    console.error(`Failed to fetch city for ${username}:`, error);
    return null;
  }
}

async function fetchCityWithCache(username: string): Promise<DeveloperCity | null> {
  const cached = await readCachedCity(username);
  if (cached && Date.now() - cached.fetchedAt.getTime() < CITY_CACHE_TTL_MS) {
    return cached.city;
  }

  const city = await fetchCity(username);
  if (city) {
    await writeCachedCity(city);
    return city;
  }

  return cached?.city ?? null;
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("user")?.trim();

  try {
    const registeredUsers = await listRegisteredUsers();

    const registeredGithubUsers = registeredUsers
      .map((user) => user.profile.githubUsername.trim())
      .filter(Boolean);

    const requestedUsername = requested?.toLowerCase();
    const usernames = requestedUsername
      ? [...registeredGithubUsers].sort((a, b) => {
          if (a.toLowerCase() === requestedUsername) return -1;
          if (b.toLowerCase() === requestedUsername) return 1;
          return 0;
        })
      : registeredGithubUsers;

    if (!usernames.length) {
      return NextResponse.json({
        cities: [],
        fetchedAt: new Date().toISOString(),
      } satisfies WorldResponse);
    }

    const fetchedCities = await Promise.all(
      usernames.map((username) => fetchCityWithCache(username))
    );

    const cities = await Promise.all(
      fetchedCities
        .filter((city): city is DeveloperCity => Boolean(city))
        .map(trimCityForWorld)
        .map(attachRegisteredProfile)
    );
    const selectedCities = cities.map(applyRepoSelection);

    const response: WorldResponse = {
      cities: selectedCities,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("github-world route error:", error);

    return NextResponse.json(
      {
        cities: [],
        fetchedAt: new Date().toISOString(),
        error:
          error instanceof Error
            ? error.message
            : "GitHub data is unavailable.",
      },
      { status: 503 }
    );
  }
}
