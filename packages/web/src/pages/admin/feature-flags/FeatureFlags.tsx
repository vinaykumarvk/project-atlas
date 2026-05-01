import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '../../../api/client';

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
      <div className="feature-flags" data-testid="flags-loading">
        <div className="section-header">
          <h3>Feature Flags</h3>
        </div>
        <p>Loading feature flags...</p>
      </div>
    );
  }

  return (
    <div className="feature-flags" data-testid="feature-flags">
      <div className="section-header">
        <h3>Feature Flags</h3>
        <span className="subtitle">{displayFlags.filter((f) => f.enabled).length} / {displayFlags.length} enabled</span>
        {isError && (
          <span style={{ color: '#ca8a04', fontSize: '0.75rem', marginLeft: '0.5rem' }} data-testid="flags-api-fallback">
            (using cached data)
          </span>
        )}
      </div>

      <div className="flags-list">
        {displayFlags.map((flag) => (
          <div key={flag.id} className={`flag-card ${flag.enabled ? 'enabled' : 'disabled'}`}>
            <div className="flag-info">
              <div className="flag-header">
                <code className="flag-key">{flag.key}</code>
                <span className={`scope-badge scope-${flag.scope}`}>{flag.scope}</span>
              </div>
              <h4 className="flag-label">{flag.label}</h4>
              <p className="flag-desc">{flag.description}</p>
              <span className="flag-rollout" data-testid={`rollout-${flag.key}`} style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Rollout: {flag.rolloutPercent}%
              </span>
            </div>
            <div className="flag-toggle">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={flag.enabled}
                  onChange={() => toggleFlag(flag)}
                  data-testid={`toggle-${flag.key}`}
                />
                <span className="toggle-slider"></span>
              </label>
              <span className="toggle-label">{flag.enabled ? 'ON' : 'OFF'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
