# Arcenray UI Skill

## Design Philosophy
**A24/Vercel editorial aesthetic** — cinematic, minimal, typography-driven.

**Source of truth**: `/home/aman/Projects/arcenray/docs/design/` and `/home/aman/Projects/arcenray/AGENTS.md`

> ⚠️ Always check design docs first. This skill provides guidance, not canonical tokens.

## Visual Direction
- **Palette**: Monochrome foundation (black, white, grays) with restrained accent colors
- **Typography**: Large, expressive headlines; tight body copy; generous whitespace
- **Imagery**: High-contrast, cinematic; film posters and hooks are hero elements
- **Motion**: Purposeful, subtle; prefer CSS transitions over complex animations
- **Texture**: Frosted glass effects, subtle gradients, film-grain overlays (sparingly)

## Component Patterns

### Cards
```typescript
// Film card: poster/hook as hero, minimal metadata overlay
<div className="relative aspect-[2/3] overflow-hidden rounded-lg">
  <Image src={poster} alt={title} fill className="object-cover" />
  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
  <div className="absolute bottom-0 p-4 text-white">
    <h3 className="text-lg font-semibold">{title}</h3>
    <p className="text-sm text-white/70">{director}</p>
  </div>
</div>
```

### Buttons
```typescript
// Primary: solid black on white (or inverse in dark mode)
<button className="bg-black text-white px-6 py-3 rounded-full hover:bg-black/90">
  Watch Film
</button>

// Secondary: outlined, transparent
<button className="border border-black/20 px-6 py-3 rounded-full hover:bg-black/5">
  Save
</button>
```

### Typography Scale
```typescript
// Headlines: large, tight tracking
<h1 className="text-5xl font-bold tracking-tight">Film Title</h1>

// Subheads: medium, regular weight
<h2 className="text-2xl font-medium">Section</h2>

// Body: readable, generous line height
<p className="text-base leading-relaxed text-black/80">
  Description text...
</p>

// Captions: small, uppercase, tracked
<span className="text-xs uppercase tracking-widest text-black/60">
  Category
</span>
```

## Layout Patterns

### Film Feed
- Grid of film cards (2-3 columns on desktop, 1-2 on mobile)
- Hover: subtle scale (1.02) + shadow elevation
- Click: full-screen film detail with hook autoplay

### Profile Page
- Hero: large profile image + name + role tags
- Grid: films they've worked on (as director, DP, etc.)
- Minimal metadata; let the work speak

### Film Detail
- Hero: poster or autoplay hook (muted)
- Credits: listed below, no confirmation workflow
- Related: similar films by genre/mood

## Accessibility
- **Contrast**: Minimum 4.5:1 for body text, 3:1 for large text
- **Focus states**: Visible outline (2px solid black) for keyboard navigation
- **Motion**: Respect `prefers-reduced-motion`; disable parallax/autoplay
- **Images**: Always include `alt` text; decorative images use `alt=""`

## Responsive Breakpoints
```typescript
// Mobile-first
sm: 640px   // Large phones
md: 768px   // Tablets
lg: 1024px  // Small laptops
xl: 1280px  // Desktop
2xl: 1536px // Large desktop
```

## Dark Mode
- Not currently implemented; monochrome palette is dark-mode-ready
- If adding: invert backgrounds (white → black), adjust text opacity

## Animation Guidelines
- **Duration**: 150-300ms for UI transitions
- **Easing**: `ease-out` for entrances, `ease-in` for exits
- **Hover**: Subtle scale (1.02) + shadow elevation
- **Loading**: Skeleton screens, not spinners
- **Page transitions**: Fade or slide (prefer fade for simplicity)

## Anti-Patterns
- ❌ Bright, saturated colors (except in film posters/hooks)
- ❌ Complex gradients or glassmorphism overuse
- ❌ Decorative animations that don't serve UX
- ❌ Dense layouts; embrace whitespace
- ❌ Generic stock-photo aesthetic; prioritize cinematic imagery

## Design Tokens (if defined)
Check `/home/aman/Projects/arcenray/docs/design/tokens.json` (if exists) for:
- Color palette
- Typography scale
- Spacing units
- Border radius
- Shadow definitions

If tokens don't exist, follow the visual direction above and propose tokens for review.

## Documentation
- Design artifacts: `/home/aman/Projects/arcenray/docs/design/`
- Architecture: `/home/aman/Projects/arcenray/AGENTS.md`
- Component library: `/home/aman/Projects/arcenray/apps/web/src/components/`
- Tailwind config: `/home/aman/Projects/arcenray/apps/web/tailwind.config.ts`
