#!/usr/bin/env bash
# Builds the app and publishes dist/ to the gh-pages branch.
# GitHub Pages must be set to "Deploy from a branch": gh-pages, / (root).
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build
touch dist/.nojekyll

WORKTREE="$(mktemp -d)"
trap 'git worktree remove --force "$WORKTREE" 2>/dev/null || true' EXIT

git fetch origin gh-pages 2>/dev/null || true
if git show-ref --verify --quiet refs/remotes/origin/gh-pages; then
  git worktree add "$WORKTREE" origin/gh-pages
  git -C "$WORKTREE" checkout -B gh-pages
else
  git worktree add --detach "$WORKTREE"
  git -C "$WORKTREE" checkout --orphan gh-pages
fi

git -C "$WORKTREE" rm -rfq . 2>/dev/null || true
cp -R dist/. "$WORKTREE"/
git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "gh-pages already up to date"
  exit 0
fi
git -C "$WORKTREE" -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name)}" \
  -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email)}" \
  commit -qm "Deploy $(git rev-parse --short HEAD) to GitHub Pages"
git -C "$WORKTREE" push -f origin gh-pages
echo "Published to gh-pages"
