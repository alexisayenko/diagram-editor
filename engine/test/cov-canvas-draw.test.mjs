import test from "node:test";
import assert from "node:assert/strict";
import { makePage, loadModel, loadDraw, El } from "./cov-canvas.mjs";
import { plain } from "./cov-dom.mjs";

const stroke = (id, points, width = 2) => ({ id, color: "#3b82f6", width, points });
const A = stroke("a", [[100, 100], [200, 100]]), B = stroke("b", [[100, 300], [200, 300]], 4);

function setup({ strokes, pen } = {}) {
  const page = makePage(strokes ? { saved: { version: 1, drawings: strokes } } : {});
  if (pen !== undefined) page.store.set("pen", pen);
  const model = loadModel(page);
  const layer = page.doc.getElementById("dw");
  const btn = (attrs, id) => { const b = new El("button", page.doc); b.closest = () => b; Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v)); if (id) b.id = id; return b; };
  const toolBtns = ["select", "pencil", "eraser"].map((t) => btn({ "data-t": t }));
  const colorBtns = ["#3b82f6", "#ef4444"].map((c) => btn({ "data-c": c }));
  const widthBtns = [2, 4, 8].map((w) => btn({ "data-w": w }));
  page.doc.querySelectorAll = (q) => (q === "#dtl [data-t]" ? toolBtns : q === "#dpo [data-c]" ? colorBtns : q === "#dpo [data-w]" ? widthBtns : []);
  const draw = loadDraw(page, model);
  const fire = (t, ev = {}) => page.svg.fire(t, { isPrimary: true, button: 0, pointerId: 1, pointerType: "mouse", clientX: 0, clientY: 0, ...ev });
  const pt = (x, y, extra = {}) => ({ clientX: x, clientY: y, ...extra });
  const paintFrame = () => { const f = page.g.frames.splice(0); f.forEach((fn) => fn()); };
  const key = (k, ev = {}) => page.doc.fire("keydown", { key: k, target: { tagName: "BODY" }, ...ev });
  const toolbar = (b) => page.core.$("dtl").fire("click", { target: b });
  const options = (b) => page.core.$("dpo").fire("click", { target: b });
  const scribble = (points) => {
    fire("pointerdown", pt(...points[0]));
    for (const p of points.slice(1)) fire("pointermove", pt(...p));
    fire("pointerup", pt(...points.at(-1)));
  };
  return { page, draw, layer, fire, pt, paintFrame, key, toolbar, options, toolBtns, colorBtns, widthBtns, btn, scribble };
}

test("starts on the select tool with the saved drawings loaded, clean, and undo/redo disabled", () => {
  const h = setup({ strokes: [A, B] });
  assert.equal(h.draw.tool(), "select");
  assert.equal(h.draw.list().length, 2);
  assert.equal(h.draw.isDirty(), false);
  assert.equal(h.page.core.$("dtu").disabled, true);
  assert.equal(h.page.core.$("dtr").disabled, true);
  assert.equal(setup().draw.list().length, 0);
});

test("the stored pen is restored when it names a known colour and width, and ignored otherwise", () => {
  const ok = setup({ pen: JSON.stringify({ color: "#ef4444", width: 8 }) });
  ok.draw.setTool("pencil");
  ok.scribble([[0, 0], [10, 0]]);
  assert.deepEqual([ok.draw.list()[0].color, ok.draw.list()[0].width], ["#ef4444", 8]);
  assert.ok(ok.colorBtns[1].attrs["aria-pressed"] === "true" && ok.colorBtns[0].attrs["aria-pressed"] === "false");
  assert.equal(ok.widthBtns[2].attrs["aria-pressed"], "true");
  for (const bad of [JSON.stringify({ color: "#000000", width: 8 }), JSON.stringify({ color: "#ef4444", width: 3 }), "not json", "null"]) {
    const h = setup({ pen: bad });
    h.draw.setTool("pencil");
    h.scribble([[0, 0], [10, 0]]);
    assert.deepEqual([h.draw.list()[0].color, h.draw.list()[0].width], ["#3b82f6", 2], bad);
  }
});

test("choosing a tool updates classes, pressed buttons and the pen options; a tool cannot change mid-stroke", () => {
  const h = setup();
  h.draw.setTool("pencil");
  assert.equal(h.draw.tool(), "pencil");
  assert.ok(h.page.svg.classes.has("draw-pencil") && !h.page.svg.classes.has("draw-eraser"));
  assert.equal(h.page.core.$("dpo").hidden, false);
  assert.deepEqual(h.toolBtns.map((b) => b.attrs["aria-pressed"]), ["false", "true", "false"]);
  h.draw.setTool("eraser");
  assert.ok(h.page.svg.classes.has("draw-eraser") && !h.page.svg.classes.has("draw-pencil"));
  assert.equal(h.page.core.$("dpo").hidden, true);
  h.draw.setTool("pencil");
  h.fire("pointerdown", h.pt(10, 10));
  h.draw.setTool("select");
  assert.equal(h.draw.tool(), "pencil");
});

test("toolbar clicks pick the tool; clicks off any button are ignored", () => {
  const h = setup();
  h.toolbar(h.toolBtns[1]);
  assert.equal(h.draw.tool(), "pencil");
  h.page.core.$("dtl").fire("click", { target: { closest: () => null } });
  h.page.core.$("dtl").fire("click", { target: {} });
  assert.equal(h.draw.tool(), "pencil");
  h.toolbar(h.btn({}, "other"));
  assert.equal(h.draw.tool(), "pencil");
});

test("pen colour and width buttons persist the pen and mark themselves pressed", () => {
  const h = setup();
  h.options(h.colorBtns[1]);
  h.options(h.widthBtns[1]);
  assert.deepEqual(JSON.parse(h.page.store.get("pen")), { color: "#ef4444", width: 4 });
  assert.equal(h.colorBtns[1].attrs["aria-pressed"], "true");
  assert.equal(h.widthBtns[1].attrs["aria-pressed"], "true");
  h.options(h.btn({}));
  h.page.core.$("dpo").fire("click", { target: { closest: () => null } });
  assert.deepEqual(JSON.parse(h.page.store.get("pen")), { color: "#ef4444", width: 4 });
});

test("drawing with the pencil adds a decimated stroke on release, enables undo and marks the drawing dirty", () => {
  const h = setup();
  h.draw.setTool("pencil");
  const e = h.fire("pointerdown", h.pt(10, 10));
  assert.equal(e.defaultPrevented, true);
  assert.equal(e.stopped, true);
  assert.deepEqual(h.page.svg.captured, [1]);
  assert.equal(h.layer.children.length, 1);
  const path = h.layer.children[0];
  assert.equal(path.attrs.stroke, "#3b82f6");
  assert.equal(path.attrs["stroke-width"], "2");
  assert.equal(path.attrs["stroke-linecap"], "round");
  const m = h.fire("pointermove", h.pt(10.2, 10.2));
  assert.equal(m.stopped, true);
  h.fire("pointermove", h.pt(40, 10));
  h.fire("pointermove", h.pt(80, 30));
  assert.equal(h.page.g.frames.length, 1);
  h.paintFrame();
  assert.match(path.attrs.d, /^M10 10/);
  h.fire("pointerup", h.pt(80, 30));
  assert.ok(path.removed);
  const l = h.draw.list();
  assert.equal(l.length, 1);
  assert.deepEqual(plain(l[0].points), [[10, 10], [40, 10], [80, 30]]);
  assert.equal(l[0].id.length > 0, true);
  assert.match(h.layer.innerHTML, /<path/);
  assert.equal(h.draw.isDirty(), true);
  assert.equal(h.page.core.$("dtu").disabled, false);
  h.draw.markSaved();
  assert.equal(h.draw.isDirty(), false);
});

test("a stroke in the select tool, with a non-primary pointer or a non-main button is not started", () => {
  const h = setup();
  const e = h.fire("pointerdown", h.pt(5, 5));
  assert.equal(e.defaultPrevented, false);
  h.draw.setTool("pencil");
  h.fire("pointerdown", h.pt(5, 5, { isPrimary: false }));
  h.fire("pointerdown", h.pt(5, 5, { button: 2 }));
  assert.equal(h.layer.children.length, 0);
});

test("a cancelled stroke leaves nothing behind; moves from another pointer are ignored", () => {
  const h = setup();
  h.draw.setTool("pencil");
  h.fire("pointerdown", h.pt(5, 5));
  const other = h.fire("pointermove", h.pt(50, 5, { pointerId: 9 }));
  assert.equal(other.stopped, undefined);
  h.fire("pointerup", h.pt(50, 5, { pointerId: 9 }));
  assert.equal(h.layer.children.length, 1);
  h.fire("pointercancel", h.pt(50, 5));
  assert.equal(h.layer.children.length, 0);
  assert.equal(h.draw.list().length, 0);
  h.fire("pointermove", h.pt(80, 5));
  h.fire("pointerup", h.pt(80, 5));
  assert.equal(h.draw.list().length, 0);
});

test("pointer samples closer than the step and beyond the point cap are skipped; coalesced events are all used", () => {
  const h = setup();
  h.draw.setTool("pencil");
  h.fire("pointerdown", h.pt(0, 0));
  h.fire("pointermove", h.pt(0.3, 0.3));
  h.fire("pointermove", h.pt(0.5, 0.5, { getCoalescedEvents: () => [] }));
  h.fire("pointermove", h.pt(50, 50, { getCoalescedEvents: () => [h.pt(20, 0), h.pt(40, 0)] }));
  h.fire("pointerup", h.pt(50, 50));
  assert.deepEqual(plain(h.draw.list()[0].points), [[0, 0], [20, 0], [40, 0]]);
  const capped = setup();
  capped.draw.setTool("pencil");
  capped.fire("pointerdown", capped.pt(0, 0));
  const many = Array.from({ length: 5200 }, (_, i) => capped.pt(i + 1, 0));
  capped.fire("pointermove", capped.pt(0, 0, { getCoalescedEvents: () => many }));
  capped.fire("pointerup", capped.pt(0, 0));
  assert.ok(capped.draw.list()[0].points.length <= 5000);
  assert.ok(capped.draw.list()[0].points.length > 1000);
});

test("a failing pointer capture does not stop drawing", () => {
  const h = setup();
  h.page.svg.setPointerCapture = () => { throw new Error("x"); };
  h.draw.setTool("pencil");
  h.scribble([[0, 0], [30, 0]]);
  assert.equal(h.draw.list().length, 1);
});

test("a single click with the pencil leaves a dot", () => {
  const h = setup();
  h.draw.setTool("pencil");
  h.scribble([[50, 60]]);
  assert.deepEqual(plain(h.draw.list()[0].points), [[50, 60]]);
});

test("the eraser removes the stroke under the pointer, drag-erases more, and commits once on release", () => {
  const h = setup({ strokes: [A, B] });
  h.draw.setTool("eraser");
  h.fire("pointerdown", h.pt(150, 100));
  assert.equal(h.draw.list().length, 2);
  assert.equal(h.layer.innerHTML.match(/<path/g).length, 1);
  h.fire("pointermove", h.pt(150, 300));
  assert.equal(h.layer.innerHTML.match(/<path/g)?.length ?? 0, 0);
  h.fire("pointerup", h.pt(150, 300));
  assert.equal(h.draw.list().length, 0);
  assert.equal(h.draw.isDirty(), true);
  h.draw.undo();
  assert.equal(h.draw.list().length, 2);
  assert.equal(h.draw.isDirty(), false);
});

test("erasing nothing commits nothing; erasing ignores other pointers and uses coalesced samples", () => {
  const h = setup({ strokes: [A, B] });
  h.draw.setTool("eraser");
  h.fire("pointerdown", h.pt(500, 500));
  h.fire("pointerup", h.pt(500, 500));
  assert.equal(h.page.core.$("dtu").disabled, true);
  h.fire("pointerdown", h.pt(500, 500));
  h.fire("pointermove", h.pt(0, 0, { pointerId: 4, pointerType: "touch" }));
  h.fire("pointerup", h.pt(0, 0, { pointerId: 4 }));
  h.fire("pointermove", h.pt(150, 100, { getCoalescedEvents: () => [{}, h.pt(150, 300)], pointerType: "touch" }));
  h.fire("pointerup", h.pt(150, 300));
  assert.equal(h.draw.list().length, 0);
});

test("the eraser radius shrinks as the view zooms in", () => {
  const near = setup({ strokes: [A] });
  near.draw.setTool("eraser");
  near.fire("pointerdown", near.pt(150, 105));
  near.fire("pointerup", near.pt(150, 105));
  assert.equal(near.draw.list().length, 0);
  const zoomed = setup({ strokes: [A] });
  zoomed.page.svg.ctm = { a: 10, e: 0, f: 0 };
  zoomed.draw.setTool("eraser");
  zoomed.fire("pointerdown", zoomed.pt(1500, 1050));
  zoomed.fire("pointerup", zoomed.pt(1500, 1050));
  assert.equal(zoomed.draw.list().length, 1);
  const noMatrix = setup({ strokes: [A] });
  noMatrix.page.svg.ctm = null;
  noMatrix.draw.setTool("eraser");
  noMatrix.fire("pointerdown", noMatrix.pt(150, 105));
  noMatrix.fire("pointerup", noMatrix.pt(150, 105));
  assert.equal(noMatrix.draw.list().length, 0);
});

test("hovering with the eraser highlights the stroke it would remove and clears when leaving", () => {
  const h = setup({ strokes: [A, B] });
  const p = [new El("path"), new El("path")];
  h.layer.children = p;
  h.draw.setTool("eraser");
  h.fire("pointermove", h.pt(150, 100));
  assert.ok(p[0].classes.has("hot"));
  h.fire("pointermove", h.pt(150, 101));
  assert.ok(p[0].classes.has("hot"));
  h.fire("pointermove", h.pt(150, 300));
  assert.ok(!p[0].classes.has("hot") && p[1].classes.has("hot"));
  h.fire("pointermove", h.pt(600, 600));
  assert.ok(!p[1].classes.has("hot"));
  h.fire("pointermove", h.pt(150, 100));
  h.draw.setTool("pencil");
  assert.ok(!p[0].classes.has("hot"));
  h.draw.setTool("eraser");
  h.fire("pointermove", h.pt(150, 100, { pointerType: "touch" }));
  assert.ok(!p[0].classes.has("hot"));
});

test("undo and redo through the buttons restore strokes and enable/disable the controls", () => {
  const h = setup();
  h.draw.setTool("pencil");
  h.scribble([[0, 0], [30, 0]]);
  h.scribble([[0, 50], [30, 50]]);
  const un = h.btn({}, "dtu"), re = h.btn({}, "dtr");
  h.toolbar(un);
  assert.equal(h.draw.list().length, 1);
  assert.equal(h.page.core.$("dtr").disabled, false);
  h.toolbar(re);
  assert.equal(h.draw.list().length, 2);
  h.draw.undo();
  h.draw.undo();
  h.draw.undo();
  assert.equal(h.draw.list().length, 0);
  assert.equal(h.page.core.$("dtu").disabled, true);
  h.draw.redo();
  h.draw.redo();
  h.draw.redo();
  assert.equal(h.draw.list().length, 2);
  assert.equal(h.page.core.$("dtr").disabled, true);
});

test("a new stroke after undo drops the redo branch", () => {
  const h = setup();
  h.draw.setTool("pencil");
  h.scribble([[0, 0], [30, 0]]);
  h.draw.undo();
  h.scribble([[0, 90], [30, 90]]);
  h.draw.redo();
  assert.equal(h.draw.list().length, 1);
  assert.deepEqual(plain(h.draw.list()[0].points[0]), [0, 90]);
});

test("keyboard: Ctrl/Cmd+Z undoes, Ctrl+Y and Ctrl+Shift+Z redo, only when possible and not while editing text or drawing", () => {
  const h = setup();
  h.draw.setTool("pencil");
  h.scribble([[0, 0], [30, 0]]);
  assert.equal(h.key("x", { ctrlKey: true }).defaultPrevented, false);
  const z = h.key("z", { ctrlKey: true });
  assert.equal(z.defaultPrevented, true);
  assert.equal(h.draw.list().length, 0);
  assert.equal(h.key("z", { ctrlKey: true }).defaultPrevented, false);
  assert.equal(h.key("y", { ctrlKey: true }).defaultPrevented, true);
  assert.equal(h.draw.list().length, 1);
  assert.equal(h.key("y", { ctrlKey: true }).defaultPrevented, false);
  h.key("Z", { metaKey: true });
  assert.equal(h.draw.list().length, 0);
  h.key("z", { ctrlKey: true, shiftKey: true });
  assert.equal(h.draw.list().length, 1);
  h.key("z", { ctrlKey: true, altKey: true });
  assert.equal(h.draw.list().length, 1);
  h.key("z", { ctrlKey: true, target: { tagName: "INPUT" } });
  h.key("z", { ctrlKey: true, target: { isContentEditable: true } });
  assert.equal(h.draw.list().length, 1);
  h.fire("pointerdown", h.pt(0, 200));
  h.key("z", { ctrlKey: true });
  assert.equal(h.draw.list().length, 1);
  h.fire("pointercancel", h.pt(0, 200));
});

test("keyboard undo is blocked while erasing; Escape returns to the select tool only when another tool is on", () => {
  const h = setup({ strokes: [A] });
  h.draw.setTool("eraser");
  h.fire("pointerdown", h.pt(600, 600));
  h.draw.undo();
  h.key("z", { ctrlKey: true });
  h.fire("pointerup", h.pt(600, 600));
  assert.equal(h.draw.list().length, 1);
  h.key("Escape");
  assert.equal(h.draw.tool(), "select");
  h.draw.setTool("pencil");
  h.key("Escape", { target: { tagName: "TEXTAREA" } });
  assert.equal(h.draw.tool(), "pencil");
  h.key("Escape");
  assert.equal(h.draw.tool(), "select");
  h.key("Escape");
  assert.equal(h.draw.tool(), "select");
});

test("clicks are swallowed while a drawing tool is active, but not in select", () => {
  const h = setup();
  assert.equal(h.page.svg.fire("click").defaultPrevented, false);
  h.draw.setTool("pencil");
  const c = h.page.svg.fire("click");
  assert.equal(c.defaultPrevented, true);
  assert.equal(c.stopped, true);
  assert.equal(h.page.svg.fire("dblclick").defaultPrevented, true);
});
