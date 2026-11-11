"""
Bit2Beat · How the algorithm works — a 3Blue1Brown-style film (about 2 minutes).

Manim Community Edition, black background, every word typeset in LaTeX, cream text, amber for
data and blue for maths. The Bit2Beat logo is built from its own pixels. An outline with a live
preview of each chapter opens the film and returns before every chapter; each chapter shows the
algorithm as arrays, step by step, with the real numbers the app computes (film-data.json,
exported from src/js/core) and the notes you hear.

  Logo       bits of data → bar chart → "Bit", a playhead reveals "2Beat"
  Outline    four chapters, each with a preview
  Chapter 1  Numbers become an array        x  →  v = (x − x_min) / (x_max − x_min)
  Chapter 2  Values become notes            v  →  k = round(v (n−1))  →  m = scale[k]  →  f, t
  Chapter 3  Earth events                   rows (λ, φ, M) sorted by λ  →  pitch v, loudness g
  Chapter 4  Pictures and video             pixels (R,G,B)  →  L*  →  24 bands  →  notes
  Finale     One plan feeds every output, then the logo

Render (see README.md):  bash video/render.sh preview  ·  bash video/render.sh  ·  bash video/render.sh 4k
The film is rendered silent and logs its notes to build/events.json; film_soundtrack.py makes the score.
"""
from manim import *
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
APP = ROOT.parent
DATA = json.loads((ROOT / "film-data.json").read_text())

# ---------------------------------------------------------------- palette
BG = "#0B0B0D"  # 3Blue1Brown black
CREAM = "#F6F1E7"
AMBER = "#E8A33D"
BLUE3 = "#58C4DD"  # the 3b1b blue, for the maths
GREY1 = "#B9B9BE"
GREY2 = "#6E6E76"
EDGE = "#3A3A42"
PANEL = "#151519"

config.background_color = BG
config.frame_rate = 60

CHAPTERS = [
    "Numbers become an array",
    "Values become notes",
    "Earth events",
    "Pictures and video",
]


def tx(s, size=36, color=CREAM):
    """Text, typeset by LaTeX."""
    return Tex(s, font_size=size, color=color)


def mx(s, size=40, color=CREAM):
    return MathTex(s, font_size=size, color=color)


def fit(m, w=None, h=None):
    if w and m.width > w:
        m.scale_to_fit_width(w)
    if h and m.height > h:
        m.scale_to_fit_height(h)
    return m


def num(v, d=2):
    return f"{v:.{d}f}"  # MathTex typesets "-" as a proper minus


def cell_row(items, w=0.9, h=0.56, size=28, color=CREAM, stroke=EDGE):
    """An array drawn as boxes. items: TeX strings ('' = empty, r'\\cdots' = gap)."""
    row = VGroup()
    for it in items:
        gap = it == r"\cdots"
        box = Rectangle(width=w, height=h, stroke_color=stroke, stroke_width=0 if gap else 2, fill_color=PANEL, fill_opacity=0 if gap else 1)
        if it:
            lab = fit(mx(it, size, GREY1 if gap else color), w * 0.86, h * 0.8).move_to(box)
        else:
            lab = VMobject()
        row.add(VGroup(box, lab))
    return row.arrange(RIGHT, buff=0)


def index_row(row, idx, color=GREY2):
    out = VGroup()
    for c, i in zip(row, idx):
        if i is not None:
            out.add(mx(str(i), 20, color).next_to(c, UP, buff=0.08))
    return out


def name_tag(tex, row, color=BLUE3, size=40):
    return mx(tex, size, color).next_to(row, LEFT, buff=0.3)


# ---------------------------------------------------------------- the film
class Bit2BeatAlgorithm(Scene):
    def construct(self):
        self.events = []
        self.done = []
        self.logo()
        self.outline_intro()
        for k, chapter in enumerate([self.ch_numbers, self.ch_notes, self.ch_earth, self.ch_pictures]):
            self.enter(k)
            chapter()
            self.done.append(k)
        self.finale()
        out = ROOT / "build" / "events.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps({"duration": float(self.time), "fps": config.frame_rate, "events": self.events}, indent=1))

    # ------------------------------------------------------------ sound log
    def note(self, midi, gain=0.0, delay=0.0, pan=0.0, voice="piano"):
        self.events.append({"t": round(float(self.time) + delay, 4), "midi": int(midi), "db": round(gain, 2), "pan": round(max(-1, min(1, pan)), 3), "voice": voice})

    def chord(self, notes, gain=-8.0, length=4.0):
        self.events.append({"t": round(float(self.time), 4), "midi": list(notes), "db": gain, "pan": 0, "voice": "pad", "len": length})

    # ------------------------------------------------------------ helpers
    def wipe(self, run_time=0.6):
        if self.mobjects:
            self.play(*[FadeOut(m) for m in self.mobjects], run_time=run_time)

    def heading(self, k):
        h = tx(r"\textsc{Chapter %d}\quad %s" % (k + 1, CHAPTERS[k]), 26, GREY1).to_corner(UL, buff=0.4)
        self.play(FadeIn(h, shift=RIGHT * 0.15), run_time=0.5)
        return h

    def caption(self, s, size=30):
        return fit(tx(s, size, GREY1), 13).to_edge(DOWN, buff=0.35)

    # ------------------------------------------------------------ logo
    def build_logo(self, width=9.0, center=ORIGIN):
        s = width / 538.0  # SVG viewBox is -20 -20 538 130
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
        heights = [1, 1, 2, 2, 3, 3, 4, 5, 7, 9]
        side = squares[0].width
        chart = VGroup()
        for col, n in enumerate(heights):
            for r in range(n):
                sq = Square(side_length=side, stroke_width=0, fill_color=CREAM, fill_opacity=1)
                sq.move_to([(col - 4.5) * side * 1.35, -1.7 + r * side * 1.12, 0])
                chart.add(sq)
        amber_i = [i for i, cell in enumerate(DATA["logo"]["cells"]) if cell[2]][0]
        top = len(chart) - 1
        chart[top].set_fill(AMBER)
        pairs = list(zip([i for i in range(len(chart)) if i != top], [i for i in range(len(squares)) if i != amber_i])) + [(top, amber_i)]

        self.chord([48, 55, 60, 64], -9, 5.0)
        self.play(LaggedStart(*[GrowFromEdge(sq, DOWN) for sq in chart], lag_ratio=0.03), run_time=1.3)
        for k, n in enumerate([48, 50, 52, 55, 60]):
            self.note(n, -12, 0.12 * k, pan=-0.5 + 0.25 * k, voice="bell")
        self.play(LaggedStart(*[Transform(chart[a], squares[b], path_arc=-PI / 3) for a, b in pairs], lag_ratio=0.015), run_time=1.5)

        x0 = left + (166 + 20) * s - 0.08
        span = c[0] + 4.6 - x0
        playhead = Line([x0, c[1] - image.height / 2 - 0.15, 0], [x0, c[1] + image.height / 2 + 0.15, 0], color=AMBER, stroke_width=6)
        curtain = Rectangle(width=span + 0.4, height=image.height + 0.4, stroke_width=0, fill_color=BG, fill_opacity=1)
        curtain.move_to([x0 + (span + 0.4) / 2, c[1], 0])
        self.add(image, curtain, playhead)
        for svg_x, midi in [(166, 60), (266, 64), (326, 67), (392, 69), (460, 72)]:
            x = left + (svg_x + 20) * s
            self.note(midi, -5, (x - x0) / span * 1.8, pan=x / 6, voice="bell")
        self.play(curtain.animate.shift(RIGHT * span), playhead.animate.shift(RIGHT * span), run_time=1.8, rate_func=linear)
        self.remove(curtain)
        self.play(FadeOut(playhead), run_time=0.3)
        tag = tx(r"Listen to Earth data.", 46).next_to(image, DOWN, buff=0.6)
        sub = tx(r"NASA Space Apps 2026 \textperiodcentered{} The Earth Information Jukebox", 30, AMBER).next_to(tag, DOWN, buff=0.22)
        self.play(Write(tag), FadeIn(sub, shift=UP * 0.1), run_time=1.1)
        self.wait(0.9)
        self.play(FadeOut(Group(chart, image), shift=UP * 0.3), FadeOut(tag), FadeOut(sub), run_time=0.8)

    # ------------------------------------------------------------ outline with previews
    def preview(self, k):
        """A small picture of chapter k, to sit inside the outline's screen."""
        g = DATA["gistemp"]
        if k == 0:
            ax = Axes(x_range=[0, 29, 1], y_range=[-0.5, 1.2, 0.5], x_length=5.6, y_length=1.9, tips=False, axis_config={"color": EDGE, "include_ticks": False})
            line = VMobject(stroke_color=CREAM, stroke_width=3).set_points_as_corners([ax.c2p(i, v) for i, v in enumerate(g["raw"])])
            dots = VGroup(*[Dot(ax.c2p(i, v), radius=0.04, color=AMBER) for i, v in enumerate(g["raw"])])
            arr = cell_row([num(v) for v in g["raw"][:5]] + [r"\cdots"], w=0.8, h=0.46, size=24).next_to(ax, DOWN, buff=0.35)
            return VGroup(ax, line, dots, arr)
        if k == 1:
            sc = DATA["scale"]["midi"]
            rungs = VGroup(*[Line(LEFT * 2.8, RIGHT * 2.8, color=EDGE, stroke_width=2).shift(UP * (j - 5) * 0.28) for j in range(11)])
            blocks = VGroup(*[RoundedRectangle(width=0.13, height=0.16, corner_radius=0.03, stroke_width=0, fill_color=AMBER, fill_opacity=1).move_to([-2.7 + i * 5.4 / 29, (sc.index(m) - 5) * 0.28, 0]) for i, m in enumerate(g["midi"])])
            return VGroup(rungs, blocks)
        if k == 2:
            world = ImageMobject(str(APP / "assets" / "img" / "world-map.jpg")).scale_to_fit_width(5.8).set_opacity(0.7)
            w, h = world.width, world.height
            dots = VGroup(*[Dot([p["lon"] / 180 * w / 2, p["lat"] / 90 * h / 2, 0], radius=0.025 + 0.05 * p["size"], color=AMBER) for p in DATA["quakes"]["points"]])
            sweep = Line(UP * h / 2, DOWN * h / 2, color=AMBER, stroke_width=4).shift(RIGHT * w * 0.1)
            return Group(world, dots, sweep)
        pic = ImageMobject(str(APP / "assets" / "nasa" / "gedi.jpg")).scale_to_fit_width(3.6)
        im = DATA["image"]
        bars = VGroup()
        for i, v in enumerate(im["norm"]):
            if v is not None:
                b = Rectangle(width=0.08, height=0.1 + 1.6 * v, stroke_width=0, fill_color=AMBER, fill_opacity=0.4 + 0.6 * v)
                b.move_to([2.2 + i * 0.11, -1.0 + b.height / 2, 0])
                bars.add(b)
        pic.move_to([-1.0, 0, 0])
        return Group(pic, bars)

    def outline_parts(self):
        items = VGroup()
        for k, title in enumerate(CHAPTERS):
            items.add(tx(r"\textbf{%d.}\quad %s" % (k + 1, title), 38))
        items.arrange(DOWN, aligned_edge=LEFT, buff=0.55).to_edge(LEFT, buff=0.8).shift(DOWN * 0.2)
        title = tx(r"\textsc{Outline}", 34, GREY1).next_to(items, UP, buff=0.6, aligned_edge=LEFT)
        screen = RoundedRectangle(width=6.6, height=3.71, corner_radius=0.12, stroke_color=GREY2, stroke_width=2, fill_color=PANEL, fill_opacity=1)
        screen.to_edge(RIGHT, buff=0.6).shift(DOWN * 0.2)
        return title, items, screen

    def in_screen(self, mob, screen):
        fit(mob, screen.width * 0.88, screen.height * 0.84)
        return mob.move_to(screen)

    def highlight(self, items, k):
        anims = []
        for j, it in enumerate(items):
            on = j == k
            anims.append(it.animate.set_color(AMBER if on else CREAM).set_opacity(1 if on else 0.4).scale(1.08 if on else 1))
        return anims

    def outline_intro(self):
        title, items, screen = self.outline_parts()
        base = items.copy()
        self.play(FadeIn(title), LaggedStart(*[Write(it) for it in items], lag_ratio=0.25), Create(screen), run_time=1.8)
        current = None
        for k in range(len(CHAPTERS)):
            prev = self.in_screen(self.preview(k), screen)
            self.note([60, 64, 67, 72][k], -11, pan=0.4, voice="bell")
            for j in range(len(items)):
                items[j].become(base[j].copy())
            anims = self.highlight(items, k) + [FadeIn(prev, scale=0.95)]
            if current is not None:
                anims.append(FadeOut(current))
            self.play(*anims, run_time=0.7)
            self.wait(0.75)
            current = prev
        self.outline = (title, items, screen)
        self.preview_shown = current

    def enter(self, k):
        """Back to the outline, tick finished chapters, then zoom into chapter k's preview."""
        title, items, screen = self.outline_parts()  # fresh each time: the last zoom enlarged the old screen
        if k == 0:
            old_title, old_items, old_screen = self.outline
            self.play(FadeOut(self.preview_shown), Transform(old_items, items), run_time=0.4)
            self.remove(old_title, old_items, old_screen)
            self.add(title, items, screen)
        else:
            self.wipe(0.5)
            self.play(FadeIn(title), FadeIn(items), FadeIn(screen), run_time=0.6)
        checks = VGroup(*[mx(r"\checkmark", 34, AMBER).next_to(items[j], LEFT, buff=0.2) for j in self.done])
        prev = self.in_screen(self.preview(k), screen)
        self.play(*self.highlight(items, k), FadeIn(prev, scale=0.95), FadeIn(checks), run_time=0.7)
        self.wait(0.6)
        zoom = Group(screen, prev)
        self.play(zoom.animate.scale(config.frame_width / screen.width).move_to(ORIGIN), FadeOut(title), FadeOut(items), FadeOut(checks), run_time=1.1)
        self.play(FadeOut(zoom), run_time=0.4)
        # chapter card
        self.chord([[48, 55, 60, 64], [45, 52, 57, 60], [43, 50, 55, 59], [41, 48, 53, 57]][k], -12, 3.0)
        small = tx(r"\textsc{Chapter %d}" % (k + 1), 36, GREY1)
        big = tx(CHAPTERS[k], 72)
        VGroup(small, big).arrange(DOWN, buff=0.35)
        rule = Line(LEFT, RIGHT, color=AMBER, stroke_width=3).set_width(big.width + 0.6).next_to(big, DOWN, buff=0.3)
        self.play(FadeIn(small, shift=DOWN * 0.15), Write(big), Create(rule), run_time=1.2)
        self.wait(0.8)
        self.play(FadeOut(small), FadeOut(big), FadeOut(rule), run_time=0.5)

    # ------------------------------------------------------------ chapter 1 · numbers become an array
    def ch_numbers(self):
        g = DATA["gistemp"]
        raw, n = g["raw"], len(g["raw"])
        self.chord([45, 52, 57, 60], -17, 22)
        self.heading(0)
        ax = Axes(x_range=[0, n - 1, 1], y_range=[-0.5, 1.2, 0.5], x_length=9.6, y_length=2.6, tips=False,
                  axis_config={"color": EDGE, "stroke_width": 2, "include_ticks": False}).move_to([0, 1.2, 0])
        ylab = VGroup(*[mx(f"{v:+.1f}" if v else "0", 22, GREY2).next_to(ax.c2p(0, v), LEFT, buff=0.12) for v in (-0.4, 0, 0.4, 0.8)])
        years = VGroup(tx("1880", 22, GREY2).next_to(ax.c2p(0, -0.5), DOWN, buff=0.1), tx("2025", 22, GREY2).next_to(ax.c2p(n - 1, -0.5), DOWN, buff=0.1))
        pts = [ax.c2p(i, v) for i, v in enumerate(raw)]
        line = VMobject(stroke_color=CREAM, stroke_width=3).set_points_as_corners(pts)
        dots = VGroup(*[Dot(p, radius=0.06, color=AMBER) for p in pts])
        cap = self.caption(r"NASA GISTEMP global temperature (${}^\circ$C vs.\ 1951--1980), averaged into 30 steps")
        self.play(Create(ax), FadeIn(ylab), FadeIn(years), FadeIn(cap), run_time=0.8)
        self.play(Create(line), LaggedStart(*[GrowFromCenter(d) for d in dots], lag_ratio=0.03), run_time=1.5)

        # the curve is just an array of 30 numbers
        shown = [0, 1, 2, 3, 4, 5, 6, None, 27, 28, 29]
        xrow = cell_row([num(raw[i]) if i is not None else r"\cdots" for i in shown]).move_to([0.4, -1.25, 0])
        xidx = index_row(xrow, shown)
        xtag = name_tag(r"\mathbf{x} =", xrow)
        say = self.caption(r"A curve is just an \emph{array}: one number per step.")
        self.play(FadeOut(cap), FadeIn(say), FadeIn(xtag), run_time=0.5)
        anims = []
        for c, i in zip(xrow, shown):
            if i is None:
                anims.append(FadeIn(c))
            else:
                anims.append(AnimationGroup(Create(c[0]), TransformFromCopy(dots[i], c[1])))
        self.play(LaggedStart(*anims, lag_ratio=0.08), FadeIn(xidx), run_time=1.8)
        for j, i in enumerate([0, 1, 2, 3, 4, 5, 6]):
            self.note(g["midi"][i], -14, 0.12 * j, pan=-0.5 + 0.1 * j)
        self.wait(0.4)

        # lift the array, find min and max
        chart = VGroup(ax, ylab, years, line, dots)
        X = VGroup(xtag, xrow, xidx)
        self.play(FadeOut(chart, shift=UP * 0.4), X.animate.move_to([0, 2.0, 0]), FadeOut(say), run_time=0.9)
        lo, hi = shown.index(6), shown.index(29)
        mn = mx(r"x_{\min} = %s" % num(g["min"]), 40, AMBER).next_to(xrow[lo], DOWN, buff=0.45)
        mxx = mx(r"x_{\max} = %s" % num(g["max"]), 40, AMBER).next_to(xrow[hi], DOWN, buff=0.45)
        self.play(Circumscribe(xrow[lo], color=AMBER), FadeIn(mn, shift=DOWN * 0.1), run_time=0.9)
        self.note(g["midi"][6], -8, pan=-0.2)
        self.play(Circumscribe(xrow[hi], color=AMBER), FadeIn(mxx, shift=DOWN * 0.1), run_time=0.9)
        self.note(g["midi"][29], -8, pan=0.5)

        # the rule, then the same rule with the numbers in
        f1 = mx(r"v_i = \frac{x_i - x_{\min}}{x_{\max} - x_{\min}}", 54).move_to([0, -0.3, 0])
        self.play(Write(f1), run_time=1.2)
        f2 = mx(r"v_i = \frac{x_i - (%s)}{%s - (%s)} = \frac{x_i + %s}{%s}" % (num(g["min"]), num(g["max"]), num(g["min"]), num(-g["min"]), num(g["max"] - g["min"])), 50).move_to(f1)
        self.play(TransformMatchingShapes(f1, f2), FadeOut(mn), FadeOut(mxx), run_time=1.2)
        self.wait(0.5)

        # element by element into a new array
        vrow = cell_row([num(g["norm"][i]) if i is not None else r"\cdots" for i in shown], color=BLUE3).move_to([0.4, -2.2, 0])
        vtag = name_tag(r"\mathbf{v} =", vrow)
        self.play(FadeIn(vtag), run_time=0.3)
        self.play(LaggedStart(*[TransformFromCopy(a, b) for a, b in zip(xrow, vrow)], lag_ratio=0.08), run_time=1.6)
        vec = mx(r"\mathbf{v} = \frac{\mathbf{x} - x_{\min}}{x_{\max} - x_{\min}} \in [0,1]^{30}", 40, GREY1).to_edge(DOWN, buff=0.35)
        self.play(FadeIn(vec, shift=UP * 0.1), Indicate(vrow[lo], color=AMBER), Indicate(vrow[hi], color=AMBER), run_time=1.0)
        self.wait(1.4)

    # ------------------------------------------------------------ chapter 2 · values become notes
    def ch_notes(self):
        g, sc = DATA["gistemp"], DATA["scale"]
        n = len(g["norm"])
        k_all = [round(v * 10) for v in g["norm"]]
        self.chord([41, 48, 53, 57], -17, 26)
        self.heading(1)
        shown = [0, 1, 2, 3, 4, 5, 6, None, 27, 28, 29]
        X0 = 0.35
        vrow = cell_row([num(g["norm"][i]) if i is not None else r"\cdots" for i in shown], color=BLUE3).move_to([X0, 2.55, 0])
        vtag = name_tag(r"\mathbf{v} =", vrow)
        srow = cell_row([str(m) for m in sc["midi"]]).move_to([X0, -0.75, 0])
        sidx = index_row(srow, list(range(11)), BLUE3)
        snames = VGroup(*[tx(nm, 22, GREY2).next_to(c, DOWN, buff=0.08) for nm, c in zip(sc["names"], srow)])
        stag = name_tag(r"\texttt{scale} =", srow, GREY1, 34)
        self.play(FadeIn(vtag), FadeIn(vrow), run_time=0.6)
        say = tx(r"C pentatonic over two octaves: $n = 11$ notes (MIDI numbers)", 28, GREY1).next_to(srow, UP, buff=0.45)
        self.play(FadeIn(stag), LaggedStart(*[FadeIn(c, shift=UP * 0.1) for c in srow], lag_ratio=0.05), FadeIn(sidx), FadeIn(snames), FadeIn(say), run_time=1.2)
        for j, m in enumerate(sc["midi"]):
            self.note(m, -15, 0.05 * j, pan=-0.6 + 0.12 * j)
        self.wait(0.4)

        # k = round(v (n-1))
        frm = mx(r"k_i = \operatorname{round}\!\big(v_i\,(n-1)\big)", 46).move_to([0, 1.55, 0])
        self.play(FadeOut(say), Write(frm), run_time=1.0)
        ex = mx(r"k_0 = \operatorname{round}(%s \times 10) = \operatorname{round}(%s) = %d" % (num(g["norm"][0]), num(g["norm"][0] * 10, 1), k_all[0]), 42).move_to(frm)
        self.play(TransformMatchingShapes(frm, ex), Indicate(vrow[0], color=AMBER), run_time=1.1)
        self.wait(0.5)
        krow = cell_row([str(k_all[i]) if i is not None else r"\cdots" for i in shown], w=0.9, h=0.5, size=26, color=AMBER).move_to([X0, 0.55, 0])
        ktag = name_tag(r"\mathbf{k} =", krow)
        self.play(FadeIn(ktag), LaggedStart(*[TransformFromCopy(a, b) for a, b in zip(vrow, krow)], lag_ratio=0.07), FadeOut(ex), run_time=1.4)

        # m = scale[k]: look it up
        frm2 = mx(r"m_i = \texttt{scale}[\,k_i\,]", 46).move_to([0, 1.55, 0])
        self.play(Write(frm2), run_time=0.7)
        k0 = k_all[0]
        arrow = CurvedArrow(krow[0].get_bottom() + DOWN * 0.02, sidx[k0].get_top() + UP * 0.02, angle=-PI / 4, color=AMBER, stroke_width=4)
        self.play(Create(arrow), Indicate(srow[k0], color=AMBER), run_time=0.9)
        self.note(sc["midi"][k0], -6)
        mrow = cell_row([str(g["midi"][i]) if i is not None else r"\cdots" for i in shown], w=0.9, h=0.5, size=26).move_to([X0, -2.35, 0])
        mtag = name_tag(r"\mathbf{m} =", mrow)
        sources = [srow[sc["midi"].index(g["midi"][i])] if i is not None else a for a, i in zip(krow, shown)]
        self.play(FadeIn(mtag), FadeOut(arrow), LaggedStart(*[TransformFromCopy(a, b) for a, b in zip(sources, mrow)], lag_ratio=0.07), run_time=1.5)

        # frequency and time
        frm3 = mx(r"f_i = 440 \cdot 2^{(m_i - 69)/12}\ \mathrm{Hz}", 44).move_to([0, 1.55, 0])
        self.play(ReplacementTransform(frm2, frm3), run_time=0.9)
        frow = cell_row([num(440 * 2 ** ((g["midi"][i] - 69) / 12), 1) if i is not None else r"\cdots" for i in shown], w=0.9, h=0.5, size=22, color=GREY1).move_to([X0, -3.15, 0])
        ftag = name_tag(r"\mathbf{f} =", frow, BLUE3, 36)
        self.play(FadeIn(ftag), LaggedStart(*[TransformFromCopy(a, b) for a, b in zip(mrow, frow)], lag_ratio=0.06), run_time=1.2)
        frm4 = fit(mx(r"t_i = i \cdot \frac{30}{\mathrm{BPM}} = i \cdot 0.3125\ \mathrm{s} \qquad (\text{one step} = \text{one eighth note at } 96\ \mathrm{BPM})", 36), 13).move_to([0, 1.55, 0])
        self.play(ReplacementTransform(frm3, frm4), run_time=0.9)
        self.wait(1.2)

        # play the arrays: a piano roll builds while the notes sound
        arrays = VGroup(vtag, vrow, ktag, krow, stag, srow, sidx, snames, mtag, mrow, ftag, frow)
        self.play(FadeOut(arrays), frm4.animate.scale(0.8).to_edge(UP, buff=1.0), run_time=0.8)
        ys = [-2.6 + j * 0.42 for j in range(11)]
        xa, xb = -5.4, 6.3
        rungs = VGroup(*[Line([xa, y, 0], [xb, y, 0], color=EDGE, stroke_width=2) for y in ys])
        names = VGroup(*[tx(nm, 22, GREY2).next_to(np.array([xa, y, 0]), LEFT, buff=0.15) for nm, y in zip(sc["names"], ys)])
        self.play(LaggedStart(*[Create(r) for r in rungs], lag_ratio=0.04), FadeIn(names), run_time=0.8)
        head = Line([xa, ys[0] - 0.3, 0], [xa, ys[-1] + 0.3, 0], color=AMBER, stroke_width=4)
        self.add(head)
        for i in range(n):
            k = sc["midi"].index(g["midi"][i])
            x = xa + 0.2 + i * (xb - xa - 0.4) / (n - 1)
            blk = RoundedRectangle(width=0.3, height=0.26, corner_radius=0.05, stroke_width=0, fill_color=AMBER, fill_opacity=1).move_to([x, ys[k], 0])
            self.note(g["midi"][i], -5, pan=-0.6 + 1.2 * i / (n - 1))
            self.play(head.animate.set_x(x), FadeIn(blk, scale=0.4), run_time=0.2, rate_func=linear)
        self.wait(1.0)

    # ------------------------------------------------------------ chapter 3 · earth events
    def ch_earth(self):
        q = DATA["quakes"]
        self.chord([43, 50, 55, 59], -17, 24)
        self.heading(2)
        w = 7.4
        world = ImageMobject(str(APP / "assets" / "img" / "world-map.jpg")).scale_to_fit_width(w).move_to([-3.1, 0.2, 0]).set_opacity(0.65)
        h = world.height
        cx, cy = world.get_center()[0], world.get_center()[1]
        frame = Rectangle(width=w, height=h, stroke_color=EDGE, stroke_width=2).move_to(world)

        def pos(lon, lat):
            return np.array([cx + lon / 180 * w / 2, cy + lat / 90 * h / 2, 0])

        pts = sorted(q["points"], key=lambda p: p["lon"])
        dots = VGroup(*[Dot(pos(p["lon"], p["lat"]), radius=0.03 + 0.06 * p["size"], color=AMBER).set_stroke(BG, 1) for p in pts])
        cap = self.caption(r"%d real USGS earthquakes, magnitude 4.5 and above, in one week" % len(pts))
        self.play(FadeIn(world), Create(frame), FadeIn(cap), run_time=0.8)
        self.play(LaggedStart(*[GrowFromCenter(d) for d in dots], lag_ratio=0.01), run_time=1.0)

        # each event is a row; the feed lists them by time
        S = q["sample"]
        cols_x = [2.15, 3.35, 4.45]
        head = VGroup(*[mx(t, 36, BLUE3).move_to([x, 2.3, 0]) for t, x in zip([r"\lambda", r"\varphi", r"M"], cols_x)])
        heads_txt = VGroup(*[tx(t, 20, GREY2).next_to(hd, UP, buff=0.08) for t, hd in zip(["longitude", "latitude", "magnitude"], head)])
        row_y = [1.6 - 0.62 * j for j in range(len(S))]
        rows = VGroup()
        for j, p in enumerate(S):
            r = VGroup(mx(num(p["lon"], 1), 32), mx(num(p["lat"], 1), 32), mx(num(p["mag"], 1), 32))
            for c, x in zip(r, cols_x):
                c.move_to([x, row_y[j], 0])
            rows.add(r)
        brace = Brace(rows, LEFT, color=GREY2)
        by_time = tx(r"in time\\order", 22, GREY2).next_to(brace, LEFT, buff=0.1)
        marks = VGroup(*[Circle(radius=0.14, color=CREAM, stroke_width=3).move_to(pos(p["lon"], p["lat"])) for p in S])
        self.play(FadeIn(head), FadeIn(heads_txt), LaggedStart(*[FadeIn(r, shift=LEFT * 0.2) for r in rows], lag_ratio=0.1), GrowFromCenter(brace), FadeIn(by_time), LaggedStart(*[Create(m) for m in marks], lag_ratio=0.1), run_time=1.6)
        self.wait(0.4)

        # sort by longitude: west to east, like reading a page
        order = sorted(range(len(S)), key=lambda j: S[j]["lon"])
        sort_tex = tx(r"sort by $\lambda$:\\ west $\rightarrow$ east", 24, AMBER).move_to(by_time).align_to(by_time, RIGHT)
        self.play(FadeOut(by_time), FadeIn(sort_tex), *[rows[j].animate.move_to([rows[j].get_x(), row_y[order.index(j)], 0]) for j in range(len(S))], run_time=1.4)
        self.wait(0.3)

        # two new columns: pitch from latitude, loudness from magnitude
        cx2 = [5.55, 6.55]
        newh = VGroup(mx(r"v", 36, AMBER).move_to([cx2[0], 2.3, 0]), mx(r"g", 36, AMBER).move_to([cx2[1], 2.3, 0]))
        newt = VGroup(tx("pitch", 20, GREY2).next_to(newh[0], UP, buff=0.08), tx("loudness", 20, GREY2).next_to(newh[1], UP, buff=0.08))
        f1 = fit(mx(r"v = \frac{\varphi - \varphi_{\min}}{\varphi_{\max} - \varphi_{\min}}, \quad \varphi_{\min} = %s,\ \varphi_{\max} = %s" % (num(q["latMin"], 1), num(q["latMax"], 1)), 34), 13).to_edge(DOWN, buff=1.05)
        f2 = fit(mx(r"s = \frac{M - M_{\min}}{M_{\max} - M_{\min}}, \qquad g = 0.45 + 0.55\,s", 34), 13).next_to(f1, DOWN, buff=0.25)
        self.play(FadeOut(cap), Write(f1), FadeIn(newh[0]), FadeIn(newt[0]), run_time=1.1)
        vcells = VGroup(*[mx(num(S[j]["v"]), 32, AMBER).move_to([cx2[0], row_y[order.index(j)], 0]) for j in range(len(S))])
        self.play(LaggedStart(*[TransformFromCopy(rows[j][1], vcells[j]) for j in range(len(S))], lag_ratio=0.08), run_time=1.1)
        self.play(Write(f2), FadeIn(newh[1]), FadeIn(newt[1]), run_time=1.0)
        gcells = VGroup(*[mx(num(S[j]["g"]), 32, AMBER).move_to([cx2[1], row_y[order.index(j)], 0]) for j in range(len(S))])
        self.play(LaggedStart(*[TransformFromCopy(rows[j][2], gcells[j]) for j in range(len(S))], lag_ratio=0.08), run_time=1.1)
        self.wait(0.6)

        # one sweep across the map: every quake lights up, the strongest sound
        x0, x1 = cx - w / 2, cx + w / 2
        line = Line([x0, cy - h / 2, 0], [x0, cy + h / 2, 0], color=AMBER, stroke_width=5)
        sweep = 6.0
        for p, d in zip(pts, dots):
            if p["mag"] >= 5.0:
                self.note(p["midi"], 20 * math.log10(max(p["gain"], 0.05)) - 4, (d.get_x() - x0) / w * sweep, pan=0.85 * p["lon"] / 180, voice="marimba")
        passed = set()

        def light(m):
            for k, d in enumerate(dots):
                if k not in passed and d.get_x() <= m.get_x():
                    d.set_fill(CREAM)
                    passed.add(k)

        line.add_updater(light)
        self.add(line)
        self.play(line.animate.set_x(x1), FadeOut(marks), run_time=sweep, rate_func=linear)
        line.remove_updater(light)
        self.play(FadeOut(line), run_time=0.4)
        self.wait(0.6)

    # ------------------------------------------------------------ chapter 4 · pictures and video
    def ch_pictures(self):
        im = DATA["image"]
        P = im["patch"]
        self.chord([45, 52, 57, 64], -17, 22)
        self.heading(3)
        pic = ImageMobject(str(APP / "assets" / "nasa" / "gedi.jpg")).scale_to_fit_width(6.4).move_to([-3.3, 0.7, 0])
        pw, ph = pic.width, pic.height
        pl, pt = pic.get_left()[0], pic.get_top()[1]
        credit = tx(r"NASA SVS \textperiodcentered{} GEDI forest height (Kel Elkins)", 20, GREY2).next_to(pic, DOWN, buff=0.12).align_to(pic, LEFT)
        self.play(FadeIn(pic), FadeIn(credit), run_time=0.8)

        # a picture is an array of pixels
        bx0, by0, bx1, by1 = P["box"]
        region = Rectangle(width=(bx1 - bx0) * pw, height=(by1 - by0) * ph, stroke_color=AMBER, stroke_width=3)
        region.move_to([pl + (bx0 + bx1) / 2 * pw, pt - (by0 + by1) / 2 * ph, 0])
        rgb = P["rgb"]
        rows, cols = len(rgb), len(rgb[0])
        side = 0.5
        grid = VGroup()
        for r in range(rows):
            for c in range(cols):
                sq = Square(side_length=side, stroke_color=BG, stroke_width=1.5, fill_color="#%02X%02X%02X" % tuple(rgb[r][c]), fill_opacity=1)
                sq.move_to([c * side, -r * side, 0])
                grid.add(sq)
        grid.move_to([3.6, 1.5, 0])
        say = tx(r"A picture is an \emph{array} of pixels", 30, GREY1).next_to(grid, UP, buff=0.3)
        self.play(Create(region), run_time=0.6)
        self.play(TransformFromCopy(region, grid), FadeIn(say), run_time=1.2)
        pr, pc = P["pick"]
        px = grid[pr * cols + pc]
        ring = SurroundingRectangle(px, color=AMBER, buff=0.03, stroke_width=4)
        R, G, B = rgb[pr][pc]
        e1 = mx(r"(R, G, B) = (%d, %d, %d)" % (R, G, B), 36).next_to(grid, DOWN, buff=0.4)
        e2 = mx(r"Y = 0.2126\,R' + 0.7152\,G' + 0.0722\,B' = %s" % num(P["pickY"], 3), 32).next_to(e1, DOWN, buff=0.25)
        e3 = mx(r"L^{*} = 116\,\sqrt[3]{Y} - 16 = %s" % num(P["pickL"], 1), 36, AMBER).next_to(e2, DOWN, buff=0.25)
        for e in (e1, e2, e3):
            fit(e, 6.6)
            e.set_x(3.6)
        lin_note = tx(r"$R', G', B'$: the sRGB values made linear", 20, GREY2).next_to(e3, DOWN, buff=0.18).set_x(3.6)
        self.play(Create(ring), Write(e1), run_time=0.9)
        self.play(Write(e2), FadeIn(lin_note), run_time=1.0)
        self.play(Write(e3), run_time=0.9)
        self.note(67, -8, voice="glass")
        self.wait(1.0)

        # cut the picture into 24 bands, average L* in each, leave the background out
        self.play(FadeOut(VGroup(grid, ring, e1, e2, e3, lin_note, say)), FadeOut(region), run_time=0.6)
        nb = im["bands"]
        bw = pw / nb
        seps = VGroup(*[Line([pl + i * bw, pt, 0], [pl + i * bw, pt - ph, 0], color=GREY2, stroke_width=1.2) for i in range(1, nb)])
        rule = fit(mx(r"\bar L^{*}_j = \operatorname{mean}\{\,L^{*}(p) : p \in \text{band } j,\ p \notin \text{background}\,\}", 30), 13).move_to([0, -2.05, 0])
        self.play(Create(seps), Write(rule), run_time=1.2)
        vals = [("%d" % round(v)) if v is not None else r"\varnothing" for v in im["L"]]
        lrow = cell_row(vals, w=0.5, h=0.46, size=20, color=AMBER).move_to([0.55, -3.05, 0])
        for c, v in zip(lrow, im["L"]):
            if v is None:
                c[1].set_color(GREY2)
        ltag = name_tag(r"\bar{\mathbf{L}}^{*} =", lrow, BLUE3, 30)
        self.add(ltag)
        bars = VGroup()
        bx_0, bx_1, base_y = 0.9, 6.7, -1.25
        step = (bx_1 - bx_0) / nb
        band = Rectangle(width=bw, height=ph, stroke_color=AMBER, stroke_width=3, fill_color=AMBER, fill_opacity=0.18)
        band.move_to([pl + bw / 2, pic.get_y(), 0])
        self.add(band)
        for i in range(nb):
            band.move_to([pl + (i + 0.5) * bw, pic.get_y(), 0])
            v = im["norm"][i]
            anims = [FadeIn(lrow[i], shift=UP * 0.1)]
            if v is not None:
                bar = Rectangle(width=step * 0.72, height=0.12 + 2.3 * v, stroke_width=0, fill_color=AMBER, fill_opacity=0.35 + 0.65 * v)
                bar.move_to([bx_0 + (i + 0.5) * step, base_y + bar.height / 2, 0])
                bars.add(bar)
                anims.append(GrowFromEdge(bar, DOWN))
                self.note(im["midi"][i], -6, pan=-0.7 + 1.4 * i / (nb - 1), voice="glass")
            self.play(*anims, run_time=0.2, rate_func=linear)
        self.remove(band)
        cap = fit(tx(r"Empty background is $\varnothing$: silent. \quad A video is read the same way, two frames per second.", 26, GREY1), 9.0).to_edge(UP, buff=1.0).set_x(2.2)
        self.play(FadeIn(cap), run_time=0.6)
        self.wait(1.4)

    # ------------------------------------------------------------ finale · one plan
    def finale(self):
        self.wipe(0.6)
        self.chord([48, 55, 60, 64, 67], -12, 9)
        small = tx(r"\textsc{Summary}", 34, GREY1).to_edge(UP, buff=0.7)
        chain = fit(mx(r"\mathbf{x} \xrightarrow{\ \text{scale}\ } \mathbf{v} \xrightarrow{\ \text{round}\ } \mathbf{k} \xrightarrow{\ \text{look up}\ } \mathbf{m} \xrightarrow{\ 440\cdot 2^{(m-69)/12}\ } \mathbf{f},\ \mathbf{t}", 46), 13).move_to([0, 1.7, 0])
        self.play(FadeIn(small), Write(chain), run_time=1.6)
        box = RoundedRectangle(width=3.6, height=1.0, corner_radius=0.15, stroke_color=AMBER, stroke_width=3, fill_color=PANEL, fill_opacity=1).move_to([0, 0.1, 0])
        plan = tx(r"\textbf{one plan}", 40, AMBER).move_to(box)
        down = Arrow(chain.get_bottom(), box.get_top(), buff=0.12, color=GREY1, stroke_width=4)
        self.play(GrowArrow(down), FadeIn(box), Write(plan), run_time=0.9)
        outs = fit(VGroup(*[tx(t, 32) for t in ["sound", "score", "readings table", r"WAV \& ADM export"]]).arrange(RIGHT, buff=1.1), 12.5).move_to([0, -1.75, 0])
        arrows = VGroup(*[Arrow(box.get_bottom(), o.get_top(), buff=0.12, color=GREY2, stroke_width=3, max_tip_length_to_length_ratio=0.15) for o in outs])
        self.play(LaggedStart(*[AnimationGroup(GrowArrow(a), FadeIn(o, shift=DOWN * 0.1)) for a, o in zip(arrows, outs)], lag_ratio=0.2), run_time=1.3)
        for k, m in enumerate([60, 64, 67, 72]):
            self.note(m, -7, 0.25 * k, pan=-0.45 + 0.3 * k)
        same = tx(r"What you see is exactly what you hear, and what you download.", 30, GREY1).to_edge(DOWN, buff=0.6)
        self.play(FadeIn(same), run_time=0.7)
        self.wait(1.4)
        self.wipe(0.6)

        squares, image, s, left = self.build_logo(9.0, UP * 0.45)
        self.chord([48, 55, 60, 64, 67], -10, 5.5)
        self.play(LaggedStart(*[GrowFromCenter(sq) for sq in squares], lag_ratio=0.02), FadeIn(image, shift=UP * 0.2), run_time=1.3)
        tag = tx(r"Listen to Earth.", 60).next_to(image, DOWN, buff=0.6)
        credit = tx(r"Data: NASA GISS GISTEMP \textperiodcentered{} USGS \textperiodcentered{} NASA SVS (GEDI) \quad Animation: Manim Community", 22, GREY2).to_edge(DOWN, buff=0.4)
        self.note(72, -7, voice="bell")
        self.note(60, -9, 0.06, voice="bell")
        self.play(Write(tag), FadeIn(credit), run_time=1.1)
        self.wait(2.2)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.9)
