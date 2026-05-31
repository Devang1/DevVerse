import { NextRequest, NextResponse } from "next/server";
import { findRegisteredProfileByGithubUsername, listRegisteredUsers } from "@/lib/auth";
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
const MAX_REPOS_PER_CITY = 32;

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
    )
    .slice(0, MAX_REPOS_PER_CITY);

  return {
    ...city,
    repos,
    totalStars: city.repos.reduce((total, repo) => total + repo.stars, 0),
  };
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

    const languages = rawRepos
      .map((repo) => repo.language)
      .filter((language): language is string => Boolean(language));

    const languageCounts = languages.reduce<Record<string, number>>(
      (counts, language) => {
        counts[language] = (counts[language] ?? 0) + 1;
        return counts;
      },
      {}
    );

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
      topLanguages: Object.entries(languageCounts)
        .sort(([, countA], [, countB]) => countB - countA)
        .slice(0, 4)
        .map(([language]) => language),
      repos,
      registeredProfile,
    });
  } catch (error) {
    console.error(`Failed to fetch city for ${username}:`, error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("user")?.trim();

  try {
    const registeredUsers = await listRegisteredUsers();

    const registeredGithubUsers = registeredUsers
      .map((user) => user.profile.githubUsername.trim())
      .filter(Boolean);

    const usernames = requested
      ? registeredGithubUsers.filter(
          (username) => username.toLowerCase() === requested.toLowerCase()
        )
      : registeredGithubUsers;

    if (!usernames.length) {
      return NextResponse.json({
        cities: [],
        fetchedAt: new Date().toISOString(),
      } satisfies WorldResponse);
    }

    const fetchedCities = await Promise.all(
      usernames.map((username) => fetchCity(username))
    );

    const cities = await Promise.all(
      fetchedCities
        .filter((city): city is DeveloperCity => Boolean(city))
        .map(trimCityForWorld)
        .map(attachRegisteredProfile)
    );

    const response: WorldResponse = {
      cities,
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