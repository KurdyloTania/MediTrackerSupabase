// src/theme/colors.ts
// Єдина кольорова гама: темно-зелений #133215, м'яко-зелений #92B775, кремовий #F3E8D3

export const COLORS = {
  // ── Primary palette ──────────────────────────────────────────────────────
  darkGreen:    '#133215',   // основний темний
  darkGreen2:   '#1E4A20',   // трохи світліший темний
  midGreen:     '#2D6B30',   // середній відтінок
  softGreen:    '#92B775',   // акцент / secondary
  lightGreen:   '#B8D4A0',   // світло-зелений (hover / disabled)
  cream:        '#F3E8D3',   // фон / поверхня
  creamDark:    '#E8D9C0',   // межі, розділювачі
  creamLight:   '#FAF5EC',   // зворотній фон

  // ── Semantic ─────────────────────────────────────────────────────────────
  taken:        '#52B788',
  takenBg:      '#E8F5EE',
  missed:       '#D64045',
  missedBg:     '#FDEAEA',
  partial:      '#E07A3C',
  partialBg:    '#FDF0E6',
  upcoming:     '#92B775',
  warn:         '#C97B1A',
  warnBg:       '#FEF3DC',

  // ── Neutrals ─────────────────────────────────────────────────────────────
  text:         '#1A2E1A',
  textSub:      '#5A7060',
  textTertiary: '#8FA88A',
  border:       '#D4C9B5',
  borderLight:  '#EDE4D3',
  surface:      '#FFFFFF',
  bg:           '#F3E8D3',
  bgDeep:       '#EDE0C8',

  white:        '#FFFFFF',
} as const;

export type ColorKey = keyof typeof COLORS;











