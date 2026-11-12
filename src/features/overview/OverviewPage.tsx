import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePlan } from '../../lib/data';
import { fmtRange } from '../../lib/dates';
import { EventFormModal } from '../events/EventFormModal';
import { Modal } from '../../components/Modal';
import type { EventRow } from '../../lib/types';

export function OverviewPage() {
  const { groups, events, groupsAll, loading } = usePlan();
  const navigate = useNavigate();
  const [planning, setPlanning] = useState(false);
  const [created, setCreated] = useState<EventRow | null>(null);

  const mine = new Set(groups.map((g) => g.id));
  const upcoming = events
    .filter((e) => mine.has(e.group_id) && new Date(e.ends_at) >= new Date())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <div className="page">
      <div className="page-head"><h1>Overview</h1></div>

      <div className="stat-row">
        <div className="card stat">
          <span className="stat-label">Groups</span>
          <span className="stat-value">{loading ? '…' : groups.length}</span>
          <span className="muted small">Total groups you belong to</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Upcoming events</span>
          <span className="stat-value">{loading ? '…' : upcoming.length}</span>
          <span className="muted small">Across all your groups</span>
        </div>
        <button className="card stat stat-action" onClick={() => setPlanning(true)}>
          <span className="stat-plus" aria-hidden="true">+</span>
          <span className="stat-action-label">Plan New Event</span>
        </button>
      </div>

      <section className="card">
        <h2>Upcoming events</h2>
        {loading ? <p className="muted">Loading…</p> : upcoming.length === 0 ? (
          <p className="empty">No upcoming events. {groups.length === 0 ? <>Start by <Link to="/groups">creating a group</Link>.</> : 'Plan one to get started.'}</p>
        ) : (
          <ul className="list">
            {upcoming.slice(0, 8).map((e) => {
              const g = groupsAll.find((x) => x.id === e.group_id);
              return (
                <li key={e.id} className="list-item clickable">
                  <Link className="list-main" to={`/groups/${e.group_id}/events/${e.id}`}>
                    <strong>{e.name}</strong>
                    <span className="muted small">{g?.emoji} {g?.name} · {fmtRange(e.starts_at, e.ends_at)}{e.location && ` · ${e.location}`}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {planning && <EventFormModal onClose={() => setPlanning(false)} onSaved={(ev, isNew) => isNew && setCreated(ev)} />}
      {created && (
        <Modal
          title="Event created"
          onClose={() => setCreated(null)}
          footer={
            <>
              <button className="btn" onClick={() => setCreated(null)}>Not now</button>
              <button className="btn btn-primary" onClick={() => { const e = created; setCreated(null); navigate(`/groups/${e.group_id}/events/${e.id}`); }}>
                View in group
              </button>
            </>
          }
        >
          <p><strong>{created.name}</strong> was added. Do you want to see it in the group screen?</p>
        </Modal>
      )}
    </div>
  );
}
