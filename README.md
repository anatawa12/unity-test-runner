# anatawa12's Unity Test Runner

A GitHub Actions Workflow that is for running unity tests.

## Differences from GameCI

- No need to store password to secrets!
  - GameCI recently requires storing passwords.
  - This workflow only needs `UnityEntitlementLicense.xml` which is what similar to `ulf` files, which does not contain such credentials
- Unity log are output to GitHub Actions in real-time
  - You can investigate workflow freeze without needing cancelling workflow and downloading artifacts
- No additional credentials exposed to Unity
  - Except for several specified directories like project and artifacts, no credentials are exposed to Unity engine.
  - `UnityEntitlementLicense.xml` is visible only to Unity Licencing Client, not to Unity itself so your C# code cannot (hard to) take your license away.

## Setup

For list of options, please refer [action.yaml](./action.yml).

```yaml
name: 'build-test'

jobs:
  test: # make sure the action works on a clean machine without building
    runs-on: ${{ matrix.on }}
    steps:
      # checkout your repository
      - uses: actions/checkout@v7

      - uses: anatawa12/unity-test-runner@v1
        with:
          licenseXml: ${{ secrets.UNITY_LICENSE_XML }}

      - uses: actions/upload-artifact@v7
        with:
          name: Unity Test Results
          path: artifacts
```

### Preparing license XML

To run unity with your credentials, you need to set contents of `UnityEntitlementLicense.xml` for Linux to UNITY_LICENSE_XML.

To make it easy to preparing unity license, we have `ghcr.io/anatawa12/unity-test-runner/activator` image.
Use following command to initiate activation process, and 

```bash
# --security-opt=seccomp=unconfined is necessary for keyring access
docker run --rm -it --pull=always --security-opt=seccomp=unconfined ghcr.io/anatawa12/unity-test-runner/activator:1
# Or with apple container
# container run --rm -it --pull=always --arch=amd64 ghcr.io/anatawa12/unity-test-runner/activator:1
```

## Extra note on semantic versioning

This action is generally intended to use on GitHub-hosted Runner and with default image.
Therefore, environment requirements changes and `customImage` requirement changes might be done in patch versions.
When you use `customImage` or this on self-hosted runner, please pin patch version, or keep your runner updated to
reasonably newer version of runner and provide reasonably popular tools on environnt.
