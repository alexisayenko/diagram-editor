// Node-free text helpers shared by the Node build and the browser bundle.
export const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
