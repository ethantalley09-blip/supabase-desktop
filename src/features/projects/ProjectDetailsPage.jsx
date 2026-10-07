import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, HelpCircle, Search } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ExportButton } from '@/features/export/ExportButton';
import { useAvailableTools } from '@/features/rbac/useAvailableTools';
import { useDashboardLayout, useSaveDashboardLayout } from '@/features/rbac/useDashboardLayout';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { AskLynx } from '@/features/workspace/AskLynx';
import { CommandPalette } from '@/features/workspace/CommandPalette';
import { buildNavIndex, pushRecent, togglePin } from '@/features/workspace/navMath';
import { NotificationBell } from '@/features/workspace/NotificationBell';
import { TabGuide } from '@/features/workspace/TabGuide';
import { readRecents, writeRecents } from '@/features/workspace/useWorkspace';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { supabase } from '@/lib/supabase/client';
import { ModeSwitch } from './ModeSwitch';
import { OverviewTab } from './tabs/OverviewTab';
import { useProject } from './useProjects';
// Every tab except Overview is code-split: the app paints with a small entry
// bundle and each tab's code (the Leaflet map, the AI suites, xlsx) downloads
// the first time it's opened — then it's cached. Overview stays eager so the
// landing view renders with zero extra round-trips.
const CommsTab = lazy(() => import('@/features/comms/CommsTab').then((m) => ({ default: m.CommsTab })));
const CompeteTab = lazy(() => import('@/features/compete/CompeteTab').then((m) => ({ default: m.CompeteTab })));
const ComplianceTab = lazy(() => import('@/features/compliance/ComplianceTab').then((m) => ({ default: m.ComplianceTab })));
const FundraisingTab = lazy(() => import('@/features/fundraising/FundraisingTab').then((m) => ({ default: m.FundraisingTab })));
const AiCenterTab = lazy(() => import('@/features/ai/AiCenterTab').then((m) => ({ default: m.AiCenterTab })));
const TurfTab = lazy(() => import('@/features/turf/TurfTab').then((m) => ({ default: m.TurfTab })));
const TeamTab = lazy(() => import('./tabs/TeamTab').then((m) => ({ default: m.TeamTab })));
const GoverningTab = lazy(() => import('@/features/governing/GoverningTab').then((m) => ({ default: m.GoverningTab })));
const TasksTab = lazy(() => import('@/features/workspace/TasksTab').then((m) => ({ default: m.TasksTab })));
const IntegrationsTab = lazy(() => import('@/features/integrations/IntegrationsTab').then((m) => ({ default: m.IntegrationsTab })));
function TabLoading() {
    return <p className="p-6 text-sm text-neutral-400">Loading…</p>;
}
const tabTriggerClass = 'rounded-md px-3 py-1.5 text-sm text-neutral-500 hover:text-neutral-900 data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-sm';
export function ProjectDetailsPage() {
    const { projectId } = useParams();
    const { data: project, isLoading, error } = useProject(projectId);
    const [tab, setTab] = useState('overview');
    // Paywalled tabs render only when the entitlement exists AND the viewer's
    // role can see that module -- a canvasser shouldn't see the fundraising
    // tab even on a project that paid for it. RLS is the enforcement layer;
    // these checks are presentation.
    const fundraisingEnt = useEntitlement(project?.org_id, 'fundraising_module', project?.id);
    const complianceEnt = useEntitlement(project?.org_id, 'compliance_module', project?.id);
    const canViewFundraising = useHasPermission(project?.org_id, 'fundraising.view');
    const canViewCompliance = useHasPermission(project?.org_id, 'compliance.view');
    const aiEnt = useEntitlement(project?.org_id, 'ai_module');
    const canUseAi = useHasPermission(project?.org_id, 'ai.use');
    const canViewCompete = useHasPermission(project?.org_id, 'compete.view');
    // Integrations reuses comms_paid_tier -- "analytics on an external
    // platform's data" is exactly what that entitlement already covers for
    // social scheduling.
    const integrationsEnt = useEntitlement(project?.org_id, 'comms_paid_tier');
    const canViewIntegrations = useHasPermission(project?.org_id, 'integrations.view');
    const showFundraising = Boolean(fundraisingEnt.data && canViewFundraising.data);
    const showCompliance = Boolean(complianceEnt.data && canViewCompliance.data);
    const showAi = Boolean(aiEnt.data && canUseAi.data);
    const showCompete = Boolean(canViewCompete.data);
    const showIntegrations = Boolean(integrationsEnt.data && canViewIntegrations.data);
    // Governing mode (0042): the Office tab exists only while the project is
    // governing. Switching back to campaign hides it but keeps every case.
    const canViewGoverning = useHasPermission(project?.org_id, 'governing.view');
    const canManageProjects = useHasPermission(project?.org_id, 'projects.manage');
    const showGoverning = Boolean(project?.mode === 'governing' && canViewGoverning.data);
    // One map of what this viewer can open, shared by Search & Jump, Ask
    // Lynx, Today, and the Launch Checklist so none of them ever offers a
    // destination that isn't there.
    const available = useMemo(() => ({
        fundraising: showFundraising,
        compliance: showCompliance,
        ai: showAi,
        compete: showCompete,
        integrations: showIntegrations,
        governing: showGoverning
    }), [showFundraising, showCompliance, showAi, showCompete, showIntegrations, showGoverning]);
    const { tools } = useAvailableTools(project?.org_id);
    const navIndex = useMemo(() => buildNavIndex({ available, tools }), [available, tools]);
    const navigate = useNavigate();
    // Pins follow the user across devices (stored in their dashboard layout
    // row); recents are per-device. Both hold nav-index ids.
    const { data: layout } = useDashboardLayout(project?.org_id);
    const saveLayout = useSaveDashboardLayout();
    const pinned = layout?.pinned ?? [];
    const onTogglePin = (id) => saveLayout.mutate({ orgId: project.org_id, layout: { ...(layout ?? {}), pinned: togglePin(pinned, id) } });
    const recentsKey = `lynx.recents.${projectId}`;
    const [recents, setRecents] = useState(() => readRecents(recentsKey));
    // The page instance survives a project-to-project route change (e.g.
    // from a notification), so reload that project's recents.
    useEffect(() => setRecents(readRecents(recentsKey)), [recentsKey]);
    const onChosen = (id) => {
        const next = pushRecent(recents, id);
        setRecents(next);
        writeRecents(recentsKey, next);
    };
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [askOpen, setAskOpen] = useState(false);
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setAskOpen(false);
                setPaletteOpen((o) => !o);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    // Deep link from an AI-dashboard card to its working tool: switch to the
    // hosting tab, then scroll once that tab's content has mounted. No-op if
    // the tab isn't available (e.g. fundraising module not purchased).
    const openTool = (loc) => {
        if (loc.tab === 'fundraising' && !showFundraising)
            return;
        if (loc.tab === 'compete' && !showCompete)
            return;
        if (loc.tab === 'integrations' && !showIntegrations)
            return;
        if (loc.tab === 'governing' && !showGoverning)
            return;
        if (loc.tab === 'compliance' && !showCompliance)
            return;
        if (loc.tab === 'ai' && !showAi)
            return;
        setTab(loc.tab);
        if (!loc.anchor) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        // Lazy tabs mount after their chunk downloads, so keep looking for the
        // anchor briefly instead of giving up after one try.
        let tries = 0;
        const find = () => {
            const el = document.getElementById(loc.anchor);
            if (el)
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else if (tries++ < 20)
                setTimeout(find, 100);
        };
        setTimeout(find, 50);
    };
    // A hidden tab (e.g. Office after switching back to campaign mode) falls
    // back to Overview rather than rendering an empty panel.
    const effectiveTab = tab === 'governing' && !showGoverning ? 'overview' : tab;
    if (isLoading)
        return <p className="p-8 text-sm text-neutral-500">Loading project…</p>;
    if (error || !project)
        return <p className="p-8 text-sm text-red-600">Project not found or access denied.</p>;
    const exportDatasets = [
        ...(showFundraising
            ? [
                {
                    id: 'donations',
                    label: 'Donations',
                    getRows: async () => {
                        const { data, error: donationsError } = await supabase
                            .from('donations')
                            .select('amount_cents, donated_at, payment_method, donors(full_name, email, employer, occupation)')
                            .eq('project_id', project.id)
                            .order('donated_at');
                        if (donationsError)
                            throw donationsError;
                        return (data ?? []).map((d) => ({
                            donor: d.donors?.full_name ?? '',
                            email: d.donors?.email ?? '',
                            employer: d.donors?.employer ?? '',
                            occupation: d.donors?.occupation ?? '',
                            amount_usd: (d.amount_cents / 100).toFixed(2),
                            donated_at: d.donated_at,
                            payment_method: d.payment_method ?? ''
                        }));
                    }
                }
            ]
            : []),
        {
            id: 'overview',
            label: 'Project overview',
            getRows: () => [
                {
                    name: project.name,
                    state: project.state ?? '',
                    status: project.status,
                    created_at: project.created_at
                }
            ]
        },
        {
            id: 'team',
            label: 'Team roster',
            getRows: async () => {
                const { data, error: teamError } = await supabase
                    .from('org_memberships')
                    .select('status, profiles(email, full_name), roles(name)')
                    .eq('org_id', project.org_id)
                    .eq('status', 'active');
                if (teamError)
                    throw teamError;
                return (data ?? []).map((m) => ({
                    email: m.profiles?.email ?? '',
                    name: m.profiles?.full_name ?? '',
                    role: m.roles?.name ?? ''
                }));
            }
        }
    ];
    return (<div className="min-h-screen bg-neutral-50">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-neutral-400 hover:text-neutral-700">
            <ArrowLeft className="h-4 w-4"/>
          </Link>
          <div>
            <h1 className="text-sm font-semibold text-neutral-900">{project.name}</h1>
            <p className="text-xs text-neutral-400">
              {project.state ? `${project.state} · ` : ''}
              {project.status}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPaletteOpen(true)} className="flex h-8 items-center gap-2 rounded-md border border-neutral-300 bg-white px-2.5 text-xs text-neutral-500 hover:bg-neutral-50" title="Search and jump anywhere (Ctrl/⌘ K)">
            <Search className="h-3.5 w-3.5"/>
            <span className="hidden sm:inline">Search</span>
            <kbd className="hidden rounded border border-neutral-200 px-1 text-[10px] sm:inline">Ctrl K</kbd>
          </button>
          <NotificationBell currentProjectId={project.id} onGo={openTool} navigate={navigate}/>
          <button type="button" onClick={() => { setPaletteOpen(false); setAskOpen(true); }} className="flex h-8 items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100" title="Ask how to do anything">
            <HelpCircle className="h-3.5 w-3.5"/>
            Ask Lynx
          </button>
          <ModeSwitch project={project} canManage={Boolean(canManageProjects.data)}/>
          <ExportButton datasets={exportDatasets} filePrefix={project.name.toLowerCase().replace(/\s+/g, '-')}/>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <Tabs.Root value={effectiveTab} onValueChange={setTab}>
          <Tabs.List className="mb-4 flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1">
            <Tabs.Trigger value="overview" className={tabTriggerClass}>
              Overview
            </Tabs.Trigger>
            {showGoverning && (<Tabs.Trigger value="governing" className={tabTriggerClass}>
                Office
              </Tabs.Trigger>)}
            <Tabs.Trigger value="tasks" className={tabTriggerClass}>
              Tasks
            </Tabs.Trigger>
            {showFundraising && (<Tabs.Trigger value="fundraising" className={tabTriggerClass}>
                Fundraising
              </Tabs.Trigger>)}
            <Tabs.Trigger value="comms" className={tabTriggerClass}>
              Comms
            </Tabs.Trigger>
            {showCompliance && (<Tabs.Trigger value="compliance" className={tabTriggerClass}>
                Compliance
              </Tabs.Trigger>)}
            <Tabs.Trigger value="turf" className={tabTriggerClass}>
              Turf Map
            </Tabs.Trigger>
            {showCompete && (<Tabs.Trigger value="compete" className={tabTriggerClass}>
                Compete
              </Tabs.Trigger>)}
            {showAi && (<Tabs.Trigger value="ai" className={tabTriggerClass}>
                AI Center
              </Tabs.Trigger>)}
            {showIntegrations && (<Tabs.Trigger value="integrations" className={tabTriggerClass}>
                Integrations
              </Tabs.Trigger>)}
            <Tabs.Trigger value="team" className={tabTriggerClass}>
              Team
            </Tabs.Trigger>
          </Tabs.List>

          <TabGuide tab={effectiveTab} index={navIndex} onGo={openTool}/>
          <Tabs.Content value="overview">
            <OverviewTab project={project} onOpenTool={openTool} available={available}/>
          </Tabs.Content>
          <Suspense fallback={<TabLoading />}>
          <Tabs.Content value="tasks">
            <TasksTab project={project} onGo={openTool}/>
          </Tabs.Content>
          {showGoverning && (<Tabs.Content value="governing">
              <GoverningTab project={project}/>
            </Tabs.Content>)}
          {showFundraising && (<Tabs.Content value="fundraising">
              <FundraisingTab project={project}/>
            </Tabs.Content>)}
          <Tabs.Content value="comms">
            <CommsTab project={project}/>
          </Tabs.Content>
          {showCompliance && (<Tabs.Content value="compliance">
              <ComplianceTab project={project}/>
            </Tabs.Content>)}
          <Tabs.Content value="turf">
            <TurfTab project={project}/>
          </Tabs.Content>
          {showCompete && (<Tabs.Content value="compete">
              <CompeteTab project={project}/>
            </Tabs.Content>)}
          {showAi && (<Tabs.Content value="ai">
              <AiCenterTab project={project} onOpenTool={openTool}/>
            </Tabs.Content>)}
          {showIntegrations && (<Tabs.Content value="integrations">
              <IntegrationsTab project={project}/>
            </Tabs.Content>)}
          <Tabs.Content value="team">
            <TeamTab orgId={project.org_id} projectId={project.id}/>
          </Tabs.Content>
          </Suspense>
        </Tabs.Root>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} index={navIndex} onGo={openTool} pinned={pinned} recents={recents} onTogglePin={onTogglePin} onChosen={onChosen}/>
      <AskLynx open={askOpen} onClose={() => setAskOpen(false)} orgId={project.org_id} projectId={project.id} index={navIndex} aiEnabled={showAi} onGo={openTool}/>
    </div>);
}
