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
5. **Scout Troop:** five scouts and their leader. Steal Granny's dress off the
   washing line to fool grown-ups (kids aren't fooled).
6. **Ranger Station:** night rangers with a tower searchlight and flashlights.
   Granny won't work here, but everyone bows to the Queen, if you can find her costume.
7. **Snowy Cabins:** Bruno leaves paw prints in the snow that people follow.
   Find the snowman kit, but don't wear it near the fire!
8. **Forest Festival:** a crowd and a costume contest. Wear the Benny the Bear
   mascot suit (there are two) and catch 3 people without anyone seeing.
9. **Hunting Lodge:** hunters shoot sleepy darts (dodge the red aim lines; 3
   hits and Bruno naps). Watch for bear traps; honey pots heal.
10. **The Army Camp:** catch the sleeping General. Soldiers are fooled by the
    uniform from far away, but if the Sergeant spots you he sounds the alarm.

### Costumes

Costumes aren't free: Bruno has to **find** each one in the level (a washing
line, a dressing-up trunk, a snowman kit; look for the sparkles), then **put it on
where nobody can see him**. Changing takes a moment, and anyone who catches him
at it raises the alarm ("The bear is putting on a DRESS?!"). Changing inside a
bush is safe. A costume is **ruined** when he pounces, so each one is good for
one catch.

### Main menu and saving

The game opens on the main menu. **Continue** picks up at the level you were
on, and **Choose Level** replays any level you've reached. Progress is saved in
the browser automatically, and **Reset progress** (tap twice) starts over.
Pull Bruno's nose on the menu to make him growl, or tap the top of his head to
try on his hats.

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
| Put on / take off a costume you've found (level 5+) | C (cycles through them) | Disguise button |
| Pause (Keep playing, Restart level, Main menu) | Esc | ❚❚ button |
| Restart level | R | ↺ button |
| Back to the main menu | Esc on a level card, or ☰ Menu | ☰ Menu |
| Sound on/off | M | 🔊 button |

## Develop

Plain HTML + JavaScript modules, with no build step. Serve the folder and open it:

```sh
python -m http.server 8000   # then open http://localhost:8000
```

Pushing to `main` updates the live site (GitHub Pages).

Sound clips are built from the original Freesound downloads with
`python tools/build_sounds.py <folder of downloads>`, which lists every cut.
