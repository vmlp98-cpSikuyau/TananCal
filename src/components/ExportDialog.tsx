import { useMemo, useRef, useState } from 'react';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { exportExcel, exportPdf, exportPng, safeFilename, type TableData } from '../lib/export';
import { errorMessage } from '../lib/utils';
import type { Person } from '../lib/types';

interface Props {
  title: string;
  subtitle?: string;
  columns: string[];
  /** Rows for the chosen member filter ("" = everyone). */
  buildRows: (filterKey: string) => string[][];
  /** Offer a member filter when provided. */
  people?: Person[];
  filterLabel?: string;
  onClose: () => void;
}

/** Preview-first export: choose a filter, generate the preview, then export as PNG / PDF / Excel. */
export function ExportDialog({ title, subtitle, columns, buildRows, people, filterLabel = 'Filter by member', onClose }: Props) {
  const toast = useToast();
  const [filter, setFilter] = useState('');
  const [previewFilter, setPreviewFilter] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  const ready = previewFilter === filter;
  const rows = useMemo(() => (previewFilter === null ? [] : buildRows(previewFilter)), [previewFilter, buildRows]);
  const who = filter ? people?.find((p) => p.key === filter)?.name : undefined;
  const fullSubtitle = [subtitle, who ? `Assigned to ${who}` : undefined].filter(Boolean).join(' · ');
  const data: TableData = { title, subtitle: fullSubtitle, columns, rows };
  const filename = safeFilename(`${title}${who ? `-${who}` : ''}`);

  async function go(kind: 'png' | 'pdf' | 'xlsx') {
    setBusy(kind);
    try {
      if (kind === 'png') await exportPng(previewRef.current!, filename);
      else if (kind === 'pdf') await exportPdf(data, filename);
      else await exportExcel(data, filename);
    } catch (e) {
      toast.push(errorMessage(e), 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <Modal title={`Export: ${title}`} onClose={onClose} wide>
      {people && (
        <label className="field">
          <span>{filterLabel}</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.key} value={p.key}>{p.name}{p.manual ? ' (manual)' : ''}</option>)}
          </select>
        </label>
      )}
      <div className="modal-actions left">
        <button className="btn" onClick={() => setPreviewFilter(filter)}>{ready ? 'Refresh preview' : 'Generate preview'}</button>
        {previewFilter !== null && !ready && <span className="muted">Filter changed. Regenerate the preview to export.</span>}
      </div>

      {previewFilter !== null && (
        <div className="export-preview-wrap">
          <div className="export-preview" ref={previewRef}>
            <h3>{title}</h3>
            {fullSubtitle && <p className="export-sub">{fullSubtitle}</p>}
            {rows.length ? (
              <table>
                <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c || '—'}</td>)}</tr>)}</tbody>
              </table>
            ) : (
              <p className="export-sub">Nothing to export for this selection.</p>
            )}
          </div>
        </div>
      )}

      <div className="modal-actions">
        <span className="muted export-hint">{ready ? '' : 'Generate a preview to enable export.'}</span>
        {(['png', 'pdf', 'xlsx'] as const).map((k) => (
          <button key={k} className="btn btn-primary" disabled={!ready || !rows.length || Boolean(busy)} onClick={() => go(k)}>
            {busy === k ? 'Exporting…' : k === 'xlsx' ? 'Excel' : k.toUpperCase()}
          </button>
        ))}
      </div>
    </Modal>
  );
}
