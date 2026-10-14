// Kits: pure functions written once in Node and inlined into the page as runtime modules through Function.toString().
// A kit body may only use its own locals and language built-ins; engine/test/kits.test.mjs enforces that.
import { geometryKit } from "../render/geometry.mjs";
import { drawKit } from "../render/draw-kit.mjs";
import { osIconKit } from "../render/os-icons.mjs";
import { serverFieldsKit } from "../model/server-fields.mjs";

export const KITS = {
  "ui/os-icons": { fn: osIconKit, file: "engine/render/os-icons.mjs (osIconKit)", names: ["ICONS", "glyph", "iconSvg"] },
  "ui/server-fields": { fn: serverFieldsKit, file: "engine/model/server-fields.mjs (serverFieldsKit)", names: ["FIELDS"] },
  "canvas/geometry": { fn: geometryKit, file: "engine/render/geometry.mjs (geometryKit)", names: ["headerTitle", "boxExtent", "fitBox", "fitRegion", "regionBounds", "resizeRegion", "route", "problems"] },
  "canvas/draw-kit": { fn: drawKit, file: "engine/render/draw-kit.mjs (drawKit)", names: ["decimate", "smoothPath", "distToStroke", "hits", "hitIndex", "history", "validate", "pathMarkup", "markup", "newId"] },
};
