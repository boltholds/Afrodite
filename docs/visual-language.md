# Visual language

Afrodite has its own visual identity and must not inherit the industrial palette of Gefest CAD.

## Direction

The interface is a dark technological workspace inspired by neon circuitry, light trails, precision instrumentation, and the restrained cinematic atmosphere of TRON: Legacy.

The result should feel precise, digital, elegant, and fast. Decorative effects must support hierarchy and interaction instead of reducing readability.

## Core palette

- `void` — near-black violet background: `#05040A`;
- `deep` — main workspace background: `#080712`;
- `surface` — panels and floating surfaces: `#0F0E1A`;
- `elevated` — buttons and raised controls: `#151326`;
- `accent` — primary neon pink: `#FF2FA6`;
- `accent-soft` — highlights and active labels: `#FF79C8`;
- `signal` — secondary cyan signal color: `#39D9FF`;
- `text-primary` — main text: `#F7F2FF`;
- `text-secondary` — supporting text: `#B4ACC8`.

Pink represents selection, creation, active editing, and the Afrodite brand. Cyan represents system information, stable identifiers, connections, diagnostics metadata, and synchronized state.

## Surfaces and geometry

- prefer near-black violet surfaces over neutral graphite;
- use thin luminous borders rather than heavy shadows;
- corners are compact and precise, usually `3–6px`;
- large rounded cards and soft consumer-SaaS styling are avoided;
- grids, corner markers, signal lines, and subtle radial light fields may reinforce the editor workspace;
- glow remains localized around active elements.

## Interaction states

- selected nodes use a pink border and controlled outer glow;
- focused inputs use pink, while keyboard focus receives an additional cyan outline;
- stable IDs and system status use cyan;
- errors use red-pink and must remain distinguishable from normal selection;
- disabled elements lose contrast and glow but preserve their structure.

## Typography

The primary UI remains highly readable. Brand names, panel titles, node IDs, and system labels may use wider letter spacing, uppercase text, and monospace styling where it reinforces the technical hierarchy.

## Motion

Motion should resemble signal propagation rather than playful UI animation. Suitable patterns include short light sweeps, restrained pulses, connection tracing, and immediate state transitions. All motion must respect `prefers-reduced-motion`.

## Brand separation

Gefest CAD uses heat, metal, graphite, ash, and orange-red industrial accents. Afrodite uses darkness, violet-black surfaces, neon pink, cyan signals, and digital precision. Shared architecture does not imply a shared skin.
