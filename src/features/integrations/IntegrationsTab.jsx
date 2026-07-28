import { AlertTriangle, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { computeEventAttendance } from './eventAttendance';
import { computeMessagePerformance } from './messagePerformance';
import { computePetitionSignatures, computeSignatureVelocity } from './petitionSignatures';
import { useConnectors, useCreateConnector, useEventRegistrations, useMessageEvents, usePetitionSignatures, useSetConnectorStatus, useSyncConnector } from './useIntegrations';
const DOMAIN_LABELS = { messaging: 'Messaging', events: 'Events', petitions: 'Petitions' };
const WEBHOOK_PROVIDERS = [
    { value: 'generic_webhook', label: 'Generic webhook (any service)' },
    { value: 'twilio', label: 'Twilio (SMS status callbacks)' }
];
const POLL_PROVIDERS = [{ value: 'generic_api', label: 'Generic API (any REST endpoint)' }];
function webhookUrl(token) {
    const base = import.meta.env.VITE_SUPABASE_URL;
    return `${base}/functions/v1/integrations-webhook?token=${token}`;
}
// Third-party connectors (Twilio/SendGrid-class messaging, Eventbrite/
// Mobilize-class events, any petition platform) plus the three analytics
// domains they unlock. Lynx never sends messages, runs events, or collects
// petitions itself -- this only ingests what a campaign's real external
// tool already knows, via an inbound webhook or an on-demand API poll.
export function IntegrationsTab({ project }) {
    const canManage = useHasPermission(project.org_id, 'integrations.manage');
    const { data: connectors } = useConnectors(project.id);
    const createConnector = useCreateConnector();
    const setStatus = useSetConnectorStatus();
    const syncConnector = useSyncConnector();
    const { data: messageEvents } = useMessageEvents(project.id);
    const { data: eventRegistrations } = useEventRegistrations(project.id);
    const { data: petitionSignatures } = usePetitionSignatures(project.id);
    const messageStats = useMemo(() => computeMessagePerformance(messageEvents ?? []), [messageEvents]);
    const eventStats = useMemo(() => computeEventAttendance(eventRegistrations ?? []), [eventRegistrations]);
    const petitionStats = useMemo(() => computePetitionSignatures(petitionSignatures ?? []), [petitionSignatures]);
    const petitionVelocity = useMemo(() => computeSignatureVelocity(petitionSignatures ?? []), [petitionSignatures]);
    const [domain, setDomain] = useState('messaging');
    const [mode, setMode] = useState('webhook');
    const [provider, setProvider] = useState('generic_webhook');
    const [pollUrl, setPollUrl] = useState('');
    const [secret, setSecret] = useState('');
    const [copiedId, setCopiedId] = useState(null);
    const providerOptions = mode === 'webhook' ? WEBHOOK_PROVIDERS : POLL_PROVIDERS;
    const handleModeChange = (next) => {
        setMode(next);
        setProvider(next === 'webhook' ? 'generic_webhook' : 'generic_api');
    };
    const handleCreate = () => {
        createConnector.mutate({
            projectId: project.id,
            domain,
            provider,
            mode,
            config: mode === 'api_poll' ? { url: pollUrl.trim() } : {},
            secret: mode === 'api_poll' ? secret : undefined
        }, {
            onSuccess: () => {
                setPollUrl('');
                setSecret('');
            }
        });
    };
    const copyWebhook = (connector) => {
        navigator.clipboard?.writeText(webhookUrl(connector.webhook_token));
        setCopiedId(connector.id);
        setTimeout(() => setCopiedId(null), 1500);
    };
    return (<div className="space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-sm text-neutral-600">
          Connect the real tools your campaign already uses for texting/email, events, and
          petitions. Lynx never sends messages or hosts events/petitions itself — it only ingests
          what those tools report, so the advisor can answer questions about the real data.
        </p>
      </div>

      {canManage.data && (<div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Add a connector</p>
          <div className="flex flex-wrap gap-2">
            <select className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {Object.entries(DOMAIN_LABELS).map(([value, label]) => (<option key={value} value={value}>{label}</option>))}
            </select>
            <select className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm" value={mode} onChange={(e) => handleModeChange(e.target.value)}>
              <option value="webhook">Webhook (they push to Lynx)</option>
              <option value="api_poll">API poll (Lynx pulls from them)</option>
            </select>
            <select className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {providerOptions.map((p) => (<option key={p.value} value={p.value}>{p.label}</option>))}
            </select>
          </div>
          {mode === 'api_poll' && (<div className="flex flex-wrap gap-2">
              <Input placeholder="https://your-provider.example.com/api/events" value={pollUrl} onChange={(e) => setPollUrl(e.target.value)} className="min-w-[20rem] flex-1"/>
              <Input type="password" placeholder="API key (stored write-only — never shown again)" value={secret} onChange={(e) => setSecret(e.target.value)} className="min-w-[16rem] flex-1"/>
            </div>)}
          <Button size="sm" disabled={createConnector.isPending || (mode === 'api_poll' && !pollUrl.trim())} onClick={handleCreate}>
            {createConnector.isPending ? 'Adding…' : 'Add connector'}
          </Button>
          {createConnector.isError && <p className="text-sm text-red-600">{createConnector.error.message}</p>}
        </div>)}

      <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Connectors</p>
        {(connectors ?? []).length === 0 && <p className="text-sm text-neutral-400">No connectors yet.</p>}
        {(connectors ?? []).map((c) => (<div key={c.id} className="rounded-md border border-neutral-100 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-neutral-900">{DOMAIN_LABELS[c.domain]}</span>
              <span className="text-neutral-400">·</span>
              <span className="text-neutral-600">{c.provider}</span>
              <span className={c.status === 'active' ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700' : 'rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500'}>
                {c.status}
              </span>
              {c.last_synced_at && (<span className="text-xs text-neutral-400">last synced {new Date(c.last_synced_at).toLocaleString()}</span>)}
            </div>
            {c.mode === 'webhook' ? (<div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded-md bg-neutral-50 px-2 py-1 text-xs text-neutral-600">{webhookUrl(c.webhook_token)}</code>
                <Button size="sm" variant="outline" onClick={() => copyWebhook(c)}>
                  <Copy className="mr-1 h-3 w-3"/>{copiedId === c.id ? 'Copied' : 'Copy'}
                </Button>
              </div>) : canManage.data && (<div className="mt-2">
                <Button size="sm" variant="outline" disabled={syncConnector.isPending} onClick={() => syncConnector.mutate({ connectorId: c.id, projectId: project.id })}>
                  {syncConnector.isPending ? 'Syncing…' : 'Sync now'}
                </Button>
              </div>)}
            {canManage.data && (<button className="mt-2 text-xs text-neutral-400 hover:text-neutral-700" onClick={() => setStatus.mutate({ connectorId: c.id, projectId: project.id, status: c.status === 'active' ? 'disabled' : 'active' })}>
                {c.status === 'active' ? 'Disable' : 'Re-enable'}
              </button>)}
          </div>))}
        {syncConnector.isError && <p className="text-sm text-red-600">{syncConnector.error.message}</p>}
      </div>

      <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Message performance</p>
        {messageStats.length === 0 ? (<p className="text-sm text-neutral-400">No message events yet — connect a messaging connector above.</p>) : (<table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr><th className="py-1">Channel</th><th>Sent</th><th>Delivery</th><th>Open</th><th>Reply</th><th>Bounce</th></tr>
            </thead>
            <tbody>
              {messageStats.map((m) => (<tr key={m.channel} className="border-t border-neutral-100">
                  <td className="py-1 text-neutral-900">{m.channel}</td>
                  <td>{m.sent}</td>
                  <td>{m.deliveryRatePct}%</td>
                  <td>{m.openRatePct === null ? '—' : `${m.openRatePct}%`}</td>
                  <td>{m.replyRatePct === null ? '—' : `${m.replyRatePct}%`}</td>
                  <td>{m.bounceRatePct}%</td>
                </tr>))}
            </tbody>
          </table>)}
      </div>

      <div className="space-y-2 rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Event attendance</p>
        {eventStats.length === 0 ? (<p className="text-sm text-neutral-400">No event registrations yet — connect an events connector above.</p>) : (<table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr><th className="py-1">Event</th><th>Registered</th><th>Attended</th><th>No-show</th><th>Rate</th></tr>
            </thead>
            <tbody>
              {eventStats.map((e) => (<tr key={e.eventId} className="border-t border-neutral-100">
                  <td className="py-1 text-neutral-900">{e.name}</td>
                  <td>{e.registered}</td>
                  <td>{e.attended}</td>
                  <td>{e.noShow}</td>
                  <td>{e.attendanceRatePct}%</td>
                </tr>))}
            </tbody>
          </table>)}
      </div>

      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Petition signatures</p>
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"/>
          <div className="text-sm text-amber-900">
            <p className="font-medium">Not legal advice</p>
            <p className="mt-0.5 text-amber-800">
              Lynx only tallies what your external petition platform reports as signed. It does not
              validate signature eligibility or legality — that stays with your petition platform and
              counsel.
            </p>
          </div>
        </div>
        {petitionStats.length === 0 ? (<p className="text-sm text-neutral-400">No petition signatures yet — connect a petitions connector above.</p>) : (<>
            <p className="text-sm text-neutral-600">{petitionVelocity.count} real signature{petitionVelocity.count === 1 ? '' : 's'} in the last 7 days ({petitionVelocity.perDay}/day pace).</p>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr><th className="py-1">Petition</th><th>Signatures</th><th>First</th><th>Latest</th></tr>
              </thead>
              <tbody>
                {petitionStats.map((p) => (<tr key={p.petitionId} className="border-t border-neutral-100">
                    <td className="py-1 text-neutral-900">{p.name}</td>
                    <td>{p.totalSignatures}</td>
                    <td>{p.firstSignedAt ? new Date(p.firstSignedAt).toLocaleDateString() : '—'}</td>
                    <td>{p.lastSignedAt ? new Date(p.lastSignedAt).toLocaleDateString() : '—'}</td>
                  </tr>))}
              </tbody>
            </table>
          </>)}
      </div>
    </div>);
}
