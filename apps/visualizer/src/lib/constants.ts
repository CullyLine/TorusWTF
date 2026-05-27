export const GITHUB_REPO = 'CullyLine/TorusFM';

export function githubIssueUrl(opts: {
  title: string;
  body: string;
  label: 'bug' | 'feature' | 'other';
}): string {
  const params = new URLSearchParams({
    title: opts.title,
    body: opts.body,
    labels: opts.label,
  });
  return `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;
}
