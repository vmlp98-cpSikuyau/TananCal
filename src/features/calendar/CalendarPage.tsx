import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth,
  startOfMonth, startOfWeek,
} from 'date-fns';
import { usePlan } from '../../lib/data';
import { fmtTime, overlapsDay } from '../../lib/dates';
import { groupColor } from '../../lib/utils';
import { EventFormModal } from '../events/EventFormModal';
import type { EventRow } from '../../lib/types';

type View = 'day' | 'week' | 'month';

export function CalendarPage() {
  const { groups, events } = usePlan();
  const navigate = useNavigate();
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState(new Date());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Date | null>(null);

  const visible = useMemo(() => events.filter((e) => !hidden.has(e.group_id)), [events, hidden]);
  const eventsOn = (d: Date) => visible.filter((e) => overlapsDay(e.starts_at, e.ends_at, d)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  function step(dir: 1 | -1) {
    setCursor((c) => (view === 'month' ? addMonths(c, dir) : view === 'week' ? addWeeks(c, dir) : addDays(c, dir)));
  }
  const title =
    view === 'month' ? format(cursor, 'MMMM yyyy')
    : view === 'week' ? `${format(startOfWeek(cursor), 'MMM d')} – ${format(endOfWeek(cursor), 'MMM d, yyyy')}`
    : format(cursor, 'EEEE, MMMM d, yyyy');

  const open = (e: EventRow) => navigate(`/groups/${e.group_id}/events/${e.id}`);
  const chip = (e: EventRow, showTime = true) => (
    <button
      key={e.id}
      className="cal-chip"
      style={{ borderLeftColor: groupColor(groups, e.group_id) }}
      onClick={() => open(e)}
      title={`${e.name} — ${groups.find((g) => g.id === e.group_id)?.name ?? ''}`}
    >
      {showTime && <span className="cal-time">{fmtTime(e.starts_at)}</span>} {e.name}
    </button>
  );

  const monthDays = eachDayOfInterval({ start: startOfWeek(startOfMonth(cursor)), end: endOfWeek(endOfMonth(cursor)) });
  const weekDays = eachDayOfInterval({ start: startOfWeek(cursor), end: endOfWeek(cursor) });
  const today = new Date();

  return (
    <div className="page">
      <div className="page-head">
        <h1>Calendar</h1>
        <button className="btn btn-primary" onClick={() => setAdding(cursor)}>+ Plan event</button>
      </div>

      <div className="cal-toolbar">
        <div className="row-gap">
          <button className="btn" onClick={() => step(-1)} aria-label="Previous">‹</button>
          <button className="btn" onClick={() => setCursor(new Date())}>Today</button>
          <button className="btn" onClick={() => step(1)} aria-label="Next">›</button>
          <h2 className="cal-title" aria-live="polite">{title}</h2>
        </div>
        <div className="seg" role="group" aria-label="Calendar view">
          {(['day', 'week', 'month'] as View[]).map((v) => (
            <button key={v} className={`seg-btn${view === v ? ' active' : ''}`} aria-pressed={view === v} onClick={() => setView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {groups.length > 0 && (
        <div className="legend" role="group" aria-label="Filter by group">
          {groups.map((g) => {
            const on = !hidden.has(g.id);
            return (
              <button
                key={g.id}
                className={`legend-item${on ? '' : ' off'}`}
                aria-pressed={on}
                onClick={() => setHidden((h) => { const n = new Set(h); if (on) n.add(g.id); else n.delete(g.id); return n; })}
              >
                <span className="dot" style={{ background: groupColor(groups, g.id) }} /> {g.emoji} {g.name}
              </button>
            );
          })}
        </div>
      )}

      {view === 'month' && (
        <div className="cal-month" role="grid" aria-label={title}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d} className="cal-dow" role="columnheader">{d}</div>)}
          {monthDays.map((d) => {
            const list = eventsOn(d);
            return (
              <div key={d.toISOString()} role="gridcell" className={`cal-cell${isSameMonth(d, cursor) ? '' : ' dim'}${isSameDay(d, today) ? ' today' : ''}`}>
                <button className="cal-daynum" onClick={() => { setCursor(d); setView('day'); }} aria-label={`Open ${format(d, 'MMMM d')}`}>{format(d, 'd')}</button>
                {list.slice(0, 3).map((e) => chip(e, false))}
                {list.length > 3 && <button className="cal-more" onClick={() => { setCursor(d); setView('day'); }}>+{list.length - 3} more</button>}
              </div>
            );
          })}
        </div>
      )}

      {view === 'week' && (
        <div className="cal-week">
          {weekDays.map((d) => {
            const list = eventsOn(d);
            return (
              <div key={d.toISOString()} className={`cal-col${isSameDay(d, today) ? ' today' : ''}`}>
                <button className="cal-colhead" onClick={() => { setCursor(d); setView('day'); }}>
                  <span>{format(d, 'EEE')}</span><strong>{format(d, 'd')}</strong>
                </button>
                {list.length === 0 ? <span className="muted small">—</span> : list.map((e) => chip(e))}
              </div>
            );
          })}
        </div>
      )}

      {view === 'day' && (
        <div className="card">
          {eventsOn(cursor).length === 0 ? <p className="empty">Nothing planned for this day.</p> : (
            <ul className="list">
              {eventsOn(cursor).map((e) => (
                <li key={e.id} className="list-item clickable">
                  <button className="list-main" onClick={() => open(e)}>
                    <strong><span className="dot" style={{ background: groupColor(groups, e.group_id) }} /> {e.name}</strong>
                    <span className="muted small">
                      {fmtTime(e.starts_at)} – {fmtTime(e.ends_at)} · {groups.find((g) => g.id === e.group_id)?.name}{e.location && ` · ${e.location}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {adding && <EventFormModal defaultDate={adding} onClose={() => setAdding(null)} onSaved={(ev) => setCursor(new Date(ev.starts_at))} />}
    </div>
  );
}
