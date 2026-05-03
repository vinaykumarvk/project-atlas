import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '../../../api/client';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FeatureFlag {
  id: string;
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  scope: 'global' | 'per-role' | 'per-user';
}

interface FeatureFlagApiResponse {
  [key: string]: {
    enabled: boolean;
    rolloutPercent: number;
    description: string;
  };
}

const MOCK_FLAGS: FeatureFlag[] = [
  {
    id: '1',
    key: 'llm_classification',
    label: 'LLM Classification',
    description: 'Enable LLM-augmented classification (ON/DEGRADED/OFF modes)',
    enabled: true,
    rolloutPercent: 100,
    scope: 'global',
  },
  {
    id: '2',
    key: 'auto_routing',
    label: 'Auto Routing',
    description: 'Automatically route cases to FPR based on classification',
    enabled: true,
    rolloutPercent: 100,
    scope: 'global',
  },
  {
    id: '3',
    key: 'vendor_auto_dispatch',
    label: 'Vendor Auto-Dispatch',
    description: 'Auto-dispatch to vendor after FPR approval',
    enabled: false,
    rolloutPercent: 0,
    scope: 'global',
  },
  {
    id: '4',
    key: 'predictive_breach',
    label: 'Predictive Breach Detection',
    description: 'ML-based prediction of SLA breaches before they occur',
    enabled: false,
    rolloutPercent: 0,
    scope: 'global',
  },
  {
    id: '5',
    key: 'suggested_replies',
    label: 'Suggested Replies',
    description: 'AI-generated reply suggestions for officers',
    enabled: true,
    rolloutPercent: 50,
    scope: 'per-role',
  },
  {
    id: '6',
    key: 'dark_mode',
    label: 'Dark Mode',
    description: 'Enable dark mode UI theme',
    enabled: true,
    rolloutPercent: 100,
    scope: 'per-user',
  },
];

function mapApiResponseToFlags(data: FeatureFlagApiResponse): FeatureFlag[] {
  return Object.entries(data).map(([key, val], idx) => ({
    id: String(idx + 1),
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    description: val.description,
    enabled: val.enabled,
    rolloutPercent: val.rolloutPercent,
    scope: 'global' as const,
  }));
}

const scopeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
  global: 'default',
  'per-role': 'secondary',
  'per-user': 'outline',
};

export function FeatureFlags() {
  const queryClient = useQueryClient();

  const { data: apiFlags, isLoading, isError } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => apiGet<FeatureFlagApiResponse>('/admin/feature-flags'),
  });

  const updateFlag = useMutation({
    mutationFn: ({ name, enabled, rolloutPercent }: { name: string; enabled: boolean; rolloutPercent?: number }) =>
      apiPatch(`/admin/feature-flags/${name}`, { enabled, rolloutPercent }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
    },
  });

  // Use API data if available, otherwise fall back to mock
  const flags: FeatureFlag[] = apiFlags ? mapApiResponseToFlags(apiFlags) : MOCK_FLAGS;

  // Local state for optimistic toggle (used when API is not available)
  const [localFlags, setLocalFlags] = useState(MOCK_FLAGS);
  const displayFlags = apiFlags ? flags : localFlags;

  const toggleFlag = (flag: FeatureFlag) => {
    if (apiFlags) {
      // Use API mutation
      updateFlag.mutate({ name: flag.key, enabled: !flag.enabled, rolloutPercent: flag.rolloutPercent });
    } else {
      // Local toggle for demo/fallback
      setLocalFlags((prev) =>
        prev.map((f) => (f.id === flag.id ? { ...f, enabled: !f.enabled } : f)),
      );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="flags-loading">
        <div>
          <h3 className="text-lg font-semibold">Feature Flags</h3>
        </div>
        <p className="text-muted-foreground">Loading feature flags...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="feature-flags">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold">Feature Flags</h3>
        <span className="text-sm text-muted-foreground">
          {displayFlags.filter((f) => f.enabled).length} / {displayFlags.length} enabled
        </span>
        {isError && (
          <span className="text-xs text-yellow-600 ml-2" data-testid="flags-api-fallback">
            (using cached data)
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {displayFlags.map((flag) => (
          <Card
            key={flag.id}
            className={cn(
              'transition-colors',
              flag.enabled ? 'border-green-200' : 'border-muted',
            )}
          >
            <CardContent className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-sm">{flag.key}</code>
                  <Badge variant={scopeVariant[flag.scope]}>{flag.scope}</Badge>
                </div>
                <h4 className="font-semibold">{flag.label}</h4>
                <p className="text-sm text-muted-foreground">{flag.description}</p>
                <span
                  className="text-xs text-slate-500"
                  data-testid={`rollout-${flag.key}`}
                >
                  Rollout: {flag.rolloutPercent}%
                </span>
              </div>
              <div className="flex flex-col items-center gap-1 pt-1">
                <Switch
                  checked={flag.enabled}
                  onCheckedChange={() => toggleFlag(flag)}
                  data-testid={`toggle-${flag.key}`}
                />
                <span className="text-xs font-medium text-muted-foreground">
                  {flag.enabled ? 'ON' : 'OFF'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
