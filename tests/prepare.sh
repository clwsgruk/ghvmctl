#!/usr/bin/env bash
# Exercise prepare with an agent that is ready before NetworkManager.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export TEST_STATE="$tmp"
export PATH="$tmp:$PATH"

cat > "$tmp/lxc" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$TEST_STATE/commands"
if [[ $1 != exec ]]; then
    exit 0
fi
shift 3
case "$*" in
    'gnome-shell --version')
        printf 'GNOME Shell 50.1\n'
        ;;
    'systemctl start NetworkManager')
        touch "$TEST_STATE/manager"
        ;;
    'nm-online --quiet --timeout=60')
        [[ -f "$TEST_STATE/manager" ]] || exit 1
        [[ ${FAIL_NETWORK:-false} == false ]] || exit 1
        touch "$TEST_STATE/online"
        ;;
    apt-get*)
        [[ -f "$TEST_STATE/online" ]] || {
            printf 'APT ran before the guest network was ready\n' >&2
            exit 100
        }
        touch "$TEST_STATE/apt"
        ;;
esac
EOF
chmod +x "$tmp/lxc"

bash "$root/src/ghvmctl" prepare
[[ -f "$tmp/apt" ]]
printf 'PASS: prepare waits for networking before APT\n'

rm -f "$tmp/manager" "$tmp/online" "$tmp/apt"
export FAIL_NETWORK=true
if bash "$root/src/ghvmctl" prepare; then
    printf 'FAIL: prepare accepted a network timeout\n' >&2
    exit 1
fi
[[ ! -f "$tmp/apt" ]]
printf 'PASS: a network timeout aborts preparation before APT\n'
