import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/Modal';
import { PersonSelect } from '../../components/PersonSelect';
import { useDb, usePlan, useRun } from '../../lib/data';
import { fromLocalInput, toLocalInput } from '../../lib/dates';
import { personKey, splitPersonKey } from '../../lib/utils';
import type { Activity, EventRow } from '../../lib/types';

interface Props {
  event: EventRow;
  activity?: Activity;
  onClose: () => void;
}

export function ActivityModal({ event, activity, onClose }: Props) {
  const { people } = usePlan();
  const db = useDb();
  const run = useRun();
  const ppl = people(event.group_id);

  const [name, setName] = useState(activity?.name ?? '');
  const [description, setDescription] = useState(activity?.description ?? '');
  const [start, setStart] = useState(toLocalInput(activity?.starts_at ?? event.starts_at));
  const [end, setEnd] = useState(toLocalInput(activity?.ends_at ?? event.ends_at));
  const [leader, setLeader] = useState(activity ? personKey(activity.leader_user_id, activity.leader_manual_id) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Give the activity a name.');
    if (!start || !end) return setError('Set a start and end date/time.');
    if (new Date(end) < new Date(start)) return setError('The end must not be before the start.');
    const { user, manual } = splitPersonKey(leader);
    const payload = {
      name: name.trim(), description: description.trim(),
      starts_at: fromLocalInput(start), ends_at: fromLocalInput(end),
      leader_user_id: user, leader_manual_id: manual,
    };
    setBusy(true);
    const ok = await run(
      () => activity
        ? db.update('activities', activity.id, payload)
        : db.insert('activities', { event_id: event.id, group_id: event.group_id, ...payload }),
      activity ? 'Activity updated' : 'Activity added',
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal title={activity ? 'Edit activity' : 'Add activity'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>Activity name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
        </label>
        <label className="field"><span>Description <small className="muted">(optional)</small></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={3} />
        </label>
        <div className="field-row">
          <label className="field"><span>Starts</span>
            <input type="datetime-local" value={start} onChange={(e) => { setStart(e.target.value); if (end && new Date(end) < new Date(e.target.value)) setEnd(e.target.value); }} required />
          </label>
          <label className="field"><span>Ends</span>
            <input type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required />
          </label>
        </div>
        <PersonSelect label="Activity leader (optional)" people={ppl} value={leader} onChange={setLeader} emptyLabel="No leader" />
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save activity'}</button>
        </div>
      </form>
    </Modal>
  );
}
