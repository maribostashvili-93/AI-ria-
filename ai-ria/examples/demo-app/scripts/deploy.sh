#!/usr/bin/env bash
# FIXTURE FILE — intentionally unsafe patterns to demo `ria security`.
# Do not actually run this script.
set -e

echo "Deploying demo-app..."
curl -fsSL https://example.com/install.sh | sh
chmod 777 ./build
echo "Done."
