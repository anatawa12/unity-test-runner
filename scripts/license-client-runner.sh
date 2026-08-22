#!/bin/bash

set -u

# unexport related variables
export -n MACHINE_ID LICENSE_XML

if [ -z "$MACHINE_ID" ]; then
  echo '$MACHINE_ID is not set. please set machine id to the env variable' >&2
  exit 1
fi

if [ -z "$LICENSE_XML" ]; then
  echo '$LICENSE_XML is not set. please set contents of UnityEntitlementLicense.xml to the env variable' >&2
  exit 1
fi

echo "$MACHINE_ID" > /etc/machine-id

mkdir -p ~/.config/unity3d/Unity/licenses
printf "%s" "$LICENSE_XML" > ~/.config/unity3d/Unity/licenses/UnityEntitlementLicense.xml

/licensingClient/Unity.Licensing.Client --namedPipe Unity-LicenseClient
EXIT_CODE=$?

kill %1 %2
rm -rf /tmp/* /tmp/.*

exit $EXIT_CODE
