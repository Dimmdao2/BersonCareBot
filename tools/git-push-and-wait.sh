#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"

branch="$(git branch --show-current)"
if [[ -z "${branch}" ]]; then
  echo "git-push-and-wait: detached HEAD is not pushable" >&2
  exit 2
fi

remote="${1:-$(git config --get "branch.${branch}.remote" || true)}"
remote="${remote:-origin}"
target_branch="${2:-$(git config --get "branch.${branch}.merge" || true)}"
target_branch="${target_branch#refs/heads/}"
target_branch="${target_branch:-${branch}}"

timeout_seconds="${GITHUB_CHECK_TIMEOUT_SECONDS:-3600}"
poll_seconds="${GITHUB_CHECK_POLL_SECONDS:-10}"
discovery_grace_seconds="${GITHUB_CHECK_DISCOVERY_GRACE_SECONDS:-30}"
for value in "${timeout_seconds}" "${poll_seconds}" "${discovery_grace_seconds}"; do
  if [[ ! "${value}" =~ ^[1-9][0-9]*$ ]]; then
    echo "git-push-and-wait: timeout/poll/grace values must be positive integers" >&2
    exit 2
  fi
done

for command in git gh jq; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "git-push-and-wait: missing required command: ${command}" >&2
    exit 2
  fi
done

remote_url="$(git remote get-url "${remote}")"
case "${remote_url}" in
  git@*:*) github_repo="${remote_url#*:}" ;;
  ssh://*/*) github_repo="${remote_url#ssh://*/}" ;;
  http://*/*|https://*/*) github_repo="${remote_url#*://*/}" ;;
  *)
    echo "git-push-and-wait: cannot derive GitHub repository from ${remote_url}" >&2
    exit 2
    ;;
esac
github_repo="${github_repo%.git}"
if [[ ! "${github_repo}" =~ ^[^/]+/[^/]+$ ]]; then
  echo "git-push-and-wait: invalid GitHub repository path: ${github_repo}" >&2
  exit 2
fi

sha="$(git rev-parse HEAD)"
git push "${remote}" "HEAD:refs/heads/${target_branch}"

remote_sha="$(git ls-remote "${remote}" "refs/heads/${target_branch}" | awk 'NR == 1 { print $1 }')"
if [[ "${remote_sha}" != "${sha}" ]]; then
  echo "git-push-and-wait: remote branch does not point to pushed SHA ${sha}" >&2
  exit 1
fi

deadline=$((SECONDS + timeout_seconds))
last_count=-1
stable_since=${SECONDS}
runs='[]'

while (( SECONDS < deadline )); do
  runs="$(gh run list \
    --repo "${github_repo}" \
    --commit "${sha}" \
    --limit 100 \
    --json databaseId,status,conclusion,name,url,workflowName,event)"
  count="$(jq 'length' <<<"${runs}")"
  incomplete="$(jq '[.[] | select(.status != "completed")] | length' <<<"${runs}")"

  if [[ "${count}" -ne "${last_count}" ]]; then
    last_count="${count}"
    stable_since=${SECONDS}
  fi

  if [[ "${count}" -gt 0 && "${incomplete}" -eq 0 \
    && $((SECONDS - stable_since)) -ge "${discovery_grace_seconds}" ]]; then
    break
  fi

  echo "GitHub checks for ${sha:0:12}: discovered=${count}, incomplete=${incomplete}" >&2
  sleep "${poll_seconds}"
done

if [[ "$(jq 'length' <<<"${runs}")" -eq 0 ]]; then
  echo "git-push-and-wait: no GitHub Actions runs appeared for ${sha} before timeout" >&2
  exit 1
fi
if [[ "$(jq '[.[] | select(.status != "completed")] | length' <<<"${runs}")" -ne 0 ]]; then
  echo "git-push-and-wait: GitHub Actions did not reach terminal state before timeout" >&2
  jq -r '.[] | "\(.name): \(.status) \(.url)"' <<<"${runs}" >&2
  exit 1
fi

jq -r '.[] | "\(.name): \(.conclusion) \(.url)"' <<<"${runs}" >&2
mapfile -t failed_run_ids < <(
  jq -r '.[] | select(.conclusion != "success") | .databaseId' <<<"${runs}"
)
if [[ "${#failed_run_ids[@]}" -eq 0 ]]; then
  echo "git-push-and-wait: all GitHub Actions passed for ${sha}" >&2
  exit 0
fi

diagnostics_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "${diagnostics_dir}"
}
trap cleanup EXIT

for run_id in "${failed_run_ids[@]}"; do
  echo "git-push-and-wait: failed run ${run_id}" >&2
  gh run view --repo "${github_repo}" "${run_id}" --log-failed >&2 || true

  artifact_dir="${diagnostics_dir}/${run_id}"
  mkdir -p "${artifact_dir}"
  if gh run download --repo "${github_repo}" "${run_id}" \
    --name gitleaks-report --dir "${artifact_dir}" >/dev/null 2>&1; then
    node scripts/render-gitleaks-sarif.mjs "${artifact_dir}/gitleaks.sarif" >/dev/null
  fi
done

echo "git-push-and-wait: pushed SHA has failed GitHub checks" >&2
exit 1
