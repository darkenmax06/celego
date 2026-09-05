"use client";

/**
 * SDD card-groups — Work Unit F, Task 16.
 *
 * Purely presentational bulk-selection checkbox, reused in both the list
 * `<tbody>` row and the cards-view grid item. Stops click propagation so a
 * click on the checkbox never triggers an ancestor row's own click handler
 * (e.g. opening the card detail).
 */
type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
};

export function CardSelectCheckbox({ checked, onChange, label }: Props) {
  return (
    <input
      type="checkbox"
      checked={checked}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
    />
  );
}
