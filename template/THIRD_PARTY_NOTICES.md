# Liquid Glass

The card renderer in src/LiquidGlass.tsx adapts the Canvas displacement-map / SVG
feDisplacementMap technique from [childrentime/liquid-glass](https://github.com/childrentime/liquid-glass),
whose README declares the MIT license, with credit to Shu Ding's reference implementation.
The implementation is adapted to responsive cards: rounded rectangular lens, ResizeObserver,
no dragging, no global mouse listeners, and separate readable text capsules.

Upstream: https://github.com/childrentime/liquid-glass/blob/main/src/LiquidGlass.tsx
Retrieved 2026-09-27. The upstream repository has no separate LICENSE file.
