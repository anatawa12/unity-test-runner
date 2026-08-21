#!/bin/bash

# unexport related variables
export -n SHARED_DIR PROJECT_PATH ARTIFACTS_PATH CUSTOM_UNITY_PARAMETERS TEST_MODE COVERAGE_OPTIONS

if [ -z "$SHARED_DIR" ]; then
  echo '$SHARED_DIR is not set.' >&2
  exit 1
fi

test_failure=false

prepare_test_env() {
  echo "###########################"
  echo "# Test Environment Setup  #"
  echo "###########################"
  echo ""
  echo "Creating \"$ARTIFACTS_PATH\" if it does not exist."
  mkdir -p "$ARTIFACTS_PATH"
  echo ""
  echo "###########################"
  echo "#   Current Environment   #"
  echo "###########################"
  echo ""
  env
  echo ""
}

prepare_license_client() {
  # starting license client proxy
  socat "UNIX-LISTEN:/tmp/Unity-LicenseClient-$(whoami).sock,fork,reuseaddr" "UNIX-CONNECT:$SHARED_DIR/unity-license-client.sock" &
  socat "UNIX-LISTEN:/tmp/Unity-LicenseClient-$(whoami)-notifications.sock,fork,reuseaddr" "UNIX-CONNECT:$SHARED_DIR/unity-license-client-notifications.sock" &

  echo "Waiting for license client to start..."
  echo ""
  while ! [ -e "$SHARED_DIR/unity-license-client-ready" ]; do
    sleep 1
  done
  echo "License client has started!"
}

run_platform_test() {
  local platform=$1
  echo ""
  echo "###########################"
  echo "#   Testing in $platform  #"
  echo "###########################"
  echo ""

  # shellcheck disable=SC2086 # CUSTOM_UNITY_PARAMETERS is env supplied
  unity-editor \
    -batchmode \
    -logFile - \
    -projectPath "$PROJECT_PATH" \
    -coverageResultsPath "$ARTIFACTS_PATH/coverage" \
    -runTests \
    -testPlatform "$platform" \
    -testResults "$ARTIFACTS_PATH/$platform-results.xml" \
    -enableCodeCoverage \
    -debugCodeOptimization \
    -coverageOptions "$COVERAGE_OPTIONS" \
    $CUSTOM_UNITY_PARAMETERS \
    | tee "$ARTIFACTS_PATH/$platform.log"

  TEST_EXIT_CODE="${PIPESTATUS[0]}"

  # Display results
  if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo "Run succeeded, no failures occurred";
  elif [ $TEST_EXIT_CODE -eq 2 ]; then
    echo "Run succeeded, some tests failed";
  elif [ $TEST_EXIT_CODE -eq 3 ]; then
    echo "Run failure (other failure)";
  else
    echo "Unexpected exit code $TEST_EXIT_CODE";
  fi

  if [ $TEST_EXIT_CODE -ne 0 ]; then
    test_failure=true
  fi

  echo ""
  echo "###########################"
  echo "#    $platform Results    #"
  echo "###########################"
  echo ""

  cat "$FULL_ARTIFACTS_PATH/$platform-results.xml"
}

prepare_test_env
prepare_license_client

for platform in ${TEST_MODE//;/ }; do
  # no standalone support
  run_platform_test "$platform"
done

kill %1 %2
wait 2>/dev/null

if $test_failure; then
  exit 1
fi
