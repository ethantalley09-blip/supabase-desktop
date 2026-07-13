import { Eye, EyeOff, GripVertical, LayoutDashboard } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  arrangeTools,
  reorderTools,
  type ToolCategory,
  type ToolDefinition
} from '@/features/rbac/toolRegistry';
import { useAvailableTools } from '@/features/rbac/useAvailableTools';
import { useDashboardLayout, useSaveDashboardLayout } from '@/features/rbac/useDashboardLayout';

const CATEGORY_LABEL: Record<ToolCategory, string> = {
  general: 'General',
  turf: 'Turf',
  comms: 'Comms',
  fundraising: 'Fundraising'
};

// Where each tool's full UI lives, so a card can say so (tools hosted right
// here on the AI Center scroll into view on click instead).
const LOCAL_ANCHORS: Record<string, string> = {
  ask_data: 'tool-ask_data',
  smart_segments: 'tool-smart_segments',
  campaign_coach: 'tool-campaign_coach',
  message_studio: 'tool-message_studio',
  content_pack: 'tool-content_pack'
};
const TAB_HINT: Record<ToolCategory, string> = {
  general: 'AI Center',
  turf: 'Turf Map tab',
  comms: 'Comms tab',
  fundraising: 'Fundraising tab'
};

// The per-role AI dashboard: only the tools this role's permissions unlock
// (filterTools), organized under category tabs, drag-and-drop to reorder,
// eye-toggle to hide/show. Arrangement persists per user per org.
export function AiDashboard({ orgId }: { orgId: string }) {
  const { tools } = useAvailableTools(orgId);
  const { data: layout } = useDashboardLayout(orgId);
  const save = useSaveDashboardLayout();
  const [activeCat, setActiveCat] = useState<ToolCategory | 'all'>('all');
  const [dragId, setDragId] = useState<string | null>(null);

  const { visible, hiddenTools } = useMemo(() => arrangeTools(tools, layout), [tools, layout]);
  const cats = useMemo(
    () => (['general', 'turf', 'comms', 'fundraising'] as ToolCategory[]).filter((c) => tools.some((t) => t.category === c)),
    [tools]
  );
  const shown = activeCat === 'all' ? visible : visible.filter((t) => t.category === activeCat);

  const persist = (order: string[], hidden: string[]) => save.mutate({ orgId, layout: { order, hidden } });

  const onDrop = (targetId: string) => {
    if (!dragId) return;
    const nextOrder = reorderTools(visible.map((t) => t.id), dragId, targetId);
    persist(nextOrder, layout?.hidden ?? []);
    setDragId(null);
  };

  const hide = (id: string) =>
    persist(visible.map((t) => t.id).filter((v) => v !== id), [...(layout?.hidden ?? []), id]);
  const show = (id: string) =>
    persist([...visible.map((t) => t.id), id], (layout?.hidden ?? []).filter((h) => h !== id));

  const open = (tool: ToolDefinition) => {
    const anchor = LOCAL_ANCHORS[tool.id];
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (tools.length === 0) return null;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="h-4 w-4 text-neutral-600" />
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
          Your AI dashboard ({visible.length} tools)
        </p>
      </div>
      <p className="text-xs text-neutral-500">
        Curated to your role. Drag cards to arrange, use the eye to hide tools you don't use — your
        layout is saved automatically and is yours alone.
      </p>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveCat('all')}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            activeCat === 'all' ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100'
          }`}
        >
          All
        </button>
        {cats.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setActiveCat(c)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              activeCat === c ? 'bg-neutral-900 text-white' : 'border border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            {CATEGORY_LABEL[c]}
          </button>
        ))}
      </div>

      {/* Draggable tool cards */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((tool) => (
          <div
            key={tool.id}
            draggable
            onDragStart={() => setDragId(tool.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => onDrop(tool.id)}
            onDragEnd={() => setDragId(null)}
            className={`group cursor-grab rounded-md border bg-white p-3 active:cursor-grabbing ${
              dragId === tool.id ? 'border-violet-400 opacity-60' : 'border-neutral-200 hover:border-neutral-300'
            }`}
          >
            <div className="flex items-start justify-between gap-1">
              <button type="button" className="min-w-0 text-left" onClick={() => open(tool)}>
                <p className="truncate text-sm font-medium text-neutral-900">{tool.label}</p>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  title="Hide from my dashboard"
                  onClick={() => hide(tool.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <EyeOff className="h-3.5 w-3.5 text-neutral-400 hover:text-neutral-700" />
                </button>
                <GripVertical className="h-3.5 w-3.5 text-neutral-300" />
              </div>
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-neutral-500">{tool.description}</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              {LOCAL_ANCHORS[tool.id] ? 'Below on this page' : TAB_HINT[tool.category]}
            </p>
          </div>
        ))}
      </div>

      {/* Hidden tools — one click to bring back */}
      {hiddenTools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-neutral-500">Hidden:</span>
          {hiddenTools.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => show(t.id)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-500 hover:bg-white"
            >
              <Eye className="h-3 w-3" />
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
