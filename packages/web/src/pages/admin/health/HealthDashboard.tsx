import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../api/client';

interface HealthMetric {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  value: string;
  detail: string;
}

interface QueueMetric {
  name: string;
  pending: number;
  processing: number;
  failed: number;
}

interface ErrorEntry {
  time: string;
  source: string;
  message: string;
}

interface HealthDetailedResponse {
  metrics: HealthMetric[];
  queues: QueueMetric[];
  errors: ErrorEntry[];
  lastUpdated: string;
}

const FALLBACK_METRICS: HealthMetric[] = [
  { name: 'API Server', status: 'healthy', value: '99.9%', detail: 'Uptime last 24h' },
  { name: 'Database', status: 'healthy', value: '12ms', detail: 'Avg query latency' },
  { name: 'Redis/Queue', status: 'healthy', value: '3', detail: 'Jobs in queue' },
  { name: 'Email Polling', status: 'healthy', value: '2 min', detail: 'Last poll age' },
  { name: 'LLM Provider', status: 'degraded', value: '850ms', detail: 'Avg latency (elevated)' },
  { name: 'S3 Storage', status: 'healthy', value: '100%', detail: 'Available' },
];

const FALLBACK_QUEUES: QueueMetric[] = [
  { name: 'email-ingest', pending: 2, processing: 1, failed: 0 },
  { name: 'classification', pending: 5, processing: 2, failed: 1 },
  { name: 'notifications', pending: 12, processing: 3, failed: 0 },
  { name: 'sla-evaluation', pending: 0, processing: 0, failed: 0 },
];

const FALLBACK_ERRORS: ErrorEntry[] = [
  { time: '10:23:45', source: 'classification', message: 'LLM timeout after 30s — fell back to distilled classifier' },
  { time: '09:55:12', source: 'email-ingest', message: 'Graph API rate limit (429) — retrying in 60s' },
];

export function HealthDashboard() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['health-detailed'],
    queryFn: () => apiGet<HealthDetailedResponse>('/health/detailed'),
    refetchInterval: 30000, // refresh every 30s
  });

  const metrics: HealthMetric[] = data?.metrics ?? FALLBACK_METRICS;
  const queues: QueueMetric[] = data?.queues ?? FALLBACK_QUEUES;
  const errors: ErrorEntry[] = data?.errors ?? FALLBACK_ERRORS;
  const lastUpdated = data?.lastUpdated ?? 'just now';

  if (isLoading) {
    return (
      <div className="health-dashboard" data-testid="health-loading">
        <div className="section-header">
          <h3>System Health</h3>
        </div>
        <p>Loading health metrics...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="health-dashboard" data-testid="health-error">
        <div className="section-header">
          <h3>System Health</h3>
        </div>
        <p style={{ color: '#dc2626' }}>
          Failed to load health data: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      </div>
    );
  }

  return (
    <div className="health-dashboard" data-testid="health-dashboard">
      <div className="section-header">
        <h3>System Health</h3>
        <span className="subtitle">Last updated: {lastUpdated}</span>
      </div>

      <div className="health-grid">
        {metrics.map((metric) => (
          <div key={metric.name} className={`health-card health-${metric.status}`}>
            <div className="health-indicator">
              <span className={`dot dot-${metric.status}`}></span>
              <span className="health-name">{metric.name}</span>
            </div>
            <div className="health-value">{metric.value}</div>
            <div className="health-detail">{metric.detail}</div>
          </div>
        ))}
      </div>

      <h4>Queue Status</h4>
      <table className="data-table">
        <thead>
          <tr>
            <th>Queue</th>
            <th>Pending</th>
            <th>Processing</th>
            <th>Failed</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {queues.map((q) => (
            <tr key={q.name}>
              <td><code>{q.name}</code></td>
              <td>{q.pending}</td>
              <td>{q.processing}</td>
              <td className={q.failed > 0 ? 'text-danger' : ''}>{q.failed}</td>
              <td>{q.pending + q.processing + q.failed}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>Recent Errors (last 1h)</h4>
      <div className="error-log">
        {errors.map((entry, idx) => (
          <div key={idx} className="error-entry">
            <span className="error-time">{entry.time}</span>
            <span className="error-source">{entry.source}</span>
            <span className="error-msg">{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
