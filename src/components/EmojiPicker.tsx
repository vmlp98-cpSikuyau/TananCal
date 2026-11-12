const EMOJIS = [
  '😀', '😎', '🤠', '🥳', '😺', '🐻', '🦊', '🐼', '🦁', '🐸', '🐙', '🦄',
  '⛺', '🏕️', '🏔️', '🌲', '🏖️', '🚣', '🚴', '🏃', '⚽', '🏀', '🏈', '🎾',
  '🎉', '🎂', '🎁', '🎸', '🎮', '🎨', '📚', '✈️', '🚗', '🏠', '👨‍👩‍👧‍👦', '👥',
  '🍕', '🍔', '🌮', '🍳', '🥗', '🍣', '☕', '🍻', '🔥', '⭐', '🌈', '💙',
];

interface Props {
  value: string | null;
  onChange: (v: string) => void;
  allowNone?: boolean;
  onClear?: () => void;
  label?: string;
}

export function EmojiPicker({ value, onChange, allowNone, onClear, label = 'Emoji' }: Props) {
  return (
    <div className="emoji-picker" role="group" aria-label={label}>
      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className={`emoji-btn${value === e ? ' selected' : ''}`}
            onClick={() => onChange(e)}
            aria-pressed={value === e}
            aria-label={e}
          >
            {e}
          </button>
        ))}
      </div>
      <div className="emoji-custom">
        <input
          aria-label="Or type your own emoji"
          placeholder="Or type your own"
          maxLength={8}
          value={value && !EMOJIS.includes(value) ? value : ''}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
        {allowNone && value && <button type="button" className="btn btn-small" onClick={onClear}>Clear</button>}
      </div>
    </div>
  );
}
