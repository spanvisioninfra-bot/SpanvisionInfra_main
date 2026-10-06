node() {
  command node "$@"
  local rc=$?
  if [ "$rc" -ne 0 ]; then printf 'NODE_COMMAND_FAILURE exit=%s args=%s\n' "$rc" "$*" >&2; fi
  return "$rc"
}
