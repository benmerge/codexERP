import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Factory, Grid2x2, Loader2, PanelTop, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppContext } from '../data/AppContext';
import { crmConfig } from '../config';
import { buildDefaultTools, getToolTitle, mergeToolsWithRegistry, type PlatformTool, type ToolRegistryEntry } from '../platform/tools';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { canManagePlatform, resolveOrgId } from '../platform/shared';
import { resolveToolAccess, type OrgToolEntitlement } from '../platform/entitlements';
import { writePlatformEvent } from '../platform/data';
import { buildLaunchUrl, createToolLaunchSession } from '../platform/launch';
import { getBillingBadgeLabel, type OrgBillingSubscription } from '../platform/billing';
import { createCheckoutSession } from '../platform/billingApi';

const statusStyles: Record<'ready' | 'beta' | 'planned', string> = {
  ready: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  beta: 'bg-amber-100 text-amber-700 ring-amber-200',
  planned: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const accessStyles = {
  active: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  blocked: 'bg-rose-100 text-rose-700 ring-rose-200',
  pending: 'bg-amber-100 text-amber-700 ring-amber-200',
  inactive: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function PlatformHome() {
  const { user, login, logout } = useAppContext();
  const navigate = useNavigate();
  const [registryEntries, setRegistryEntries] = useState<ToolRegistryEntry[]>([]);
  const [entitlements, setEntitlements] = useState<Record<string, OrgToolEntitlement>>({});
  const [billingSubscriptions, setBillingSubscriptions] = useState<Record<string, OrgBillingSubscription>>({});
  const [entitlementError, setEntitlementError] = useState<string | null>(null);
  const [pendingToolId, setPendingToolId] = useState<string | null>(null);
  const canAdmin = canManagePlatform(user?.email);
  const orgId = resolveOrgId(user, crmConfig.sharedOrgId);

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

  useEffect(() => {
    if (!user || !orgId) {
      setEntitlements({});
      return;
    }

    setEntitlementError(null);
    const unsubscribe = onSnapshot(
      collection(db, `orgs/${orgId}/entitlements`),
      (snapshot) => {
        setEntitlements(
          Object.fromEntries(
            snapshot.docs.map((entry) => [
              entry.id,
              {
                id: entry.id,
                ...(entry.data() as Omit<OrgToolEntitlement, 'id'>),
              },
            ])
          )
        );
      },
      (error) => {
        setEntitlementError(error instanceof Error ? error.message : 'Unable to load entitlements.');
      }
    );

    return () => unsubscribe();
  }, [orgId, user?.uid]);

  useEffect(() => {
    if (!user || !orgId) {
      setBillingSubscriptions({});
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, `orgs/${orgId}/billing_subscriptions`),
      (snapshot) => {
        setBillingSubscriptions(
          Object.fromEntries(
            snapshot.docs.map((entry) => [
              entry.id,
              {
                id: entry.id,
                ...(entry.data() as Omit<OrgBillingSubscription, 'id'>),
              },
            ])
          )
        );
      },
      (error) => {
        setEntitlementError(error instanceof Error ? error.message : 'Unable to load billing records.');
      }
    );

    return () => unsubscribe();
  }, [orgId, user?.uid]);

  const tools = useMemo<PlatformTool[]>(() => {
    const defaults = buildDefaultTools({
      crmUrl: '/crm',
      dataCoopUrl: crmConfig.dataCoopAppUrl ?? '/data-coop',
      ecoStackUrl: crmConfig.ecoStackAppUrl ?? '/eco-stack',
      remixUrl: crmConfig.remixAppUrl ?? crmConfig.appUrl,
    });

    return mergeToolsWithRegistry(defaults, registryEntries);
  }, [registryEntries]);

  const crmTool = tools.find((tool) => tool.id === 'crm');
  const dataCoopTool = tools.find((tool) => tool.id === 'data-coop');
  const ecoStackTool = tools.find((tool) => tool.id === 'eco-stack');
  const remixTool = tools.find((tool) => tool.id === 'remix');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const toolId = params.get('toolId');
    const sessionId = params.get('sessionId');
    const provider = params.get('provider');

    if (checkout !== 'success' || !toolId || !sessionId || !provider || !user || !orgId) return;

    const tool = tools.find((entry) => entry.id === toolId);
    if (!tool) return;

    let isMounted = true;

    void (async () => {
      setPendingToolId(toolId);
      setEntitlementError(null);

      try {
        await setDoc(
          doc(db, `orgs/${orgId}/billing_subscriptions`, sessionId),
          {
            provider,
            status: 'active',
            toolId,
            amount: null,
            currency: 'usd',
            renewalDate: null,
            plan: 'checkout-activation',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        const requiresProvisioning = tool.provisioningMode === 'manual';
        await setDoc(
          doc(db, `orgs/${orgId}/entitlements`, toolId),
          {
            toolId,
            status: requiresProvisioning ? 'pending' : 'active',
            plan: 'checkout-activation',
            activatedAt: new Date().toISOString(),
            expiresAt: null,
            billingSubscriptionId: sessionId,
            source: `${provider}_checkout`,
            pricingType: tool.pricingType ?? 'paid',
            provisioningStatus: requiresProvisioning ? 'pending' : 'ready',
            provisioningRequestedAt: requiresProvisioning ? new Date().toISOString() : null,
            provisioningCompletedAt: requiresProvisioning ? null : new Date().toISOString(),
            failureReason: null,
            rolesGranted: tool.rolesAllowed ?? ['admin', 'user'],
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        await writePlatformEvent(db, {
          action: 'updated',
          actorEmail: user.email,
          actorUserId: user.uid,
          description: `Checkout completed for ${getToolTitle(tool)} via ${provider}.`,
          orgId,
          recordId: sessionId,
          recordType: 'billing-checkout',
        });

        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.delete('checkout');
        nextUrl.searchParams.delete('toolId');
        nextUrl.searchParams.delete('sessionId');
        nextUrl.searchParams.delete('provider');
        window.history.replaceState({}, '', nextUrl.toString());
      } catch (error) {
        if (isMounted) {
          setEntitlementError(error instanceof Error ? error.message : 'Unable to finalize checkout.');
        }
      } finally {
        if (isMounted) {
          setPendingToolId(null);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [orgId, tools, user]);

  const activateTool = async (tool: PlatformTool) => {
    if (!user || !orgId) return;

    setPendingToolId(tool.id);
    setEntitlementError(null);

    try {
      const requiresProvisioning = tool.provisioningMode === 'manual';
      const billingSubscriptionId = tool.pricingType === 'paid' ? `${tool.id}-manual` : null;

      if (tool.pricingType === 'paid') {
        await setDoc(
          doc(db, `orgs/${orgId}/billing_subscriptions`, billingSubscriptionId!),
          {
            provider: 'manual',
            status: 'active',
            toolId: tool.id,
            amount: null,
            currency: 'usd',
            renewalDate: null,
            plan: 'manual-activation',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }

      await setDoc(
        doc(db, `orgs/${orgId}/entitlements`, tool.id),
        {
          toolId: tool.id,
          status: requiresProvisioning ? 'pending' : 'active',
          plan: tool.pricingType === 'paid' ? 'manual-activation' : 'included',
          activatedAt: new Date().toISOString(),
          expiresAt: null,
          billingSubscriptionId,
          source: 'manual_admin_activation',
          pricingType: tool.pricingType ?? 'manual',
          provisioningStatus: requiresProvisioning ? 'pending' : 'ready',
          provisioningRequestedAt: requiresProvisioning ? new Date().toISOString() : null,
          provisioningCompletedAt: requiresProvisioning ? null : new Date().toISOString(),
          failureReason: null,
          rolesGranted: tool.rolesAllowed ?? ['admin', 'user'],
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: requiresProvisioning
          ? `Tool ${getToolTitle(tool)} was activated and moved into provisioning for the org.`
          : `Tool ${getToolTitle(tool)} was manually activated for the org.`,
        orgId,
        recordId: tool.id,
        recordType: 'entitlement',
      });
    } catch (error) {
      setEntitlementError(error instanceof Error ? error.message : 'Unable to activate tool.');
    } finally {
      setPendingToolId(null);
    }
  };

  const startCheckout = async (tool: PlatformTool) => {
    if (!user || !orgId) return;

    setPendingToolId(tool.id);
    setEntitlementError(null);

    try {
      const session = await createCheckoutSession({
        amount: null,
        currency: 'usd',
        orgId,
        plan: 'checkout-activation',
        returnUrl: window.location.href,
        toolId: tool.id,
        userEmail: user.email,
        userId: user.uid,
      });

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: `Checkout session ${session.sessionId} was created for ${getToolTitle(tool)}.`,
        orgId,
        recordId: session.sessionId,
        recordType: 'billing-checkout',
      });

      window.location.assign(session.checkoutUrl);
    } catch (error) {
      setEntitlementError(error instanceof Error ? error.message : 'Unable to start checkout.');
      setPendingToolId(null);
    }
  };

  const revokeTool = async (tool: PlatformTool) => {
    if (!user || !orgId) return;

    setPendingToolId(tool.id);
    setEntitlementError(null);

    try {
      await setDoc(
        doc(db, `orgs/${orgId}/entitlements`, tool.id),
        {
          toolId: tool.id,
          status: 'inactive',
          plan: tool.pricingType === 'paid' ? 'manual-activation' : 'included',
          activatedAt: null,
          expiresAt: null,
          billingSubscriptionId: null,
          source: 'manual_admin_revocation',
          pricingType: tool.pricingType ?? 'manual',
          provisioningStatus: 'not_required',
          provisioningRequestedAt: null,
          provisioningCompletedAt: null,
          failureReason: null,
          rolesGranted: tool.rolesAllowed ?? ['admin', 'user'],
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: `Tool ${getToolTitle(tool)} was manually deactivated for the org.`,
        orgId,
        recordId: tool.id,
        recordType: 'entitlement',
      });
    } catch (error) {
      setEntitlementError(error instanceof Error ? error.message : 'Unable to deactivate tool.');
    } finally {
      setPendingToolId(null);
    }
  };

  const updateProvisioning = async (
    tool: PlatformTool,
    next: { provisioningStatus: 'ready' | 'failed'; failureReason?: string | null }
  ) => {
    if (!user || !orgId) return;

    setPendingToolId(tool.id);
    setEntitlementError(null);

    try {
      const isReady = next.provisioningStatus === 'ready';
      await setDoc(
        doc(db, `orgs/${orgId}/entitlements`, tool.id),
        {
          toolId: tool.id,
          status: isReady ? 'active' : 'suspended',
          provisioningStatus: next.provisioningStatus,
          provisioningCompletedAt: isReady ? new Date().toISOString() : null,
          failureReason: isReady ? null : next.failureReason || 'Provisioning needs follow-up.',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: isReady
          ? `Provisioning for ${getToolTitle(tool)} was marked ready.`
          : `Provisioning for ${getToolTitle(tool)} was marked failed.`,
        orgId,
        recordId: tool.id,
        recordType: 'provisioning',
      });
    } catch (error) {
      setEntitlementError(error instanceof Error ? error.message : 'Unable to update provisioning.');
    } finally {
      setPendingToolId(null);
    }
  };

  const logLaunch = async (tool: PlatformTool) => {
    if (!user || !orgId) return;

    try {
      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: `Tool ${getToolTitle(tool)} was launched from the platform home.`,
        orgId,
        recordId: tool.id,
        recordType: 'tool-launch',
      });
    } catch (error) {
      console.error('Unable to record tool launch event', error);
    }
  };

  const launchTool = async (tool: PlatformTool) => {
    if (!user || !orgId) return;

    try {
      const session = await createToolLaunchSession({
        db,
        orgId,
        returnUrl: window.location.href,
        targetUrl: tool.href,
        toolId: tool.id,
        userEmail: user.email,
        userId: user.uid,
      });

      await writePlatformEvent(db, {
        action: 'updated',
        actorEmail: user.email,
        actorUserId: user.uid,
        description: `Launch session ${session.id} was created for ${getToolTitle(tool)}.`,
        orgId,
        recordId: session.id,
        recordType: 'launch-session',
      });

      void logLaunch(tool);
      window.open(buildLaunchUrl(tool.href, session.id), '_blank', 'noopener,noreferrer');
    } catch (error) {
      setEntitlementError(error instanceof Error ? error.message : 'Unable to launch tool.');
    }
  };

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
            <Button
              className="rounded-2xl bg-emerald-400 px-5 text-slate-950 hover:bg-emerald-300"
              onClick={() => crmTool && void launchTool(crmTool)}
            >
              Open CRM
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12"
              onClick={() => dataCoopTool && void launchTool(dataCoopTool)}
            >
              Open Data Coop
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12"
              onClick={() => ecoStackTool && void launchTool(ecoStackTool)}
            >
              Open EcoStack
            </Button>
            <Button
              variant="outline"
              className="rounded-2xl border-white/15 bg-white/8 px-5 text-white hover:bg-white/12"
              onClick={() => remixTool && void launchTool(remixTool)}
            >
              Open ReMix
            </Button>
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

        {entitlementError ? (
          <div className="rounded-2xl border border-rose-300/50 bg-rose-100/90 px-4 py-3 text-sm text-rose-900">
            {entitlementError}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          {tools.map((tool) => {
            const access = resolveToolAccess({
              entitlement: entitlements[tool.id],
              isPlatformAdmin: canAdmin,
              tool,
              userRole: canAdmin ? 'admin' : 'user',
            });
            const isBusy = pendingToolId === tool.id;
            const accessStyle =
              access.state === 'open'
                ? accessStyles.active
                : access.state === 'pending'
                  ? accessStyles.pending
                  : access.state === 'blocked'
                    ? accessStyles.blocked
                    : accessStyles.inactive;

            return tool.status === 'planned' ? (
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
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ring-1 ${accessStyle}`}>
                    {access.label}
                  </span>
                </div>
                <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  {access.cta}
                </div>
              </div>
            ) : (
              <div
                key={tool.id}
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
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ring-1 ${accessStyle}`}>
                    {access.label}
                  </span>
                  <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ring-1 ring-white/10 bg-white/8 text-slate-200">
                    {tool.pricingType ?? 'manual'}
                  </span>
                  {tool.priceLabel ? (
                    <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ring-1 ring-white/10 bg-white/8 text-slate-200">
                      {tool.priceLabel}
                    </span>
                  ) : null}
                  <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ring-1 ring-white/10 bg-white/8 text-slate-200">
                    provisioning {tool.provisioningMode ?? 'manual'}
                  </span>
                  {tool.pricingType === 'paid' ? (
                    <span className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] ring-1 ring-white/10 bg-white/8 text-slate-200">
                      {getBillingBadgeLabel(
                        entitlements[tool.id]?.billingSubscriptionId
                          ? billingSubscriptions[entitlements[tool.id].billingSubscriptionId as string]
                          : undefined
                      )}
                    </span>
                  ) : null}
                </div>
                {access.reason ? (
                  <p className="mt-3 text-xs leading-5 text-slate-300/80">{access.reason}</p>
                ) : null}
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {access.state === 'open' ? (
                    <button
                      type="button"
                      onClick={() => void launchTool(tool)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-200 transition-transform group-hover:translate-x-1"
                    >
                      {access.cta}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-300">
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {access.cta}
                    </span>
                  )}

                  {canAdmin && access.state === 'activate' ? (
                    <Button
                      size="sm"
                      className="rounded-2xl bg-emerald-400 px-4 text-slate-950 hover:bg-emerald-300"
                      disabled={isBusy}
                      onClick={() => void (tool.pricingType === 'paid' ? startCheckout(tool) : activateTool(tool))}
                    >
                      {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {tool.pricingType === 'paid' ? 'Start checkout' : 'Activate for org'}
                    </Button>
                  ) : null}

                  {canAdmin && access.state === 'pending' ? (
                    <>
                      <Button
                        size="sm"
                        className="rounded-2xl bg-emerald-400 px-4 text-slate-950 hover:bg-emerald-300"
                        disabled={isBusy}
                        onClick={() => void updateProvisioning(tool, { provisioningStatus: 'ready' })}
                      >
                        {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Mark ready
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-2xl border-white/15 bg-white/8 px-4 text-white hover:bg-white/12"
                        disabled={isBusy}
                        onClick={() =>
                          void updateProvisioning(tool, {
                            provisioningStatus: 'failed',
                            failureReason: 'Provisioning blocked pending admin setup.',
                          })
                        }
                      >
                        {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Mark failed
                      </Button>
                    </>
                  ) : null}

                  {canAdmin && access.state === 'open' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-2xl border-white/15 bg-white/8 px-4 text-white hover:bg-white/12"
                      disabled={isBusy}
                      onClick={() => void revokeTool(tool)}
                    >
                      {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Deactivate
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
}
