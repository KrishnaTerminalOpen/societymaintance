import React from 'react';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-xl">
          CD
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          ColonyDeposit
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Residential Security Deposit Management Platform.
        </p>
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-xs text-left text-slate-700 space-y-2 border border-slate-100">
          <p className="font-semibold text-slate-900">Module 1: Database Initialized</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>PostgreSQL schema with connection pooling</li>
            <li>Prisma ORM &amp; SQL migrations</li>
            <li>Shared Zod types &amp; integer paise currency math</li>
            <li>Ready for Module 2: Authentication</li>
          </ul>
        </div>
      </div>
    </main>
  );
}

