'use client';

import Link from 'next/link';
import { Project } from '@/types';

interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const chapterCount = project.chapter_count || 0;
  const totalWords = project.total_word_count || 0;

  return (
    <Link href={`/projects/${project.id}`}>
      <div
        className="card group cursor-pointer hover:scale-[1.02] transition-all duration-300"
        style={{ borderLeftColor: project.color, borderLeftWidth: '3px' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text-primary text-base truncate group-hover:text-accent transition-colors">
              {project.title}
            </h3>
            {project.subtitle && (
              <p className="text-text-muted text-xs mt-0.5 truncate">
                {project.subtitle}
              </p>
            )}
          </div>
          <div
            className="w-3 h-3 rounded-full shrink-0 ml-3 mt-1"
            style={{ backgroundColor: project.color }}
          />
        </div>

        {/* Fandoms */}
        {project.fandoms && project.fandoms.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {project.fandoms.map((fandom, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: `${project.color}20`,
                  color: project.color,
                  border: `1px solid ${project.color}30`,
                }}
              >
                {fandom}
              </span>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 mt-auto pt-3 border-t border-border">
          <div className="flex items-center gap-1.5 text-text-muted text-xs">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{chapterCount} chapter{chapterCount !== 1 ? 's' : ''}</span>
          </div>
          {totalWords > 0 && (
            <div className="flex items-center gap-1.5 text-text-muted text-xs">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
              <span>{totalWords.toLocaleString()} words</span>
            </div>
          )}
          <div className="ml-auto text-text-muted text-xs">
            {new Date(project.updated_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </div>
        </div>
      </div>
    </Link>
  );
}
