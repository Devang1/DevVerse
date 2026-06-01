import { NextRequest, NextResponse } from "next/server";

type GitHubRepoResponse = {
  id: number;
  name: string;
  html_url: string;
  language: string | null;
  stargazers_count: number;
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

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("user")?.trim();
  if (!username) {
    return NextResponse.json({ error: "Choose a GitHub username." }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&page=1&sort=updated`,
      {
        headers,
        next: { revalidate: 900 },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) {
      return NextResponse.json({ error: "GitHub repositories are unavailable." }, { status: response.status });
    }

    const repos = ((await response.json()) as GitHubRepoResponse[])
      .sort((a, b) => b.stargazers_count - a.stargazers_count || a.name.localeCompare(b.name))
      .map((repo) => ({
        id: repo.id,
        name: repo.name,
        htmlUrl: repo.html_url,
        language: repo.language,
        stars: repo.stargazers_count,
      }));

    return NextResponse.json({ repos });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load repositories." },
      { status: 503 }
    );
  }
}
