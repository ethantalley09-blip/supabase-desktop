import { CloudOff, DatabaseZap, ServerCog, ShieldCheck, Upload, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { DoorAttributeRow, QueuedCapture, VisitRow, VoterRow } from './doorIntelligence.types';
import { drain, queueSize, stuckItems } from './offlineQueue';
import { useBackfillPlan, useFirewallCheck, useServiceHealth } from './useScoringService';

// Operations panel for the Python scoring service and the offline queue.
//
// Everything here is diagnostic or explicitly-triggered. The service is
// optional by design: the same maths runs in-app (doorAttributes.js,
// walkListScore.js), so this panel degrades to "not running" rather than
// breaking canvassing.
interface Props {
    voters: VoterRow[];
    visits: VisitRow[];
    attributes: DoorAttributeRow[];
    /** Sends one queued capture; supplied by the caller so this stays testable. */
    onFlushCapture: (item: QueuedCapture) => Promise<void>;
}

export function ScoringServicePanel({ voters, visits, attributes, onFlushCapture }: Props) {
    const health = useServiceHealth();
    const backfill = useBackfillPlan();
    const firewall = useFirewallCheck();
    const [pending, setPending] = useState(() => queueSize());
    const [stuck, setStuck] = useState(() => stuckItems().length);
    const [flushing, setFlushing] = useState(false);
    const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

    const refreshQueue = useCallback(() => {
        setPending(queueSize());
        setStuck(stuckItems().length);
    }, []);

    const flush = useCallback(async () => {
        setFlushing(true);
        try {
            await drain(onFlushCapture);
        } finally {
            setFlushing(false);
            refreshQueue();
        }
    }, [onFlushCapture, refreshQueue]);

    // Drain automatically the moment connectivity returns — a canvasser who
    // walks back into signal should not have to know this panel exists.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const goOnline = () => {
            setOnline(true);
            void flush();
        };
        const goOffline = () => setOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        const poll = window.setInterval(refreshQueue, 5000);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
            window.clearInterval(poll);
        };
    }, [flush, refreshQueue]);

    const serviceUp = health.data?.status === 'ok';

    return (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4" id="tool-scoring_service">
            <div className="flex items-center gap-2">
                <ServerCog className="h-4 w-4 text-neutral-600" />
                <h3 className="text-sm font-semibold text-neutral-900">Door Intelligence operations</h3>
                <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        serviceUp ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-600'
                    }`}
                >
                    {health.isLoading ? 'checking…' : serviceUp ? 'scoring service up' : 'scoring service not running'}
                </span>
            </div>

            {!serviceUp && !health.isLoading && (
                <p className="text-xs text-neutral-500">
                    Scoring still works — the same calculations run in the app. The service adds the backfill
                    planner and the firewall check below. Start it with{' '}
                    <code className="rounded bg-neutral-100 px-1">uvicorn python_svc.main:app --port 8555</code>.
                </p>
            )}

            {/* ---- Offline capture queue ---- */}
            <div className="rounded-md border border-neutral-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        {online ? (
                            <DatabaseZap className="h-4 w-4 text-neutral-500" />
                        ) : (
                            <WifiOff className="h-4 w-4 text-amber-600" />
                        )}
                        <span className="text-sm font-medium text-neutral-900">
                            {pending === 0
                                ? 'All door conditions saved'
                                : `${pending} door${pending === 1 ? '' : 's'} queued`}
                        </span>
                        {!online && <span className="text-xs text-amber-700">offline</span>}
                    </div>
                    {pending > 0 && (
                        <Button size="sm" variant="outline" onClick={() => void flush()} disabled={flushing}>
                            {flushing ? 'Sending…' : 'Send now'}
                        </Button>
                    )}
                </div>
                {stuck > 0 && (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-700">
                        <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {stuck} capture{stuck === 1 ? ' has' : 's have'} failed repeatedly. Nothing was lost —
                        they stay queued — but something is rejecting the write.
                    </p>
                )}
                <p className="mt-1.5 text-xs text-neutral-400">
                    Captures made without signal are held locally and sent when you reconnect. Each carries its
                    own id, so a resend can never double-log a visit.
                </p>
            </div>

            {/* ---- Class firewall check ---- */}
            <div className="rounded-md border border-neutral-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-neutral-500" />
                        <span className="text-sm font-medium text-neutral-900">Safety-data firewall check</span>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!serviceUp || firewall.isPending}
                        onClick={() => firewall.mutate({ attributes, visits, voters })}
                    >
                        {firewall.isPending ? 'Checking…' : 'Run check'}
                    </Button>
                </div>
                <p className="mt-1.5 text-xs text-neutral-400">
                    Confirms that safety observations are being withheld from routing, timing, and scoring on
                    this project&rsquo;s real data — not just in tests.
                </p>
                {firewall.data && (
                    <p
                        className={`mt-1.5 text-sm ${
                            firewall.data.routingContainsSafety ? 'text-red-700' : 'text-emerald-700'
                        }`}
                    >
                        {firewall.data.routingContainsSafety
                            ? '⚠ Safety data reached routing. This is a bug — report it.'
                            : `✓ ${firewall.data.safetyConditionsWithheld} safety observation${
                                  firewall.data.safetyConditionsWithheld === 1 ? '' : 's'
                              } withheld from routing; ${firewall.data.visibleToRouting} of ${
                                  firewall.data.totalConditions
                              } conditions visible.`}
                    </p>
                )}
                {firewall.isError && <p className="mt-1.5 text-sm text-red-600">{firewall.error.message}</p>}
            </div>

            {/* ---- Backfill planner (dry run) ---- */}
            <div className="rounded-md border border-neutral-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-neutral-500" />
                        <span className="text-sm font-medium text-neutral-900">
                            Find conditions in older notes
                        </span>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={!serviceUp || backfill.isPending}
                        onClick={() => backfill.mutate({ voters, existing_attributes: attributes })}
                    >
                        {backfill.isPending ? 'Scanning…' : 'Preview'}
                    </Button>
                </div>
                <p className="mt-1.5 text-xs text-neutral-400">
                    Scans free-text door notes written before conditions were structured. Preview only — nothing
                    is written until you say so.
                </p>
                {backfill.data && (
                    <div className="mt-2 space-y-1.5 text-sm">
                        <p className="text-neutral-800">
                            Scanned {backfill.data.notesScanned} notes · would create{' '}
                            <span className="font-medium">{backfill.data.wouldCreate}</span> condition
                            {backfill.data.wouldCreate === 1 ? '' : 's'}
                            {backfill.data.skippedBecauseRealObservationExists > 0 &&
                                ` · skipped ${backfill.data.skippedBecauseRealObservationExists} already observed for real`}
                        </p>
                        {Object.keys(backfill.data.byTag).length > 0 && (
                            <p className="text-xs text-neutral-600">
                                {Object.entries(backfill.data.byTag)
                                    .map(([tag, count]) => `${tag.replace(/_/g, ' ')}: ${count}`)
                                    .join(' · ')}
                            </p>
                        )}
                        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-neutral-600">
                            {backfill.data.hits.slice(0, 25).map((hit, i) => (
                                <li key={`${hit.voterId}-${hit.tag}-${i}`}>
                                    <span className="font-medium capitalize">{hit.addressKey}</span> —{' '}
                                    {hit.tag.replace(/_/g, ' ')} from &ldquo;{hit.excerpt}&rdquo;
                                </li>
                            ))}
                        </ul>
                        <p className="text-xs text-amber-700">{backfill.data.caveat}</p>
                    </div>
                )}
                {backfill.isError && <p className="mt-1.5 text-sm text-red-600">{backfill.error.message}</p>}
            </div>
        </div>
    );
}
