import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Modal, ConfirmDialog } from '../../components/Modal';
import { PersonSelect } from '../../components/PersonSelect';
import { ExportDialog } from '../../components/ExportDialog';
import { useDb, usePlan, useRun } from '../../lib/data';
import { fmtDateTime, fromLocalInput, toLocalInput } from '../../lib/dates';
import { assigneeKey, assigneePatch, personName } from '../../lib/utils';
import type { EventRow, Food } from '../../lib/types';

interface Props {
  groupId: string;
  eventId?: string;
}

export function FoodPanel({ groupId, eventId }: Props) {
  const { food, events, ingredients, people } = usePlan();
  const [eventFilter, setEventFilter] = useState('');
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const ppl = people(groupId);

  const groupEvents = useMemo(() => events.filter((e) => e.group_id === groupId).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [events, groupId]);
  const scope = eventId ?? (eventFilter || undefined);
  const items = useMemo(
    () => food
      .filter((f) => f.group_id === groupId && (scope === undefined || (scope === 'none' ? f.event_id === null : f.event_id === scope)))
      .sort((a, b) => a.meal_at.localeCompare(b.meal_at)),
    [food, groupId, scope],
  );
  const eventName = (id: string | null) => groupEvents.find((e) => e.id === id)?.name ?? 'No event';

  // Food schedule export: one row per food with its ingredients (ingredients default to the food's assignee).
  const buildRows = useCallback(
    (filterKey: string) =>
      items
        .filter((f) => !filterKey || assigneeKey(f) === filterKey)
        .map((f) => {
          const ing = ingredients
            .filter((i) => i.food_id === f.id)
            .map((i) => `${i.name} (${personName(ppl, assigneeKey(i) || assigneeKey(f)) || 'unassigned'})`)
            .join('; ');
          return [fmtDateTime(f.meal_at), f.name, personName(ppl, assigneeKey(f)), eventName(f.event_id), ing];
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, ingredients, ppl.length, groupEvents],
  );

  const open = food.find((f) => f.id === openId);

  return (
    <section>
      <div className="section-head">
        <h3>Food</h3>
        <div className="row-gap">
          {!eventId && (
            <select aria-label="Filter by event" value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}>
              <option value="">All events</option>
              {groupEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              <option value="none">No event</option>
            </select>
          )}
          <button className="btn" onClick={() => setExporting(true)} disabled={!items.length}>Export schedule</button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add food</button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="empty">No food planned yet. Add meals to build the menu.</p>
      ) : (
        <ul className="list">
          {items.map((f) => {
            const count = ingredients.filter((i) => i.food_id === f.id).length;
            return (
              <li key={f.id} className="list-item clickable">
                <button className="list-main" onClick={() => setOpenId(f.id)}>
                  <strong>{f.name}</strong>
                  <span className="muted small">
                    {fmtDateTime(f.meal_at)} · {personName(ppl, assigneeKey(f)) || 'Unassigned'}
                    {!eventId && ` · ${eventName(f.event_id)}`} · {count} ingredient{count === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <FoodForm groupId={groupId} eventId={eventId} item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {open && <FoodDetail food={open} onClose={() => setOpenId(null)} />}
      {exporting && (
        <ExportDialog
          title={`Food schedule${eventId ? ` — ${eventName(eventId)}` : eventFilter && eventFilter !== 'none' ? ` — ${eventName(eventFilter)}` : ''}`}
          columns={['Meal time', 'Food', 'Assigned to', 'Event', 'Ingredients']}
          buildRows={buildRows}
          people={ppl}
          filterLabel="Filter by food assignee"
          onClose={() => setExporting(false)}
        />
      )}
    </section>
  );
}

function FoodForm({ groupId, eventId, item, onClose }: { groupId: string; eventId?: string; item?: Food; onClose: () => void }) {
  const { events, people } = usePlan();
  const db = useDb();
  const run = useRun();
  const groupEvents: EventRow[] = events.filter((e) => e.group_id === groupId);
  const base = groupEvents.find((e) => e.id === (item?.event_id ?? eventId));

  const [name, setName] = useState(item?.name ?? '');
  const [mealAt, setMealAt] = useState(toLocalInput(item?.meal_at ?? base?.starts_at ?? new Date()));
  const [who, setWho] = useState(item ? assigneeKey(item) : '');
  const [evt, setEvt] = useState(item?.event_id ?? eventId ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Give the food a name.');
    if (!mealAt) return setError('Set the meal date and time.');
    const payload = { name: name.trim(), meal_at: fromLocalInput(mealAt), event_id: evt || null, ...assigneePatch(who) };
    setBusy(true);
    const ok = await run(
      () => item ? db.update('food', item.id, payload) : db.insert('food', { group_id: groupId, ...payload }),
      item ? 'Food updated' : 'Food added',
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Modal title={item ? 'Edit food' : 'Add food'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="field"><span>Food name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
        </label>
        <label className="field"><span>Meal date &amp; time</span>
          <input type="datetime-local" value={mealAt} onChange={(e) => setMealAt(e.target.value)} required />
        </label>
        <PersonSelect label="Assigned to" people={people(groupId)} value={who} onChange={setWho} />
        {!eventId && (
          <label className="field"><span>Event</span>
            <select value={evt} onChange={(e) => setEvt(e.target.value)}>
              <option value="">No specific event</option>
              {groupEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        )}
        {error && <div className="form-error" role="alert">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Pop-up with food details and its ingredients. Unassigned ingredients inherit the food's assignee. */
function FoodDetail({ food, onClose }: { food: Food; onClose: () => void }) {
  const { ingredients, equipment, people } = usePlan();
  const db = useDb();
  const run = useRun();
  const ppl = people(food.group_id);
  const mine = ingredients.filter((i) => i.food_id === food.id).sort((a, b) => a.name.localeCompare(b.name));
  const gear = equipment.filter((e) => e.food_id === food.id);

  const [newName, setNewName] = useState('');
  const [newWho, setNewWho] = useState('');
  const [editFood, setEditFood] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const foodWho = personName(ppl, assigneeKey(food));

  async function addIngredient(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const ok = await run(() => db.insert('ingredients', { food_id: food.id, group_id: food.group_id, name: newName.trim(), ...assigneePatch(newWho) }));
    if (ok) { setNewName(''); setNewWho(''); }
  }

  return (
    <Modal title={food.name} onClose={onClose} wide
      footer={
        <>
          <button className="btn btn-danger-ghost" onClick={() => setConfirmDel(true)}>Delete food</button>
          <button className="btn" onClick={() => setEditFood(true)}>Edit food</button>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </>
      }>
      <dl className="details">
        <div><dt>Meal time</dt><dd>{fmtDateTime(food.meal_at)}</dd></div>
        <div><dt>Assigned to</dt><dd>{foodWho || 'Unassigned'}</dd></div>
      </dl>

      <h3>Ingredients</h3>
      {mine.length === 0 ? <p className="empty">No ingredients yet.</p> : (
        <ul className="list">
          {mine.map((i) => (
            <IngredientRow key={i.id} id={i.id} name={i.name} who={assigneeKey(i)} ppl={ppl} fallback={foodWho} />
          ))}
        </ul>
      )}
      <form className="inline-form" onSubmit={addIngredient}>
        <input aria-label="Ingredient name" placeholder="Add an ingredient" value={newName} maxLength={200} onChange={(e) => setNewName(e.target.value)} />
        <select aria-label="Ingredient assignee" value={newWho} onChange={(e) => setNewWho(e.target.value)}>
          <option value="">{foodWho ? `Default (${foodWho})` : 'Unassigned'}</option>
          {ppl.map((p) => <option key={p.key} value={p.key}>{p.name}{p.manual ? ' (manual)' : ''}</option>)}
        </select>
        <button className="btn btn-primary" disabled={!newName.trim()}>Add</button>
      </form>

      {gear.length > 0 && (
        <>
          <h3>Equipment for this food</h3>
          <ul className="chips">{gear.map((g) => <li key={g.id} className="chip">{g.name}</li>)}</ul>
        </>
      )}

      {editFood && <FoodForm groupId={food.group_id} item={food} onClose={() => setEditFood(false)} />}
      {confirmDel && (
        <ConfirmDialog
          title="Delete food" danger confirmLabel="Delete"
          message={<>Delete <strong>{food.name}</strong> and its ingredients?</>}
          onClose={() => setConfirmDel(false)}
          onConfirm={async () => { if (await run(() => db.remove('food', food.id), 'Food deleted')) onClose(); }}
        />
      )}
    </Modal>
  );
}

function IngredientRow({ id, name, who, ppl, fallback }: { id: string; name: string; who: string; ppl: ReturnType<ReturnType<typeof usePlan>['people']>; fallback: string }) {
  const db = useDb();
  const run = useRun();
  return (
    <li className="list-item">
      <div className="grow"><strong>{name}</strong></div>
      <select aria-label={`Assignee for ${name}`} value={who} onChange={(e) => run(() => db.update('ingredients', id, assigneePatch(e.target.value)))}>
        <option value="">{fallback ? `Default (${fallback})` : 'Unassigned'}</option>
        {ppl.map((p) => <option key={p.key} value={p.key}>{p.name}{p.manual ? ' (manual)' : ''}</option>)}
      </select>
      <button className="btn btn-small btn-danger-ghost" aria-label={`Remove ${name}`} onClick={() => run(() => db.remove('ingredients', id))}>Remove</button>
    </li>
  );
}
