'use client';

import Header from '@/components/Header';
import ChapterProcessor from '@/components/ChapterProcessor';
import { Project } from '@/types';

interface Props {
  projects: Project[];
  preselectedProjectId?: string;
}

export default function ProcessClient({ projects, preselectedProjectId }: Props) {
  return (
    <div>
      <Header
        title="Novel Scraper"
        subtitle="Fetch and clean novel chapters automatically"
      />

      <ChapterProcessor
        projects={projects}
        preselectedProjectId={preselectedProjectId}
      />
    </div>
  );
}
