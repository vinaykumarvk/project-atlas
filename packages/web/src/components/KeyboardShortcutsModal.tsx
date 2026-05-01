import { type CSSProperties } from 'react';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  key: string;
  description: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: 'j', description: 'Next case in list' },
  { key: 'k', description: 'Previous case in list' },
  { key: 'Enter', description: 'Open selected case' },
  { key: '/', description: 'Focus search' },
  { key: 'n', description: 'Add note (case detail)' },
  { key: 'Escape', description: 'Go back / close modal' },
];

/**
 * Modal displaying available keyboard shortcuts.
 * Triggered by the `?` key.
 */
export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={onClose} data-testid="shortcuts-modal-overlay">
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} data-testid="shortcuts-modal">
        <div style={headerStyle}>
          <h3 style={titleStyle}>Keyboard Shortcuts</h3>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close shortcuts modal">
            X
          </button>
        </div>
        <table style={tableStyle}>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.key}>
                <td style={keyCellStyle}>
                  <kbd style={kbdStyle}>{s.key}</kbd>
                </td>
                <td style={descCellStyle}>{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0,0,0,0.4)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
};

const modalStyle: CSSProperties = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  padding: '1.5rem',
  minWidth: '360px',
  maxWidth: '480px',
  boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '1rem',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: '1.1rem',
  fontWeight: 700,
};

const closeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '1rem',
  cursor: 'pointer',
  color: '#64748b',
  fontWeight: 700,
};

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const keyCellStyle: CSSProperties = {
  padding: '0.5rem 0.75rem',
  textAlign: 'right',
  width: '80px',
};

const descCellStyle: CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontSize: '0.875rem',
  color: '#475569',
};

const kbdStyle: CSSProperties = {
  display: 'inline-block',
  padding: '0.2rem 0.5rem',
  borderRadius: '4px',
  border: '1px solid #d1d5db',
  backgroundColor: '#f9fafb',
  fontFamily: 'monospace',
  fontSize: '0.8rem',
  fontWeight: 600,
  boxShadow: '0 1px 0 1px rgba(0,0,0,0.05)',
};
