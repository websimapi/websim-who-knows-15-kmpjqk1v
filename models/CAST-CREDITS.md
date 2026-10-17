# Human cast additions and polish

Mara Vale (red), Ivo Quill (yellow), Nessa Calder (copper), and Basil Reed (teal)
use the project's MakeHuman-derived human base and X Bot animation rig.
They have individual skull/jaw/cheek/nose/mouth proportions, fitted clothing,
occupational accessories and strand grooms informed by `npc/<color>/soul.md`.
They are original fictional character designs, not portraits of real people.

The MakeHuman basemesh, macro target assets and eye source are CC0; see
`MAKEHUMAN-ASSETS-LICENSE.md`, `LEONIE-CREDITS.md`, `ELIAN-CREDITS.md` and
`SERA-CREDITS.md` for provenance. The X Bot rig/animations retain their existing
project asset terms. The current Tomas head also uses the CC0 anatomical base; his previous scanned head remains hidden in the local source only and retains its historical attribution in `TOMAS-CREDITS.md`.

All eight footwear designs are original procedural Blender meshes: Tomas cap-toe
oxfords, Leonie oxblood Mary Janes, Elian comfortable derbies, Sera field boots,
Mara burgundy loafers, Ivo perforated brogues, Nessa leather work boots and Basil
rubber rain boots. Rounded lofts, soles, welts, straps, stitching and lacework
are authored geometry. Existing square shoe bottoms are removed in production.

## Facial animation

The 15 mouth shapes are retargeted from **visemes02**, contributed by
**Mika Suominen**, distributed by the MakeHuman Community under **CC0**.
Source pack metadata is retained locally with the original target files:
`art/remaining/visemes/packs/visemes02.json`.

- [MakeHuman visemes02 asset page](https://static.makehumancommunity.org/assets/assetpacks/visemes02.html)
- [Original pack](https://files2.makehumancommunity.org/functional/visemes02.zip)
- [MakeHuman lip sync documentation](https://static.makehumancommunity.org/mpfb/docs/lipsync/index.html)

The audio player uses the actual playback clock and audio envelope. Text-derived
visemes and coarticulation approximate speech timing; the TTS API does not supply
phoneme timestamps, so this is not phoneme alignment from the speech service.
Private inner thoughts do not animate a mouth. Robot bodies have no human lips.


### Device speech compatibility

When Websim returns an empty audio URL or its speech service fails, the player
uses the device's speech engine. Real start/end and word boundary events anchor
the mouth shapes; letter timing inside each word is approximate and there is no
measured audio envelope for device speech. If device speech is also unavailable,
the mouth remains neutral and the studio reports that speech is unavailable.
Audio URL playback uses the audio clock and measured envelope as described above.


The portrait repair pass removes earlier narrow stacked sculpt fields before
applying broader individual jaw, cheek, chin, nose and lip proportions. Source
head extents register the CC0 speech targets separately for the male and female
base meshes. Production mouth shapes include normal deltas for moving surfaces.
The palettes are artistic interpretations of the characters' professions and
personalities; the soul files do not specify canonical hair color or ethnicity.

## Nine-character fitted oral/eye source pass

The current nine models, including Mr. Grimsby, use the official MakeHuman CC0 system skin textures, high-poly eyes and iris textures, teeth_shape01 dental arches/gingiva and tongue01. These are fitted through the native helper cage. The eye texture alpha removes the outer support surface; it must be preserved as an alpha mask.

- [Official CC0 system assets pack](https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip)
- [System assets provenance](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html)

The authored appearances in the soul files are new art directions. Ethnicity and complexion do not change statistics or imply personality traits. Grimsby's formal livery, white gloves, receding silver groom and polished black derbies are original project styling.

The production models use meshopt compression and WebP textures. Their full detailed Blender source is kept separately; simplified game meshes retain the oral morph targets, all seven body clips, and exact v3 haircut IDs.
