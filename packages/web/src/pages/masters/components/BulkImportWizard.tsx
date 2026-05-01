import { useState } from 'react';

interface BulkImportWizardProps {
  masterKey: string;
  onClose: () => void;
}

type WizardStep = 'upload' | 'validate' | 'review' | 'submit';

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export function BulkImportWizard({ masterKey, onClose }: BulkImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [validCount, setValidCount] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
  };

  const handleValidate = () => {
    // Simulate validation
    setErrors([
      { row: 3, field: 'pin_prefix', message: 'Must be exactly 3 digits' },
      { row: 7, field: 'canonical_form', message: 'Required field is empty' },
    ]);
    setValidCount(8);
    setStep('review');
  };

  const handleSubmit = () => {
    setSubmitted(true);
    setStep('submit');
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer drawer-wide" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>Bulk Import: {masterKey.replace(/_/g, ' ')}</h3>
          <button className="drawer-close" onClick={onClose}>X</button>
        </div>

        <div className="drawer-body">
          {/* Step indicators */}
          <div className="wizard-steps">
            {(['upload', 'validate', 'review', 'submit'] as WizardStep[]).map((s, i) => (
              <div
                key={s}
                className={`wizard-step ${step === s ? 'active' : ''} ${
                  ['upload', 'validate', 'review', 'submit'].indexOf(step) > i ? 'done' : ''
                }`}
              >
                <span className="step-number">{i + 1}</span>
                <span className="step-label">{s.charAt(0).toUpperCase() + s.slice(1)}</span>
              </div>
            ))}
          </div>

          {step === 'upload' && (
            <div className="wizard-content">
              <p>Upload a CSV or Excel file with master data records.</p>
              <div className="upload-area">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                />
                {file && <p className="file-info">Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>}
              </div>
              <button
                className="btn-primary"
                disabled={!file}
                onClick={() => { setStep('validate'); handleValidate(); }}
              >
                Upload & Validate
              </button>
            </div>
          )}

          {step === 'review' && (
            <div className="wizard-content">
              <div className="validation-summary">
                <div className="summary-card success">
                  <span className="count">{validCount}</span>
                  <span className="label">Valid rows</span>
                </div>
                <div className="summary-card error">
                  <span className="count">{errors.length}</span>
                  <span className="label">Errors</span>
                </div>
              </div>

              {errors.length > 0 && (
                <div className="error-table">
                  <h4>Validation Errors</h4>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Field</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {errors.map((err, i) => (
                        <tr key={i}>
                          <td>{err.row}</td>
                          <td>{err.field}</td>
                          <td>{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button className="btn-ghost btn-sm">Download Errors CSV</button>
                </div>
              )}

              <div className="wizard-actions">
                <button className="btn-secondary" onClick={() => setStep('upload')}>
                  Re-upload
                </button>
                <button className="btn-primary" onClick={handleSubmit} disabled={validCount === 0}>
                  Submit {validCount} rows for Approval
                </button>
              </div>
            </div>
          )}

          {step === 'submit' && submitted && (
            <div className="wizard-content">
              <div className="success-state">
                <h4>Batch Submitted Successfully</h4>
                <p>{validCount} records have been submitted for maker-checker approval.</p>
                <p>They will appear in the Approver Inbox for review.</p>
                <button className="btn-primary" onClick={onClose}>
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
