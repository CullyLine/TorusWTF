# Visual shader provenance

The Mad Scientist visual pack uses original Torus GLSL except for the
licensed port and the MIT-licensed galaxy geometry dependency described
below. Shadertoy links were otherwise used only as visual references: no
Shadertoy source, constants, camera setup, shader structure, or equations
were copied, translated, or vendored.

## Licensed port

- Rainforest Reverie (`rainforest_reverie`) is a direct port of Inigo
  Quilez's "Rainforest" (<https://www.shadertoy.com/view/4ttSWf>, Image +
  Buffer A passes), used with the author's permission obtained by the
  project owner in July 2026. The original copyright notice is preserved in
  `packages/visualizers/src/presets/RainforestReverie.tsx`, and every
  TorusFM modification (audio reactivity, tier caps, uniform-based
  reprojection camera, palette grade) is tagged `[TorusFM]` in the source.
  This permission is specific to this project — the shader code cannot be
  reused elsewhere under this repository's license.

## Clean-room visual references

- Lava Choir and Bubble Melt:
  <https://www.shadertoy.com/view/3sySRK>
- Alien Planet (formerly the clean-room "Rainforest Reverie"):
  <https://www.shadertoy.com/view/4ttSWf>
- Octagram Bloom:
  <https://www.shadertoy.com/view/tlVGDt>
- Pyramid Cathedral:
  <https://www.shadertoy.com/view/tsXBzS>
- Creation Well:
  <https://www.shadertoy.com/view/XsXXDn>
- Sea Glass and Tidal Sanctuary:
  <https://www.shadertoy.com/view/Ms2SD1>

Firefly Hug and Velvet Aurora were designed without an external shader
reference.

## Directly used dependency

Galaxy Garden uses `GalaxyGeometry` from
[`threejs-galaxy-shader` 1.0.2](https://github.com/AmitDigga/threejs-galaxy-shader).
Its custom Torus material and all audio choreography are original. The
dependency is distributed under the following MIT license:

> MIT License
>
> Copyright 2025 AMIT DIGGA
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
