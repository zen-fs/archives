#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-3.0-or-later
# Builds the archive fixtures used by the tests.
#
# "data" is built from tests/data, "core" from the test data shipped with @zenfs/core.
# Each is built as a ZIP, an ISO 9660 image and a (ustar) tarball.

set -euo pipefail
export LC_ALL=C # Stable ordering of archive entries

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

out="$root/tests/files"
formats=(zip iso tar)
names=()

# Fixed timestamp (`touch -t`) for everything we put into an archive, so rebuilds are reproducible.
timestamp='202601010000.00'

usage() {
	cat <<-EOF
		Usage: ${0##*/} [options] [name...]

		Names:
		  data    tests/data (default)
		  core    node_modules/@zenfs/core/tests/data (default)

		Options:
		  -f, --formats <list>  Comma-separated list of formats to build (zip, iso, tar). Defaults to all.
		  -o, --out <dir>       Output directory. Defaults to tests/files.
		  -h, --help            Show this message.
	EOF
}

source_for() {
	case "$1" in
	data) echo "$root/tests/data" ;;
	core) echo "$root/node_modules/@zenfs/core/tests/data" ;;
	*)
		echo "Unknown archive: $1" >&2
		return 1
		;;
	esac
}

while [ $# -gt 0 ]; do
	case "$1" in
	-f | --formats)
		IFS=, read -ra formats <<<"${2:?missing value for $1}"
		shift 2
		;;
	-o | --out)
		out="${2:?missing value for $1}"
		shift 2
		;;
	-h | --help)
		usage
		exit 0
		;;
	-*)
		echo "Unknown option: $1" >&2
		usage >&2
		exit 1
		;;
	*)
		names+=("$1")
		shift
		;;
	esac
done

[ ${#names[@]} -gt 0 ] || names=(data core)

for format in "${formats[@]}"; do
	case "$format" in
	zip | iso | tar) ;;
	*)
		echo "Unknown format: $format" >&2
		exit 1
		;;
	esac
done

# ISO tooling differs per platform: genisoimage/mkisofs/xorrisofs on Linux, hdiutil on macOS.
# Unlike the ZIP and tar output, the image is not byte-reproducible: every one of these embeds its
# own build timestamp, which none of them can be told to override portably.
mkiso() {
	local target="$1" dir="$2" tool
	for tool in genisoimage mkisofs xorrisofs; do
		command -v "$tool" >/dev/null || continue

		# The fixtures are plain ISO 9660 (uppercase 8.3 names with `;1` versions) so they keep
		# exercising the backend's name handling. Only xorrisofs adds Rock Ridge by default.
		if [ "$tool" = xorrisofs ]; then
			xorrisofs -quiet --norock -V CDROM -o "$target" "$dir"
		else
			"$tool" -quiet -V CDROM -o "$target" "$dir"
		fi
		return
	done

	if command -v hdiutil >/dev/null; then
		hdiutil makehybrid -quiet -iso -default-volume-name CDROM -o "$target" "$dir"
		return
	fi

	echo "No ISO tool found: install xorriso (Linux) or use hdiutil (macOS)" >&2
	return 1
}

mktar() {
	local target="$1" dir="$2"
	local -a owner

	# GNU tar and the bsdtar shipped by macOS spell ownership differently.
	if tar --version 2>/dev/null | grep -q GNU; then
		owner=(--owner=0 --group=0)
	else
		owner=(--uid 0 --gid 0 --uname '' --gname '')
	fi

	(
		cd "$dir"
		shopt -s dotglob nullglob
		tar --create --format=ustar --numeric-owner "${owner[@]}" --file "$target" -- *
	)
}

mkzip() {
	local target="$1" dir="$2"
	# Entries are fed in sorted rather than in readdir order, so the archive does not depend on the
	# host FS. -X drops platform-specific extra fields, -o dates the archive by its newest entry.
	(cd "$dir" && find . -mindepth 1 | sed 's|^\./||' | sort | zip --quiet -X -o "$target" -@)
}

mkdir -p "$out"
out="$(cd "$out" && pwd)"

staged="$(mktemp -d)"
trap 'rm -rf "$staged"' EXIT

for name in "${names[@]}"; do
	src="$(source_for "$name")"

	if [ ! -d "$src" ]; then
		echo "Missing source directory for '$name': $src" >&2
		exit 1
	fi

	# Build from a copy so the fixed timestamps never touch the sources.
	dir="$staged/$name"
	mkdir -p "$dir"
	cp -R "$src/." "$dir/"
	find "$dir" -exec touch -t "$timestamp" {} +

	for format in "${formats[@]}"; do
		target="$out/$name.$format"
		rm -f "$target"
		"mk$format" "$target" "$dir"
		echo "$target"
	done
done
