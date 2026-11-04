/**
 * Illustrated product art, drawn per category until real vendor photos arrive.
 * Colours come from theme tokens so it works in light and dark.
 */

const M = "rgb(var(--marigold))";
const G = "rgb(var(--gurans))";
const L = "rgb(var(--leaf))";
const I = "rgb(var(--ink))";

function Cake() {
  return (
    <g>
      <ellipse cx="100" cy="150" rx="62" ry="10" fill={I} opacity=".12" />
      <rect x="44" y="96" width="112" height="52" rx="10" fill={G} />
      <path d="M44 108c10 10 18 0 28 8s18 0 28 8 18 0 28 8 18 0 28-8" fill="none" stroke="rgb(var(--surface))" strokeWidth="5" strokeLinecap="round" />
      <rect x="56" y="68" width="88" height="34" rx="8" fill={M} />
      <circle cx="78" cy="64" r="6" fill={G} />
      <circle cx="100" cy="62" r="6" fill={G} />
      <circle cx="122" cy="64" r="6" fill={G} />
      <rect x="98" y="38" width="4" height="18" rx="2" fill={I} />
      <path d="M100 26c4 5 4 9 0 12-4-3-4-7 0-12Z" fill={M} />
    </g>
  );
}

function Flowers() {
  const bloom = (x: number, y: number, c: string) => (
    <g key={`${x}-${y}`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={x} cy={y - 11} rx="7" ry="12" fill={c} transform={`rotate(${a} ${x} ${y})`} />
      ))}
      <circle cx={x} cy={y} r="5" fill={M} />
    </g>
  );
  return (
    <g>
      <path d="M100 150 70 80M100 150l0-78M100 150l32-70" stroke={L} strokeWidth="4" fill="none" />
      <path d="M72 118c10-14 22-14 28 0-10 6-18 6-28 0Z" fill={L} />
      {bloom(70, 76, G)}
      {bloom(100, 62, G)}
      {bloom(132, 78, G)}
      <path d="M80 130h40l-8 26H88Z" fill={M} />
    </g>
  );
}

function Hamper() {
  return (
    <g>
      <path d="M50 92c0-34 100-34 100 0" fill="none" stroke={I} strokeWidth="5" />
      <circle cx="78" cy="88" r="14" fill={M} />
      <circle cx="104" cy="82" r="14" fill={G} />
      <circle cx="126" cy="90" r="12" fill={M} />
      <path d="M40 96h120l-12 56H52Z" fill={M} />
      <path d="M52 112h96M56 128h88M60 144h80" stroke={I} strokeWidth="2.5" opacity=".35" />
      <path d="M92 96v56M108 96v56" stroke={G} strokeWidth="6" />
    </g>
  );
}

function Topi() {
  return (
    <g>
      <path d="M46 120c0-30 24-54 54-58 30 4 54 28 54 58Z" fill={I} />
      <g opacity=".95">
        {[60, 80, 100, 120, 140].map((x) =>
          [84, 100].map((y) => <path key={`${x}${y}`} d={`M${x} ${y - 6} ${x + 6} ${y} ${x} ${y + 6} ${x - 6} ${y}Z`} fill={(x + y) % 40 === 0 ? G : M} />),
        )}
      </g>
      <rect x="40" y="118" width="120" height="14" rx="4" fill={G} />
    </g>
  );
}

function Gift() {
  return (
    <g>
      <rect x="52" y="76" width="96" height="74" rx="8" fill={M} />
      <rect x="46" y="66" width="108" height="20" rx="6" fill={G} />
      <rect x="94" y="66" width="12" height="84" fill={I} opacity=".85" />
      <path d="M100 66c-14-20-34-16-28-4 4 8 18 6 28 4Zm0 0c14-20 34-16 28-4-4 8-18 6-28 4Z" fill={G} />
    </g>
  );
}

function Bowl() {
  return (
    <g>
      <ellipse cx="100" cy="146" rx="58" ry="9" fill={I} opacity=".12" />
      <path d="M40 92h120c0 34-26 54-60 54S40 126 40 92Z" fill={M} />
      <ellipse cx="100" cy="92" rx="60" ry="12" fill={I} opacity=".85" />
      <path d="M52 110c14 6 30 9 48 9s34-3 48-9" fill="none" stroke={I} strokeWidth="2" opacity=".35" />
      <rect x="128" y="40" width="10" height="56" rx="5" fill={G} transform="rotate(30 133 68)" />
    </g>
  );
}

function Journal() {
  return (
    <g>
      <rect x="58" y="40" width="88" height="112" rx="6" fill={G} />
      <rect x="58" y="40" width="14" height="112" rx="4" fill={I} opacity=".85" />
      <rect x="86" y="62" width="46" height="46" rx="3" fill={M} />
      <path d="M109 68l17 17-17 17-17-17Z" fill={G} />
      <path d="M86 122h46M86 132h34" stroke="rgb(var(--surface))" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function Shawl() {
  return (
    <g>
      <path d="M48 46h104l-10 92H58Z" fill={G} />
      <path d="M58 70h86M56 92h90M60 114h82" stroke={M} strokeWidth="3" opacity=".7" />
      {[62, 74, 86, 98, 110, 122, 134].map((x) => (
        <path key={x} d={`M${x} 138v14`} stroke={G} strokeWidth="3" strokeLinecap="round" />
      ))}
    </g>
  );
}

/** Specific drawings for products whose category art would mislead. */
const BY_SLUG: Record<string, () => JSX.Element> = {
  "singing-bowl-small": Bowl,
  "lokta-journal": Journal,
  "pashmina-shawl": Shawl,
  "dashain-family-hamper": Hamper,
};

const BY_CATEGORY: Record<string, () => JSX.Element> = {
  cakes: Cake,
  flowers: Flowers,
  hampers: Hamper,
  "local-crafts": Topi,
};

const BG: Record<string, string> = {
  cakes: "bg-gurans-soft",
  flowers: "bg-leaf-soft",
  hampers: "bg-marigold-soft",
  "local-crafts": "bg-marigold-soft",
};

export function ProductArt({ category, slug, title, className = "" }: { category: string; slug?: string; title: string; className?: string }) {
  const Art = (slug && BY_SLUG[slug]) || BY_CATEGORY[category] || Gift;
  return (
    <div className={`${BG[category] ?? "bg-leaf-soft"} aspect-square w-full max-w-full ${className}`}>
      <svg viewBox="0 0 200 180" className="h-full w-full" role="img" aria-label={`Illustration of ${title}`}>
        <Art />
      </svg>
    </div>
  );
}

export function Logo({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M32 19c-6-9-15-9-15-3 0 5 8 6 15 3Z" fill={G} />
      <path d="M32 19c6-9 15-9 15-3 0 5-8 6-15 3Z" fill={G} />
      <path d="M14 30c0-6 6-10 18-10s18 4 18 10l-3 20c-1 5-6 8-15 8s-14-3-15-8l-3-20Z" fill={M} />
      <path d="M20 26c4 2 8 3 12 3s8-1 12-3" fill="none" stroke={I} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="32" cy="20" r="4" fill={I} />
    </svg>
  );
}
