// Shared chart theme tokens — keep visuals consistent with the design system.

export const chartTheme = {
  axis:        'hsl(28 5% 30%)',
  grid:        'hsl(28 8% 14%)',
  gridDashed:  '2 4',
  textPrimary: 'hsl(40 12% 92%)',
  textMuted:   'hsl(32 6% 50%)',
  textSubtle:  'hsl(28 5% 30%)',
};

// Categorical palette — warm and intentional, matches the brand.
// Use in order; charts cycle through it.
export const chartPalette = [
  'hsl(38 90% 58%)',     // amber primary
  'hsl(168 60% 56%)',    // mint live
  'hsl(6 72% 62%)',      // coral
  'hsl(280 35% 65%)',    // soft violet
  'hsl(200 50% 60%)',    // ice blue
  'hsl(48 70% 60%)',     // gold
];

// Severity → color mapping for стан-encoded charts
export const severityColor = {
  low:      'hsl(168 60% 56%)',
  medium:   'hsl(38 90% 58%)',
  high:     'hsl(6 72% 62%)',
  ok:       'hsl(168 60% 56%)',
  warning:  'hsl(38 90% 58%)',
  critical: 'hsl(6 72% 62%)',
  healthy:  'hsl(168 60% 56%)',
} as const;

// Recharts-compatible tooltip wrapper styling
export const tooltipStyle: React.CSSProperties = {
  background:   'hsl(26 8% 11%)',
  border:       '1px solid hsl(28 8% 22%)',
  borderRadius: 8,
  padding:      '10px 12px',
  fontSize:     12,
  color:        'hsl(40 12% 92%)',
  boxShadow:    '0 8px 32px -8px rgba(0,0,0,0.6)',
  fontFamily:   'var(--font-geist-mono), ui-monospace, monospace',
  fontVariantNumeric: 'tabular-nums',
};

export const tooltipLabelStyle: React.CSSProperties = {
  color:        'hsl(36 8% 68%)',
  fontSize:     10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  marginBottom: 4,
};

export const tooltipItemStyle: React.CSSProperties = {
  color:        'hsl(40 12% 92%)',
  padding:      0,
};
