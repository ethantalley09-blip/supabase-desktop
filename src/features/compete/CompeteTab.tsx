import { Swords } from 'lucide-react';
import type { Project } from '@/features/projects/useProjects';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { ContrastBuilder } from './ContrastBuilder';
import { DebatePrep } from './DebatePrep';
import { FilingGap } from './FilingGap';
import { InterviewPrep } from './InterviewPrep';
import { MistakeResponse } from './MistakeResponse';
import { OpponentDigest } from './OpponentDigest';
import { OpponentLog } from './OpponentLog';
import { RapidRebuttal } from './RapidRebuttal';
import { RedTeam } from './RedTeam';
import { useOpponentRecords } from './useCompete';

// Compete tab: opposition research done the defensible way. Staff log the
// opponent's PUBLIC record by hand (statements, votes, ads, filings — with
// date + source); every tool works only off those entries. No scraping, no
// automated monitoring, no personal-life material — and the AI prompts
// enforce issues-only criticism server-side.
export function CompeteTab({ project }: { project: Project }) {
  const { data: records } = useOpponentRecords(project.id);
  const aiEnt = useEntitlement(project.org_id, 'ai_module');
  const canUseAi = useHasPermission(project.org_id, 'ai.use');
  const showAi = Boolean(aiEnt.data && canUseAi.data);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Swords className="h-5 w-5 text-indigo-600" />
        <h2 className="text-base font-semibold text-neutral-900">Compete</h2>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
          Opposition research
        </span>
      </div>

      {/* The ground rules, stated up front — this is the product's ethic */}
      <div className="rounded-md border-l-4 border-indigo-500 bg-indigo-50 p-3 text-xs text-indigo-900">
        <span className="font-semibold">How this works:</span> your team logs what the opponent said
        or did <span className="font-semibold">publicly</span> — a statement, a vote, an ad, a
        filing — with the date and source. Every tool below runs only on what you logged. Nothing is
        scraped, and every draft criticizes positions, never the person.
      </div>

      {/* Step 1: the data foundation */}
      <div id="tool-opponent_log">
        <OpponentLog orgId={project.org_id} projectId={project.id} records={records} />
      </div>

      {/* Works with zero AI setup: public filing comparison, pure math */}
      <div id="tool-filing_gap">
        <FilingGap projectId={project.id} />
      </div>

      {showAi ? (
        <>
          <div id="tool-rapid_rebuttal">
            <RapidRebuttal orgId={project.org_id} projectId={project.id} records={records} />
          </div>
          <div id="tool-contrast_builder">
            <ContrastBuilder orgId={project.org_id} projectId={project.id} records={records} />
          </div>
          <div id="tool-opponent_digest">
            <OpponentDigest orgId={project.org_id} projectId={project.id} records={records} />
          </div>
          <div id="tool-debate_prep">
            <DebatePrep orgId={project.org_id} projectId={project.id} records={records} />
          </div>
          <div id="tool-red_team">
            <RedTeam orgId={project.org_id} projectId={project.id} />
          </div>
          <div id="tool-mistake_response">
            <MistakeResponse orgId={project.org_id} projectId={project.id} />
          </div>
          <div id="tool-interview_prep">
            <InterviewPrep orgId={project.org_id} projectId={project.id} />
          </div>
        </>
      ) : (
        <p className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-400">
          The AI tools on this tab (rebuttal, contrast, digest, debate prep, red team, mistake
          response, interview prep) unlock with the AI module.
        </p>
      )}
    </div>
  );
}
