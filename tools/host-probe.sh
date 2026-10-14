#!/usr/bin/env bash
# Read-only host probe: prints one servers/<id>.toml snippet on stdout.
# Run:    ssh HOST 'bash -s' < tools/host-probe.sh
# Needs:  plain bash and a normal (non-root) login. Never uses sudo.
# Never:  writes files, changes settings, installs anything, or sends data
#         anywhere. It only runs list/show commands and prints the results.
# Facts that need root (e.g. process names of other users' ports) are skipped.
# Any missing tool is skipped quietly; its key is printed empty.
# Every command that touches the host is listed once, in the COMMANDS block
# below; the functions after it only reshape that text.

# True if the command exists on this host.
have() { local cmd=$1; command -v "$cmd" >/dev/null 2>&1; return; }

# Run a command with a 5 second limit, no stdin, errors hidden.
run() {
  if have timeout; then timeout 5 "$@" </dev/null 2>/dev/null
  else "$@" </dev/null 2>/dev/null; fi
  return
}

# COMMANDS: everything this script asks the host. Nothing else runs. Every line only reads or lists. No sudo, no writes, no network calls.
# Each function is one tiny read-only command. A missing tool or a timeout prints nothing and fails quietly.
cmd_hostname_short()        { run hostname -s; return; }                          # short host name
cmd_hostname_plain()        { run hostname; return; }                             # host name, fallback for the short one
cmd_hostname_fqdn()         { run hostname -f; return; }                          # full host name
cmd_os_release()            { run cat "${OS_RELEASE:-/etc/os-release}"; return; }          # OS name and version (shell-style file)
cmd_debian_version()        { run cat "${DEBIAN_VERSION:-/etc/debian_version}"; return; }  # Debian point release, e.g. 11.11
cmd_redhat_release()        { run cat /etc/redhat-release; return; }              # old RHEL-likes: "CentOS release 6.10 (Final)"
cmd_kernel()                { run uname -sr; return; }                            # kernel name and version
cmd_arch()                  { run uname -m; return; }                             # CPU architecture
cmd_uptime()                { run uptime -p; return; }                            # "up 3 days, 2 hours"
cmd_cpu_count()             { run nproc; return; }                                # number of CPU cores
cmd_mem_info()              { run cat /proc/meminfo; return; }                    # RAM and swap sizes in kB
cmd_disk_root()             { run df -h /; return; }                              # size of the root filesystem
cmd_ip_addresses()          { have ip && run ip -o -4 addr show scope global; return; }  # IPv4 addresses, one line each
cmd_user_crontab()          { run crontab -l; return; }                           # your own cron jobs (no root needed)
cmd_system_crontabs() {                                                   # world-readable system cron files
  local f
  for f in /etc/crontab /etc/cron.d/*; do
    [[ -r "$f" ]] || continue
    case "$f" in *.placeholder|*~|*.dpkg-*) continue ;; *) ;; esac
    run cat "$f"; echo
  done
  return
}
cmd_timers()                { have systemctl && run systemctl list-timers --all --no-legend --plain; return; }              # systemd timers
cmd_services()              { have systemctl && run systemctl list-units --type=service --state=running --no-legend --plain; return; }  # running services
cmd_listening_ports()       { have ss && run ss -H -ltnup; return; }              # listening sockets (preferred tool)
cmd_listening_ports_netstat() { have netstat && run netstat -ltnup; return; }     # same, for hosts without ss
cmd_containers()            { local rt=$1; have "$rt" && run "$rt" ps --format '{{.Names}}'; return; }  # running container names; $1 = docker or podman

# Make stdin safe inside a TOML "..." string: drop CRs, escape \ and ".
esc() { tr -d '\r' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# Turn lines on stdin into a TOML array: ["a", "b"] ("[]" if empty).
to_array() {
  local first=1 line
  printf '['
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    if [[ "$first" = 0 ]]; then printf ', '; fi
    first=0
    printf '"%s"' "$(printf '%s' "$line" | esc)"
  done
  printf ']'
  return
}

# Server id: short hostname, lowercase, anything but a-z 0-9 becomes "-".
make_id() {
  # lowercase | non-alphanumerics to "-" | trim "-" at both ends
  local id=$1
  printf '%s' "$id" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9\n' '-' | sed 's/^-*//; s/-*$//'
  return
}

# Global IPv4 addresses, skipping container/virtual bridge interfaces.
list_ips() {
  # "ip -o" prints one line per address: field 2 = interface, field 4 = address/prefix
  cmd_ip_addresses | awk '{print $2, $4}' \
    | grep -Ev '^(lo|docker|veth|br-|virbr|cni|flannel|cali|tun|podman)' | awk '{print $2}'
  return
}

# OS name from the os-release text, e.g. "Debian 11.11 bullseye", "Ubuntu 16.04 LTS Xenial", "Rocky Linux 9.4".
# os-release is a plain shell file, so we evaluate it inside a subshell (the parentheses) to keep its variables to ourselves.
os_name() {
  local text
  text=$(cmd_os_release)
  [[ -n "$text" ]] || return 0
  (
    eval "$text" 2>/dev/null
    id=${ID:-}
    ver=${VERSION_ID:-}
    code=${VERSION_CODENAME:-}
    case "$id" in
      debian)
        # The Debian version file holds the full point release ("11.11"); testing/sid hold words such as "bookworm/sid".
        full=$(cmd_debian_version)
        case "$full" in
          [0-9]*.[0-9]*) ver=$full ;;
          [0-9]*) ;;
          *) ver= ;;
        esac
        [[ -n "$code" ]] || code=$(printf '%s' "${VERSION:-}" | sed -n 's/.*(\(.*\)).*/\1/p')
        printf '%s' "Debian${ver:+ $ver}${code:+ $code}"
        ;;
      ubuntu)
        lts=
        case "${VERSION:-} ${PRETTY_NAME:-}" in *LTS*) lts=" LTS" ;; *) ;; esac
        # Capitalise the first letter of the codename ("xenial" -> "Xenial").
        cap=$(printf '%s' "$code" | sed 's/^./\U&/')
        printf '%s' "Ubuntu${ver:+ $ver}$lts${cap:+ $cap}"
        ;;
      *)
        if [[ -n "$ver" && -n "${NAME:-}" ]]; then
          short=$(printf '%s' "$NAME" | sed 's/ GNU\/Linux//; s/ Server$//; s/ Linux Server$/ Linux/')
          printf '%s' "$short $ver${code:+ $code}"
        elif [[ -n "${PRETTY_NAME:-}" ]]; then
          printf '%s' "$PRETTY_NAME"
        else
          # Old RHEL-likes without VERSION_ID: "CentOS release 6.10 (Final)".
          cmd_redhat_release | head -n 1
        fi
        ;;
    esac
  )
  return
}

# Total RAM rounded to whole G (GiB), as "8G", or nothing if unknown.
memory_gib() {
  local kb
  kb=$(cmd_mem_info | awk '/^MemTotal/{print $2}')
  [[ -n "$kb" ]] || return 0
  printf '%sG' "$(( (kb + 524288) / 1048576 ))"
  return
}

# Swap size rounded to whole G (GiB), as "2G"; nothing if there is no swap or it is unknown.
swap_gib() {
  local kb
  kb=$(cmd_mem_info | awk '/^SwapTotal/{print $2}')
  [[ -n "$kb" && "$kb" -gt 0 ]] 2>/dev/null || return 0
  printf '%sG' "$(( (kb + 524288) / 1048576 ))"
  return
}

# Size of the root filesystem as df -h prints it (e.g. "50G"); nothing if unavailable.
disk_size() {
  cmd_disk_root | awk 'NR == 2 {print $2}'
  return
}

# Print "cron: <schedule> <command basename>" for crontab lines on stdin.
# $1 = extra fields before the command (0 user crontab, 1 system file: has a user column).
cron_lines() {
  # skip comments, blank lines and VAR=value; schedule is 5 fields, or 1 for @daily etc.
  local extra=$1
  awk -v extra="$extra" '!/^[ \t]*(#|$)/ && !/^[A-Za-z_][A-Za-z0-9_]*=/ {
    if ($1 ~ /^@/) { sched = $1; start = 2 + extra }
    else { sched = $1 " " $2 " " $3 " " $4 " " $5; start = 6 + extra }
    cmd = start
    for (i = start; i <= NF; i++) if (index($i, "/")) { cmd = i; break }   # first path-like word
    n = split($cmd, parts, "/")
    if (parts[n] == "") parts[n] = "cmd"
    print "cron: " sched " " parts[n] }'
  return
}

# Cron jobs: own crontab (works without root) plus world-readable system files.
list_cron() {
  cmd_user_crontab | cron_lines 0
  cmd_system_crontabs | cron_lines 1
  return
}

# Timers that are not stock OS housekeeping (anything matching is hidden).
OS_TIMERS='apt-daily|apt-daily-upgrade|dpkg-db-backup|e2scrub_all|fstrim|fwupd-refresh|logrotate|man-db|motd-news|systemd-tmpfiles-clean|update-notifier-download|update-notifier-motd|ua-timer|sysstat-.*|mdcheck.*|mdmonitor-oneshot|snapd.snap-repair|lvm2-.*|raid-check|dnf-makecache|shadow|plocate-updatedb|anacron|phpsessionclean|cron-.*'
list_timers() {
  cmd_timers | grep -o '[^ ]*\.timer' | sort -u \
    | grep -Ev "^($OS_TIMERS)\.timer\$" | sed 's/^/timer: /'
  return
}

# Running systemd services that are not stock OS plumbing (anything matching is hidden).
OS_SERVICES='systemd-.*|dbus(-broker)?|cron|crond|atd|rsyslog|syslog-ng|ssh|sshd|openssh-server|getty@.*|serial-getty@.*|console-getty|user@.*|user-runtime-dir@.*|polkit|polkitd|networkd-dispatcher|NetworkManager|wpa_supplicant|irqbalance|multipathd|udisks2|accounts-daemon|avahi-daemon|chrony|chronyd|ntp|ntpd|unattended-upgrades|ModemManager|snapd|lvm2-.*|auditd|gssproxy|rpcbind|tuned|rngd|qemu-guest-agent|vmtoolsd|open-vm-tools|cloud-.*|amazon-ssm-agent|packagekit|fwupd|thermald|upower|rtkit-daemon|apport|ufw|firewalld|sysstat|lxd-.*|plymouth.*|dm-event|mdmonitor|nscd|sssd|postfix|exim4|containerd|docker|podman|libvirtd|wsl-.*'
list_services() {
  cmd_services | awk '{print $1}' \
    | sed 's/\.service$//' | grep -Ev "^($OS_SERVICES)\$" | sort -u | head -60
  return
}

# Listening TCP/UDP ports as "proto/port process". Without root, only your own
# processes have names; the others print "?".
list_listening() {
  local out
  if out=$(cmd_listening_ports); then
    # the process name sits inside: users:(("name",pid=1,fd=2))
    printf '%s' "$out" | awk '{
      split($5, a, ":"); port = a[length(a)]
      name = "?"
      if (match($0, /users:\(\("[^"]+"/)) name = substr($0, RSTART + 9, RLENGTH - 10)
      print $1 "/" port " " name }' | sort -t/ -k2,2n -u | head -60
  elif out=$(cmd_listening_ports_netstat); then
    printf '%s' "$out" | awk 'NR > 2 {
      split($4, a, ":"); name = $NF; sub(/^[0-9]*\//, "", name)
      if (name == "-") name = "?"
      print $1 "/" a[length(a)] " " name }' | sort -u | head -60
  fi
  return
}

# Running container names per runtime, e.g. "docker: web, db". Needs docker-group
# access without sudo; if denied, nothing is printed.
list_containers() {
  local rt names
  for rt in docker podman; do
    names=$(cmd_containers "$rt" | head -30 | tr '\n' ',' | sed 's/,$//; s/,/, /g')
    if [[ -n "$names" ]]; then printf '%s: %s\n' "$rt" "$names"; fi
  done
  return
}

# Free-text "details" body: kernel, uptime, containers, listening ports.
# (CPU, memory, swap and disk have their own keys: see main.)
build_details() {
  local listen containers
  listen=$(list_listening)
  containers=$(list_containers)
  printf 'Kernel: %s %s\n' "$(cmd_kernel)" "$(cmd_arch)"
  printf 'Uptime: %s\n' "$(cmd_uptime | sed 's/^$/?/')"
  if [[ -n "$containers" ]]; then printf '%s\n' "$containers"; fi
  printf 'Listening (proto/port process):\n'
  if [[ -n "$listen" ]]; then printf '%s\n' "$listen" | sed 's/^/- /'; else printf '(none visible)\n'; fi
  return
}

# Print the snippet.
main() {
  local host fqdn os ncpu ram swap disk
  host=$(cmd_hostname_short || cmd_hostname_plain)
  fqdn=$(cmd_hostname_fqdn || echo "$host")
  os=$(os_name)
  ncpu=$(cmd_cpu_count)
  ram=$(memory_gib)
  swap=$(swap_gib)
  disk=$(disk_size)

  echo "# Generated by tools/host-probe.sh (read-only, no sudo)."
  echo "# Review, add region/role/server_type, then save as servers/<id>.toml."
  echo "id = \"$(make_id "$host")\""
  echo "name = \"$(printf '%s' "$fqdn" | esc)\""
  echo "ips = $(list_ips | to_array)"
  if [[ -n "$os" ]]; then echo "os = \"$(printf '%s' "$os" | esc)\""; fi
  if [[ -n "$ncpu" ]]; then echo "cpu = \"$ncpu\""; fi
  if [[ -n "$ram" ]]; then echo "ram = \"$ram\""; fi
  if [[ -n "$swap" ]]; then echo "swap = \"$swap\""; fi
  if [[ -n "$disk" ]]; then echo "disk = \"$(printf '%s' "$disk" | esc)\""; fi
  echo "jobs = $( { list_cron; list_timers; } | awk '!seen[$0]++' | head -50 | to_array)"
  echo "systemd_services = $(list_services | to_array)"
  # details is multi-line: join lines with a literal \n inside one TOML string
  printf 'details = "%s"\n' "$(build_details | esc | awk 'NR > 1 { printf "\\n" } { printf "%s", $0 }')"
  return
}

main </dev/null
