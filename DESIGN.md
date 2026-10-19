# Bear Attack — Game Design

## The pitch

**Bruno** is a big, hungry, not-very-subtle bear, and people keep wandering into
his territory. He has to creep up on them without being seen or raising
suspicion — hiding behind bushes, staying in the dark, and wearing some very
questionable disguises.

When Bruno catches someone there's a **tussle** (a big cartoon dust cloud),
followed by Bruno **licking his lips**.

## Rules

- **Win a level** by catching every person in it.
- **Restart the level** if anyone escapes, or if Bruno is beaten by people who
  fight back.
- **Getting spotted:** the spotter shouts, and everyone within earshot of the
  spotter is alerted. Unarmed people run away — they're faster than Bruno, so he
  usually can't catch up. Armed people fight back instead.

## How it plays

Top-down view. Every person has a **vision cone** drawn on the ground.

**Suspicion meter** over each person's head:

- 😐 **Calm** — following their normal routine.
- ❓ **Suspicious** — stops, turns toward what they noticed ("Did that bush just move?").
- ❗ **Spotted** — shouts, alerts everyone in earshot, then runs (or fights).

Seeing Bruno fills the meter fast (faster the closer he is). Hearing him fills
it slowly and makes the person turn to look. The meter drains if nothing
happens for a while.

### Bruno's moves

| Move   | Effect |
|--------|--------|
| Sneak  | Slow, silent |
| Walk   | Normal speed, small noise radius |
| Run    | Fast, loud |
| Pounce | Short leap — catches anyone it hits. Loud! |
| Growl  | *(later)* Lures people toward the sound |
| Throw fish | *(later)* Distraction: "…why is there a salmon here?" |

### Hiding

- **Bushes** — inside one, Bruno can't be seen (but moving quickly makes it rustle).
  Bushes and trees also block line of sight, so he can hide *behind* them.
- **Darkness** — at night people only see a short way, except where firelight
  or flashlights reach.
- **Costumes** — each has a trick and a weakness:

| Costume | Trick | Weakness |
|---|---|---|
| Bush hat | Invisible while standing still | Moving: "Bushes don't walk…" |
| Cardboard box | Very sneaky | Super slow; people try to sit on it |
| **Queen costume** 👑 | Everyone bows the first time they see the Queen — frozen for a couple of seconds, a perfect time to pounce. Soldiers salute and stand at attention | Royal walking pace only. Her shoes clip-clop even when sneaking, so people turn and bow too early. Each person only bows once. There's one crown per level: pounce or run and it's gone. Dogs aren't fooled |
| Grandma disguise | Walk in plain sight | Fools adults, never kids ("THAT'S A BEAR") |
| Tree stump | Totally invisible | Can't move at all |
| Snowman | Perfect in snow | Melts near campfires |
| Mascot suit ("Benny the Bear") | Blends in at the festival | Only works at the festival |
| Soldier uniform + fake mustache | Gets through the army camp | Only from far away — up close the mustache falls off |

Dogs ignore all costumes — they smell the bear.

## Levels

1. **The Picnic** — one defenseless kid on a picnic blanket. Tutorial: sneak, hide, pounce.
2. **The Hiker** — one adult who stops to look around. Adds twigs/noise.
3. **Campfire Night** — two campers. Firelight dangerous, shadows safe. Adds darkness + growl.
4. **Gone Fishin'** — fisherman and his dog. The dog smells Bruno; stay downwind or throw a fish.
5. **Scout Troop** — a group of kids and a troop leader. If one spots Bruno, they all scatter. Unlocks grandma disguise.
6. **Ranger Station** — rangers with binoculars (long sight) and flashlights. Unlocks the Queen costume.
7. **Snowy Cabins** — Bruno leaves footprints that people follow. Unlocks snowman.
8. **Forest Festival** — crowds and a costume contest. Unlocks mascot suit.
9. **Hunting Lodge** — armed hunters who fight back, camouflage, bear traps, honey decoys.
10. **The Army Camp** — searchlights, guard towers, armed soldiers, and a drill sergeant boss. Reach the general's tent.

From level 9 on, Bruno has a **health bar**; armed people shoot back, and if
he's knocked out the level restarts.

## Extras (maybe)

- 3 stars per level: caught everyone / never spotted / fast time.
- Berries or fish to collect.
- Bruno's den between levels: pick which costumes to bring.
