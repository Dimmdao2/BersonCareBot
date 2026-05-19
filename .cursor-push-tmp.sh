#!/bin/bash
set -euo pipefail
cd /home/dev/dev-projects/BersonCareBot
git status --porcelain=v1 > /tmp/bcb-git-status.txt 2>&1
git log -1 --oneline >> /tmp/bcb-git-status.txt 2>&1
echo "---" >> /tmp/bcb-git-status.txt
