import { AlertTriangle, TrendingUp, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useTopConnectors, useChurnRisk } from './useFundraisingAi';
export function DonorInsights({ orgId, projectId }) {
    const { data: connectors, isLoading: connectorsLoading } = useTopConnectors(orgId);
    const { data: atRisk, isLoading: riskLoading } = useChurnRisk(orgId);
    const stats = useMemo(() => {
        const totalCapacity = connectors?.reduce((sum, c) => sum + c.estimated_capacity_cents, 0) ?? 0;
        const atRiskValue = atRisk?.reduce((sum, d) => sum + (d.reactivation_ask_cents ?? 0), 0) ?? 0;
        return { totalCapacity: Math.round(totalCapacity / 100), atRiskValue: Math.round(atRiskValue / 100) };
    }, [connectors, atRisk]);
    return (<div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600"/>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Top Connectors</p>
          </div>
          <p className="mt-2 text-2xl font-semibold text-neutral-900">{connectors?.length || 0}</p>
          <p className="text-xs text-neutral-500">can activate networks</p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600"/>
            <p className="text-xs uppercase tracking-wide text-neutral-400">At-Risk Donors</p>
          </div>
          <p className="mt-2 text-2xl font-semibold text-neutral-900">{atRisk?.length || 0}</p>
          <p className="text-xs text-neutral-500">worth ${stats.atRiskValue.toLocaleString()} to reactivate</p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600"/>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Connector Capacity</p>
          </div>
          <p className="mt-2 text-2xl font-semibold text-neutral-900">${stats.totalCapacity.toLocaleString()}</p>
          <p className="text-xs text-neutral-500">potential lifetime value</p>
        </div>
      </div>

      {/* Top Connectors */}
      {!connectorsLoading && connectors && connectors.length > 0 && (<div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-neutral-900">Top Network Connectors</h3>
            <p className="text-xs text-neutral-500">Donors who can bring in their networks</p>
          </div>
          <div className="divide-y divide-neutral-100">
            {connectors.slice(0, 5).map((c) => (<div key={c.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-neutral-900">Connector Score: {(c.connector_score * 100).toFixed(0)}%</p>
                  <p className="text-xs text-neutral-500">Capacity: ${(c.estimated_capacity_cents / 100).toLocaleString()}</p>
                </div>
                <Button size="sm" variant="outline">
                  Activate
                </Button>
              </div>))}
          </div>
        </div>)}

      {/* At-Risk Donors */}
      {!riskLoading && atRisk && atRisk.length > 0 && (<div className="overflow-hidden rounded-lg border border-red-200 bg-red-50">
          <div className="border-b border-red-200 px-4 py-3">
            <h3 className="text-sm font-semibold text-red-900">Donors at Risk of Churning</h3>
            <p className="text-xs text-red-700">{atRisk.length} donors haven't given in 6+ months</p>
          </div>
          <div className="divide-y divide-red-200">
            {atRisk.slice(0, 5).map((d) => (<div key={d.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-900">Risk: {(d.risk_score * 100).toFixed(0)}%</p>
                  <p className="text-xs text-red-700">{d.days_since_gift || 0} days since last gift ({d.predicted_churn_reason})</p>
                  <p className="text-xs text-red-600">Suggested ask to restart: ${((d.reactivation_ask_cents ?? 0) / 100).toLocaleString()}</p>
                </div>
                <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-100">
                  Win Back
                </Button>
              </div>))}
          </div>
        </div>)}
    </div>);
}
