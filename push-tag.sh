#!/usr/bin/env bash

set -euo pipefail

remote="origin"
latest_tag="$(git for-each-ref \
  --sort=-version:refname \
  --count=1 \
  --format='%(refname:short)' \
  refs/tags)"

if [[ -z "$latest_tag" ]]; then
  echo "No local tags found." >&2
  exit 1
fi

echo "Pushing latest local tag $latest_tag to $remote..."
git push "$remote" "refs/tags/$latest_tag"
