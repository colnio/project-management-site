/**
 * PropertyEditor — inline key/value editor for a JSONB object.
 * Values are parsed as JSON when possible, otherwise kept as strings.
 * Shared by the sample detail page (sample.properties) and the experiment
 * dashboard / create dialog (experiment.parameters).
 */
import { useState } from 'react';

interface PropertyEditorProps {
  properties: Record<string, unknown>;
  onChange: (props: Record<string, unknown>) => void;
}

export function PropertyEditor({ properties, onChange }: PropertyEditorProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [addMode, setAddMode] = useState(false);

  const entries = Object.entries(properties);

  const updateValue = (key: string, rawVal: string) => {
    let parsed: unknown = rawVal;
    try { parsed = JSON.parse(rawVal); } catch { /* keep string */ }
    onChange({ ...properties, [key]: parsed });
    setEditingKey(null);
  };

  const removeKey = (key: string) => {
    const next = { ...properties };
    delete next[key];
    onChange(next);
  };

  const addEntry = () => {
    if (!newKey.trim()) return;
    let parsed: unknown = newVal;
    try { parsed = JSON.parse(newVal); } catch { /* keep string */ }
    onChange({ ...properties, [newKey.trim()]: parsed });
    setNewKey('');
    setNewVal('');
    setAddMode(false);
  };

  const displayValue = (v: unknown) => {
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  };

  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {entries.length === 0 && !addMode && (
        <div style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted-2)' }}>
          No properties
        </div>
      )}

      {entries.map(([key, val]) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--line)', gap: 10, minHeight: 38 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ember)', flex: '0 0 140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {key}
          </span>
          <span style={{ fontSize: 11, color: 'var(--muted-2)', flex: '0 0 auto', marginRight: 4 }}>:</span>
          {editingKey === key ? (
            <input
              autoFocus
              defaultValue={displayValue(val)}
              onBlur={e => updateValue(key, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') updateValue(key, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditingKey(null); }}
              style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12.5, background: 'var(--paper-2)', border: '1px solid var(--ember-soft)', borderRadius: 4, padding: '2px 8px', outline: 'none' }}
            />
          ) : (
            <span
              onClick={() => setEditingKey(key)}
              style={{ flex: 1, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink)', cursor: 'text', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={displayValue(val)}
            >
              {displayValue(val)}
            </span>
          )}
          <button onClick={() => removeKey(key)} className="icon-btn" style={{ fontSize: 11, color: 'var(--bad)', flexShrink: 0 }}>✕</button>
        </div>
      ))}

      {addMode ? (
        <div style={{ display: 'flex', gap: 8, padding: '8px 14px', background: 'var(--paper-2)', borderTop: entries.length > 0 ? '1px solid var(--line)' : undefined }}>
          <input
            placeholder="key"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 4, padding: '3px 8px', width: 120, outline: 'none' }}
          />
          <span style={{ color: 'var(--muted-2)', alignSelf: 'center' }}>:</span>
          <input
            placeholder="value or JSON"
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addEntry(); if (e.key === 'Escape') setAddMode(false); }}
            style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 4, padding: '3px 8px', flex: 1, outline: 'none' }}
          />
          <button className="top-btn primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={addEntry}>Add</button>
          <button className="icon-btn" onClick={() => { setAddMode(false); setNewKey(''); setNewVal(''); }}>✕</button>
        </div>
      ) : (
        <div style={{ borderTop: entries.length > 0 ? '1px solid var(--line)' : undefined }}>
          <button
            onClick={() => setAddMode(true)}
            style={{ display: 'block', width: '100%', padding: '8px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)', textAlign: 'left', background: 'transparent', borderRadius: 0 }}
          >
            + Add property
          </button>
        </div>
      )}
    </div>
  );
}
