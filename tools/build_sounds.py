"""Cut, trim, normalise and encode the game's sound clips into sounds/.

Sources are Freesound HQ previews (all CC0, see sounds/CREDITS.md), saved as
<freesound id>.mp3 in SRC_DIR, plus three kid screams from Swoopin.

    python tools/build_sounds.py SRC_DIR [SWOOPIN_SOUNDS_DIR]

Needs ffmpeg. Output is mono 44.1 kHz mp3, which every browser (including
iPhone Safari) can play.
"""

from __future__ import annotations

import array
import math
import re
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "sounds"
RATE = 44100

# name: (source id, start s, end s). One-shots are peak-normalised, trimmed to
# their onset and faded out.
CLIPS = {
    # Bruno
    "pounce0": ("77637", 0, 1.3),
    "pounce1": ("410343", 1.2, 3.3),
    "growl0": ("763026", 2.0, 4.6),
    "growl1": ("77634", 0, 2.6),
    "eat0": ("519599", 9.8, 12.0),
    "eat1": ("519599", 25.6, 27.8),
    "eat2": ("519599", 48.3, 50.5),
    "crunch0": ("392883", 0, 0.7),
    "crunch1": ("457475", 0.55, 1.1),
    "crunch2": ("353067", 0, 0.3),
    "lick0": ("464021", 0.3, 2.1),
    "lick1": ("464021", 2.9, 4.2),
    "smack0": ("232930", 0.5, 1.0),
    "smack1": ("232930", 1.55, 2.0),
    "mmm0": ("368592", 1.75, 3.0),
    "mmm1": ("368592", 0, 1.0),
    "mmm2": ("52763", 0, 1.6),
    # Bushes and twigs
    "rustle0": ("106114", 0, 1.0),
    "rustle1": ("106113", 0, 0.6),
    "rustle2": ("178615", 0, 1.1),
    "twig0": ("164472", 0, 0.6),
    "twig1": ("452570", 0, 0.5),
    "twig2": ("319230", 0.6, 1.3),
    # Kid
    "kid_giggle0": ("652991", 0.1, 0.7),
    "kid_giggle1": ("652991", 2.7, 3.7),
    "kid_giggle2": ("652991", 5.5, 6.4),
    "kid_laugh0": ("616088", 0, 2.6),
    "kid_hum0": ("408584", 0, 2.8),
    "kid_huh0": ("416688", 0, 0.6),
    "kid_gasp0": ("839996", 0.2, 1.2),
    "kid_gasp1": ("633220", 0.8, 1.5),
    "kid_hello0": ("436471", 0, 3.0),
    # Man
    "man_whistle0": ("369296", 1.4, 2.7),
    "man_whistle1": ("369296", 3.5, 6.8),
    "man_whistle2": ("19825", 0, 0.9),
    "man_laugh0": ("119459", 0.3, 2.5),
    "man_hmm0": ("170779", 0, 0.8),
    "man_hmm1": ("170776", 0.3, 1.2),
    "man_huh0": ("554017", 0, 0.3),
    "man_hm0": ("519112", 0.1, 0.6),
    "man_scream0": ("219719", 0, 1.6),
    "man_scream1": ("203594", 0, 1.0),
    "man_scream2": ("272023", 0, 0.6),
    "kid_huh1": ("150505", 0.1, 0.8),
    "kid_laugh1": ("365632", 0.1, 2.4),
    # Dog
    "bark0": ("163459", 0.2, 0.95),
    "bark1": ("110134", 0, 1.1),
    "bark2": ("231762", 0, 1.5),
    "bark3": ("386766", 0.5, 1.5),
    "sniff0": ("118965", 0, 1.5),
    "sniff1": ("353107", 0.6, 2.4),
    "whine0": ("350593", 0, 0.7),
    "whine1": ("118970", 1.5, 2.6),
    "dog_eat0": ("398730", 0, 0.5),
    # Fish, water, fishing, disguise
    "throw0": ("585257", 0, 0.4),
    "flop0": ("570208", 0, 1.5),
    "flop1": ("679389", 0.4, 1.6),
    "splash0": ("398032", 0, 1.2),
    "splash1": ("319418", 0, 0.9),
    "reel0": ("464701", 0, 2.5),
    "cloth0": ("19291", 0.4, 2.0),
    "cloth1": ("334219", 0, 0.9),
    # Rangers, the Queen, snow
    "radio0": ("524205", 0, 1.2),
    "radio1": ("732209", 0, 0.8),
    "radio2": ("524204", 0, 2.0),
    "click0": ("187335", 0, 0.6),
    "click1": ("410360", 0, 0.3),
    "owl0": ("465697", 0.2, 1.3),
    "owl1": ("465697", 2.6, 4.0),
    "owl2": ("398734", 0.1, 3.6),
    "fanfare0": ("418525", 0, 2.2),
    "clink0": ("259553", 0, 1.5),
    "clink1": ("489767", 0, 1.0),
    "shovel0": ("268056", 0.4, 1.4),
    "shovel1": ("268056", 3.2, 4.0),
    "shovel2": ("560957", 0.1, 1.0),
    "sizzle0": ("351406", 3.5, 6.0),
    # Woman
    "woman_huh0": ("242616", 0, 0.5),
    "woman_huh1": ("460922", 0.5, 1.1),
    "woman_huh2": ("460922", 2.0, 2.7),
    "woman_scream0": ("169811", 0.2, 2.0),
    "woman_scream1": ("219856", 0, 1.2),
    "woman_scream2": ("400183", 0, 1.5),
}

# Background loops: (source id, start, end, crossfade seconds).
LOOPS = {
    "amb_day": ("464147", 0, 32, 2.5),
    "amb_crickets": ("129678", 0, 15.5, 1.5),
    "amb_campfire": ("637523", 2, 24, 2.0),
    "amb_lake": ("528067", 0, 20, 2.0),
    "amb_kids": ("541151", 0, 30, 2.5),
    "amb_winter": ("352436", 0, 30, 2.5),
}

# Footsteps are picked out of longer recordings automatically:
# (source id, how many, length of each in seconds).
STEPS = {
    "bruno_step": ("658429", 4, 0.3),
    "step": ("389625", 4, 0.2),
    "run": ("127955", 4, 0.15),
    "snow_step": ("613849", 4, 0.3),
}

SWOOPIN = {"kid_scream0": "scream0.ogg", "kid_scream1": "scream1.ogg", "kid_scream2": "scream2.ogg"}


def ffmpeg(*args: str) -> str:
    result = subprocess.run(["ffmpeg", "-hide_banner", "-y", *args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-2000:])
    return result.stderr


def peak_db(src: Path, start: float, end: float | None) -> float:
    trim = f"atrim={start}" + (f":{end}" if end is not None else "")
    log = ffmpeg("-i", str(src), "-af", f"{trim},volumedetect", "-f", "null", "-")
    return float(re.search(r"max_volume: ([-0-9.]+) dB", log).group(1))


def one_shot(name: str, src: Path, start: float = 0, end: float | None = None) -> None:
    gain = -1.0 - peak_db(src, start, end)
    trim = f"atrim={start}" + (f":{end}" if end is not None else "")
    chain = (
        f"{trim},asetpts=PTS-STARTPTS,volume={gain:.2f}dB,"
        "silenceremove=start_periods=1:start_threshold=-40dB:start_silence=0.005,"
        "afade=t=in:d=0.004,areverse,afade=t=in:d=0.04,areverse"
    )
    encode(src, chain, OUT / f"{name}.mp3")


def encode(src: Path, chain: str, out: Path) -> None:
    ffmpeg("-i", str(src), "-af", chain, "-ac", "1", "-ar", str(RATE), "-c:a", "libmp3lame", "-q:a", "4", str(out))


def read_pcm(src: Path, rate: int, chain: str = "anull") -> array.array:
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(src), "-af", chain, "-ac", "1", "-ar", str(rate), "-f", "s16le", "-"],
        capture_output=True,
        check=True,
    ).stdout
    return array.array("h", raw)


def loop(name: str, src: Path, start: float, end: float, fade: float) -> None:
    """Crossfade the tail of the segment into its head so it loops seamlessly."""
    gain = -3.0 - peak_db(src, start, end)
    pcm = read_pcm(src, RATE, f"atrim={start}:{end},asetpts=PTS-STARTPTS,volume={gain:.2f}dB")
    n = int(fade * RATE)
    body = pcm[: len(pcm) - n]
    tail = pcm[len(pcm) - n :]
    for i in range(n):
        k = i / n
        mixed = body[i] * math.sqrt(k) + tail[i] * math.sqrt(1 - k)
        body[i] = max(-32768, min(32767, int(mixed)))
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        with wave.open(tmp.name, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(body.tobytes())
        encode(Path(tmp.name), "anull", OUT / f"{name}.mp3")


def step_onsets(src: Path, count: int) -> list[float]:
    """Find the `count` loudest well-separated footfalls in a recording."""
    rate, frame = 8000, 80  # 10 ms frames
    pcm = read_pcm(src, rate)
    db = []
    for i in range(0, len(pcm) - frame, frame):
        chunk = pcm[i : i + frame]
        rms = math.sqrt(sum(s * s for s in chunk) / frame) / 32768
        db.append(20 * math.log10(max(rms, 1e-7)))
    floor = sorted(db)[len(db) // 5]
    peaks = [
        i for i in range(12, len(db) - 30)
        if db[i] == max(db[i - 12 : i + 13]) and db[i] > floor + 12
    ]
    peaks.sort(key=lambda i: db[i], reverse=True)
    chosen: list[int] = []
    for i in peaks:
        if all(abs(i - j) > 30 for j in chosen):
            chosen.append(i)
        if len(chosen) == count:
            break
    onsets = []
    for i in sorted(chosen):
        j = i  # walk back to where the step starts
        while j > i - 10 and db[j - 1] > db[i] - 15:
            j -= 1
        onsets.append(max(0.0, j / 100 - 0.01))
    return onsets


def main() -> None:
    src_dir = Path(sys.argv[1])
    swoopin = Path(sys.argv[2]) if len(sys.argv) > 2 else Path.home() / "Work/swoopin/swoopin/sounds"
    OUT.mkdir(exist_ok=True)
    for name, (sid, start, end) in CLIPS.items():
        one_shot(name, src_dir / f"{sid}.mp3", start, end)
        print("clip", name)
    for name, (sid, start, end, fade) in LOOPS.items():
        loop(name, src_dir / f"{sid}.mp3", start, end, fade)
        print("loop", name)
    for name, (sid, count, length) in STEPS.items():
        src = src_dir / f"{sid}.mp3"
        onsets = step_onsets(src, count)
        for k, t in enumerate(onsets):
            one_shot(f"{name}{k}", src, t, t + length)
        print("steps", name, [round(t, 2) for t in onsets])
    for name, file in SWOOPIN.items():
        one_shot(name, swoopin / file)
        print("clip", name)


if __name__ == "__main__":
    main()
