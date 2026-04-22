import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Factory, Grid2x2, PanelTop, ShieldCheck, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppContext } from '../data/AppContext';
import { crmConfig } from '../config';
import { buildDefaultTools, getToolTitle, mergeToolsWithRegistry, type PlatformTool, type ToolRegistryEntry } from '../platform/tools';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { canManagePlatform } from '../platform/shared';

const statusStyles: Record<'ready' | 'beta' | 'planned', string> = {
  ready: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  beta: 'bg-amber-100 text-amber-700 ring-amber-200',
  planned: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function PlatformHome() {
  const { user, login, logout } = useAppContext();
  const navigate = useNavigate();
  const [registryEntries, setRegistryEntries] = useState<ToolRegistryEntry[]>([]);
  const canAdmin = canManagePlatform(user?.email);

  useEffect(() => {
    if (!user) {
      setRegistryEntries([]);
      return;
    }

    const unsubscribe = onSnapshot(collection(db, 'platform_tools'), (snapshot) => {
      setRegistryEntries(
        snapshot.docs.map((entry) => ({
          id: entry.id,
          ...(entry.data() as Omit<ToolRegistryEntry, 'id'>),
        }))
      );
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const tools = useMemo<PlatformTool[]>(() => {
    const defaults = buildDefaultTools({
      crmUrl: '/crm',
      remixUrl: crmConfig.remixAppUrl ?? crmConfig.appUrl,
    });

    return mergeToolsWithRegistry(defaults, registryEntries);
  }, [registryEntries]);

  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.2),_transparent_32%),linear-gradient(180deg,_#08111f,_#0f172a)] px-4 py-8 text-white">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
          <div className="grid w-full gap-6 overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 shadow-[0_30px_120px_-40px_rgba(15,23,42,0.7)] lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative overflow-hidden px-8 py-10 sm:px-12 sm:py-14">
              <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-emerald-400/15 blur-3xl" />
              <div className="absolute bottom-0 left-8 h-44 w-44 rounded-full bg-amber-400/10 blur-3xl" />
              <div className="relative space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">
                  <Sparkles className="h-3.5 w-3.5" />
                  Shared Platform
                </div>
                <div className="space-y-3">
                  <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                    One login. Multiple tools. Shared data.
                  </h1>
                  <p className="max-w-2xl text-base leading-7 text-slate-200/90 sm:text-lg">
                    CRM, ReMix, and future tools all sit on the same Firestore-backed workspace so the whole operation stays connected.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-200/70">Auth</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      <ShieldCheck className="h-4 w-4 text-emerald-300" />
                      Firebase login
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-200/70">Data</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      <Factory className="h-4 w-4 text-amber-300" />
                      Firestore core
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-200/70">Tools</div>
                    <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
                      <Grid2x2 className="h-4 w-4 text-sky-300" />
                      CRM + ReMix
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center bg-[linear-gradient(180deg,_rgba(255,255,255,0.96),_rgba(247,244,236,0.96))] px-8 py-10 text-slate-900 sm:px-12">
              <div className="w-full space-y-5">
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Sign in</div>
                  <h2 className="font-display text-3xl font-bold tracking-tight">Enter the platform</h2>
                  <p className="text-sm leading-6 text-slate-500">
                    Use the same approved account across all tools.
                  </p>
                </div>
                <Button
                  onClick={() => login()}
                  className="h-14 w-full rounded-2xl bg-slate-950 text-base font-semibold text-white shadow-lg shadow-slate-300 hover:bg-black"
                >
                  Sign in with Google
                </Button>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">What you get</div>
                  <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                    <li>• CRM and order management</li>
                    <li>• ReMix production and inventory</li>
                    <li>• Future tools on the same workspace</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.2),_transparent_32%),linear-gradient(180deg,_#08111f,_#0f172a)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/7 px-6 py-5 shadow-[0_30px_120px_-40px_rgba(15,23,42,0.6)] backdrop-blur lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-emerald-200/70">Workspace</div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Select a tool</h1>
            <p className="text-sm leading-6 text-slate-200/80">
              Signed in as <span className="font-semibold text-white">{user.email}</span>.
              {canAdmin ? ' You can manage platform tools.' : ' Standard access is enabled.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/crm">
              <Button className="rounded-2xl bg-emerald-400 px-5 text-slate-950 hover:bg-emerald-300">Open CRM</Button>
            </Link>
            <a href={crmConfig.remixAppUrl ?? crmConfig.appUrl}>
              <Button variant="outline" className="rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12">
                Open ReMix
              </Button>
            </a>
            {canAdmin ? (
              <Button
                variant="outline"
                className="rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12"
                onClick={() => navigate('/tools/manage')}
              >
                Manage tools
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="rounded-2xl text-slate-200 hover:bg-white/8 hover:text-white"
              onClick={() => logout()}
            >
              Sign out
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {tools.map((tool) => (
            tool.status === 'planned' ? (
              <div
                key={tool.id}
                className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/7 p-5 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.7)]"
              >
                <div className={`h-1.5 rounded-full bg-gradient-to-r ${tool.accent}`} />
                <div className="mt-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                      <PanelTop className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold">{getToolTitle(tool)}</div>
                      {tool.note ? <div className="text-sm text-slate-300">{tool.note}</div> : null}
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ring-1 ${statusStyles[tool.status]}`}>
                    {tool.status}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-200/82">{tool.description}</p>
                <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  Coming soon
                </div>
              </div>
            ) : (
              <a
                key={tool.id}
                href={tool.href}
                className="group overflow-hidden rounded-[2rem] border border-white/10 bg-white/7 p-5 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.7)] transition-transform duration-200 hover:-translate-y-1 hover:border-white/20"
              >
                <div className={`h-1.5 rounded-full bg-gradient-to-r ${tool.accent}`} />
                <div className="mt-5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/10">
                      <PanelTop className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <div className="text-lg font-semibold">{getToolTitle(tool)}</div>
                      {tool.note ? <div className="text-sm text-slate-300">{tool.note}</div> : null}
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ring-1 ${statusStyles[tool.status]}`}>
                    {tool.status}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-200/82">{tool.description}</p>
                <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-emerald-200 transition-transform group-hover:translate-x-1">
                  Launch tool
                  <ArrowRight className="h-4 w-4" />
                </div>
              </a>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
