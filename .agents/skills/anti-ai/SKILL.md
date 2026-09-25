---
name: anti-ai
description: anti-ai skill
---

Design & Content Anti-Patterns
Strictly avoid the following cliches, overused trends, and design tropes across all generated code, styling, and text content:

Visual & Aesthetic Anti-Patterns
Color Palettes: No purple-and-black themes, neon colors, basic pastel schemes, or rainbow coloring.

Backgrounds: Never use pure white (#FFFFFF), radial/glow orbs, dot grid patterns, or liquid glass/glassmorphism effects.

Gradients & Shadows: No harsh gradients. Avoid drop shadows entirely.

Layout Elements: Do not use Bento grids or 3-feature card side-by-side rows. Avoid cards with colored left border strips.

Corners: Avoid generic soft/rounded corner radii (rounded-lg, rounded-xl, etc.).

Typography & Icons
Typography: Never import or specify Inter, Geist, or Space Grotesk fonts. Avoid em dashes (—) in text.

Iconography: Do not use Lucide icon sets, sparkle icons, animated arrows, checkmark bullet lists, or emojis anywhere in the UI or copy.

Interactive & UI Dynamics
UI States: No skeleton loaders during loading states.

Components: Never render mock terminal windows/code block previews.

Micro-interactions: Avoid hover animations on elements or cards.

Tone & Copy Writing
Phrasing Tropes: Never write copy using the format "It's not Y, it's X" or similar oppositional marketing tropes. Keep text direct, clear, and focused on function.
## Extended AI Anti-Patterns

### Copy & Content Tropes
* **Aspirational Headlines:** No "Build the future of...", "Supercharge your...", or "Reimagining...". Keep copy grounded and specific to the exact utility.
* **Buzzword Trios:** Never group descriptors in threes (e.g., "Fast, secure, and scalable").
* **Banned Vocabulary:** Never use: *delve, unlock, seamless, leverage, elevate, robust, game-changer, empower, ecosystem, bespoke.*
* **Over-Capitalization:** Use standard sentence case for subheadings and body copy, not Title Case on every word.

### Layout & Structural Tropes
* **Pill Badges:** Do not put pill tags (`✨ Feature v2.0`) above hero titles.
* **Floating 3D Geometry:** No abstract floating chrome/plastic blobs or rings in background assets.
* **Uniform Card Heights:** Avoid forcing every card in a non-comparison grid to have identical uniform padding and forced equal heights; let content dictate structure naturally.
* **Over-Symmetrical Centered Heroes:** Avoid strictly centered Hero layouts with two side-by-side buttons and a fake chart underneath.