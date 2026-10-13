#!/usr/bin/env bash
# Read-only host probe: prints one servers/<id>.toml snippet on stdout.
# Run:    ssh HOST 'bash -s' < tools/host-probe.sh
# Needs:  plain bash and a normal (non-root) login. Never uses sudo.
# Never:  writes files, changes settings, installs anything, or sends data
#         anywhere. It only runs list/show commands and prints the results.
# Facts that need root (e.g. process names of other users' ports) are skipped.
# Any missing tool is skipped quietly; its key is printed empty.

# True if the command exists on this host.
have() { command -v "$1" >/dev/null 2>&1; }

# Run a command with a 5 second limit, no stdin, errors hidden.
run() {
  if have timeout; then timeout 5 "$@" </dev/null 2>/dev/null
  else "$@" </dev/null 2>/dev/null; fi
}

# Make stdin safe inside a TOML "..." string: drop CRs, escape \ and ".
esc() { tr -d '\r' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# Turn lines on stdin into a TOML array: ["a", "b"] ("[]" if empty).
to_array() {
  local first=1 line
  printf '['
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    if [ "$first" = 0 ]; then printf ', '; fi
    first=0
    printf '"%s"' "$(printf '%s' "$line" | esc)"
  done
  printf ']'
}

# Server id: short hostname, lowercase, anything but a-z 0-9 becomes "-".
make_id() {
  # lowercase | non-alphanumerics to "-" | trim "-" at both ends
  printf '%s' "$1" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9\n' '-' | sed 's/^-*//; s/-*$//'
}

# Global IPv4 addresses, skipping container/virtual bridge interfaces.
list_ips() {
  have ip || return 0
  # "ip -o" prints one line per address: field 2 = interface, field 4 = address/prefix
  run ip -o -4 addr show scope global | awk '{print $2, $4}' \
    | grep -Ev '^(lo|docker|veth|br-|virbr|cni|flannel|cali|tun|podman)' | awk '{print $2}'
}

# Pretty OS name, e.g. "Ubuntu 22.04.4 LTS" (os-release is a plain shell file).
os_name() {
  [ -r /etc/os-release ] || return 0
  . /etc/os-release 2>/dev/null
  printf '%s' "${PRETTY_NAME:-}"
}

# Total RAM rounded to whole GiB, or nothing if unknown.
memory_gib() {
  local kb
  kb=$(awk '/^MemTotal/{print $2}' /proc/meminfo 2>/dev/null)
  [ -n "$kb" ] || return 0
  printf '%s GiB' "$(( (kb + 524288) / 1048576 ))"
}

# Swap size rounded to whole GiB; nothing if there is no swap or it is unknown.
swap_gib() {
  local kb
  kb=$(awk '/^SwapTotal/{print $2}' /proc/meminfo 2>/dev/null)
  [ -n "$kb" ] && [ "$kb" -gt 0 ] 2>/dev/null || return 0
  printf '%s GiB' "$(( (kb + 524288) / 1048576 ))"
}

# Size of the root filesystem as df -h prints it (e.g. "50G"); nothing if unavailable.
disk_size() {
  run df -h / | awk 'NR == 2 {print $2}'
}

# Print "cron: <schedule> <command basename>" for crontab lines on stdin.
# $1 = extra fields before the command (0 user crontab, 1 system file: has a user column).
cron_lines() {
  # skip comments, blank lines and VAR=value; schedule is 5 fields, or 1 for @daily etc.
  awk -v extra="$1" '!/^[ \t]*(#|$)/ && !/^[A-Za-z_][A-Za-z0-9_]*=/ {
    if ($1 ~ /^@/) { sched = $1; start = 2 + extra }
    else { sched = $1 " " $2 " " $3 " " $4 " " $5; start = 6 + extra }
    cmd = start
    for (i = start; i <= NF; i++) if (index($i, "/")) { cmd = i; break }   # first path-like word
    n = split($cmd, parts, "/")
    if (parts[n] == "") parts[n] = "cmd"
    print "cron: " sched " " parts[n] }'
}

# Cron jobs: own crontab (works without root) plus world-readable system files.
list_cron() {
  local f
  run crontab -l | cron_lines 0
  for f in /etc/crontab /etc/cron.d/*; do
    [ -r "$f" ] || continue
    case "$f" in *.placeholder|*~|*.dpkg-*) continue ;; esac
    cron_lines 1 < "$f" 2>/dev/null
  done
}

# Timers that are not stock OS housekeeping (anything matching is hidden).
OS_TIMERS='apt-daily|apt-daily-upgrade|dpkg-db-backup|e2scrub_all|fstrim|fwupd-refresh|logrotate|man-db|motd-news|systemd-tmpfiles-clean|update-notifier-download|update-notifier-motd|ua-timer|sysstat-.*|mdcheck.*|mdmonitor-oneshot|snapd.snap-repair|lvm2-.*|raid-check|dnf-makecache|shadow|plocate-updatedb|anacron|phpsessionclean|cron-.*'
list_timers() {
  have systemctl || return 0
  run systemctl list-timers --all --no-legend --plain | grep -o '[^ ]*\.timer' | sort -u \
    | grep -Ev "^($OS_TIMERS)\.timer\$" | sed 's/^/timer: /'
}

# Running systemd services that are not stock OS plumbing (anything matching is hidden).
OS_SERVICES='systemd-.*|dbus(-broker)?|cron|crond|atd|rsyslog|syslog-ng|ssh|sshd|openssh-server|getty@.*|serial-getty@.*|console-getty|user@.*|user-runtime-dir@.*|polkit|polkitd|networkd-dispatcher|NetworkManager|wpa_supplicant|irqbalance|multipathd|udisks2|accounts-daemon|avahi-daemon|chrony|chronyd|ntp|ntpd|unattended-upgrades|ModemManager|snapd|lvm2-.*|auditd|gssproxy|rpcbind|tuned|rngd|qemu-guest-agent|vmtoolsd|open-vm-tools|cloud-.*|amazon-ssm-agent|packagekit|fwupd|thermald|upower|rtkit-daemon|apport|ufw|firewalld|sysstat|lxd-.*|plymouth.*|dm-event|mdmonitor|nscd|sssd|postfix|exim4|containerd|docker|podman|libvirtd|wsl-.*'
list_services() {
  have systemctl || return 0
  run systemctl list-units --type=service --state=running --no-legend --plain | awk '{print $1}' \
    | sed 's/\.service$//' | grep -Ev "^($OS_SERVICES)\$" | sort -u | head -60
}

# Listening TCP/UDP ports as "proto/port process". Without root, only your own
# processes have names; the others print "?".
list_listening() {
  if have ss; then
    # the process name sits inside: users:(("name",pid=1,fd=2))
    run ss -H -ltnup | awk '{
      split($5, a, ":"); port = a[length(a)]
      name = "?"
      if (match($0, /users:\(\("[^"]+"/)) name = substr($0, RSTART + 9, RLENGTH - 10)
      print $1 "/" port " " name }' | sort -t/ -k2,2n -u | head -60
  elif have netstat; then
    run netstat -ltnup | awk 'NR > 2 {
      split($4, a, ":"); name = $NF; sub(/^[0-9]*\//, "", name)
      if (name == "-") name = "?"
      print $1 "/" a[length(a)] " " name }' | sort -u | head -60
  fi
}

# Running container names per runtime, e.g. "docker: web, db". Needs docker-group
# access without sudo; if denied, nothing is printed.
list_containers() {
  local rt names
  for rt in docker podman; do
    have "$rt" || continue
    names=$(run "$rt" ps --format '{{.Names}}' | head -30 | tr '\n' ',' | sed 's/,$//; s/,/, /g')
    if [ -n "$names" ]; then printf '%s: %s\n' "$rt" "$names"; fi
  done
}

# Free-text "details" body: kernel, uptime, containers, listening ports.
# (CPU, memory, swap and disk have their own keys: see main.)
build_details() {
  local listen containers
  listen=$(list_listening)
  containers=$(list_containers)
  printf 'Kernel: %s %s\n' "$(uname -sr 2>/dev/null)" "$(uname -m 2>/dev/null)"
  printf 'Uptime: %s\n' "$(uptime -p 2>/dev/null | sed 's/^$/?/')"
  if [ -n "$containers" ]; then printf '%s\n' "$containers"; fi
  printf 'Listening (proto/port process):\n'
  if [ -n "$listen" ]; then printf '%s\n' "$listen" | sed 's/^/- /'; else printf '(none visible)\n'; fi
}

# Print the snippet.
main() {
  local host fqdn os ncpu ram swap disk
  host=$(hostname -s 2>/dev/null || hostname 2>/dev/null)
  fqdn=$(hostname -f 2>/dev/null || echo "$host")
  os=$(os_name)
  ncpu=$(nproc 2>/dev/null)
  ram=$(memory_gib)
  swap=$(swap_gib)
  disk=$(disk_size)

  echo "# Generated by tools/host-probe.sh (read-only, no sudo)."
  echo "# Review, add region/role/server_type, then save as servers/<id>.toml."
  echo "id = \"$(make_id "$host")\""
  echo "name = \"$(printf '%s' "$fqdn" | esc)\""
  echo "ips = $(list_ips | to_array)"
  if [ -n "$os" ]; then echo "os = \"$(printf '%s' "$os" | esc)\""; fi
  if [ -n "$ncpu" ]; then echo "cpu = \"$ncpu cores\""; fi
  if [ -n "$ram" ]; then echo "ram = \"$ram\""; fi
  if [ -n "$swap" ]; then echo "swap = \"$swap\""; fi
  if [ -n "$disk" ]; then echo "disk = \"$(printf '%s' "$disk" | esc)\""; fi
  echo "jobs = $( { list_cron; list_timers; } | awk '!seen[$0]++' | head -50 | to_array)"
  echo "systemd_services = $(list_services | to_array)"
  # details is multi-line: join lines with a literal \n inside one TOML string
  printf 'details = "%s"\n' "$(build_details | esc | awk 'NR > 1 { printf "\\n" } { printf "%s", $0 }')"
}

main </dev/null
