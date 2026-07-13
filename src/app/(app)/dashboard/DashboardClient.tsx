'use client';

import Link from 'next/link';
import Header from '@/components/Header';
import ProjectCard from '@/components/ProjectCard';
import { Project } from '@/types';

export default function DashboardClient({ projects }: { projects: Project[] }) {
  return (
    <div>
      <Header
        title="My Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''}`}
        action={
          <Link href="/projects/new" className="btn-primary">
            + New Project
          </Link>
        }
      />

      {/* Process Chapter CTA */}
      <Link href="/process">
        <div className="card mb-8 group cursor-pointer glow-accent hover:scale-[1.01] transition-all duration-300 bg-gradient-to-r from-accent/10 to-purple-500/10 border-accent/20">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                ⚡ Process a Chapter
              </h2>
              <p className="text-sm text-text-secondary mt-1">
                Paste a URL or raw text, auto-detect the project, and clean it with AI
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center group-hover:bg-accent/25 transition-colors">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
          </div>
        </div>
      </Link>

      {/* Projects Grid */}
      {projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 card-stagger">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">📚</div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">No projects yet</h3>
          <p className="text-text-muted text-sm mb-6">Create your first project to get started</p>
          <Link href="/projects/new" className="btn-primary">+ Create Project</Link>
        </div>
      )}
    </div>
  );
}
