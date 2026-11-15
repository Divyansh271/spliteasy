interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const PALETTES = [
  'bg-emerald-100 text-emerald-800',
  'bg-teal-100 text-teal-800',
  'bg-sky-100 text-sky-800',
  'bg-amber-100 text-amber-800',
  'bg-slate-200 text-slate-800',
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getPaletteClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

const SIZE_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-xl',
};

export function Avatar({ name, size = 'md' }: AvatarProps) {
  const initials = getInitials(name);
  const palette = getPaletteClass(name);

  return (
    <div
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none ${SIZE_CLASSES[size]} ${palette}`}
    >
      {initials}
    </div>
  );
}
