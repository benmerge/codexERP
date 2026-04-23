import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Save, ShieldOff, Sparkles } from 'lucide-react';
import { collection, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAppContext } from '../data/AppContext';
import { crmConfig } from '../config';
import { db } from '../firebase';
import {
  getDefaultToolRegistryEntries,
  getToolTitle,
  type ToolRegistryEntry,
} from '../platform/tools';
import { canManagePlatform } from '../platform/shared';

type ToolDraft = ToolRegistryEntry & {
  originalId: string;
};

const statusOptions: Array<ToolDraft['status']> = ['ready', 'beta', 'planned'];
const pricingOptions: Array<NonNullable<ToolDraft['pricingType']>> = ['included', 'manual', 'paid'];
const provisioningOptions: Array<NonNullable<ToolDraft['provisioningMode']>> = ['none', 'manual'];

const defaultAccent = 'from-slate-500 to-slate-700';

const createBlankDraft = (): ToolDraft => ({
  originalId: '',
  id: '',
  title: '',
  name: '',
  description: '',
  href: '',
  accent: defaultAccent,
  status: 'planned',
  pricingType: 'manual',
  priceLabel: '',
  provisioningMode: 'manual',
  note: '',
  enabled: true,
  sortOrder: 0,
});

const toDraft = (id: string, data: Partial<ToolRegistryEntry>, sortOrder: number): ToolDraft => {
  const title = getToolTitle({ id, title: data.title, name: data.name });
  return {
    originalId: id,
    id,
    title,
    name: data.name ?? title,
    description: data.description ?? '',
    href: data.href ?? '',
    accent: data.accent ?? defaultAccent,
    status: data.status ?? 'planned',
    pricingType: data.pricingType ?? 'manual',
    priceLabel: data.priceLabel ?? '',
    provisioningMode: data.provisioningMode ?? 'manual',
    note: data.note ?? '',
    enabled: data.enabled !== false,
    sortOrder,
  };
};

const normalizePayload = (draft: ToolDraft) => {
  const id = draft.id.trim();
  const title = (draft.title || draft.name || id).trim();
  return {
    id,
    title,
    name: title,
    description: draft.description.trim(),
    href: draft.href.trim(),
    accent: draft.accent.trim() || defaultAccent,
    status: draft.status ?? 'planned',
    pricingType: draft.pricingType ?? 'manual',
    priceLabel: draft.priceLabel?.trim() ?? '',
    provisioningMode: draft.provisioningMode ?? 'manual',
    note: draft.note.trim(),
    enabled: draft.enabled !== false,
    sortOrder: Number.isFinite(draft.sortOrder) ? draft.sortOrder ?? 0 : 0,
  };
};

export function ManageTools() {
  const { user, login, logout } = useAppContext();
  const navigate = useNavigate();
  const canAdmin = canManagePlatform(user?.email);
  const [tools, setTools] = useState<ToolDraft[]>([]);
  const [newTool, setNewTool] = useState<ToolDraft>(createBlankDraft());
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSavingNew, setIsSavingNew] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const seededRef = useRef(false);

  const defaultTools = useMemo(
    () =>
      getDefaultToolRegistryEntries({
        crmUrl: '/crm',
        dataCoopUrl: crmConfig.dataCoopAppUrl ?? '/data-coop',
        ecoStackUrl: crmConfig.ecoStackAppUrl ?? '/eco-stack',
        remixUrl: crmConfig.remixAppUrl ?? crmConfig.appUrl,
      }),
    []
  );

  useEffect(() => {
    if (!user || !canAdmin) {
      setTools([]);
      return;
    }

    setErrorMessage(null);
    const unsubscribe = onSnapshot(
      collection(db, 'platform_tools'),
      (snapshot) => {
        const nextTools = snapshot.docs.map((entry, index) =>
          toDraft(entry.id, entry.data() as Partial<ToolRegistryEntry>, index)
        );

        setTools(nextTools);
        setStatusMessage(snapshot.empty ? 'No tools found yet.' : null);
        if (snapshot.empty && !seededRef.current) {
          seededRef.current = true;
          setIsSeeding(true);
          void seedDefaults();
        }
      },
      (error) => {
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load platform tools.');
      }
    );

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAdmin, user?.uid]);

  const seedDefaults = async () => {
    try {
      const batch = writeBatch(db);
      defaultTools.forEach((tool, sortOrder) => {
        batch.set(doc(db, 'platform_tools', tool.id), {
          ...tool,
          id: tool.id,
          title: tool.title ?? tool.name,
          name: tool.name ?? tool.title ?? tool.id,
          enabled: true,
          sortOrder,
        });
      });
      await batch.commit();
      setStatusMessage('Seeded default tools.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to seed default tools.');
    } finally {
      setIsSeeding(false);
    }
  };

  const persistCard = async (draft: ToolDraft) => {
    const next = normalizePayload(draft);
    if (!next.id) {
      throw new Error('Tool id is required.');
    }
    if (!next.title) {
      throw new Error('Tool title is required.');
    }
    if (!next.href) {
      throw new Error('Tool href is required.');
    }

    const originalId = draft.originalId.trim();
    if (originalId && originalId !== next.id) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'platform_tools', next.id), next);
      batch.delete(doc(db, 'platform_tools', originalId));
      await batch.commit();
      return;
    }

    await setDoc(doc(db, 'platform_tools', next.id), next);
  };

  const hasIdCollision = (draft: ToolDraft, originalId: string) => {
    const nextId = draft.id.trim();
    return tools.some((tool) => tool.originalId !== originalId && tool.id.trim() === nextId);
  };

  const updateTool = (originalId: string, patch: Partial<ToolDraft>) => {
    setTools((current) =>
      current.map((tool) => (tool.originalId === originalId ? { ...tool, ...patch } : tool))
    );
  };

  const saveExistingTool = async (originalId: string) => {
    const draft = tools.find((tool) => tool.originalId === originalId);
    if (!draft) return;

    setErrorMessage(null);
    try {
      if (hasIdCollision(draft, originalId)) {
        throw new Error('That id is already in use by another tool.');
      }
      await persistCard(draft);
      const nextId = draft.id.trim();
      setTools((current) =>
        current.map((tool) =>
          tool.originalId === originalId ? { ...tool, originalId: nextId, id: nextId, name: draft.title?.trim() || draft.name || nextId, title: draft.title?.trim() || draft.name || nextId } : tool
        )
      );
      setStatusMessage(`Saved ${getToolTitle({ id: nextId, title: draft.title, name: draft.name })}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save tool.');
    }
  };

  const toggleEnabled = async (originalId: string) => {
    const draft = tools.find((tool) => tool.originalId === originalId);
    if (!draft) return;

    const nextEnabled = draft.enabled === false;
    setTools((current) =>
      current.map((tool) =>
        tool.originalId === originalId ? { ...tool, enabled: nextEnabled } : tool
      )
    );

    try {
      await setDoc(doc(db, 'platform_tools', draft.id.trim()), {
        ...normalizePayload({ ...draft, enabled: nextEnabled }),
        enabled: nextEnabled,
      }, { merge: true });
      setStatusMessage(nextEnabled ? 'Tool enabled.' : 'Tool disabled.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update tool status.');
      setTools((current) =>
        current.map((tool) =>
          tool.originalId === originalId ? { ...tool, enabled: draft.enabled } : tool
        )
      );
    }
  };

  const persistOrder = async (nextTools: ToolDraft[]) => {
    const batch = writeBatch(db);
    nextTools.forEach((tool, sortOrder) => {
      if (!tool.id.trim()) return;
      batch.set(
        doc(db, 'platform_tools', tool.id.trim()),
        {
          sortOrder,
        },
        { merge: true }
      );
    });
    await batch.commit();
  };

  const moveTool = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= tools.length) return;

    const nextTools = [...tools];
    const [moved] = nextTools.splice(index, 1);
    nextTools.splice(nextIndex, 0, moved);
    setTools(nextTools);

    try {
      await persistOrder(nextTools);
      setStatusMessage('Tool order updated.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update order.');
    }
  };

  const saveNewTool = async () => {
    setErrorMessage(null);
    setIsSavingNew(true);
    try {
      if (hasIdCollision(newTool, '')) {
        throw new Error('That id is already in use by another tool.');
      }
      await persistCard({ ...newTool, originalId: '' });
      setNewTool(createBlankDraft());
      setStatusMessage('Created new tool.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create tool.');
    } finally {
      setIsSavingNew(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">Admin access</div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Manage platform tools</h1>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Sign in with an approved admin account to edit the launcher tools.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => login()} className="bg-slate-950 text-white hover:bg-black">
            Sign in with Google
          </Button>
          <Button variant="outline" onClick={() => navigate('/')}>
            Back to launcher
          </Button>
        </div>
      </div>
    );
  }

  if (!canAdmin) {
    return (
      <div className="space-y-6 rounded-[2rem] border border-amber-200 bg-amber-50 p-8 shadow-sm">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-amber-600">Restricted</div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-amber-950">Manage platform tools</h1>
          <p className="max-w-2xl text-sm leading-6 text-amber-900/80">
            This page is reserved for approved admins.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => navigate('/')} className="bg-slate-950 text-white hover:bg-black">
            Back to launcher
          </Button>
          <Button variant="outline" onClick={() => logout()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,_rgba(8,17,31,0.96),_rgba(15,23,42,0.96))] px-6 py-6 text-white shadow-[0_30px_120px_-40px_rgba(15,23,42,0.7)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">
              <Sparkles className="h-3.5 w-3.5" />
              Admin tools
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Manage platform tools</h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-200/80">
              Edit the Firestore-backed launcher cards without touching code. Changes update the platform home as soon as they are saved.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => navigate('/')} className="border-white/15 bg-white/8 text-white hover:bg-white/12">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to launcher
            </Button>
            <Button variant="ghost" onClick={() => logout()} className="text-slate-200 hover:bg-white/8 hover:text-white">
              Sign out
            </Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-slate-300/80">
          <Badge variant="outline" className="border-white/15 bg-white/8 text-white">
            {user.email}
          </Badge>
          <span>Keep titles, hrefs, notes, accents, and status labels simple so the launcher stays easy to maintain.</span>
        </div>
      </section>

      {(errorMessage || statusMessage || isSeeding) && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          {isSeeding ? (
            <span className="inline-flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Seeding default tools...
            </span>
          ) : null}
          {statusMessage ? <span>{statusMessage}</span> : null}
          {errorMessage ? <span className="text-rose-600">{errorMessage}</span> : null}
        </div>
      )}

      <div className="grid gap-4">
        {tools.length === 0 && !isSeeding ? (
          <Card>
            <CardContent className="py-8 text-sm text-slate-500">
              No tools found yet. Defaults will seed automatically if the collection is empty.
            </CardContent>
          </Card>
        ) : (
          tools.map((tool, index) => {
            const disabled = tool.enabled === false;
            const title = getToolTitle(tool);
            return (
              <Card key={tool.originalId} className={disabled ? 'opacity-70' : ''}>
                <CardHeader className="border-b border-slate-200/70">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-2">
                        <span>{title || 'Untitled tool'}</span>
                        <Badge variant="outline" className={disabled ? 'border-slate-300 text-slate-500' : 'border-emerald-200 text-emerald-700'}>
                          {disabled ? 'disabled' : tool.status}
                        </Badge>
                      </CardTitle>
                      <CardDescription>
                        Document id: <span className="font-mono text-slate-700">{tool.originalId}</span>
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => moveTool(index, -1)} disabled={index === 0}>
                        <ArrowUp className="mr-2 h-4 w-4" />
                        Up
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => moveTool(index, 1)} disabled={index === tools.length - 1}>
                        <ArrowDown className="mr-2 h-4 w-4" />
                        Down
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleEnabled(tool.originalId)}
                      >
                        <ShieldOff className="mr-2 h-4 w-4" />
                        {disabled ? 'Enable' : 'Disable'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`title-${tool.originalId}`}>Title</Label>
                      <Input
                        id={`title-${tool.originalId}`}
                        value={tool.title ?? tool.name ?? ''}
                        onChange={(event) =>
                          updateTool(tool.originalId, {
                            title: event.target.value,
                            name: event.target.value,
                          })
                        }
                        disabled={disabled}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`id-${tool.originalId}`}>Id</Label>
                      <Input
                        id={`id-${tool.originalId}`}
                        value={tool.id}
                        onChange={(event) => updateTool(tool.originalId, { id: event.target.value })}
                        disabled={disabled}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`href-${tool.originalId}`}>Href</Label>
                    <Input
                      id={`href-${tool.originalId}`}
                      value={tool.href ?? ''}
                      onChange={(event) => updateTool(tool.originalId, { href: event.target.value })}
                      disabled={disabled}
                      placeholder="/crm or https://example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`description-${tool.originalId}`}>Description</Label>
                    <textarea
                      id={`description-${tool.originalId}`}
                      value={tool.description ?? ''}
                      onChange={(event) => updateTool(tool.originalId, { description: event.target.value })}
                      disabled={disabled}
                      rows={3}
                      className="min-h-24 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-6">
                    <div className="space-y-2">
                      <Label htmlFor={`status-${tool.originalId}`}>Status</Label>
                      <select
                        id={`status-${tool.originalId}`}
                        value={tool.status ?? 'planned'}
                        onChange={(event) => updateTool(tool.originalId, { status: event.target.value as ToolDraft['status'] })}
                        disabled={disabled}
                        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
                      >
                        {statusOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`pricing-${tool.originalId}`}>Pricing</Label>
                      <select
                        id={`pricing-${tool.originalId}`}
                        value={tool.pricingType ?? 'manual'}
                        onChange={(event) => updateTool(tool.originalId, { pricingType: event.target.value as ToolDraft['pricingType'] })}
                        disabled={disabled}
                        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
                      >
                        {pricingOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`provisioning-${tool.originalId}`}>Provisioning</Label>
                      <select
                        id={`provisioning-${tool.originalId}`}
                        value={tool.provisioningMode ?? 'manual'}
                        onChange={(event) => updateTool(tool.originalId, { provisioningMode: event.target.value as ToolDraft['provisioningMode'] })}
                        disabled={disabled}
                        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 dark:bg-input/30 dark:disabled:bg-input/80"
                      >
                        {provisioningOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`price-label-${tool.originalId}`}>Price Label</Label>
                      <Input
                        id={`price-label-${tool.originalId}`}
                        value={tool.priceLabel ?? ''}
                        onChange={(event) => updateTool(tool.originalId, { priceLabel: event.target.value })}
                        disabled={disabled}
                        placeholder="Included or $49/mo"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`accent-${tool.originalId}`}>Accent</Label>
                      <Input
                        id={`accent-${tool.originalId}`}
                        value={tool.accent ?? ''}
                        onChange={(event) => updateTool(tool.originalId, { accent: event.target.value })}
                        disabled={disabled}
                        placeholder="from-emerald-500 to-teal-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`note-${tool.originalId}`}>Note</Label>
                      <Input
                        id={`note-${tool.originalId}`}
                        value={tool.note ?? ''}
                        onChange={(event) => updateTool(tool.originalId, { note: event.target.value })}
                        disabled={disabled}
                        placeholder="System of record"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-3 pt-2">
                    <Button
                      onClick={() => saveExistingTool(tool.originalId)}
                      className="bg-slate-950 text-white hover:bg-black"
                    >
                      <Save className="mr-2 h-4 w-4" />
                      Save changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card>
        <CardHeader className="border-b border-slate-200/70">
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add new tool
          </CardTitle>
          <CardDescription>
            Create a new launcher card. The id becomes the Firestore document key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-title">Title</Label>
              <Input
                id="new-title"
                value={newTool.title ?? ''}
                onChange={(event) =>
                  setNewTool((current) => ({ ...current, title: event.target.value, name: event.target.value }))
                }
                placeholder="Internal Portal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-id">Id</Label>
              <Input
                id="new-id"
                value={newTool.id ?? ''}
                onChange={(event) => setNewTool((current) => ({ ...current, id: event.target.value }))}
                placeholder="internal-portal"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-href">Href</Label>
            <Input
              id="new-href"
              value={newTool.href ?? ''}
              onChange={(event) => setNewTool((current) => ({ ...current, href: event.target.value }))}
              placeholder="/crm or https://example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-description">Description</Label>
            <textarea
              id="new-description"
              value={newTool.description ?? ''}
              onChange={(event) => setNewTool((current) => ({ ...current, description: event.target.value }))}
              rows={3}
              className="min-h-24 w-full rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              placeholder="What this tool does."
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="new-status">Status</Label>
              <select
                id="new-status"
                value={newTool.status ?? 'planned'}
                onChange={(event) => setNewTool((current) => ({ ...current, status: event.target.value as ToolDraft['status'] }))}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none transition-colors dark:bg-input/30"
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-accent">Accent</Label>
              <Input
                id="new-accent"
                value={newTool.accent ?? ''}
                onChange={(event) => setNewTool((current) => ({ ...current, accent: event.target.value }))}
                placeholder="from-sky-500 to-indigo-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-note">Note</Label>
              <Input
                id="new-note"
                value={newTool.note ?? ''}
                onChange={(event) => setNewTool((current) => ({ ...current, note: event.target.value }))}
                placeholder="Optional short note"
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-between gap-3">
            <Label className="flex items-center gap-2 text-sm font-normal text-slate-600">
              <input
                type="checkbox"
                checked={newTool.enabled !== false}
                onChange={(event) => setNewTool((current) => ({ ...current, enabled: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300"
              />
              Enabled
            </Label>
            <Button
              onClick={saveNewTool}
              className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              disabled={isSavingNew}
            >
              {isSavingNew ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add tool
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
