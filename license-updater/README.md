# anatawa12's Unity Test Runner License Updater

A GitHub Actions Workflow that is for renewing license XML stored in github secrets

## Setup

For list of options, please refer [action.yaml](./action.yml).

```yaml
on:
  workflow_dispatch:
    inputs:
      alwaysUpdate:
        type: boolean
  schedule:
    - cron: '0 0 * * *'

permissions:
  contents: write

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - uses: anatawa12/unity-test-runner/license-updater@v0.1
        with:
          githubSecret: ${{ secrets.ACTION_PAT }}
          unityEmail: ${{ secrets.UNITY_EMAIL }}
          unityPassword: ${{ secrets.UNITY_PASSWORD }}
          licenseXml: ${{ secrets.UNITY_LICENSE_XML }}
          onlyIfExpiresSoon: ${{ !inputs.alwaysUpdate }}
          addDummyCommitToRepository: true
          secrets: |-
            ${{ github.repository }}/UNITY_LICENSE_XML
          # anatawa12/unity-test-runner/UNITY_LICENSE_XML
```
