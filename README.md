# Bear Attack

Bruno the bear sneaks up on people in his territory: hiding in bushes, creeping
through the dark, and wearing ridiculous costumes. See [DESIGN.md](DESIGN.md)
for the full game plan.

**Play:** https://wufle.github.io/bear-attack/

## Levels

1. **The Picnic:** one kid alone on a picnic blanket.
2. **The Hiker:** a grown-up on a forest trail who looks all around. Twigs snap
   unless you sneak over them.
3. **Campfire Night:** two campers by the fire. Stay in the dark, and growl to
   lure one over.
4. **Gone Fishin':** a fisherman on a dock and his dog. The dog smells you from
   downwind, so watch the wind, or throw him a fish.
5. **Scout Troop:** five scouts and their leader. Put on the Grandma disguise to
   fool grown-ups (kids aren't fooled).
6. **Ranger Station:** night rangers with a tower searchlight and flashlights.
   Granny won't work here, but everyone bows to the Queen.
7. **Snowy Cabins:** Bruno leaves paw prints in the snow that people follow.
   Disguise yourself as a snowman, but not near the fire!

Your progress is saved in the browser. On the level card, press 1-7 or use ◀ ▶ to
replay any level you've reached.

Sounds are real recordings from [Freesound](https://freesound.org), all CC0
(public domain). See [sounds/CREDITS.md](sounds/CREDITS.md).

Works in desktop browsers and on Android/iPhone (hold the phone sideways). On a
phone, use *Add to Home Screen* to play fullscreen like an app.

## Controls

Modelled on Minecraft.

| Action | Keyboard + mouse (Java) | Touch (Bedrock) |
|---|---|---|
| Move | WASD / arrows | Joystick: left side of the screen |
| Sneak (silent) | Hold Shift | Sneak button (toggle) |
| Sprint (loud) | Hold Ctrl, or double-tap W | Sprint button (stops when you stop) |
| Pounce | Left click (toward cursor) or Space | Pounce button, or tap the right side (toward the tap) |
| Growl (level 3+) | Right click or G | Growl button |
| Throw a fish (level 4+) | Q (like dropping an item) | Fish button |
| Disguises (level 5+): Granny, Queen, Snowman | C (cycles through them) | Disguise button |
| Pause | Esc | ❚❚ button |
| Restart level | R | |
| Sound on/off | M | 🔊 button |

## Develop

Plain HTML + JavaScript modules, with no build step. Serve the folder and open it:

```sh
python -m http.server 8000   # then open http://localhost:8000
```

Pushing to `main` updates the live site (GitHub Pages).

Sound clips are built from the original Freesound downloads with
`python tools/build_sounds.py <folder of downloads>`, which lists every cut.
