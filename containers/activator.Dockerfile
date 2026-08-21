# syntax=docker/dockerfile:1.25

ARG DEBIAN_RELEASE=13

FROM debian:${DEBIAN_RELEASE}-slim

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    curl xz-utils unzip $(apt-cache dumpavail | grep '^Package: libicu[0-9]*$' | awk '{print $2}' | head -1) sudo ca-certificates keyutils

RUN useradd -m admin-user

RUN chmod a+w /etc

USER admin-user

COPY --chmod=755 <<'EOF' /docker-entrypoint.sh
#!/bin/bash

set -eu

# keyctl show; echo $? => exits with 1
echo "Checking if keychain is available..."

if ! keyctl show @s; then
  echo "logging in unity cli requires Key Retention Service and it looks it's not enabled. Please restart this container with --security-opt seccomp=unconfined."
  exit 1
fi

# some oci container system does not create keyring so we need to renew session before run
keyctl new_session || true

cat /proc/sys/kernel/random/uuid | tr -d '-' > /etc/machine-id

echo "Installing Unity CLI for activation..."

curl -fsSL https://public-cdn.cloud.unity3d.com/hub/prod/cli/install.sh | UNITY_CLI_CHANNEL=beta bash

echo "Logging in to unity CLI. Go to the URL and approve login"

export UNITY_NON_INTERACTIVE=1
~/.local/bin/unity auth login

echo "Activating Unity License."
echo "Before start you need to read and accept eula of Unity."
read -p "Do you accept EULA of unity? [y/N] : " -r answer
echo ""

if [ "$answer" != "y" ]; then
  echo "EULA is not accepted ($answer entered)"
  exit 1
fi

~/.local/bin/unity license activate --personal --accept-eula

echo "Activating Unity License Finished! Here is UnityEntitlementLicense.xml. You should not share this XML."
cat ~/.config/unity3d/Unity/licenses/UnityEntitlementLicense.xml
echo

EOF

ENTRYPOINT ["/docker-entrypoint.sh"]
