import { useState } from 'react';

interface ProposeChangeDrawerProps {
  masterKey: string;
  existingData: Record<string, unknown> | null;
  onClose: () => void;
  onSubmit: () => void;
}

export function ProposeChangeDrawer({ masterKey, existingData, onClose, onSubmit }: ProposeChangeDrawerProps) {
  const [formData, setFormData] = useState<Record<string, string>>(
    existingData
      ? Object.fromEntries(Object.entries(existingData).map(([k, v]) => [k, String(v)]))
      : {},
  );
  const [effectiveAt, setEffectiveAt] = useState('');

  const isEdit = existingData !== null;
  const title = isEdit ? 'Propose Edit' : 'Propose New Record';

  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In production: POST to /v1/masters/:masterName/changes
    onSubmit();
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h3>{title}</h3>
          <span className="drawer-subtitle">Master: {masterKey.replace(/_/g, ' ')}</span>
          <button className="drawer-close" onClick={onClose}>X</button>
        </div>

        <form className="drawer-body" onSubmit={handleSubmit}>
          {Object.entries(formData)
            .filter(([key]) => key !== 'id')
            .map(([key, value]) => (
              <div className="form-field" key={key}>
                <label htmlFor={key}>{key.replace(/_/g, ' ')}</label>
                <input
                  id={key}
                  type="text"
                  value={value}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                />
              </div>
            ))}

          <div className="form-field">
            <label htmlFor="effective_at">Effective From (optional)</label>
            <input
              id="effective_at"
              type="date"
              value={effectiveAt}
              onChange={(e) => setEffectiveAt(e.target.value)}
            />
          </div>

          {isEdit && existingData && (
            <div className="diff-preview">
              <h4>Changes Preview</h4>
              <div className="diff-list">
                {Object.entries(formData)
                  .filter(([key, val]) => key !== 'id' && String(existingData[key]) !== val)
                  .map(([key, val]) => (
                    <div key={key} className="diff-item">
                      <span className="diff-field">{key}:</span>
                      <span className="diff-old">{String(existingData[key])}</span>
                      <span className="diff-arrow">&rarr;</span>
                      <span className="diff-new">{val}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="drawer-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Submit for Approval
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
