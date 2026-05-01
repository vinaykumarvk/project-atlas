import { useState } from 'react';

interface RoutingRationaleProps {
  rationale: string;
  tier?: string;
  fprName?: string;
  workloadRatio?: number;
  fallbackChain?: string[];
  resolvedKeys?: Record<string, string>;
}

export function RoutingRationale({
  rationale,
  tier,
  fprName,
  workloadRatio,
  fallbackChain,
  resolvedKeys,
}: RoutingRationaleProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      data-testid="routing-rationale"
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        overflow: 'hidden',
        marginTop: 16,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '12px 16px',
          border: 'none',
          backgroundColor: '#f9fafb',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <span>Why this routing?</span>
        <span>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div style={{ padding: 16, fontSize: 14 }}>
          <div style={{ marginBottom: 12 }}>
            <strong>Rationale:</strong> {rationale}
          </div>

          {tier && (
            <div style={{ marginBottom: 8 }}>
              <strong>Matched Tier:</strong>{' '}
              <span style={{
                padding: '2px 8px',
                borderRadius: 4,
                backgroundColor: '#dbeafe',
                color: '#1d4ed8',
                fontSize: 12,
              }}>
                {tier}
              </span>
            </div>
          )}

          {fprName && (
            <div style={{ marginBottom: 8 }}>
              <strong>Assigned FPR:</strong> {fprName}
            </div>
          )}

          {workloadRatio !== undefined && (
            <div style={{ marginBottom: 8 }}>
              <strong>Workload Ratio:</strong> {(workloadRatio * 100).toFixed(0)}%
            </div>
          )}

          {resolvedKeys && Object.keys(resolvedKeys).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <strong>Resolved Keys:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                {Object.entries(resolvedKeys).map(([key, value]) => (
                  <li key={key}>{key}: {value || 'N/A'}</li>
                ))}
              </ul>
            </div>
          )}

          {fallbackChain && fallbackChain.length > 0 && (
            <div>
              <strong>Fallback Chain:</strong>
              <ol style={{ margin: '4px 0', paddingLeft: 20 }}>
                {fallbackChain.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
