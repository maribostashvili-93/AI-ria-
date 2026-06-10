export function Button({ label }: { label: string }) {
  // Intentional inconsistencies for ria ui-review / ui-fix demos:
  // hardcoded hex duplicating --color-primary, rounded-md vs Figma's 12px radius.
  return (
    <button
      className="rounded-md px-4 py-2 text-sm text-white"
      style={{ backgroundColor: "#4f46e5" }}
    >
      {label}
    </button>
  );
}
