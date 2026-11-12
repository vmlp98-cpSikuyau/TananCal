import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePlan } from '../../lib/data';
import { fmtRange } from '../../lib/dates';
import { CreateGroupModal, GroupSettingsModal } from './GroupModals';
import { MembersPanel } from './MembersPanel';
import { EquipmentPanel } from '../equipment/EquipmentPanel';
import { FoodPanel } from '../food/FoodPanel';
import { EventDetail } from '../events/EventDetail';
import { EventFormModal } from '../events/EventFormModal';

const TABS = ['events', 'equipment', 'food', 'members'] as const;
type Tab = (typeof TABS)[number];

export function GroupsPage() {
  const { groupId, eventId } = useParams();
  const { groups, loading } = usePlan();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <div className="page-head">
        <h1>Groups</h1>
        <div className="row-gap">
          <label className="sr-only" htmlFor="group-select">Select group</label>
          <select id="group-select" value={groupId ?? ''} onChange={(e) => navigate(e.target.value ? `/groups/${e.target.value}` : '/groups')}>
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New group</button>
        </div>
      </div>

      {loading ? <p className="muted">Loading…</p> : groupId ? <GroupDetail groupId={groupId} eventId={eventId} /> : <GroupGrid />}

      {creating && <CreateGroupModal onClose={() => setCreating(false)} onCreated={(g) => navigate(`/groups/${g.id}`)} />}
    </div>
  );
}

function GroupGrid() {
  const { groups, members, events, roleIn } = usePlan();
  if (!groups.length) {
    return (
      <div className="card empty-state">
        <h2>No groups yet</h2>
        <p className="muted">Create a group to start planning events, equipment and food together. Or ask a friend to invite you by email.</p>
      </div>
    );
  }
  return (
    <div className="grid">
      {groups.map((g) => {
        const n = members.filter((m) => m.group_id === g.id).length;
        const e = events.filter((x) => x.group_id === g.id && new Date(x.ends_at) >= new Date()).length;
        return (
          <Link key={g.id} to={`/groups/${g.id}`} className="card group-card">
            <span className="group-emoji" aria-hidden="true">{g.emoji}</span>
            <h2>{g.name}</h2>
            {g.description && <p className="muted clamp">{g.description}</p>}
            <p className="small muted">{n} member{n === 1 ? '' : 's'} · {e} upcoming event{e === 1 ? '' : 's'}</p>
            <span className={`badge badge-${roleIn(g.id)}`}>{roleIn(g.id)}</span>
          </Link>
        );
      })}
    </div>
  );
}

function GroupDetail({ groupId, eventId }: { groupId: string; eventId?: string }) {
  const { groups, events, roleIn } = usePlan();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [showSettings, setShowSettings] = useState(false);
  const group = groups.find((g) => g.id === groupId);
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'events';

  if (!group) {
    return (
      <div className="card empty-state">
        <h2>Group not found</h2>
        <p className="muted">It may have been deleted, or you may no longer be a member.</p>
        <Link className="btn" to="/groups">Back to all groups</Link>
      </div>
    );
  }

  const role = roleIn(groupId);
  const open = eventId ? events.find((e) => e.id === eventId && e.group_id === groupId) : undefined;

  return (
    <>
      <div className="card group-head">
        <span className="group-emoji big" aria-hidden="true">{group.emoji}</span>
        <div className="grow">
          <h2>{group.name} <span className={`badge badge-${role}`}>{role}</span></h2>
          {group.description && <p className="muted prewrap">{group.description}</p>}
        </div>
        <button className="btn" onClick={() => setShowSettings(true)}>Group settings</button>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setParams({ tab: t }, { replace: true })}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="tab-panel" role="tabpanel">
        {tab === 'events' && <EventsTab groupId={groupId} />}
        {tab === 'equipment' && <EquipmentPanel groupId={groupId} />}
        {tab === 'food' && <FoodPanel groupId={groupId} />}
        {tab === 'members' && <MembersPanel groupId={groupId} />}
      </div>

      {open && <EventDetail event={open} onClose={() => navigate(`/groups/${groupId}`)} />}
      {showSettings && <GroupSettingsModal group={group} onClose={() => setShowSettings(false)} onDeleted={() => navigate('/groups')} />}
    </>
  );
}

function EventsTab({ groupId }: { groupId: string }) {
  const { events } = usePlan();
  const [creating, setCreating] = useState(false);
  const list = events.filter((e) => e.group_id === groupId).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const now = new Date();
  const upcoming = list.filter((e) => new Date(e.ends_at) >= now);
  const past = list.filter((e) => new Date(e.ends_at) < now).reverse();

  const row = (e: (typeof list)[number]) => (
    <li key={e.id} className="list-item clickable">
      <Link className="list-main" to={`/groups/${groupId}/events/${e.id}`}>
        <strong>{e.name}</strong>
        <span className="muted small">{fmtRange(e.starts_at, e.ends_at)}{e.location && ` · ${e.location}`}</span>
      </Link>
    </li>
  );

  return (
    <section>
      <div className="section-head">
        <h3>Events</h3>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New event</button>
      </div>
      {list.length === 0 && <p className="empty">No events yet. Plan the first one.</p>}
      {upcoming.length > 0 && <ul className="list">{upcoming.map(row)}</ul>}
      {past.length > 0 && (<><h4>Past events</h4><ul className="list past">{past.map(row)}</ul></>)}
      {creating && <EventFormModal defaultGroupId={groupId} onClose={() => setCreating(false)} />}
    </section>
  );
}
