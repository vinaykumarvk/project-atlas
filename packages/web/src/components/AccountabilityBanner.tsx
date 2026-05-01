import type { CSSProperties } from 'react';

interface AccountabilityBannerProps {
  confidenceBand?: string;
  llmMode?: string;
  modelVersion?: string;
}

/**
 * Non-dismissable advisory banner shown on case detail and triage pages.
 * Reminds officers that AI suggestions are advisory only and they hold
 * accountability for every decision made on a case.
 */
export function AccountabilityBanner({
  confidenceBand,
  llmMode,
  modelVersion,
}: AccountabilityBannerProps) {
  return (
    <div style={styles.banner}>
      <div style={styles.bannerContent}>
        <strong style={styles.bannerTitle}>Advisory Notice</strong>
        <span style={styles.bannerText}>
          You are the final accountable party for this case. AI suggestions are advisory.
        </span>
      </div>
      {(confidenceBand || llmMode || modelVersion) && (
        <div style={styles.meta}>
          {llmMode && (
            <span style={styles.metaTag}>
              LLM Mode: <strong>{llmMode}</strong>
            </span>
          )}
          {confidenceBand && (
            <span
              style={{
                ...styles.metaTag,
                backgroundColor:
                  confidenceBand === 'GREEN'
                    ? '#d1fae5'
                    : confidenceBand === 'AMBER'
                      ? '#fef3c7'
                      : '#fee2e2',
                color:
                  confidenceBand === 'GREEN'
                    ? '#065f46'
                    : confidenceBand === 'AMBER'
                      ? '#92400e'
                      : '#991b1b',
              }}
            >
              Confidence: <strong>{confidenceBand}</strong>
            </span>
          )}
          {modelVersion && (
            <span style={styles.metaTag}>
              Model: <strong>{modelVersion}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  banner: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  bannerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  bannerTitle: {
    fontSize: '0.8rem',
    color: '#93c5fd',
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
  },
  bannerText: {
    fontSize: '0.85rem',
    color: '#e2e8f0',
    lineHeight: 1.4,
  },
  meta: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  metaTag: {
    fontSize: '0.75rem',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    backgroundColor: '#f1f5f9',
    color: '#475569',
    whiteSpace: 'nowrap',
  },
};
