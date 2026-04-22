export type PlatformTool = {
  id: string;
  title?: string;
  name: string;
  description: string;
  href: string;
  accent: string;
  status: 'ready' | 'beta' | 'planned';
  note?: string;
};

export type ToolRegistryEntry = Partial<Omit<PlatformTool, 'id'>> & {
  id: string;
  enabled?: boolean;
  sortOrder?: number;
};

const resolveToolTitle = (...values: Array<string | undefined>) =>
  values.map((value) => value?.trim()).find((value): value is string => !!value) ?? '';

export const buildDefaultTools = (tools: {
  crmUrl: string;
  remixUrl: string;
}): PlatformTool[] => [
  {
    id: 'crm',
    title: 'CRM',
    name: 'CRM',
    description: 'Customers, orders, pipelines, and shared company records.',
    href: tools.crmUrl,
    accent: 'from-emerald-500 to-teal-500',
    status: 'ready',
    note: 'System of record',
  },
  {
    id: 'remix',
    title: 'ReMix',
    name: 'ReMix',
    description: 'Production planning, inventory, recipes, and shipment updates.',
    href: tools.remixUrl,
    accent: 'from-amber-400 to-orange-500',
    status: 'ready',
    note: 'Operations floor',
  },
  {
    id: 'future-tools',
    title: 'Other Tools',
    name: 'Other Tools',
    description: 'Add future internal tools here with the same login and org context.',
    href: '#',
    accent: 'from-sky-500 to-indigo-500',
    status: 'planned',
    note: 'Ready for expansion',
  },
];

export const getDefaultToolRegistryEntries = (tools: {
  crmUrl: string;
  remixUrl: string;
}): ToolRegistryEntry[] =>
  buildDefaultTools(tools).map((tool, sortOrder) => ({
    ...tool,
    title: tool.title ?? tool.name,
    name: tool.name ?? tool.title ?? tool.id,
    enabled: true,
    sortOrder,
  }));

export const getToolTitle = (tool: { id: string; name?: string; title?: string }) =>
  resolveToolTitle(tool.title, tool.name, tool.id);

export const mergeToolsWithRegistry = (defaults: PlatformTool[], registry: ToolRegistryEntry[]) => {
  const map = new Map(defaults.map((tool) => [tool.id, tool]));

  for (const entry of registry) {
    if (entry.enabled === false) {
      map.delete(entry.id);
      continue;
    }

    const base = map.get(entry.id);
    const title = resolveToolTitle(entry.title, entry.name, base?.title, base?.name, entry.id);
    map.set(entry.id, {
      id: entry.id,
      title,
      name: entry.name ?? title,
      description: entry.description ?? base?.description ?? '',
      href: entry.href ?? base?.href ?? '#',
      accent: entry.accent ?? base?.accent ?? 'from-slate-500 to-slate-700',
      status: entry.status ?? base?.status ?? 'planned',
      note: entry.note ?? base?.note,
    });
  }

  const merged = Array.from(map.values());
  const registryOrders = new Map(registry.map((entry) => [entry.id, entry.sortOrder ?? Number.MAX_SAFE_INTEGER]));
  return merged.sort((left, right) => (registryOrders.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (registryOrders.get(right.id) ?? Number.MAX_SAFE_INTEGER));
};
