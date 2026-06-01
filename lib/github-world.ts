export type GitHubRepo = {
  id: number;
  name: string;
  description: string | null;
  htmlUrl: string;
  language: string | null;
  stars: number;
  forks: number;
};

export type DeveloperCity = {
  login: string;
  name: string;
  avatarUrl: string;
  htmlUrl: string;
  bio: string | null;
  company: string | null;
  location: string | null;
  followers: number;
  publicRepos: number;
  totalStars: number;
  topLanguages: string[];
  repos: GitHubRepo[];
  registeredProfile?: {
    userId: string;
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
  } | null;
};

export type WorldResponse = {
  cities: DeveloperCity[];
  fetchedAt: string;
};
