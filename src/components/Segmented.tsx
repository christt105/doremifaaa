interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label?: string;
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: Props<T>) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          class={o.value === value ? 'selected' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
