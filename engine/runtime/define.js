window.InfraDiagram = { modules: {} };
InfraDiagram.define = function (name, deps, factory) {
  var args = deps.map(function (d) {
    if (!InfraDiagram.modules[d]) throw new Error("InfraDiagram: " + name + " needs " + d + ", which is not loaded yet");
    return InfraDiagram.modules[d];
  });
  InfraDiagram.modules[name] = factory.apply(null, args);
};
