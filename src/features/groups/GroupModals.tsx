import { useState, type FormEvent } from 'react';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { EmojiPicker } from '../../components/EmojiPicker';
import { useDb, usePlan, useRun } from '../../lib/data';
import { exportCsv, exportJson, safeFilename } from '../../lib/export';
import { fmtDateTime } from '../../lib/dates';
import { assigneeKey, personName } from '../../lib/utils';
import type { Group } from '../../lib/types';

export function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (g: Group) => void }) {
  const db = useDb();
  const run = useRun();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('📅');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Give your group a name.');
    setBusy(true);
    let created: Group | undefined;
    const ok = await run(async () => {
      const rows = await db.insert('groups', { name: name.trim(), emoji, description: description.trim() });
      created = rows[0] as unknown as Group;
      await db.refresh('group_members');
    }, 'Group created');
    setBusy(false);
    if (ok && created) { onClose(); onCreated(created); }
  }

  return (
    <Modal title="Create group" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>Group name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </label>
        <div className="field"><span>Icon</span><EmojiPicker value={emoji} onChange={setEmoji} label="Group icon" /></div>
        <label className="field"><span>Description <small className="muted">(optional)</small></span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function GroupSettingsModal({ group, onClose, onDeleted }: { group: Group; onClose: () => void; onDeleted: () => void }) {
  const { roleIn, events, activities, equipment, food, ingredients, manual, people, members, profiles } = usePlan();
  const db = useDb();
  const run = useRun();
  const role = roleIn(group.id);
  const canEdit = role === 'owner' || role === 'admin';
  const isOwner = role === 'owner';

  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [description, setDescription] = useState(group.description);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [transferTo, setTransferTo] = useState('');
  const [confirmTransfer, setConfirmTransfer] = useState(false);

  const ppl = people(group.id);
  const otherMembers = members.filter((m) => m.group_id === group.id && m.role !== 'owner');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Give your group a name.');
    if (await run(() => db.update('groups', group.id, { name: name.trim(), emoji, description: description.trim() }), 'Group updated')) onClose();
  }

  function backupJson() {
    exportJson(
      {
        exportedAt: new Date().toISOString(),
        group: { name: group.name, emoji: group.emoji, description: group.description },
        members: members.filter((m) => m.group_id === group.id).map((m) => ({ name: profiles.get(m.user_id)?.display_name || m.display_name, role: m.role })),
        manualMembers: manual.filter((m) => m.group_id === group.id).map((m) => m.name),
        events: events.filter((e) => e.group_id === group.id),
        activities: activities.filter((a) => a.group_id === group.id),
        equipment: equipment.filter((e) => e.group_id === group.id),
        food: food.filter((f) => f.group_id === group.id),
        ingredients: ingredients.filter((i) => i.group_id === group.id),
      },
      `${safeFilename(group.name)}-backup`,
    );
  }

  function csvs() {
    const evName = (id: string | null) => events.find((e) => e.id === id)?.name ?? '';
    const base = safeFilename(group.name);
    exportCsv(
      ['Event', 'Description', 'Location', 'Starts', 'Ends'],
      events.filter((e) => e.group_id === group.id).map((e) => [e.name, e.description, e.location, e.starts_at, e.ends_at]),
      `${base}-events`,
    );
    exportCsv(
      ['Equipment', 'Assigned to', 'Event', 'Packed'],
      equipment.filter((e) => e.group_id === group.id).map((e) => [e.name, personName(ppl, assigneeKey(e)), evName(e.event_id), e.packed ? 'Yes' : 'No']),
      `${base}-equipment`,
    );
    exportCsv(
      ['Food', 'Meal time', 'Assigned to', 'Event', 'Ingredients'],
      food.filter((f) => f.group_id === group.id).map((f) => [
        f.name, fmtDateTime(f.meal_at), personName(ppl, assigneeKey(f)), evName(f.event_id),
        ingredients.filter((i) => i.food_id === f.id).map((i) => i.name).join('; '),
      ]),
      `${base}-food`,
    );
  }

  return (
    <Modal title="Group settings" onClose={onClose} wide>
      {canEdit ? (
        <form onSubmit={save} noValidate>
          <label className="field"><span>Group name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
          </label>
          <div className="field"><span>Icon</span><EmojiPicker value={emoji} onChange={setEmoji} label="Group icon" /></div>
          <label className="field"><span>Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={3} />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="modal-actions left"><button className="btn btn-primary">Save changes</button></div>
        </form>
      ) : (
        <p className="muted">Only the owner or an admin can edit group details.</p>
      )}

      <h3>Backup &amp; export</h3>
      <div className="row-gap">
        <button className="btn" onClick={backupJson}>Download JSON backup</button>
        <button className="btn" onClick={csvs}>Download CSVs (events, equipment, food)</button>
      </div>

      {isOwner && otherMembers.length > 0 && (
        <>
          <h3>Transfer ownership</h3>
          <div className="inline-form">
            <select aria-label="New owner" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
              <option value="">Choose a member…</option>
              {otherMembers.map((m) => <option key={m.user_id} value={m.user_id}>{profiles.get(m.user_id)?.display_name || m.display_name || 'Member'}</option>)}
            </select>
            <button className="btn" disabled={!transferTo} onClick={() => setConfirmTransfer(true)}>Transfer</button>
          </div>
        </>
      )}

      <h3>Danger zone</h3>
      <div className="row-gap">
        {!isOwner && <button className="btn btn-danger-ghost" onClick={() => setConfirmLeave(true)}>Leave group</button>}
        {isOwner && <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>Delete group</button>}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete group" danger confirmLabel="Delete group permanently" requireText={group.name}
          message={<>This permanently deletes <strong>{group.name}</strong> and all of its events, activities, equipment and food for every member. This cannot be undone.</>}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            if (await run(async () => { await db.remove('groups', group.id); await Promise.all((['group_members', 'events', 'activities', 'equipment', 'food', 'ingredients', 'manual_members', 'group_invites'] as const).map((t) => db.refresh(t))); }, 'Group deleted')) { onClose(); onDeleted(); }
          }}
        />
      )}
      {confirmLeave && (
        <ConfirmDialog
          title="Leave group" danger confirmLabel="Leave group"
          message={<>Leave <strong>{group.name}</strong>? You will lose access unless you are invited again.</>}
          onClose={() => setConfirmLeave(false)}
          onConfirm={async () => { if (await run(() => db.rpc('leave_group', { p_group_id: group.id }), 'You left the group')) { onClose(); onDeleted(); } }}
        />
      )}
      {confirmTransfer && (
        <ConfirmDialog
          title="Transfer ownership" confirmLabel="Transfer ownership"
          message={<>You will become an admin and the selected member will own <strong>{group.name}</strong>.</>}
          onClose={() => setConfirmTransfer(false)}
          onConfirm={async () => { if (await run(() => db.rpc('transfer_group_ownership', { p_group_id: group.id, p_new_owner: transferTo }), 'Ownership transferred')) { setConfirmTransfer(false); onClose(); } }}
        />
      )}
    </Modal>
  );
}
