import { Project } from '@/types';

export function detectProject(
  text: string,
  projects: Project[]
): Project | null {
  const lower = text.toLowerCase();
  let bestMatch: Project | null = null;
  let bestScore = 0;

  for (const project of projects) {
    let score = 0;
    for (const keyword of project.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = project;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}
