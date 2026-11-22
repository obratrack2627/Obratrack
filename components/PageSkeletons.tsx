'use client';

import React from 'react';

export function DashboardSkeleton() {
  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[var(--bg-page)]" aria-busy="true" aria-label="Cargando Centro de Mando">
      <div className="bg-white dark:bg-[#141A23] border-b border-kraft-200 dark:border-[#263040] px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded-lg bg-gray-200 dark:bg-[#222C3D] animate-pulse" />
          <div className="h-3.5 w-64 rounded bg-gray-100 dark:bg-[#1A2230] animate-pulse" />
        </div>
        <div className="h-9 w-36 rounded-xl bg-gray-200 dark:bg-[#222C3D] animate-pulse" />
      </div>
      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] p-5 space-y-3">
              <div className="flex justify-between items-center">
                <div className="h-3 w-24 rounded bg-gray-200 dark:bg-[#222C3D] animate-pulse" />
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-[#1A2230] animate-pulse" />
              </div>
              <div className="h-7 w-28 rounded bg-gray-200 dark:bg-[#222C3D] animate-pulse" />
              <div className="h-2.5 w-full rounded bg-gray-100 dark:bg-[#1A2230] animate-pulse" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] animate-pulse" />
          <div className="h-80 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] animate-pulse" />
        </div>
        <div className="h-60 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] animate-pulse" />
      </div>
    </div>
  );
}

export function ProjectWorkspaceSkeleton({ label = 'Cargando módulo de obra...' }: { label?: string }) {
  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[var(--bg-page)]" aria-busy="true" aria-label={label}>
      <div className="bg-white dark:bg-[#141A23] border-b border-kraft-200 dark:border-[#263040] px-4 sm:px-6 pt-4 pb-3 space-y-3">
        <div className="h-3.5 w-44 rounded bg-gray-200 dark:bg-[#222C3D] animate-pulse" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-7 w-64 rounded-lg bg-gray-200 dark:bg-[#222C3D] animate-pulse" />
            <div className="h-3.5 w-80 max-w-full rounded bg-gray-100 dark:bg-[#1A2230] animate-pulse" />
          </div>
          <div className="h-8 w-28 rounded-xl bg-gray-200 dark:bg-[#222C3D] animate-pulse" />
        </div>
        <div className="flex gap-3 pt-2 border-t border-kraft-100 dark:border-[#1E2530] overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-8 w-28 shrink-0 rounded-lg bg-gray-100 dark:bg-[#1A2230] animate-pulse" />
          ))}
        </div>
      </div>
      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-2xl bg-white dark:bg-[#141A23] border border-kraft-200 dark:border-[#263040] animate-pulse" />
      </div>
    </div>
  );
}

export function ReportFeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando registros">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-kraft-200 dark:border-[#263040] bg-white dark:bg-[#141A23] p-4 space-y-3 animate-pulse"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gray-200 dark:bg-[#222C3D]" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-40 rounded bg-gray-200 dark:bg-[#222C3D]" />
                <div className="h-3 w-28 rounded bg-gray-100 dark:bg-[#1A2230]" />
              </div>
            </div>
            <div className="h-5 w-20 rounded-full bg-gray-100 dark:bg-[#1A2230]" />
          </div>
          <div className="h-3 w-3/4 rounded bg-gray-100 dark:bg-[#1A2230]" />
          <div className="h-3 w-1/2 rounded bg-gray-100 dark:bg-[#1A2230]" />
        </div>
      ))}
    </div>
  );
}
