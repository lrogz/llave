export function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-menta">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14201C" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="15" r="4" />
          <path d="M11 12l9-9M17 6l3 3" />
        </svg>
      </span>
      <span className={`font-display text-2xl font-bold ${claro ? "text-white" : "text-tinta"}`}>Llave</span>
    </span>
  );
}
