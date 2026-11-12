import type { Person } from '../lib/types';

interface Props {
  label: string;
  people: Person[];
  value: string;
  onChange: (key: string) => void;
  emptyLabel?: string;
  required?: boolean;
}

export function PersonSelect({ label, people, value, onChange, emptyLabel = 'Unassigned', required }: Props) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">{emptyLabel}</option>
        {people.map((p) => (
          <option key={p.key} value={p.key}>{p.name}{p.manual ? ' (manual)' : ''}</option>
        ))}
      </select>
    </label>
  );
}
