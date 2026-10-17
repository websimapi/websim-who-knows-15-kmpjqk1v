# Tomas Voss — blue character

Character direction: `npc/blue/soul.md`. Clothing, accessories, tapered strand groom and guide rig were created in Blender for this character. Body motion reuses the existing game's X Bot Mixamo rig and idle, walk, run, agree and headShake clips. The additional sad_pose and sneak_pose clips are retained.

## Historical source reference (not in the current production GLB)

The previous head scan and its color/normal textures: **Lee Perry-Smith**, **Infinite Realities**, **CC BY 3.0**, from the project's Hair Salon reference and the [Three.js normal map example](https://threejs.org/examples/webgl_materials_normalmap.html). License: [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Original [asset license notice](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/LeePerrySmith/LeePerrySmith_License.txt). Source asset attribution: [Lee Perry-Smith head](https://casual-effects.com/data/). The scan was trimmed, scaled, bound to the game rig and fitted with eyes and a custom groom.

## Current production head and eyes

The replacement anatomical head, skin texture, native helper-fitted eye meshes, iris texture, fifteen viseme targets, dental arches/gums and tongue derive from MakeHuman Community assets released under CC0. See `MAKEHUMAN-ASSETS-LICENSE.md` and `CAST-CREDITS.md`. The former scanned head is retained hidden in the local Blender source for provenance; it is not exported in the current model.

The original swept chestnut ribbon groom has 2,800 cuttable fibers and sixteen two-segment guide chains. Real-time gravity, inertia, bending and collision are implemented in `js/clue/hair-motion.js`; the GLB alone contains the mesh, weights, guide rig and haircut metadata.

All seven existing body animation clips remain. Speech uses UV-topology correspondence, with independently deforming upper/lower lips and matching oral geometry. Playback timing is approximate text/audio synchronization. This remains a game character under visual review, not a claim of finished AAA production quality.
