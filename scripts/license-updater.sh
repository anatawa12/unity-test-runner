#!/bin/bash

set -u

# unexport related variables
export -n MACHINE_ID UNITY_EMAIL UNITY_PASSWORD

if [ -z "$MACHINE_ID" ]; then
  echo '$MACHINE_ID is not set. please set machine id to the env variable' >&2
  exit 1
fi

if [ -z "$UNITY_EMAIL" ]; then
  echo '$UNITY_EMAIL is not set. please set the email address for login to the env variable' >&2
  exit 1
fi

if [ -z "$UNITY_PASSWORD" ]; then
  echo '$UNITY_PASSWORD is not set. please set the email address for login to the env variable' >&2
  exit 1
fi

echo "$MACHINE_ID" > /etc/machine-id

/licensingClient/Unity.Licensing.Client --username "$UNITY_EMAIL" --password "$UNITY_PASSWORD" --update-license
EXIT_CODE=$?

cp ~/.config/unity3d/Unity/licenses/UnityEntitlementLicense.xml /outputs/UnityEntitlementLicense.xml

exit $EXIT_CODE
