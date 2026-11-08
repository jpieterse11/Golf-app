/* Regression tests for WHS course handicaps and hole strokes.
   Run: node handicap.test.js
   The scoring code lives in index.html; this loads that script so the tests cannot drift. */
"use strict";
var fs = require("fs");
var path = require("path");
var vm = require("vm");
var assert = require("assert");

var html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
var block = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
if (!block) throw new Error("logic script missing");
var sandbox = { module: { exports: {} }, console: console };
vm.runInContext(block[1], vm.createContext(sandbox));
var MP = sandbox.module.exports;
var courses = JSON.parse(fs.readFileSync(path.join(__dirname, "courses.json"), "utf8")).courses;

function courseById(id) {
  var raw = courses.filter(function (c) { return c.id === id; })[0];
  var checked = MP.checkCourse(raw);
  assert.strictEqual(checked.ok, true, checked.errors && checked.errors.join("; "));
  return checked.course;
}

/* 18-hole WHS: Course Handicap = round(index × slope/113 + (rating − par)), half away toward +∞. */
function expectCourse(index, slope, rating, par) {
  var raw = index * (slope / 113) + (rating - par);
  var rounded = Math.round(raw);
  assert.strictEqual(Object.is(rounded, -0) ? 0 : rounded, rounded);
  return rounded;
}

function round(opts) {
  var s = MP.defaultState();
  s.game = opts.game || "nassau";
  s.format = opts.format || "singles";
  s.allowance = opts.allowance || "100";
  s.useHcp = opts.useHcp !== false;
  s.names = opts.names || ["A", "B", "C", "D", "E"];
  s.indexes = opts.indexes;
  if (opts.course) MP.applyCourse(s, opts.course, opts.tee);
  else {
    s.par = (opts.par || Array(18).fill(4)).map(String);
    s.si = (opts.si || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]).map(String);
    s.slope = String(opts.slope);
    s.rating = String(opts.rating);
    s.tee = "Custom";
    s.teePar = opts.teePar != null ? String(opts.teePar) : "";
  }
  if (s.game === "skins") s.skinN = opts.n || 2;
  if (s.game === "stableford") s.stbN = opts.n || 2;
  if (s.game === "wolf") s.wolfN = opts.n || 4;
  if (opts.skinMode) s.skinMode = opts.skinMode;
  if (opts.vegasMode) s.vegasMode = opts.vegasMode;
  if (opts.birdNet != null) s.birdNet = opts.birdNet;
  if (opts.scores) s.scores = opts.scores;
  return MP.normalizeGame(s);
}

function strokeSum(strokes) { return strokes.reduce(function (a, n) { return a + n; }, 0); }
function holesWith(strokes, si, n) {
  var out = [];
  strokes.forEach(function (st, i) { if (st === n) out.push(Number(si[i])); });
  return out.sort(function (a, b) { return a - b; });
}

var muirfield = courseById("muirfield-village");
var annandale = courseById("annandale");
var failed = 0;
function test(name, fn) {
  try { fn(); console.log("ok  " + name); }
  catch (e) { failed++; console.error("FAIL " + name + "\n" + (e.stack || e.message)); }
}
/* Arrays built inside the page script have that realm's prototype, so compare by value. */
function same(actual, expected, msg) {
  assert.strictEqual(JSON.stringify(actual), JSON.stringify(expected), msg || "");
}

test("indexes 5 and 6 on Muirfield White are course handicaps 6 and 8, two strokes on the hardest holes", function () {
  var s = round({ course: muirfield, tee: "White", indexes: ["5", "6", "", "", ""], allowance: "100", format: "singles" });
  var c = MP.compute(s);
  assert.strictEqual(MP.coursePar(s), 72);
  assert.strictEqual(s.slope, "144");
  assert.strictEqual(s.rating, "72.1");
  same(c.courseH.slice(0, 2), [6, 8]);
  same(c.playingH.slice(0, 2), [6, 8]);
  same(c.diff.slice(0, 2), [0, 2]);
  assert.strictEqual(strokeSum(c.strokes[0]), 0);
  assert.strictEqual(strokeSum(c.strokes[1]), 2);
  same(holesWith(c.strokes[1], s.si, 1), [1, 2]);
  assert.notStrictEqual(c.diff[1], 1, "must not use the raw index gap of 1");
});

test("rating below par lowers the course handicap for both players", function () {
  var s = round({ slope: 113, rating: 70, teePar: 72, indexes: ["10", "10", "", "", ""] });
  var c = MP.compute(s);
  assert.strictEqual(expectCourse(10, 113, 70, 72), 8);
  same(c.courseH.slice(0, 2), [8, 8]);
  same(c.diff.slice(0, 2), [0, 0]);
  assert.strictEqual(strokeSum(c.strokes[0]) + strokeSum(c.strokes[1]), 0);
});

test("a different tee on the same course changes course handicaps", function () {
  var white = round({ course: muirfield, tee: "White", indexes: ["5", "6", "", "", ""] });
  var memorial = round({ course: muirfield, tee: "Memorial", indexes: ["5", "6", "", "", ""] });
  assert.strictEqual(memorial.slope, "155");
  assert.strictEqual(memorial.rating, "77.4");
  var cw = MP.compute(white).courseH.slice(0, 2);
  var cm = MP.compute(memorial).courseH.slice(0, 2);
  same(cw, [6, 8]);
  same(cm, [expectCourse(5, 155, 77.4, 72), expectCourse(6, 155, 77.4, 72)]);
  same(cm, [12, 14]);
  assert.notStrictEqual(JSON.stringify(cw), JSON.stringify(cm));
});

test("Annandale Blue is 6 and 7 for indexes 5 and 6, one stroke: the 6-vs-8 case is the tee, not every course", function () {
  var s = round({ course: annandale, tee: "Blue", indexes: ["5", "6", "", "", ""] });
  var c = MP.compute(s);
  assert.strictEqual(s.slope, "128");
  assert.strictEqual(s.rating, "70.4");
  assert.strictEqual(MP.coursePar(s), 70);
  same(c.courseH.slice(0, 2), [6, 7]);
  assert.strictEqual(c.diff[1], 1);
  assert.strictEqual(strokeSum(c.strokes[1]), 1);
});

test("plus indexes round half toward positive infinity and the higher player receives the full gap", function () {
  var half = round({ slope: 113, rating: 72, teePar: 72, indexes: ["+1.5", "0", "", "", ""] });
  assert.strictEqual(MP.compute(half).courseH[0], -1);
  var plus = round({ slope: 113, rating: 72, teePar: 72, indexes: ["+2.4", "5", "", "", ""] });
  var c = MP.compute(plus);
  same(c.courseH.slice(0, 2), [-2, 5]);
  same(c.diff.slice(0, 2), [0, 7]);
  assert.strictEqual(strokeSum(c.strokes[1]), 7);
  same(holesWith(c.strokes[1], plus.si, 1), [1, 2, 3, 4, 5, 6, 7]);
  var up = round({ slope: 113, rating: 72, teePar: 72, indexes: ["0.5", "0.5", "", "", ""] });
  assert.strictEqual(MP.compute(up).courseH[0], 1);
});

test("more than 18 strokes, including a third stroke past 36", function () {
  var twenty = round({ slope: 113, rating: 72, teePar: 72, indexes: ["0", "20", "", "", ""] });
  var c = MP.compute(twenty);
  assert.strictEqual(strokeSum(c.strokes[1]), 20);
  same(holesWith(c.strokes[1], twenty.si, 2), [1, 2]);
  assert.strictEqual(holesWith(c.strokes[1], twenty.si, 1).length, 16);
  var thirtySeven = round({ slope: 113, rating: 72, teePar: 72, indexes: ["0", "37", "", "", ""] });
  var d = MP.compute(thirtySeven);
  assert.strictEqual(d.diff[1], 37);
  assert.strictEqual(strokeSum(d.strokes[1]), 37);
  same(holesWith(d.strokes[1], thirtySeven.si, 3), [1]);
  assert.strictEqual(holesWith(d.strokes[1], thirtySeven.si, 2).length, 17);
  for (var h = 1; h <= 60; h++) {
    for (var si = 1; si <= 18; si++) assert.strictEqual(MP.strokesOn(si, h), MP.ownStrokes(si, h));
  }
});

test("90% allowance changes playing handicaps and not the course handicaps", function () {
  var s = round({ course: muirfield, tee: "White", indexes: ["5", "6", "", "", ""], allowance: "90", format: "singles" });
  var c = MP.compute(s);
  same(c.courseH.slice(0, 2), [6, 8]);
  same(c.playingH.slice(0, 2), [5, 7]);
  same(c.diff.slice(0, 2), [0, 2]);
  var stepped = round({ slope: 113, rating: 72.5, teePar: 72, indexes: ["10", "10", "", "", ""], allowance: "90" });
  var p = MP.compute(stepped);
  assert.strictEqual(p.courseH[0], 11);
  assert.strictEqual(p.playingH[0], 10);
});

test("gross games ignore strokes; net games use them", function () {
  function scored() {
    var scores = MP.emptyScores();
    scores[0][4] = "4";
    scores[1][4] = "4";
    return scores;
  }
  var net = round({ course: muirfield, tee: "White", indexes: ["5", "6", "", "", ""], game: "skins", skinMode: "net", scores: scored() });
  var gross = round({ course: muirfield, tee: "White", indexes: ["5", "6", "", "", ""], game: "skins", skinMode: "gross", scores: scored() });
  assert.strictEqual(MP.skins(net, MP.compute(net)).holes[4].winner, 1);
  assert.strictEqual(MP.skins(gross, MP.compute(gross)).holes[4].winner, null);
  var off = round({ course: muirfield, tee: "White", indexes: ["5", "6", "", "", ""], useHcp: false, game: "skins", skinMode: "net", scores: scored() });
  var offCalc = MP.compute(off);
  same(offCalc.diff.slice(0, 2), [0, 0]);
  assert.strictEqual(strokeSum(offCalc.strokes[0]) + strokeSum(offCalc.strokes[1]), 0);
  assert.strictEqual(MP.skins(off, offCalc).holes[4].winner, null);
  var vegasScores = MP.emptyScores();
  [0, 1, 2, 3].forEach(function (p) { vegasScores[p][0] = "4"; });
  var vg = round({ slope: 125, rating: 72.9, teePar: 72, indexes: ["5", "6", "5", "6", ""], game: "vegas", vegasMode: "gross", scores: vegasScores, format: "bestball" });
  assert.strictEqual(MP.vegas(vg, MP.compute(vg)).holes[0].pts, 0);
  var birdScores = MP.emptyScores();
  birdScores[1][0] = "4";
  var bird = round({ course: muirfield, tee: "White", indexes: ["5", "6", "", "", ""], game: "skins", scores: birdScores, birdNet: false });
  var holePar = Number(bird.par[0]);
  assert.ok(holePar >= 4);
  assert.strictEqual(MP.birdies(bird, MP.compute(bird)).count[1], 0);
});

test("Stableford plays off each player's own playing handicap, and a plus gives strokes back", function () {
  var s = round({ slope: 113, rating: 72, teePar: 72, indexes: ["+2", "18", "", "", ""], game: "stableford", allowance: "100" });
  var c = MP.compute(s);
  same(c.courseH.slice(0, 2), [-2, 18]);
  same(c.diff.slice(0, 2), [-2, 18]);
  assert.strictEqual(strokeSum(c.strokes[0]), -2);
  same(holesWith(c.strokes[0], s.si, -1), [17, 18]);
  assert.strictEqual(strokeSum(c.strokes[1]), 18);
});

test("Annandale Orange uses the supplied 73.0/134 and gives Hosp 5.6 three strokes on Speaker 3.7", function () {
  var s = round({ course: annandale, tee: "Orange", indexes: ["5.6", "3.7", "", "", ""], allowance: "100", format: "singles" });
  assert.strictEqual(s.slope, "134");
  assert.strictEqual(Number(s.rating), 73);
  assert.strictEqual(s.course.tees[0].yards, 6640);
  assert.strictEqual(MP.coursePar(s), 70);
  var c = MP.compute(s);
  same(c.courseH.slice(0, 2), [10, 7]);
  same(c.playingH.slice(0, 2), [10, 7]);
  same(c.diff.slice(0, 2), [3, 0]);
  assert.strictEqual(strokeSum(c.strokes[0]), 3);
  same(holesWith(c.strokes[0], s.si, 1), [1, 2, 3]);
  var team = round({
    course: annandale, tee: "Orange", allowance: "90", format: "bestball", game: "nassau",
    indexes: ["5.6", "3.7", "18", "18", ""], names: ["Hosp", "Speaker", "C", "D", "E"]
  });
  var t = MP.compute(team);
  same(t.courseH.slice(0, 2), [10, 7]);
  same(t.playingH.slice(0, 2), [9, 6]);
  assert.strictEqual(t.playingH[0] - t.playingH[1], 3);
  var blue = annandale.tees.filter(function (x) { return x.name === "Blue"; })[0];
  assert.strictEqual(blue.rating, 70.4);
  assert.strictEqual(blue.slope, 128);
  same(annandale.tees.map(function (t) { return [t.name, t.rating, t.slope, t.yards]; }), [
    ["Orange", 73, 134, 6640], ["Orange/Blue", 71.8, 131, 6386], ["Blue", 70.4, 128, 6095], ["Blue/White", 69, 125, 5792],
    ["White", 68.2, 123, 5626], ["White/Green", 66.5, 119, 5264], ["Green", 65.3, 116, 5003], ["Yellow", 63, 110, 4488]
  ]);
});

test("a saved stock Annandale round picks up the GHIN tees, keeps its tee name and scores", function () {
  var old = {
    id: "annandale", name: "Annandale Golf Club", location: "Pasadena, CA",
    par: annandale.par.slice(), si: annandale.si.slice(),
    tees: [
      { name: "Orange", rating: 73, slope: 134, yards: 6602 },
      { name: "Orange/Blue", rating: 71.3, slope: 127, yards: 6387 },
      { name: "Blue", rating: 70.4, slope: 125, yards: 6191 },
      { name: "Runyan", rating: 68.7, slope: 121, yards: 5848 },
      { name: "White", rating: 67.7, slope: 119, yards: 5657 },
      { name: "White/Green", rating: 65.7, slope: 113, yards: 5214 },
      { name: "Green", rating: 64.9, slope: 110, yards: 5041 }
    ]
  };
  function saved(tee, slope, rating) {
    var s = MP.defaultState();
    s.course = JSON.parse(JSON.stringify(old)); s.courseId = "annandale";
    s.tee = tee; s.slope = slope; s.rating = rating; s.teePar = "";
    s.par = annandale.par.map(String); s.si = annandale.si.map(String);
    s.scores = MP.emptyScores(); s.scores[0][0] = "5";
    return s;
  }
  var orange = saved("Orange", "134", "73");
  assert.strictEqual(MP.refreshBuiltinAnnandale(orange), true);
  assert.strictEqual(orange.tee, "Orange");
  assert.strictEqual(Number(orange.slope), 134);
  assert.strictEqual(Number(orange.rating), 73);
  assert.strictEqual(orange.course.tees[0].yards, 6640);
  assert.strictEqual(orange.scores[0][0], "5");
  assert.strictEqual(orange.course.tees.length, 8);
  var blueRound = saved("Blue", "125", "70.4");
  MP.refreshBuiltinAnnandale(blueRound);
  assert.strictEqual(blueRound.tee, "Blue");
  assert.strictEqual(blueRound.slope, "128");
  assert.strictEqual(blueRound.rating, "70.4");
  assert.strictEqual(blueRound.scores[0][0], "5");
  var runyan = saved("Runyan", "121", "68.7");
  MP.refreshBuiltinAnnandale(runyan);
  assert.strictEqual(runyan.tee, "Runyan");
  assert.strictEqual(runyan.slope, "121");
  assert.strictEqual(runyan.rating, "68.7");
  assert.strictEqual(runyan.course.tees.some(function (t) { return t.name === "Runyan"; }), false);
  var custom = saved("Orange", "134", "73");
  custom.courseId = "custom";
  assert.strictEqual(MP.refreshBuiltinAnnandale(custom), false);
  assert.strictEqual(custom.course.tees[0].yards, 6602);
  var typed = saved("Custom", "140", "74.0");
  MP.refreshBuiltinAnnandale(typed);
  assert.strictEqual(typed.tee, "Custom");
  assert.strictEqual(typed.slope, "140");
  assert.strictEqual(typed.rating, "74.0");
});

test("Chevy Chase Glendale is the verified GHIN 18-hole card, and unknown tee lengths are omitted", function () {
  var raw = courses.filter(function (c) { return c.id === "chevy-chase-glendale"; })[0];
  assert.ok(raw, "course missing");
  var checked = MP.checkCourse(raw);
  assert.strictEqual(checked.ok, true, checked.errors && checked.errors.join("; "));
  var c = checked.course;
  assert.strictEqual(c.name, "Chevy Chase Country Club");
  assert.strictEqual(c.location, "Glendale, CA");
  same(c.par, [5, 5, 3, 4, 3, 3, 4, 3, 4, 5, 4, 3, 4, 3, 3, 4, 3, 4]);
  same(c.si, [13, 9, 17, 5, 3, 7, 1, 11, 15, 12, 2, 14, 8, 6, 16, 4, 10, 18]);
  assert.strictEqual(c.par.slice(0, 9).reduce(function (a, b) { return a + b; }, 0), 34);
  assert.strictEqual(c.par.slice(9).reduce(function (a, b) { return a + b; }, 0), 33);
  same(c.tees.map(function (t) { return [t.name, t.rating, t.slope, t.par || null, t.yards || null]; }), [
    ["Black/Blue", 65.8, 124, 67, 5032],
    ["Blue/White", 64.2, 120, 67, null],
    ["White/Red", 62.6, 116, 67, null]
  ]);
  assert.strictEqual(JSON.stringify(raw.tees[1]).indexOf("5032"), -1);
  assert.strictEqual(JSON.stringify(raw.tees[2]).indexOf("5032"), -1);
  var s = round({ course: c, tee: "Black/Blue", indexes: ["10", "10", "", "", ""], allowance: "100" });
  assert.strictEqual(s.slope, "124");
  assert.strictEqual(s.rating, "65.8");
  assert.strictEqual(MP.coursePar(s), 67);
  assert.strictEqual(courses.some(function (x) { return x.id === "annandale"; }), true);
  assert.strictEqual(courses.some(function (x) { return /royal-cape/i.test(x.id) || /Royal Cape/i.test(x.name); }), false);
});

if (failed) { console.error("\n" + failed + " failed"); process.exit(1); }
console.log("\nall handicap tests passed");
