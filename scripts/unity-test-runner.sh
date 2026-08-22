#!/bin/bash

# unexport related variables
export -n PROJECT_PATH ARTIFACTS_PATH CUSTOM_UNITY_PARAMETERS TEST_MODE COVERAGE_OPTIONS

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
  env | sed 's/=.*//'
  echo ""
  env
  echo ""
  echo "###########################"
  echo "#    Project Directory    #"
  echo "###########################"
  echo ""
  ls -la "$PROJECT_PATH"
  echo ""
}

prepare_license_client() {
  # starting license client proxy
  SOCK1="/tmp/Unity-LicenseClient-$(whoami).sock"
  SOCK2="/tmp/Unity-LicenseClient-$(whoami)-notifications.sock"

  echo "Waiting for license client to start..."
  echo ""
  while ! [ -e "$SOCK1" ] || ! [ -e "$SOCK2" ]; do
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
    -quit \
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

rm -rf /tmp/* /tmp/.*

if $test_failure; then
  exit 1
fi
