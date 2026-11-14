"""
Bit2Beat · 30-second promo (Manim Community, 60 fps, LaTeX text, 3Blue1Brown black).

Every cut lands on the 120 BPM grid of promo_soundtrack.py (one beat = 0.5 s, one bar = 2 s), and
the picture moves with the music: a spectrum visualiser and the beat "pulse" are driven by an
analysis of the real track (build/promo-spectrum.json, made by render.sh before rendering).

  0:00  Hook      NASA's temperature curve draws itself; "What does our planet sound like?" word by word
  0:03  DROP      flash, shockwave: data bits slam into "Bit", a playhead reveals "2Beat"
  0:06  The app   five real screenshots, whip-panned on every bar, each breathing with the kick
  0:16  Break     146 years · 91 earthquakes · For everyone
  0:19  DROP      the team: five portraits pop on the beat, bounce with the kick, each plays a note
  0:26  DROP      logo slam, "Listen to Earth."

Render:  bash video/render.sh promo   (promo-preview, promo-4k)
"""
from manim import *
import json
import math
import random
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / "film-data.json").read_text())
SPEC_FILE = ROOT / "build" / "promo-spectrum.json"
SPEC = json.loads(SPEC_FILE.read_text()) if SPEC_FILE.exists() else None

BG = "#0B0B0D"
CREAM = "#F6F1E7"
AMBER = "#E8A33D"
GREY1 = "#B9B9BE"
EDGE = "#3A3A42"
BEAT = 0.5  # 120 BPM

config.background_color = BG
config.frame_rate = 60

SHOTS = [  # (screenshot, words before, highlighted words, words after, direction of the whip)
    ("studio", "NASA climate data, turned into", "music", "", LEFT),
    ("earth", "Live earthquakes, played", "west to east", "", UP),
    ("video", "NASA videos, read through their own", "colour bars", "", RIGHT),
    ("story", "Bitty's story:", "eight chapters", "of real data", DOWN),
    ("guide", "A guide for", "every", "visitor", LEFT),
]
TEAM = [
    ("george-hany", "George Hany", "Team leader"),
    ("mina-helal", "Mina Helal", "Data analyst"),
    ("steven-joseph", "Steven Joseph", "Integration lead"),
    ("mostafa-ragab", "Mostafa Ragab", r"UI specialist \& engine"),
    ("mostafa-mohammed", "Mostafa Mohammed", "Core"),
]


def tx(*parts, size=36, color=CREAM):
    return Tex(*parts, font_size=size, color=color, arg_separator=" ")


def highlight_line(before, hi, after, size=46):
    parts = [p for p in (before, hi, after) if p]
    t = tx(*parts, size=size)
    t[parts.index(hi)].set_color(AMBER)
    return t


def fit(m, w=None, h=None):
    if w and m.width > w:
        m.scale_to_fit_width(w)
    if h and m.height > h:
        m.scale_to_fit_height(h)
    return m


# ---------------------------------------------------------------- the music, as numbers per frame
def kick(t):
    if SPEC:
        k = SPEC["kick"]
        return k[min(len(k) - 1, max(0, int(t * 60)))]
    on = (3 <= t < 16) or (19 <= t < 25.5) or t >= 26
    return math.exp(-((t % BEAT) / 0.09)) * (1.0 if on else 0.25)


def bands(t):
    if SPEC:
        b = SPEC["bands"]
        return b[min(len(b) - 1, max(0, int(t * 60)))]
    k = kick(t)
    return [max(0.0, min(1.0, 0.25 + 0.6 * k * (1 - j / 30) + 0.15 * math.sin(7 * t + j))) for j in range(24)]


class Bit2BeatPromo(Scene):
    def construct(self):
        self.events = []
        random.seed(7)
        self.visualiser()
        self.hook()
        self.drop_logo()
        self.montage()
        self.numbers()
        self.team()
        self.end_card()
        out = ROOT / "build" / "promo-events.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"duration": float(self.time), "bpm": 120, "events": self.events}, indent=1))

    # ------------------------------------------------------------ timing, sound, effects
    def at(self, t):
        dt = t - float(self.time)
        if dt > 1e-3:
            self.wait(dt)

    def note(self, midi, gain=-8.0, delay=0.0, pan=0.0, voice="bell"):
        self.events.append({"t": round(float(self.time) + delay, 4), "midi": int(midi), "db": gain, "pan": pan, "voice": voice})

    def flash(self, color=CREAM, opacity=0.55):
        """A full-frame flash, shown now; fade it in the next play()."""
        r = Rectangle(width=config.frame_width + 1, height=config.frame_height + 1, stroke_width=0, fill_color=color, fill_opacity=opacity)
        self.add(r)
        return FadeOut(r)

    def shock(self, where=ORIGIN, size=30, color=AMBER, width=10):
        """A ring that bursts outwards; returns (ring, animation). Remove the ring afterwards."""
        ring = Circle(radius=0.2, stroke_color=color, stroke_width=width).move_to(where)
        self.add(ring)
        return ring, ring.animate.scale(size).set_stroke(width=0.5, opacity=0)

    def live(self, m, zoom=0.0, pulse=0.0):
        """Let m breathe: slow zoom plus a punch on every kick of the real track."""
        st = {"t": float(self.time), "f": 1.0, "t0": float(self.time)}
        # own the group in the scene (its parts may have been added one by one)
        self.remove(*[x for x in m.get_family()[1:] if x in self.mobjects])
        if m not in self.mobjects:
            self.add(m)

        def upd(mob, dt):
            st["t"] += dt
            f = (1 + zoom * (st["t"] - st["t0"])) * (1 + pulse * kick(st["t"]))
            mob.scale(f / st["f"])
            st["f"] = f

        m.add_updater(upd)
        return m

    def still(self, *mobs):
        for m in mobs:
            m.clear_updaters()

    # ------------------------------------------------------------ the spectrum along the bottom
    def visualiser(self):
        n = 48
        bars = VGroup(*[Rectangle(width=0.2, height=0.05, stroke_width=0, fill_color=AMBER, fill_opacity=0.5) for _ in range(n)])
        xs = np.linspace(-7.0, 7.0, n)
        base = -config.frame_height / 2
        st = {"t": 0.0, "level": 0.0}
        self.viz_level = 0.55

        def upd(group, dt):
            st["t"] += dt
            st["level"] += (self.viz_level - st["level"]) * min(1.0, dt * 6)
            b = bands(st["t"])
            for i, bar in enumerate(group):
                j = int(abs(i - (n - 1) / 2))  # mirrored: bass in the middle, treble at the edges
                v = b[min(23, j)]
                h = max(0.04, 1.25 * v * st["level"])
                bar.stretch_to_fit_height(h)
                bar.move_to([xs[i], base + h / 2, 0])
                bar.set_fill(AMBER, opacity=0.18 + 0.5 * st["level"] * v)

        bars.add_updater(upd)
        self.add(bars)
        self.viz = bars

    # ------------------------------------------------------------ 0:00 hook
    def hook(self):
        raw = DATA["gistemp"]["raw"]
        lo, hi = min(raw), max(raw)
        pts = [np.array([-6.4 + i * 12.8 / (len(raw) - 1), -2.4 + (v - lo) / (hi - lo) * 2.5, 0]) for i, v in enumerate(raw)]
        curve = VMobject(stroke_color=AMBER, stroke_width=5).set_points_smoothly(pts)
        glow = curve.copy().set_stroke(AMBER, width=18, opacity=0.16)
        tip = Dot(radius=0.09, color=CREAM)
        tip.add_updater(lambda d: d.move_to(curve.get_end()))
        words = tx("What", "does", "our planet", r"\emph{sound}", "like?", size=88).move_to(UP * 1.6)
        words[3].set_color(AMBER)
        self.add(tip)
        for i in range(5):
            self.note([57, 60, 64, 67, 72][i], -14, i * 0.4, pan=-0.5 + 0.25 * i, voice="glass")
        self.play(
            Create(curve), Create(glow),
            LaggedStart(*[FadeIn(w, shift=UP * 0.35, scale=1.5) for w in words], lag_ratio=1.0),
            run_time=2.0, rate_func=linear,
        )
        tip.clear_updaters()
        # tension before the drop
        self.play(Indicate(words[3], color=AMBER, scale_factor=1.25), run_time=0.5)
        self.hook_parts = (curve, glow, tip, words)

    # ------------------------------------------------------------ 0:03 drop: the logo
    def build_logo(self, width=9.0, center=ORIGIN):
        s = width / 538.0
        h = 130 * s
        left, top = center[0] - width / 2, center[1] + h / 2
        image = ImageMobject(str(ROOT / "assets" / "wordmark-beat.png")).scale_to_fit_width(width).move_to(center)
        squares = VGroup()
        for x, y, amber in DATA["logo"]["cells"]:
            sq = Square(side_length=11 * s, stroke_width=0, fill_color=AMBER if amber else CREAM, fill_opacity=1)
            sq.move_to([left + (x + 20 + 5.5) * s, top - (y + 20 + 5.5) * s, 0])
            squares.add(sq)
        return squares, image, s, left

    def drop_logo(self):
        curve, glow, tip, words = self.hook_parts
        c = UP * 0.45
        squares, image, s, left = self.build_logo(9.0, c)
        # the question explodes outwards while the bits rush in from everywhere (2.5 → 3.0)
        scattered = squares.copy()
        for sq in scattered:
            ang = random.uniform(0, TAU)
            sq.move_to([9 * math.cos(ang), 5.5 * math.sin(ang), 0]).rotate(random.uniform(-2, 2)).scale(random.uniform(0.6, 2.0))
        outs = []
        for w in words:
            d = w.get_center() - ORIGIN
            outs.append(w.animate.shift(d * 1.2 + UP * 0.5).scale(1.6).set_opacity(0))
        self.play(
            *outs, FadeOut(VGroup(curve, glow, tip), scale=1.2),
            LaggedStart(*[Transform(a, b) for a, b in zip(scattered, squares)], lag_ratio=0.004),
            run_time=0.5, rate_func=rush_into,
        )
        self.remove(*words)
        # 3.0: DROP
        self.note(45, -2, voice="impact")
        fl = self.flash(CREAM, 0.6)
        ring, burst = self.shock(c, 34)
        x0 = left + (166 + 20) * s - 0.08
        span = c[0] + 4.6 - x0
        playhead = Line([x0, c[1] - image.height / 2 - 0.2, 0], [x0, c[1] + image.height / 2 + 0.2, 0], color=AMBER, stroke_width=8)
        curtain = Rectangle(width=span + 0.4, height=image.height + 0.5, stroke_width=0, fill_color=BG, fill_opacity=1).move_to([x0 + (span + 0.4) / 2, c[1], 0])
        self.add(image, curtain, playhead)
        self.bring_to_front(fl.mobject)
        for svg_x, midi in [(166, 72), (266, 76), (326, 79), (392, 81), (460, 84)]:
            x = left + (svg_x + 20) * s
            self.note(midi, -9, (x - x0) / span * 0.8, pan=x / 6)
        self.viz_level = 1.0
        self.play(fl, burst, curtain.animate.shift(RIGHT * span), playhead.animate.shift(RIGHT * span), run_time=0.8, rate_func=linear)
        self.remove(curtain, ring)
        tag = tx(r"Listen to Earth data.", size=56).next_to(image, DOWN, buff=0.55)
        self.play(FadeOut(playhead), Write(tag), run_time=0.5)
        logo = Group(scattered, image, tag)
        self.live(logo, zoom=0.03, pulse=0.05)
        self.logo_now = logo
        self.at(6.0 - 0.3)

    # ------------------------------------------------------------ 0:06 the app, whip-panned on every bar
    def browser(self, name):
        shot = ImageMobject(str(ROOT / "assets" / "shots" / f"{name}.png")).scale_to_fit_width(10.6)
        bar = RoundedRectangle(width=10.6, height=0.34, corner_radius=0.08, stroke_width=0, fill_color="#26262C", fill_opacity=1).next_to(shot, UP, buff=0)
        dots = VGroup(*[Dot(radius=0.055, color=c) for c in ("#FF5F57", "#FEBC2E", "#28C840")]).arrange(RIGHT, buff=0.12).move_to(bar).align_to(bar, LEFT).shift(RIGHT * 0.22)
        border = Rectangle(width=10.6, height=shot.height + 0.34, stroke_color=EDGE, stroke_width=2).move_to(Group(bar, shot))
        glowline = Rectangle(width=10.6, height=shot.height + 0.34, stroke_color=AMBER, stroke_width=2, stroke_opacity=0.5).move_to(border)
        return Group(glowline, bar, dots, shot, border).move_to(UP * 0.5)

    def montage(self):
        logo = self.logo_now
        self.still(logo)
        self.viz_level = 0.45
        prev, prev_cap = None, None
        for i, (name, before, hi, after, d) in enumerate(SHOTS):
            T0 = 6.0 + 2.0 * i
            frame = self.browser(name)
            cap = fit(highlight_line(before, hi, after), 12.8).to_edge(DOWN, buff=0.5)
            dist = 15 if d[0] else 9.5
            self.at(T0 - 0.3)
            if prev is None:
                # the logo flies through the camera, the first screen lands on the downbeat
                self.play(FadeOut(logo, scale=4), FadeIn(frame, scale=0.55), run_time=0.3, rate_func=rush_into)
            else:
                self.still(prev)
                frame.shift(-d * dist)
                self.play(prev.animate.shift(d * dist), frame.animate.shift(d * dist), FadeOut(prev_cap, shift=d * 2), run_time=0.3, rate_func=rush_into)
                self.remove(prev)
            # on the downbeat: flash, caption, then breathe with the kick until the next bar
            self.note([60, 64, 67, 69, 72][i], -13, voice="glass")
            fl = self.flash(AMBER if i % 2 else CREAM, 0.28)
            self.play(fl, FadeIn(cap, shift=UP * 0.25), run_time=0.25)
            self.live(frame, zoom=0.025, pulse=0.03)
            prev, prev_cap = frame, cap
        self.at(16.0 - 0.3)
        self.still(prev)
        self.play(FadeOut(prev, scale=0.05), FadeOut(prev_cap, scale=0.5), run_time=0.3, rate_func=rush_into)

    # ------------------------------------------------------------ 0:16 break: three numbers
    def numbers(self):
        self.viz_level = 0.75

        def slam_count(value, label):
            big = Integer(0, font_size=190, color=AMBER).move_to(UP * 0.55)
            sub = fit(tx(label, size=44), 12.5).next_to(big, DOWN, buff=0.4)
            self.note(84, -8)
            ring, burst = self.shock(big.get_center(), 22, AMBER, 8)
            self.add(big)
            self.play(ChangeDecimalToValue(big, value), burst, FadeIn(sub, shift=UP * 0.25), run_time=0.45, rate_func=rush_from)
            self.remove(ring)
            self.play(Indicate(big, color=CREAM, scale_factor=1.08), run_time=0.3)
            return VGroup(big, sub)

        self.at(16.0)
        a = slam_count(146, r"years of NASA temperature, from 1880 to 2025")
        self.at(17.0 - 0.2)
        self.play(a.animate.shift(LEFT * 15), run_time=0.2, rate_func=rush_into)
        self.remove(a, *a)
        b = slam_count(91, r"real earthquakes from one week, played west to east")
        self.at(18.0 - 0.2)
        self.play(b.animate.shift(LEFT * 15), run_time=0.2, rate_func=rush_into)
        self.remove(b, *b)
        big = tx(r"\textbf{For everyone}", size=120, color=AMBER).move_to(UP * 0.55)
        sub = tx(r"built for people who \emph{can't see} a chart", size=46).next_to(big, DOWN, buff=0.45)
        self.note(79, -7)
        fl = self.flash(AMBER, 0.3)
        self.play(fl, FadeIn(big, scale=2.6), run_time=0.3, rate_func=rush_from)
        self.play(Write(sub), run_time=0.4)
        self.at(19.0 - 0.3)
        self.play(FadeOut(big, scale=5), FadeOut(sub, scale=2), run_time=0.3, rate_func=rush_into)

    # ------------------------------------------------------------ 0:19 drop: the team
    def team(self):
        self.viz_level = 1.0
        self.note(45, -3, voice="impact")
        fl = self.flash(CREAM, 0.55)
        title = tx(r"Made by Team \textbf{Bit2Beat}", size=66).to_edge(UP, buff=0.55)
        ring0, burst = self.shock(ORIGIN, 34)
        self.play(fl, burst, FadeIn(title, scale=1.8), run_time=0.4, rate_func=rush_from)
        self.remove(ring0)
        xs = [-5.3, -2.65, 0, 2.65, 5.3]
        cards = []
        for i, ((slug, name, role), x) in enumerate(zip(TEAM, xs)):
            self.at(19.5 + i * BEAT)
            photo = ImageMobject(str(ROOT / "assets" / "team" / f"{slug}.png")).scale_to_fit_height(2.15).move_to([x, 0.45, 0])
            ring = Circle(radius=1.12, color=AMBER, stroke_width=5).move_to(photo)
            nm = fit(tx(r"\textbf{%s}" % name, size=32), 2.5).move_to([x, -1.17, 0])
            rl = fit(tx(role, size=26, color=AMBER), 2.5).next_to(nm, DOWN, buff=0.14)
            self.note([60, 64, 67, 69, 72][i], -9, pan=x / 7)
            pop, popanim = self.shock(photo.get_center(), 9, CREAM, 6)
            self.play(FadeIn(photo, scale=0.3), Create(ring), popanim, FadeIn(nm, shift=UP * 0.25), FadeIn(rl, shift=UP * 0.25), run_time=0.4, rate_func=rush_from)
            self.remove(pop)
            card = Group(photo, ring, nm, rl)
            self.live(card, pulse=0.045)
            cards.append(card)
        self.at(22.0)
        line = tx(r"Five of us. One planet. Every number becomes a note.", size=36, color=GREY1).to_edge(DOWN, buff=1.4)
        self.play(FadeIn(line, shift=UP * 0.25), run_time=0.5)
        # each of us is a note: a playhead sweeps the team
        self.at(23.0)
        head = Line(UP * 1.75, DOWN * 2.1, color=AMBER, stroke_width=6).move_to([-7.0, -0.2, 0])
        self.add(head)
        for i, x in enumerate(xs):
            self.note([72, 76, 79, 81, 84][i], -6, (x + 7.0) / 14.0 * 2.0, pan=x / 7)
        passed = set()

        def light(m, dt):
            for i, card in enumerate(cards):
                if i not in passed and card[1].get_x() <= m.get_x():
                    card[1].set_stroke(CREAM, width=9)
                    passed.add(i)

        head.add_updater(light)
        self.play(head.animate.set_x(7.0), run_time=2.0, rate_func=linear)
        head.clear_updaters()
        self.remove(head)
        # 25.6: everyone collapses into the centre …
        self.at(25.6)
        for c in cards:
            self.still(c)
        self.play(*[c.animate.move_to(ORIGIN).scale(0.05) for c in cards], FadeOut(title, scale=0.5), FadeOut(line, scale=0.5), run_time=0.4, rate_func=rush_into)
        self.remove(*cards)

    # ------------------------------------------------------------ 0:26 drop: the end card
    def end_card(self):
        self.at(26.0)
        squares, image, s, left = self.build_logo(10.0, UP * 0.75)
        self.note(41, -2, voice="impact")
        fl = self.flash(AMBER, 0.5)
        ring, burst = self.shock(UP * 0.75, 40)
        self.play(fl, burst, LaggedStart(*[GrowFromCenter(sq) for sq in squares], lag_ratio=0.008), FadeIn(image, scale=1.35), run_time=0.5, rate_func=rush_from)
        self.remove(ring)
        tag = tx(r"Listen to Earth.", size=84).next_to(image, DOWN, buff=0.6)
        self.play(Write(tag), run_time=0.6)
        self.note(84, -9)
        logo = Group(squares, image, tag)
        self.live(logo, zoom=0.02, pulse=0.035)
        self.at(29.3)
        self.still(logo)
        self.viz_level = 0.0
        self.play(FadeOut(logo, scale=1.1), FadeOut(self.viz), run_time=0.7)
