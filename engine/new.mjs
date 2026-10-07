import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const ID = /^[a-z0-9][a-z0-9-]*$/;

const fail = (m) => {
  console.error("new: " + m);
  process.exit(1);
};

const target = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!target) fail("usage: node engine/new.mjs <diagram-dir>");
const dir = resolve(target);
const id = basename(dir);
if (!ID.test(id)) fail(`folder name "${id}" must match ${ID} (it becomes the diagram id)`);
if (existsSync(dir)) fail(`"${dir}" already exists; refusing to overwrite`);

const files = {
  "diagram.mmd": `flowchart LR
  subgraph app["Application Servers"]
    app01["app-01.example.test<br/>Tomcat: demo-api<br/>192.0.2.11/24"]
    app02["app-02.example.test<br/>Tomcat: demo-api<br/>192.0.2.12/24"]
  end
  subgraph ora["Oracle DB Servers"]
    db01[("db-01.example.test<br/>Oracle 19c<br/>192.0.2.21/24")]
  end

  app01 -->|"TCP · SQL*Net"| db01

  classDef application fill:#E3F2FD,stroke:#1565C0
  classDef oracle fill:#FFF3E0,stroke:#E65100

  class app,app01,app02 application
  class ora,db01 oracle
`,
  "diagram.json": JSON.stringify({ title: `${id} infrastructure`, id }, null, 2) + "\n",
  "details.md": `# ${id} infrastructure details
`,
  "notes.md": `# Notes

## Diagram created
Date: ${new Date().toISOString().slice(0, 10)}

Scaffolded by engine/new.mjs; replace the placeholder servers with real ones.
`,
  "documents.md": `# Related documents

- [Overview](https://wiki.example.test/display/DEMO/Overview) — placeholder, replace
`,
  "networks.md": `# Networks

- \`192.0.2.0/24\` Application network
`,
};

mkdirSync(dir, { recursive: true });
for (const [f, text] of Object.entries(files)) writeFileSync(resolve(dir, f), text);
console.log(`new: created ${dir} (${Object.keys(files).join(", ")})`);
