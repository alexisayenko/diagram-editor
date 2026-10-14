// The one table of the keys of a servers/<id>.toml file. It feeds the parser's allowed keys and checks, the surgical writer,
// the details panel table and the editor form (the table is inlined as the "ui/server-fields" runtime module through
// Function.toString(), so the function must stay self-contained), and engine/test/server-fields.test.mjs compares it with docs/tech/authoring.md.
//   type    single (one-line string), list (string array), text (multi-line string), flag (boolean)
//   form    edited in the details panel form        row   a Key / Value row of the panel table (and a non-empty one-line string)
//   check   ip | dns: a list entry validator        card  drawn on the server card
//   label   panel table and form label, placeholder the form's example, add the form's "Add ..." button
export function serverFieldsKit() {
  var FIELDS = [
    { key: "id", type: "single", label: "ID" },
    { key: "name", type: "single", label: "Name", form: true, card: true },
    { key: "server_type", type: "single", label: "Server type", form: true },
    { key: "region", type: "single", label: "Region" },
    { key: "os", type: "single", label: "OS", placeholder: "Ubuntu 24.04", form: true, row: true, card: true },
    { key: "hardware", type: "single", label: "Hardware", placeholder: "8 vCPU, 16 GB RAM", form: true, row: true },
    { key: "cpu", type: "single", label: "CPU", formLabel: "CPU (cores)", placeholder: "8", form: true, row: true, card: true },
    { key: "ram", type: "single", label: "RAM", formLabel: "RAM (size)", placeholder: "16G", form: true, row: true, card: true },
    { key: "swap", type: "single", label: "Swap", formLabel: "Swap (size)", placeholder: "2G", form: true, row: true, card: true },
    { key: "disk", type: "single", label: "Disk", formLabel: "Disk (size)", placeholder: "50G", form: true, row: true, card: true },
    { key: "role", type: "single", label: "Role", placeholder: "Reverse proxy", form: true, row: true },
    { key: "ips", type: "list", label: "IPs", add: "Add IP", placeholder: "192.0.2.10/24", form: true, check: "ip", card: true },
    { key: "dns", type: "list", label: "DNS", add: "Add DNS name", placeholder: "host.example.test", form: true, check: "dns" },
    { key: "jobs", type: "list", label: "Jobs", add: "Add job", placeholder: "Job 104 batch import", form: true, card: true },
    { key: "rmi_services", type: "list", label: "RMI services", add: "Add RMI service", placeholder: "ExampleService", form: true, card: true },
    { key: "systemd_services", type: "list", label: "systemd services", add: "Add systemd service", placeholder: "example.service", form: true, card: true },
    { key: "services", type: "list", label: "Services", card: true },
    { key: "details", type: "text", label: "Notes", form: true },
    { key: "proposed", type: "flag", label: "Proposed" },
  ];
  return { FIELDS: FIELDS };
}

export const SERVER_FIELDS = serverFieldsKit().FIELDS;
export const SERVER_KEYS = SERVER_FIELDS.map((f) => f.key);
export const SERVER_ROW_FIELDS = SERVER_FIELDS.filter((f) => f.row);
export const SERVER_LIST_FIELDS = SERVER_FIELDS.filter((f) => f.type === "list" && f.form);
export const SERVER_FORM_KEYS = SERVER_FIELDS.filter((f) => f.form).map((f) => f.key);
