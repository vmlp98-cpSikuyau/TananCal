import { useState } from 'react';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { EquipmentPanel } from '../equipment/EquipmentPanel';
import { FoodPanel } from '../food/FoodPanel';
import { ActivityModal } from './ActivityModal';
import { EventFormModal } from './EventFormModal';
import { useDb, usePlan, useRun } from '../../lib/data';
import { fmtRange } from '../../lib/dates';
import { personKey, personName } from '../../lib/utils';
import type { Activity, EventRow } from '../../lib/types';

/** The event's own window: details, activities, equipment and food. */
export function EventDetail({ event, onClose }: { event: EventRow; onClose: () => void }) {
  const { activities, people, groupsAll } = usePlan();
  const db = useDb();
  const run = useRun();
  const [editEvent, setEditEvent] = useState(false);
  const [activity, setActivity] = useState<Activity | 'new' | null>(null);
  const [delEvent, setDelEvent] = useState(false);
  const [delActivity, setDelActivity] = useState<Activity | null>(null);
  const ppl = people(event.group_id);
  const group = groupsAll.find((g) => g.id === event.group_id);
  const acts = activities.filter((a) => a.event_id === event.id).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return (
    <Modal
      title={event.name}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-danger-ghost" onClick={() => setDelEvent(true)}>Delete event</button>
          <button className="btn" onClick={() => setEditEvent(true)}>Edit event</button>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </>
      }
    >
      <dl className="details">
        {group && <div><dt>Group</dt><dd>{group.emoji} {group.name}</dd></div>}
        <div><dt>When</dt><dd>{fmtRange(event.starts_at, event.ends_at)}</dd></div>
        {event.location && <div><dt>Where</dt><dd>{event.location}</dd></div>}
      </dl>
      {event.description && <p className="prewrap">{event.description}</p>}

      <section>
        <div className="section-head">
          <h3>Activities</h3>
          <button className="btn btn-primary" onClick={() => setActivity('new')}>+ Add activity</button>
        </div>
        {acts.length === 0 ? <p className="empty">No activities yet.</p> : (
          <ul className="list">
            {acts.map((a) => (
              <li key={a.id} className="list-item">
                <div className="grow">
                  <strong>{a.name}</strong>
                  <div className="muted small">
                    {fmtRange(a.starts_at, a.ends_at)}
                    {(a.leader_user_id || a.leader_manual_id) && ` · Leader: ${personName(ppl, personKey(a.leader_user_id, a.leader_manual_id)) || 'Unknown'}`}
                  </div>
                  {a.description && <div className="small prewrap">{a.description}</div>}
                </div>
                <button className="btn btn-small" onClick={() => setActivity(a)}>Edit</button>
                <button className="btn btn-small btn-danger-ghost" aria-label={`Delete ${a.name}`} onClick={() => setDelActivity(a)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EquipmentPanel groupId={event.group_id} eventId={event.id} />
      <FoodPanel groupId={event.group_id} eventId={event.id} />

      {editEvent && <EventFormModal event={event} onClose={() => setEditEvent(false)} />}
      {activity && <ActivityModal event={event} activity={activity === 'new' ? undefined : activity} onClose={() => setActivity(null)} />}
      {delActivity && (
        <ConfirmDialog
          title="Delete activity" danger confirmLabel="Delete"
          message={<>Delete <strong>{delActivity.name}</strong>?</>}
          onClose={() => setDelActivity(null)}
          onConfirm={async () => { if (await run(() => db.remove('activities', delActivity.id), 'Activity deleted')) setDelActivity(null); }}
        />
      )}
      {delEvent && (
        <ConfirmDialog
          title="Delete event" danger confirmLabel="Delete event"
          message={<>Delete <strong>{event.name}</strong> with its activities, equipment and food? This cannot be undone.</>}
          onClose={() => setDelEvent(false)}
          onConfirm={async () => {
            if (await run(async () => { await db.remove('events', event.id); await Promise.all(['activities', 'equipment', 'food', 'ingredients'].map((t) => db.refresh(t as never))); }, 'Event deleted')) onClose();
          }}
        />
      )}
    </Modal>
  );
}
