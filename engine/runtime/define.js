window.InfraDiagram = { modules: {} };
InfraDiagram.define = function (name, deps, factory) {
  const args = {};
  deps.forEach(function (d) {
    if (!InfraDiagram.modules[d]) throw new Error("InfraDiagram: " + name + " needs " + d + ", which is not loaded yet");
    args[d.split("/").pop().replace(/-(\w)/g, function (_, c) { return c.toUpperCase(); })] = InfraDiagram.modules[d];
  });
  InfraDiagram.modules[name] = factory(args);
};
