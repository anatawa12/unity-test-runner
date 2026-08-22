import * as fs from "node:fs/promises";
import path from "node:path";
import * as core from "@actions/core";
import { exec } from "@actions/exec";
import os from "os";
import { loadInputs } from "./inputs.js";
import { parallelRun } from "./parallel-exec-with-pretty-log.js";

async function run(): Promise<void> {
	const unityCiContainer = "unity-test-runner.unity-ci";
	const licenceClientContainer = "unity-test-runner.license-client";
	await using tempDir = await fs.mkdtempDisposable(
		path.join(os.tmpdir(), "unity-test-runner-"),
	);
	await fs.chmod(tempDir.path, 0o700);
	const tmpLicenseClient = path.join(tempDir.path, "tmp-license-client");
	const tmpUnityCi = path.join(tempDir.path, "tmp-unity-ci");
	await fs.mkdir(tmpLicenseClient);
	await fs.mkdir(tmpUnityCi);
	await fs.chmod(tmpLicenseClient, 0o1777);
	await fs.chmod(tmpUnityCi, 0o1777);

	try {
		const inputs = loadInputs();

		const unityVersion =
			inputs.unityVersion === "auto"
				? await loadUnityVersion(inputs.projectPath)
				: inputs.unityVersion;
		const machineId = loadMachineId(inputs.licenseXml);

		const unityCIImageTag =
			inputs.customImage ||
			`unityci/editor:ubuntu-${unityVersion}-linux-il2cpp-3`;
		const licenseServerImageTag =
			"ghcr.io/anatawa12/unity-test-runner/license-client:1";

		const actionsPath = path.dirname(path.dirname(import.meta.filename));

		await core.group("Pulling docker images", async () => {
			await exec("docker", ["image", "pull", unityCIImageTag]);
			await exec("docker", ["image", "pull", licenseServerImageTag]);
		});
		// anatawa12@debian-x64-on-anatawa12-book:~/unity-test-runner/work$ mv tmp/Unity-LicenseClient.sock tmp1/Unity-LicenseClient-root.sock
		// anatawa12@debian-x64-on-anatawa12-book:~/unity-test-runner/work$ mv tmp/Unity-LicenseClient-notifications.sock tmp1/Unity-LicenseClient-root-notifications.sock
		// docker run --rm -it -v "$(pwd)/tmp1:/tmp" -v "$(pwd)/project:/project" -v "$(pwd)/artifacts:/artifacts" unityci/editor:ubuntu-6000.0.59f2-linux-il2cpp-3 unity-editor -batchmode -logFile - -projectPath /project -coverageResultsPath /artifacts/coverage -runTests -testPlatform editmode -testResults "/artifacts/editmode-results.xml" -enableCodeCoverage -debugCodeOptimization -coverageOptions 'generateAdditionalMetrics;generateHtmlReport;generateBadgeReport;dontClear' -quit

		await core.group("starting containers", async () => {
			await exec("docker", [
				"container",
				"run",
				"--detach",
				`--volume=${tmpLicenseClient}:/tmp:z`,
				`--volume=${actionsPath}/scripts:/scripts:z`,
				`--name=${licenceClientContainer}`,
				"--network=none",
				licenseServerImageTag,
				"sleep",
				"infinity",
			]);
			await exec("docker", [
				"container",
				"run",
				"--detach",
				`--volume=${tmpUnityCi}:/tmp:z`,
				`--volume=${actionsPath}/scripts:/scripts:z`,
				`--volume=${inputs.projectPath}:/project:z`,
				`--env=PROJECT_PATH=/project`,
				`--volume=${inputs.artifactsPath}:/artifacts:z`,
				`--env=ARTIFACTS_PATH=/artifacts`,
				`--name=${unityCiContainer}`,
				`--cpus=${inputs.dockerCpuLimit}`,
				`--memory=${inputs.dockerMemoryLimit}`,
				unityCIImageTag,
				"sleep",
				"infinity",
			]);
		});

		await core.group("Installing required tools", async () => {
			await exec("docker", [
				"container",
				"exec",
				"--user=0:0",
				unityCiContainer,
				"sh",
				"-c",
				"apt-get update && apt-get install socat -y --no-install-recommends",
			]);
		});

		await core.group("Running", async () => {
			const unityTester = parallelRun(
				"unity  ",
				"docker",
				[
					"container",
					"exec",
					"--env=CUSTOM_UNITY_PARAMETERS",
					"--env=TEST_MODE",
					"--env=COVERAGE_OPTIONS",
					unityCiContainer,
					"/scripts/unity-test-runner.sh",
				],
				{
					env: {
						CUSTOM_UNITY_PARAMETERS: inputs.customParameters,
						TEST_MODE: inputs.testMode.join(" "),
						COVERAGE_OPTIONS: inputs.coverageOptions,
					},
				},
			);

			const runnerLog = (log: string) => console.log(`[runner ] ${log}`);

			const unityExited = new AbortController();
			const abortPromise = new Promise<false>((resolve) => {
				if (unityExited.signal.aborted) return resolve(false);
				unityExited.signal.addEventListener("abort", () => resolve(false), {
					once: true,
				});
			});

			const user = "root";
			const clientMainSocket = `${tmpLicenseClient}/Unity-LicenseClient.sock`;
			const clientNotifSocket = `${tmpLicenseClient}/Unity-LicenseClient-notifications.sock`;
			const requestFile = `${tmpUnityCi}/Request-Unity-LicenseClient`;
			const mainSocket = `${tmpUnityCi}/Unity-LicenseClient-${user}.sock`;
			const notifSocket = `${tmpUnityCi}/Unity-LicenseClient-${user}-notifications.sock`;

			const runLicenseClient = async () => {
				const licenseClient = parallelRun(
					"license",
					"docker",
					[
						"container",
						"exec",
						"--env=MACHINE_ID",
						"--env=LICENSE_XML",
						licenceClientContainer,
						"/scripts/license-client-runner.sh",
					],
					{
						env: {
							MACHINE_ID: machineId,
							LICENSE_XML: inputs.licenseXml,
						},
					},
				);

				if (
					!(await Promise.race([
						await Promise.all([
							await pollFor(() => exists(clientMainSocket)),
							await pollFor(() => exists(clientNotifSocket)),
						]).then(() => true),
						abortPromise,
					]))
				)
					return;

				runnerLog(`Unity License Client has started!`);

				await fs.rename(clientMainSocket, mainSocket);
				await fs.rename(clientNotifSocket, notifSocket);

				await Promise.race([licenseClient, abortPromise]);

				await fs.rm(mainSocket);
				await fs.rm(notifSocket);
			};

			const licenseClientRunner = (async () => {
				while (await pollFor(() => exists(requestFile), unityExited.signal)) {
					await fs.rm(requestFile);
					runnerLog(`Unity License Client has requested to start`);
					await runLicenseClient();
				}
			})();

			await unityTester;
			unityExited.abort();
			await licenseClientRunner;
		});
	} catch (error) {
		if (error instanceof Error) core.setFailed(error);
		else throw error;
	} finally {
		try {
			await core.group("Removing created containers", async () => {
				await exec("docker", [
					"container",
					"rm",
					"--force",
					licenceClientContainer,
					unityCiContainer,
				]);
			});
		} catch (error) {
			if (error instanceof Error) core.setFailed(error);
			else console.error(`Error removing created containers: ${error}`);
		}
	}
}

async function loadUnityVersion(projectPath: string) {
	const projectVersionFile = path.join(
		projectPath,
		"ProjectSettings",
		"ProjectVersion.txt",
	);
	let projectVersionTxt: string;
	try {
		projectVersionTxt = await fs.readFile(projectVersionFile, "latin1");
	} catch (e) {
		throw new Error(
			`Failed to load project settings file at "${projectPath}". Have you correctly set the projectPath?`,
		);
	}
	const versionRegex = /m_EditorVersion: (\d+\.\d+\.\d+[A-Za-z]?\d+)/;

	const matches = projectVersionTxt.match(versionRegex);

	if (!matches || matches.length < 2) {
		throw new Error(`Failed to extract version from "${projectVersionTxt}".`);
	}

	return matches[1];
}

function loadMachineId(licenseXml: string): string {
	const machineIdExtractor =
		/<Identifier Id="([^"]+)" Type="Legacy.MachineBinding1" \/>/;

	const matches = licenseXml.match(machineIdExtractor);

	if (!matches || matches.length < 2) {
		throw new Error(`Failed to extract MachineId from licenseXml.`);
	}

	return matches[1];
}

function exists(path: string) {
	return fs.stat(path).then(
		() => true,
		() => false,
	);
}

async function pollFor(
	cond: () => boolean | Promise<boolean>,
	signal?: AbortSignal,
) {
	while (!(await cond())) {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		if (signal?.aborted) return false;
	}
	return true;
}

await run();
