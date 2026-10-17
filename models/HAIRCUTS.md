# Human avatars and cuttable hair

All eight guests have individual human meshes and authored Blender grooms.
Robot bodies and Mr. Grimsby have no hair. Color IDs stay stable across forms.

## Avatar settings

- **No Human Avatars:** every guest uses the original solid-color robot; no haircut tasks.
- **Robot and Human Avatars (default):** human-controlled seats have human bodies; AI seats use robots.
- **Only Human Avatars:** all eight seats use human bodies, including AI seats. AI seats remain AI controlled.

The online host sets this directly below Killer settings. Local play shows the
selector below Back. Match snapshots preserve the selected policy.

## Preview

Press **Ctrl + backtick** and choose any of the eight guests. Inspect face, hair,
shoes, walking, running, sitting, blinking and speech. Scissors switches orbit to
cutting: drag across visible fibers. Trim 25%, Cut to half, Shave and Reset hair
are local groom studies; preview cuts persist only in tab session storage.
They never change an active match. Preview loads only the selected human model.

## Cut Hair task

Hold the **Kitchen Knife**. Share the haircut task in conversation to roll for
permission. Stealth, persuasion, target observation and trust affect that d20;
a human recipient must still explicitly Accept. If accepted, both guests walk
to the hydraulic barber chair in the bathroom. The actor manually drags across
hair in the cutting view. Remove at least **15% of the original total groom
length** to complete the task. Cutting more already-shortened fibers cannot
fake progress. Leave cancels the session.

A knife holder can instead use **T / Use** while targeting a living human-form
guest to attempt a stealth d20 against their observation (attention). Being seen
raises the difficulty. Success opens a short manual sneak-cut window; failure
costs trust. Robots and corpses are never eligible. Tasks require at least two
living human-form guests with useful hair remaining; when no target remains,
an unfinished assignment is waived without penalty. The same applies if the
last eligible target dies during that day.

A killer who obtained permission can pretend to cut, then choose the private
**Slit throat** action while the other guest is in the chair. This uses the
existing murder rules, including kill-day availability and one-kill limits.
It is not a way to kill on a protected day.

The host validates the knife, living forms, reach, line of sight, session,
consent, stroke rate and strand lengths. It awards task completion. Cuts merge
monotonically, so stale updates cannot regrow hair. Snapshots preserve cuts;
an interrupted chair session is cancelled on recovery rather than inventing
continued consent. New matches start with the original grooms.

## Fiber representation

`avatar.haircuts` exposes `cutAtRay(ray,radiusMeters)`, `cutSphere`, `cutStrand`
(with `commit`), `trim`, `serialize`, `apply` and preview `reset`.
The shader clips fibers at measured arc length. Detached clippings fall and fade.
Each guide ends at its longest surviving follower; roots remain pinned.
Leonie's bun core and hairpin disappear as bun fibers are removed; scalp
undercoats and Sera's support locks also obey local strand limits.

Wire format: `{schema:1,groom:"green-v1",cuts:[[strandId,lengthTenthsMm],...]}`.
Every color uses `<color>-v1`. IDs must not be reordered without a new schema.
The catalog stores original lengths for host-side progress accounting.

Guide particles use 120 Hz Verlet integration, compliant length constraints,
airflow relative to movement, head/body/arm collision and coarse guide separation.
Short styles and tied hair retain stronger support; long ends are flexible.
This is guide-driven real-time fiber hair, not individual simulation of every
fiber, full fiber collision or a guarantee of film rendering on all devices.

Blender sources live in the local art workspace: `art/hair/` and
`art/remaining/cast-distinct-faces-fitted-gear.blend`. Production packaging keeps
the original animation clips, bind poses and custom hair attributes.

References: the user's Hair Salon project, especially `js/hair3d.js`,
[XPBD](https://matthias-research.github.io/pages/publications/XPBD.pdf), and
[Three.js r160 GLTFLoader](https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/jsm/loaders/GLTFLoader.js).
