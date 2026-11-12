import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { PersonSelect } from '../../components/PersonSelect';
import { ExportDialog } from '../../components/ExportDialog';
import { useDb, usePlan, useRun } from '../../lib/data';
import { assigneeKey, assigneePatch, personName } from '../../lib/utils';
import type { Equipment } from '../../lib/types';

interface Props {
  groupId: string;
  /** When set, the panel is scoped to one event (used inside the event window). */
  eventId?: string;
}

export function EquipmentPanel({ groupId, eventId }: Props) {
  const { equipment, events, food, people } = usePlan();
  const db = useDb();
  const run = useRun();
  const ppl = people(groupId);
  const [eventFilter, setEventFilter] = useState('');
  const [editing, setEditing] = useState<Equipment | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Equipment | null>(null);
  const [exporting, setExporting] = useState(false);

  const groupEvents = useMemo(() => events.filter((e) => e.group_id === groupId).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [events, groupId]);
  const scopeEvent = eventId ?? (eventFilter || undefined);
  const items = useMemo(
    () => equipment
      .filter((e) => e.group_id === groupId && (scopeEvent === undefined || (scopeEvent === 'none' ? e.event_id === null : e.event_id === scopeEvent)))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [equipment, groupId, scopeEvent],
  );
  const eventName = (id: string | null) => groupEvents.find((e) => e.id === id)?.name ?? 'No event';
  const foodName = (id: string | null) => food.find((f) => f.id === id)?.name ?? '';

  const buildRows = useCallback(
    (filterKey: string) =>
      items
        .filter((i) => !filterKey || assigneeKey(i) === filterKey)
        .map((i) => [i.name, personName(ppl, assigneeKey(i)), eventName(i.event_id), foodName(i.food_id), i.packed ? 'Yes' : 'No']),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, ppl.length, groupEvents, food],
  );

  return (
    <section>
      <div className="section-head">
        <h3>Equipment</h3>
        <div className="row-gap">
          {!eventId && (
            <select aria-label="Filter by event" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
              <option value="">All events</option>
              {groupEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              <option value="none">No event</option>
            </select>
          )}
          <button className="btn" onClick={() => setExporting(true)} disabled={!items.length}>Export</button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add equipment</button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="empty">No equipment yet. Add what the group needs to bring.</p>
      ) : (
        <ul className="list">
          {items.map((i) => (
            <li key={i.id} className="list-item">
              <label className="check">
                <input
                  type="checkbox"
                  checked={i.packed}
                  onChange={(e) => run(() => db.update('equipment', i.id, { packed: e.target.checked }))}
                />
                <span className="sr-only">Packed</span>
              </label>
              <div className="grow">
                <div className={i.packed ? 'struck' : ''}><strong>{i.name}</strong></div>
                <div className="muted small">
                  {personName(ppl, assigneeKey(i)) || 'Unassigned'}
                  {!eventId && ` · ${eventName(i.event_id)}`}
                  {i.food_id && ` · for ${foodName(i.food_id)}`}
                </div>
              </div>
              <button className="btn btn-small" onClick={() => setEditing(i)}>Edit</button>
              <button className="btn btn-small btn-danger-ghost" onClick={() => setDeleting(i)} aria-label={`Delete ${i.name}`}>Delete</button>
            </li>
          ))}
        </ul>
      )}

      {editing && <EquipmentForm groupId={groupId} eventId={eventId} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title="Delete equipment" danger confirmLabel="Delete"
          message={<>Remove <strong>{deleting.name}</strong> from the list?</>}
          onClose={() => setDeleting(null)}
          onConfirm={async () => { if (await run(() => db.remove('equipment', deleting.id), 'Equipment deleted')) setDeleting(null); }}
        />
      )}
      {exporting && (
        <ExportDialog
          title={`Equipment${eventId ? ` — ${eventName(eventId)}` : eventFilter && eventFilter !== 'none' ? ` — ${eventName(eventFilter)}` : ''}`}
          columns={['Equipment', 'Assigned to', 'Event', 'For food', 'Packed']}
          buildRows={buildRows}
          people={ppl}
          onClose={() => setExporting(false)}
        />
      )}
    </section>
  );
}

function EquipmentForm({ groupId, eventId, item, onClose }: { groupId: string; eventId?: string; item?: Equipment; onClose: () => void }) {
  const { events, food, people } = usePlan();
  const db = useDb();
  const run = useRun();
  const ppl = people(groupId);
  const groupEvents = events.filter((e) => e.group_id === groupId);
  const groupFood = food.filter((f) => f.group_id === groupId && (!eventId || f.event_id === eventId));

  const [name, setName] = useState(item?.name ?? '');
  const [who, setWho] = useState(item ? assigneeKey(item) : '');
  const [evt, setEvt] = useState(item?.event_id ?? eventId ?? '');
  const [foodId, setFoodId] = useState(item?.food_id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Give the equipment a name.');
    const payload = { name: name.trim(), event_id: evt || null, food_id: foodId || null, ...assigneePatch(who) };
    setBusy(true);
    const ok = await run(
      () => item ? db.update('equipment', item.id, payload) : db.insert('equipment', { group_id: groupId, ...payload }),
      item ? 'Equipment updated' : 'Equipment added',
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal title={item ? 'Edit equipment' : 'Add equipment'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>Equipment name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
        </label>
        <PersonSelect label="Assigned to" people={ppl} value={who} onChange={setWho} />
        {!eventId && (
          <label className="field"><span>Event</span>
            <select value={evt} onChange={(e) => setEvt(e.target.value)}>
              <option value="">No specific event</option>
              {groupEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        )}
        <label className="field"><span>Used for food <small className="muted">(optional)</small></span>
          <select value={foodId} onChange={(e) => setFoodId(e.target.value)}>
            <option value="">Not tied to food</option>
            {groupFood.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}
