"""
Bit2Beat · 30-second promo (Manim Community, 60 fps, LaTeX text, 3Blue1Brown black).

Every cut lands on the 120 BPM grid of promo_soundtrack.py (one beat = 0.5 s, one bar = 2 s).

  0:00  Hook      NASA's temperature curve draws itself; "What does our planet sound like?"
  0:03  Logo      the data bits fly together into "Bit", a playhead reveals "2Beat"
  0:06  The app   five real screenshots, one per bar
  0:16  Numbers   146 years · 91 earthquakes · For everyone
  0:19  The team  five portraits, one per beat, each plays a note
  0:26  End card  logo, "Listen to Earth."

Render:  bash video/render.sh promo   (promo-preview, promo-4k)
"""
from manim import *
import json
import random
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / "film-data.json").read_text())

BG = "#0B0B0D"
CREAM = "#F6F1E7"
AMBER = "#E8A33D"
GREY1 = "#B9B9BE"
GREY2 = "#6E6E76"
EDGE = "#3A3A42"
BEAT = 0.5  # 120 BPM

config.background_color = BG
config.frame_rate = 60

SHOTS = [  # (screenshot, words before, highlighted words, words after)
    ("studio", "NASA climate data, turned into", "music", ""),
    ("earth", "Live earthquakes, played", "west to east", ""),
    ("video", "NASA videos, read through their own", "colour bars", ""),
    ("story", "Bitty's story:", "eight chapters", "of real data"),
    ("guide", "A guide for", "every", "visitor"),
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


class Bit2BeatPromo(Scene):
    def construct(self):
        self.events = []
        random.seed(7)
        self.hook()
        self.logo()
        self.montage()
        self.numbers()
        self.team()
        self.end_card()
        out = ROOT / "build" / "promo-events.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"duration": float(self.time), "bpm": 120, "events": self.events}, indent=1))

    # ------------------------------------------------------------ timing and sound
    def at(self, t):
        dt = t - float(self.time)
        if dt > 1e-3:
            self.wait(dt)

    def own(self, group):
        """Make the scene hold `group` itself instead of its parts (they were added one by one by
        earlier animations), so fading the group out removes every part for good."""
        family = {id(m) for m in group.get_family()[1:]}
        self.remove(*[m for m in self.mobjects if id(m) in family])
        self.add(group)
        return group

    def note(self, midi, gain=-8.0, delay=0.0, pan=0.0, voice="bell"):
        self.events.append({"t": round(float(self.time) + delay, 4), "midi": int(midi), "db": gain, "pan": pan, "voice": voice})

    # ------------------------------------------------------------ 0:00 hook
    def hook(self):
        raw = DATA["gistemp"]["raw"]
        lo, hi = min(raw), max(raw)
        pts = [np.array([-6.4 + i * 12.8 / (len(raw) - 1), -2.4 + (v - lo) / (hi - lo) * 2.5, 0]) for i, v in enumerate(raw)]
        curve = VMobject(stroke_color=AMBER, stroke_width=5).set_points_smoothly(pts)
        glow = curve.copy().set_stroke(AMBER, width=16, opacity=0.14)
        tip = Dot(radius=0.09, color=CREAM)
        tip.add_updater(lambda d: d.move_to(curve.get_end()))
        words = tx("What", "does", "our planet", r"\emph{sound}", "like?", size=80).move_to(UP * 1.6)
        words[3].set_color(AMBER)
        self.add(tip)
        for i in range(5):
            self.note([57, 60, 64, 67, 72][i], -14, i * 0.4, pan=-0.5 + 0.25 * i, voice="glass")
        self.play(
            Create(curve), Create(glow),
            LaggedStart(*[FadeIn(w, shift=UP * 0.25) for w in words], lag_ratio=1.0),
            run_time=2.0, rate_func=linear,
        )
        tip.clear_updaters()
        self.at(2.6)
        self.play(FadeOut(self.own(words), shift=UP * 0.3), FadeOut(self.own(VGroup(curve, glow, tip))), run_time=0.4)

    # ------------------------------------------------------------ 0:03 the logo
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

    def logo(self):
        c = UP * 0.45
        squares, image, s, left = self.build_logo(9.0, c)
        # 3.0: the data bits fly in from everywhere and settle into "Bit"
        scattered = squares.copy()
        for sq in scattered:
            sq.move_to([random.uniform(-6.5, 6.5), random.uniform(-3.6, 3.6), 0]).rotate(random.uniform(-1.2, 1.2))
        self.note(57, -10, voice="marimba")
        self.play(LaggedStart(*[FadeIn(sq, scale=0.4) for sq in scattered], lag_ratio=0.01), run_time=0.3)
        self.play(Transform(scattered, squares), run_time=0.7, rate_func=smooth)
        # 4.0: a playhead plays "2Beat" into view, one note per letter
        x0 = left + (166 + 20) * s - 0.08
        span = c[0] + 4.6 - x0
        playhead = Line([x0, c[1] - image.height / 2 - 0.2, 0], [x0, c[1] + image.height / 2 + 0.2, 0], color=AMBER, stroke_width=6)
        curtain = Rectangle(width=span + 0.4, height=image.height + 0.5, stroke_width=0, fill_color=BG, fill_opacity=1).move_to([x0 + (span + 0.4) / 2, c[1], 0])
        self.add(image, curtain, playhead)
        for svg_x, midi in [(166, 72), (266, 76), (326, 79), (392, 81), (460, 84)]:
            x = left + (svg_x + 20) * s
            self.note(midi, -8, (x - x0) / span * 0.8, pan=x / 6)
        self.play(curtain.animate.shift(RIGHT * span), playhead.animate.shift(RIGHT * span), run_time=0.8, rate_func=linear)
        self.remove(curtain)
        tag = tx(r"Listen to Earth data.", size=52).next_to(image, DOWN, buff=0.55)
        self.play(FadeOut(playhead), Write(tag), run_time=0.6)
        self.logo_now = Group(scattered, image, tag)
        self.at(6.0 - 0.4)

    # ------------------------------------------------------------ 0:06 the app, one screenshot per bar
    def browser(self, name):
        shot = ImageMobject(str(ROOT / "assets" / "shots" / f"{name}.png")).scale_to_fit_width(10.6)
        bar = RoundedRectangle(width=10.6, height=0.34, corner_radius=0.08, stroke_width=0, fill_color="#26262C", fill_opacity=1).next_to(shot, UP, buff=0)
        dots = VGroup(*[Dot(radius=0.055, color=c) for c in ("#FF5F57", "#FEBC2E", "#28C840")]).arrange(RIGHT, buff=0.12).move_to(bar).align_to(bar, LEFT).shift(RIGHT * 0.22)
        border = Rectangle(width=10.6, height=shot.height + 0.34, stroke_color=EDGE, stroke_width=2).move_to(Group(bar, shot))
        return Group(bar, dots, shot, border).move_to(UP * 0.5)

    def montage(self):
        prev, prev_cap = self.logo_now, None
        for i, (name, before, hi, after) in enumerate(SHOTS):
            T0 = 6.0 + 2.0 * i
            frame = self.browser(name).scale(0.96)
            cap = fit(highlight_line(before, hi, after), 12.8).to_edge(DOWN, buff=0.55)
            self.at(T0 - 0.4)
            outs = [FadeOut(self.own(prev), shift=LEFT * 1.5)]
            if prev_cap is not None:
                outs.append(FadeOut(prev_cap, shift=LEFT * 1.5))
            self.play(*outs, FadeIn(frame, shift=LEFT * 1.5), run_time=0.4, rate_func=smooth)
            self.note([60, 64, 67, 69, 72][i], -13, voice="glass")
            self.play(FadeIn(cap, shift=UP * 0.2), frame.animate.scale(1.01), run_time=0.4)
            # a slow push-in until the next bar
            self.play(frame.animate.scale(1.03), run_time=T0 + 2.0 - 0.4 - float(self.time), rate_func=linear)
            prev, prev_cap = frame, cap
        self.at(16.0 - 0.4)
        self.play(FadeOut(prev), FadeOut(prev_cap), run_time=0.4)

    # ------------------------------------------------------------ 0:16 three numbers
    def numbers(self):
        def count(value, label):
            big = Integer(0, font_size=170, color=AMBER).move_to(UP * 0.55)
            sub = fit(tx(label, size=40), 12.5).next_to(big, DOWN, buff=0.4)
            self.note(84, -9)
            # the counter cannot fade and count at once (its digits change), so it counts up from 0 in place
            self.add(big)
            self.play(ChangeDecimalToValue(big, value), FadeIn(sub, shift=UP * 0.2), run_time=0.6, rate_func=rush_from)
            return VGroup(big, sub)

        self.at(16.0)
        a = count(146, r"years of NASA temperature, from 1880 to 2025")
        self.at(17.0 - 0.25)
        self.play(FadeOut(self.own(a)), run_time=0.25)
        b = count(91, r"real earthquakes from one week, played west to east")
        self.at(18.0 - 0.25)
        self.play(FadeOut(self.own(b)), run_time=0.25)
        big = tx(r"\textbf{For everyone}", size=110, color=AMBER).move_to(UP * 0.55)
        sub = tx(r"built for people who \emph{can't see} a chart", size=44).next_to(big, DOWN, buff=0.45)
        self.note(79, -8)
        self.play(FadeIn(big, scale=1.2), run_time=0.35)
        self.play(Write(sub), run_time=0.35)
        self.at(19.0 - 0.3)
        self.play(FadeOut(big), FadeOut(sub), run_time=0.3)

    # ------------------------------------------------------------ 0:19 the team
    def team(self):
        title = tx(r"Made by Team \textbf{Bit2Beat}", size=62).to_edge(UP, buff=0.6)
        self.play(Write(title), run_time=0.5)
        xs = [-5.3, -2.65, 0, 2.65, 5.3]
        cards = []
        for i, ((slug, name, role), x) in enumerate(zip(TEAM, xs)):
            self.at(19.5 + i * BEAT)
            photo = ImageMobject(str(ROOT / "assets" / "team" / f"{slug}.png")).scale_to_fit_height(2.1).move_to([x, 0.4, 0])
            ring = Circle(radius=1.1, color=AMBER, stroke_width=4).move_to(photo)
            nm = fit(tx(r"\textbf{%s}" % name, size=30), 2.5).move_to([x, -1.15, 0])
            rl = fit(tx(role, size=24, color=AMBER), 2.5).next_to(nm, DOWN, buff=0.12)
            self.note([60, 64, 67, 69, 72][i], -10, pan=x / 7)
            self.play(FadeIn(photo, scale=0.85), Create(ring), FadeIn(nm, shift=UP * 0.2), FadeIn(rl, shift=UP * 0.2), run_time=0.4)
            cards.append(Group(photo, ring, nm, rl))
        # each of us is a note: a playhead sweeps the team
        self.at(23.0)
        head = Line(UP * 1.7, DOWN * 2.0, color=AMBER, stroke_width=5).move_to([-7.0, -0.2, 0])
        self.add(head)
        # the head moves from ring to ring (2 s for the whole width); each ring lights as it is reached
        x_prev = -7.0
        for i, (card, x) in enumerate(zip(cards, xs)):
            self.play(head.animate.set_x(x), run_time=(x - x_prev) / 14.0 * 2.0, rate_func=linear)
            self.note([72, 76, 79, 81, 84][i], -7, pan=x / 7)
            card[1].set_stroke(CREAM, width=7)
            x_prev = x
        self.play(head.animate.set_x(7.0), run_time=(7.0 - x_prev) / 14.0 * 2.0, rate_func=linear)
        self.remove(head)
        self.at(25.5)
        self.play(FadeOut(self.own(Group(title, *cards))), run_time=0.5)

    # ------------------------------------------------------------ 0:26 the end card
    def end_card(self):
        self.at(26.0)
        squares, image, s, left = self.build_logo(9.0, UP * 0.6)
        self.note(72, -8)
        self.play(LaggedStart(*[GrowFromCenter(sq) for sq in squares], lag_ratio=0.01), FadeIn(image, shift=LEFT * 0.3), run_time=0.6)
        tag = tx(r"Listen to Earth.", size=70).next_to(image, DOWN, buff=0.55)
        self.play(Write(tag), run_time=0.6)
        self.note(84, -9)
        self.at(29.3)
        self.play(FadeOut(self.own(Group(squares, image, tag))), run_time=0.7)
