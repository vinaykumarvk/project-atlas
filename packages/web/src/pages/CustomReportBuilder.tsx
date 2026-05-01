import { useState, useCallback, type CSSProperties, type DragEvent } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiGet, apiPost } from '../api/client';

interface ReportSchema {
  name: string;
  dimensions: string[];
  measures: string[];
  filters?: Record<string, string | string[]>;
  groupBy?: string[];
  orderBy?: string;
  limit?: number;
}

interface ReportResult {
  schema: ReportSchema;
  rows: Record<string, unknown>[];
  totalRows: number;
  generatedAt: string;
}

const CustomReportBuilder = () => {
  const [reportName, setReportName] = useState('');
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [selectedMeasures, setSelectedMeasures] = useState<string[]>([]);
  const [reportResult, setReportResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // FR-113.A1: Drag-and-drop state
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [draggedType, setDraggedType] = useState<'dimension' | 'measure' | null>(null);
  const [dimDropHighlight, setDimDropHighlight] = useState(false);
  const [measureDropHighlight, setMeasureDropHighlight] = useState(false);

  // FR-113.A1: Drag handlers
  const handleDragStart = useCallback((item: string, type: 'dimension' | 'measure') => (e: DragEvent) => {
    setDraggedItem(item);
    setDraggedType(type);
    e.dataTransfer.setData('text/plain', item);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDropOnDimensions = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDimDropHighlight(false);
    const item = e.dataTransfer.getData('text/plain') || draggedItem;
    if (item && draggedType === 'dimension' && !selectedDimensions.includes(item)) {
      setSelectedDimensions((prev) => [...prev, item]);
    }
    setDraggedItem(null);
    setDraggedType(null);
  }, [draggedItem, draggedType, selectedDimensions]);

  const handleDropOnMeasures = useCallback((e: DragEvent) => {
    e.preventDefault();
    setMeasureDropHighlight(false);
    const item = e.dataTransfer.getData('text/plain') || draggedItem;
    if (item && draggedType === 'measure' && !selectedMeasures.includes(item)) {
      setSelectedMeasures((prev) => [...prev, item]);
    }
    setDraggedItem(null);
    setDraggedType(null);
  }, [draggedItem, draggedType, selectedMeasures]);

  const handleDimDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (draggedType === 'dimension') setDimDropHighlight(true);
  }, [draggedType]);

  const handleDimDragLeave = useCallback(() => {
    setDimDropHighlight(false);
  }, []);

  const handleMeasureDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (draggedType === 'measure') setMeasureDropHighlight(true);
  }, [draggedType]);

  const handleMeasureDragLeave = useCallback(() => {
    setMeasureDropHighlight(false);
  }, []);

  // Fetch available dimensions and measures
  const { data: dimensionsData } = useQuery({
    queryKey: ['reports', 'dimensions'],
    queryFn: () => apiGet<{ data: string[] }>('/sla/reports/dimensions'),
  });

  const { data: measuresData } = useQuery({
    queryKey: ['reports', 'measures'],
    queryFn: () => apiGet<{ data: string[] }>('/sla/reports/measures'),
  });

  const availableDimensions = dimensionsData?.data ?? [
    'case_type', 'priority', 'status', 'assigned_fpr_id',
    'assigned_vendor_id', 'property_city', 'confidence_band', 'region',
  ];

  const availableMeasures = measuresData?.data ?? [
    'count', 'avg_tat', 'breach_rate', 'total_breached',
    'total_resolved', 'min_tat', 'max_tat',
  ];

  // Generate report mutation
  const generateMutation = useMutation({
    mutationFn: (schema: ReportSchema) =>
      apiPost<{ data: ReportResult }>('/sla/reports/execute', schema),
    onSuccess: (response) => {
      setReportResult(response.data);
      setError(null);
    },
    onError: (err: Error) => {
      setError(err.message);
      setReportResult(null);
    },
  });

  const toggleDimension = (dim: string) => {
    setSelectedDimensions((prev) =>
      prev.includes(dim)
        ? prev.filter((d) => d !== dim)
        : [...prev, dim],
    );
  };

  const toggleMeasure = (measure: string) => {
    setSelectedMeasures((prev) =>
      prev.includes(measure)
        ? prev.filter((m) => m !== measure)
        : [...prev, measure],
    );
  };

  const handleGenerate = () => {
    if (!reportName.trim()) {
      setError('Report name is required');
      return;
    }
    if (selectedDimensions.length === 0) {
      setError('At least one dimension is required');
      return;
    }
    if (selectedMeasures.length === 0) {
      setError('At least one measure is required');
      return;
    }

    setError(null);

    const schema: ReportSchema = {
      name: reportName,
      dimensions: selectedDimensions,
      measures: selectedMeasures,
      groupBy: selectedDimensions,
    };

    generateMutation.mutate(schema);
  };

  // Derive column headers from report result
  const columnHeaders = reportResult
    ? [...reportResult.schema.dimensions, ...reportResult.schema.measures]
    : [];

  return (
    <div style={styles.container} data-testid="custom-report-builder">
      <h2 style={styles.heading}>Custom Report Builder</h2>

      {/* Report Configuration */}
      <div style={styles.panel}>
        <h3 style={styles.panelTitle}>Report Configuration</h3>

        {/* Report Name */}
        <div style={styles.formGroup}>
          <label style={styles.label} htmlFor="report-name">Report Name</label>
          <input
            id="report-name"
            data-testid="report-name-input"
            type="text"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            placeholder="Enter report name..."
            style={styles.input}
          />
        </div>

        {/* Dimensions — draggable source cards */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Dimensions <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#94a3b8' }}>(click or drag)</span></label>
          <div style={styles.chipContainer} data-testid="dimension-selector">
            {availableDimensions.map((dim) => (
              <button
                key={dim}
                data-testid={`dim-${dim}`}
                draggable
                onDragStart={handleDragStart(dim, 'dimension')}
                onClick={() => toggleDimension(dim)}
                style={{
                  ...styles.chip,
                  cursor: 'grab',
                  backgroundColor: selectedDimensions.includes(dim)
                    ? 'var(--color-accent, #3b82f6)'
                    : 'var(--color-surface)',
                  color: selectedDimensions.includes(dim)
                    ? '#fff'
                    : 'var(--color-text)',
                  border: selectedDimensions.includes(dim)
                    ? '1px solid transparent'
                    : '1px solid var(--color-border)',
                }}
              >
                {dim}
              </button>
            ))}
          </div>
        </div>

        {/* Dimensions drop zone */}
        <div
          data-testid="dimension-drop-zone"
          onDragOver={handleDragOver}
          onDrop={handleDropOnDimensions}
          onDragEnter={handleDimDragEnter}
          onDragLeave={handleDimDragLeave}
          style={{
            ...styles.dropZone,
            borderColor: dimDropHighlight ? '#3b82f6' : '#d1d5db',
            backgroundColor: dimDropHighlight ? '#eff6ff' : '#f9fafb',
          }}
        >
          {selectedDimensions.length === 0
            ? 'Drop dimensions here'
            : selectedDimensions.map((d) => (
                <span key={d} style={styles.selectedTag}>
                  {d}
                  <button
                    aria-label={`Remove ${d}`}
                    onClick={() => toggleDimension(d)}
                    style={styles.removeTagBtn}
                  >
                    x
                  </button>
                </span>
              ))}
        </div>

        {/* Measures — draggable source cards */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Measures <span style={{ fontWeight: 400, fontSize: '0.75rem', color: '#94a3b8' }}>(click or drag)</span></label>
          <div style={styles.chipContainer} data-testid="measure-selector">
            {availableMeasures.map((measure) => (
              <button
                key={measure}
                data-testid={`measure-${measure}`}
                draggable
                onDragStart={handleDragStart(measure, 'measure')}
                onClick={() => toggleMeasure(measure)}
                style={{
                  ...styles.chip,
                  cursor: 'grab',
                  backgroundColor: selectedMeasures.includes(measure)
                    ? 'var(--color-accent, #3b82f6)'
                    : 'var(--color-surface)',
                  color: selectedMeasures.includes(measure)
                    ? '#fff'
                    : 'var(--color-text)',
                  border: selectedMeasures.includes(measure)
                    ? '1px solid transparent'
                    : '1px solid var(--color-border)',
                }}
              >
                {measure}
              </button>
            ))}
          </div>
        </div>

        {/* Measures drop zone */}
        <div
          data-testid="measure-drop-zone"
          onDragOver={handleDragOver}
          onDrop={handleDropOnMeasures}
          onDragEnter={handleMeasureDragEnter}
          onDragLeave={handleMeasureDragLeave}
          style={{
            ...styles.dropZone,
            borderColor: measureDropHighlight ? '#3b82f6' : '#d1d5db',
            backgroundColor: measureDropHighlight ? '#eff6ff' : '#f9fafb',
          }}
        >
          {selectedMeasures.length === 0
            ? 'Drop measures here'
            : selectedMeasures.map((m) => (
                <span key={m} style={styles.selectedTag}>
                  {m}
                  <button
                    aria-label={`Remove ${m}`}
                    onClick={() => toggleMeasure(m)}
                    style={styles.removeTagBtn}
                  >
                    x
                  </button>
                </span>
              ))}
        </div>

        {/* Error */}
        {error && (
          <p style={styles.errorText} data-testid="report-error">{error}</p>
        )}

        {/* Generate Button */}
        <button
          data-testid="generate-report-btn"
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
          style={styles.generateBtn}
        >
          {generateMutation.isPending ? 'Generating...' : 'Generate Report'}
        </button>
      </div>

      {/* Report Results */}
      {reportResult && (
        <div style={styles.panel} data-testid="report-results">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={styles.panelTitle}>{reportResult.schema.name}</h3>
            <span style={styles.resultMeta}>
              {reportResult.totalRows} rows | Generated at{' '}
              {new Date(reportResult.generatedAt).toLocaleString()}
            </span>
          </div>

          {reportResult.rows.length === 0 ? (
            <p style={styles.placeholderText}>No data found for this report configuration</p>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {columnHeaders.map((col) => (
                      <th key={col} style={styles.th}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportResult.rows.map((row, idx) => (
                    <tr key={idx}>
                      {columnHeaders.map((col) => (
                        <td key={col} style={styles.td}>
                          {row[col] !== undefined && row[col] !== null
                            ? String(row[col])
                            : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, CSSProperties> = {
  container: {
    padding: '0',
  },
  heading: {
    margin: '0 0 1.5rem 0',
    fontSize: '1.5rem',
    fontWeight: 700,
  },
  panel: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1.25rem',
    marginBottom: '1.5rem',
  },
  panelTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    margin: '0 0 1rem 0',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    marginBottom: '0.5rem',
    color: '#475569',
  },
  input: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '0.85rem',
    boxSizing: 'border-box',
  },
  chipContainer: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  chip: {
    padding: '0.35rem 0.75rem',
    borderRadius: '16px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontWeight: 500,
  },
  generateBtn: {
    padding: '0.6rem 1.5rem',
    backgroundColor: 'var(--color-accent, #3b82f6)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  errorText: {
    color: '#dc2626',
    fontSize: '0.85rem',
    margin: '0.5rem 0',
  },
  resultMeta: {
    fontSize: '0.75rem',
    color: '#94a3b8',
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.85rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.5rem 0.75rem',
    borderBottom: '2px solid var(--color-border)',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#475569',
  },
  td: {
    padding: '0.4rem 0.75rem',
    borderBottom: '1px solid var(--color-border)',
  },
  placeholderText: {
    margin: 0,
    fontSize: '0.875rem',
    color: '#94a3b8',
  },
  dropZone: {
    minHeight: '48px',
    padding: '0.5rem 0.75rem',
    border: '2px dashed #d1d5db',
    borderRadius: '8px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.4rem',
    alignItems: 'center',
    fontSize: '0.8rem',
    color: '#94a3b8',
    marginBottom: '1rem',
    transition: 'border-color 0.15s, background-color 0.15s',
  },
  selectedTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.3rem',
    padding: '0.25rem 0.6rem',
    borderRadius: '12px',
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  removeTagBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#1d4ed8',
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '0 2px',
    lineHeight: 1,
  },
};

export default CustomReportBuilder;
