// Kits: pure functions written once in Node and inlined into the page as runtime modules through Function.toString().
// A kit body may only use its own locals and language built-ins; engine/test/kits.test.mjs enforces that.
// A kit may take arguments: { json: value } is inlined as JSON, { kit: fn } as the call of another kit.
import { geometryKitOf } from "../render/geometry.mjs";
import { METRICS, metricsKit } from "../render/metrics.mjs";
import { keysKit } from "../lib/keys.mjs";
import { drawKit } from "../render/draw-kit.mjs";
import { osIconKit } from "../render/os-icons.mjs";
import { serverFieldsKit } from "../model/server-fields.mjs";

const json = (value) => ({ json: value });
const kit = (fn) => ({ kit: fn });

export const KITS = {
  "ui/keys": { fn: keysKit, file: "engine/lib/keys.mjs (keysKit)", names: ["nodeKey", "parseKey", "isKind"] },
  "ui/metrics": { fn: metricsKit, args: [json(METRICS)], file: "engine/render/metrics.mjs (metricsKit)", names: ["METRICS"] },
  "ui/os-icons": { fn: osIconKit, file: "engine/render/os-icons.mjs (osIconKit)", names: ["ICONS", "glyph", "iconSvg"] },
  "ui/server-fields": { fn: serverFieldsKit, file: "engine/model/server-fields.mjs (serverFieldsKit)", names: ["FIELDS"] },
  "canvas/geometry": { fn: geometryKitOf, args: [json(METRICS), kit(keysKit)], file: "engine/render/geometry.mjs (geometryKitOf)", names: ["headerTitle", "boxExtent", "boxFor", "rows", "fitBox", "fitRegion", "regionBounds", "resizeRegion", "route", "routeWith", "problems"] },
  "canvas/draw-kit": { fn: drawKit, file: "engine/render/draw-kit.mjs (drawKit)", names: ["decimate", "smoothPath", "distToStroke", "hits", "hitIndex", "history", "validate", "pathMarkup", "markup", "newId"] },
};
