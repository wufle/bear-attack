# Bear Attack

Bruno the bear sneaks up on people in his territory: hiding in bushes, creeping
through the dark, and wearing ridiculous costumes. See [DESIGN.md](DESIGN.md)
for the full game plan.

**Play:** https://wufle.github.io/bear-attack/

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
| Pause | Esc | ❚❚ button |
| Restart level | R | |

## Develop

Plain HTML + JavaScript modules, with no build step. Serve the folder and open it:

```sh
python -m http.server 8000   # then open http://localhost:8000
```

Pushing to `main` updates the live site (GitHub Pages).
