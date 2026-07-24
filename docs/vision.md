# Product vision

Afrodite is a visual UI engineering environment where the canvas, semantic component tree, design tokens, responsive constraints, and source code represent the same system.

## Problem

Traditional design tools primarily store visual geometry. Code generators must infer whether a group is a component, whether aligned layers form a stack, which dimensions are responsive, and which changes may safely be applied to an existing codebase. One-shot generation quickly becomes detached from production code.

## Product thesis

A UI document should preserve developer intent explicitly:

- semantic components rather than anonymous rectangles;
- layout constraints rather than accidental coordinates;
- variants and interaction states;
- stable bindings to source components;
- bidirectional, conflict-aware synchronization;
- reviewable AST-level patches.

## Initial audience

Small product teams and individual developers building component-based web applications with AI-assisted coding workflows.

## Non-goals for the first releases

- a general-purpose vector illustration editor;
- freehand drawing and advanced boolean geometry;
- full Figma or Penpot file-format compatibility;
- autonomous AI-generated product design without a component system;
- replacing application runtime logic with generated code.

## Product principles

1. Preserve handwritten code.
2. Make every generated change reviewable.
3. Prefer explicit semantics over visual guessing.
4. Reuse the repository's real components and tokens.
5. Keep the intermediate representation framework-neutral.
6. Treat visual editing as constrained source transformation.
