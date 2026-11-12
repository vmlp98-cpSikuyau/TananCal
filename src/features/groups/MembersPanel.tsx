import { useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../../components/Modal';
import { Avatar } from '../../components/Avatar';
import { useDb, usePlan, useRun } from '../../lib/data';
import { fmtDateTime } from '../../lib/dates';
import { isValidEmail, memberName } from '../../lib/utils';
import type { GroupMember } from '../../lib/types';

export function MembersPanel({ groupId }: { groupId: string }) {
  const { members, invites, manual, profiles, roleIn, uid } = usePlan();
  const db = useDb();
  const run = useRun();
  const role = roleIn(groupId);
  const isOwner = role === 'owner';
  const isAdmin = role === 'owner' || role === 'admin';

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [manualName, setManualName] = useState('');
  const [removing, setRemoving] = useState<GroupMember | null>(null);

  const mine = members.filter((m) => m.group_id === groupId).sort((a, b) => ({ owner: 0, admin: 1, member: 2 })[a.role] - ({ owner: 0, admin: 1, member: 2 })[b.role] || memberName(a, profiles).localeCompare(memberName(b, profiles)));
  const mineManual = manual.filter((m) => m.group_id === groupId);
  const groupInvites = invites.filter((i) => i.group_id === groupId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pending = groupInvites.filter((i) => i.status === 'pending' && new Date(i.expires_at) > new Date());
  const declined = groupInvites.filter((i) => i.status === 'declined');

  async function invite(e: FormEvent) {
    e.preventDefault();
    setEmailError('');
    if (!isValidEmail(email)) return setEmailError('Enter a valid email address.');
    if (await run(() => db.rpc('send_group_invite', { p_group_id: groupId, p_email: email }), 'Invitation sent')) setEmail('');
  }

  async function addManual(e: FormEvent) {
    e.preventDefault();
    if (!manualName.trim()) return;
    if (await run(() => db.insert('manual_members', { group_id: groupId, name: manualName.trim() }), 'Member added')) setManualName('');
  }

  return (
    <section>
      <div className="section-head"><h3>Members ({mine.length})</h3></div>
      <ul className="list">
        {mine.map((m) => {
          const p = profiles.get(m.user_id);
          const name = memberName(m, profiles);
          const canRemove = m.user_id !== uid && m.role !== 'owner' && (isOwner || (isAdmin && m.role === 'member'));
          return (
            <li key={m.user_id} className="list-item">
              <Avatar name={name} emoji={p?.emoji} url={p?.avatar_url} />
              <div className="grow">
                <strong>{name}</strong>{m.user_id === uid && <span className="muted"> (you)</span>}
                <div className="muted small">Joined {fmtDateTime(m.joined_at)}</div>
              </div>
              <span className={`badge badge-${m.role}`}>{m.role}</span>
              {isOwner && m.role !== 'owner' && (
                <button className="btn btn-small" onClick={() => run(() => db.rpc('set_group_member_role', { p_group_id: groupId, p_user_id: m.user_id, p_role: m.role === 'admin' ? 'member' : 'admin' }), m.role === 'admin' ? 'Admin removed' : 'Admin assigned')}>
                  {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                </button>
              )}
              {canRemove && <button className="btn btn-small btn-danger-ghost" onClick={() => setRemoving(m)}>Remove</button>}
            </li>
          );
        })}
      </ul>

      {isAdmin && (
        <>
          <h3>Invite by email</h3>
          <form className="inline-form" onSubmit={invite} noValidate>
            <input type="email" aria-label="Invitee email" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn-primary">Send invite</button>
          </form>
          {emailError && <div className="form-error" role="alert">{emailError}</div>}
          <p className="muted small">They will see an invitation after signing in with that email address. Invitations expire after 14 days.</p>

          {pending.length > 0 && (
            <>
              <h4>Pending invitations</h4>
              <ul className="list">
                {pending.map((i) => (
                  <li key={i.id} className="list-item">
                    <div className="grow">{i.email}<div className="muted small">Sent {fmtDateTime(i.created_at)}</div></div>
                    <button className="btn btn-small" onClick={() => run(() => db.rpc('cancel_group_invite', { p_invite_id: i.id }), 'Invitation cancelled')}>Cancel</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {declined.length > 0 && (
            <>
              <h4>Declined invitations</h4>
              <ul className="list">
                {declined.map((i) => (
                  <li key={i.id} className="list-item">
                    <div className="grow">{i.email} <span className="badge badge-declined">declined</span>
                      <div className="muted small">{i.responded_at ? fmtDateTime(i.responded_at) : ''}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <h3>People without an account</h3>
      <p className="muted small">Add a named person (for example a child) so tasks can be assigned to them.</p>
      {mineManual.length > 0 && (
        <ul className="list">
          {mineManual.map((m) => (
            <li key={m.id} className="list-item">
              <Avatar name={m.name} size={32} />
              <div className="grow">{m.name}</div>
              <button className="btn btn-small btn-danger-ghost" aria-label={`Remove ${m.name}`} onClick={() => run(() => db.remove('manual_members', m.id), 'Member removed')}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={addManual}>
        <input aria-label="Name" placeholder="Name" value={manualName} maxLength={80} onChange={(e) => setManualName(e.target.value)} />
        <button className="btn" disabled={!manualName.trim()}>Add person</button>
      </form>

      {removing && (
        <ConfirmDialog
          title="Remove member" danger confirmLabel="Remove"
          message={<>Remove <strong>{memberName(removing, profiles)}</strong> from the group? Their assignments will become unassigned.</>}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            if (await run(async () => { await db.rpc('remove_group_member', { p_group_id: groupId, p_user_id: removing.user_id }); await Promise.all((['equipment', 'food', 'ingredients', 'activities'] as const).map((t) => db.refresh(t))); }, 'Member removed')) setRemoving(null);
          }}
        />
      )}
    </section>
  );
}
