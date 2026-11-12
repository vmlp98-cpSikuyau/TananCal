import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { useDb, usePlan, useRun } from '../../lib/data';
import { defaultRange, fromLocalInput, toLocalInput } from '../../lib/dates';
import type { EventRow } from '../../lib/types';

interface Props {
  event?: EventRow;
  defaultGroupId?: string;
  defaultDate?: Date;
  onClose: () => void;
  onSaved?: (ev: EventRow, created: boolean) => void;
}

export function EventFormModal({ event, defaultGroupId, defaultDate, onClose, onSaved }: Props) {
  const { groups } = usePlan();
  const db = useDb();
  const run = useRun();
  const range = defaultRange(defaultDate);

  const [groupId, setGroupId] = useState(event?.group_id ?? defaultGroupId ?? groups[0]?.id ?? '');
  const [name, setName] = useState(event?.name ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [start, setStart] = useState(event ? toLocalInput(event.starts_at) : range.start);
  const [end, setEnd] = useState(event ? toLocalInput(event.ends_at) : range.end);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function onStart(v: string) {
    setStart(v);
    // Keep the end after the start while the user is still picking dates.
    if (v && end && new Date(end) < new Date(v)) setEnd(v);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!groupId) return setError('Choose a group.');
    if (!name.trim()) return setError('Give the event a name.');
    if (!start || !end) return setError('Set a start and end date/time.');
    if (new Date(end) < new Date(start)) return setError('The end must not be before the start.');
    setBusy(true);
    const payload = {
      name: name.trim(), description: description.trim(), location: location.trim(),
      starts_at: fromLocalInput(start), ends_at: fromLocalInput(end),
    };
    let saved: EventRow | undefined;
    const ok = await run(async () => {
      if (event) {
        await db.update('events', event.id, payload);
        saved = { ...event, ...payload };
      } else {
        const rows = await db.insert('events', { group_id: groupId, ...payload });
        saved = rows[0] as unknown as EventRow;
      }
    }, event ? 'Event updated' : 'Event created');
    setBusy(false);
    if (ok && saved) {
      onClose();
      onSaved?.(saved, !event);
    }
  }

  if (!groups.length) {
    return (
      <Modal title="Plan an event" onClose={onClose}>
        <p>You need to belong to a group before you can plan an event. Create one from the Groups page.</p>
      </Modal>
    );
  }

  return (
    <Modal title={event ? 'Edit event' : 'Plan new event'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field">
          <span>Group</span>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={Boolean(event)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Event name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Starts</span>
            <input type="datetime-local" value={start} onChange={(e) => onStart(e.target.value)} required />
          </label>
          <label className="field">
            <span>Ends</span>
            <input type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>
        <label className="field">
          <span>Location <small className="muted">(optional)</small></span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
        </label>
        <label className="field">
          <span>Description <small className="muted">(optional)</small></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={3} />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : event ? 'Save changes' : 'Create event'}</button>
        </div>
      </form>
    </Modal>
  );
}
