#!/bin/bash

set -eu

# unexport related variables
export -n MACHINE_ID LICENSE_XML SHARED_DIR

if [ -z "$MACHINE_ID" ]; then
  echo '$MACHINE_ID is not set. please set machine id to the env variable' >&2
  exit 1
fi

if [ -z "$LICENSE_XML" ]; then
  echo '$LICENSE_XML is not set. please set contents of UnityEntitlementLicense.xml to the env variable' >&2
  exit 1
fi

if [ -z "$SHARED_DIR" ]; then
  echo '$SHARED_DIR is not set.' >&2
  exit 1
fi

echo "$MACHINE_ID" > /etc/machine-id

mkdir -p ~/.config/unity3d/Unity/licenses
printf "%s" "$LICENSE_XML" > ~/.config/unity3d/Unity/licenses/UnityEntitlementLicense.xml

socat "UNIX-LISTEN:$SHARED_DIR/unity-license-client.sock,fork,reuseaddr" UNIX-CONNECT:/tmp/Unity-LicenseClient.sock &
socat "UNIX-LISTEN:$SHARED_DIR/unity-license-client-notifications.sock,fork,reuseaddr" UNIX-CONNECT:/tmp/Unity-LicenseClient-notifications.sock &

(
  while ! [ -e "/tmp/Unity-LicenseClient.sock" ] || ! [ -e "/tmp/Unity-LicenseClient-notifications.sock" ]; do
    sleep 1
  done
  touch "$SHARED_DIR/unity-license-client-ready";
  echo "license client started!"
) &

/licensingClient/Unity.Licensing.Client --namedPipe Unity-LicenseClient --debug

rm -f touch "$SHARED_DIR/unity-license-client-ready"

kill %1 %2
