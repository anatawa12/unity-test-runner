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
	await fs.mkdir(path.join(tempDir.path, "shared"));

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

		await core.group("starting containers", async () => {
			await exec("docker", [
				"container",
				"run",
				"--detach",
				`--volume=${actionsPath}/scripts:/scripts:z`,
				`--volume=${tempDir.path}/shared:/shared:z`,
				`--env=SHARED_DIR=/shared`,
				`--name=${unityCiContainer}`,
				"--network=none",
				unityCIImageTag,
				"sleep",
				"infinity",
			]);
			await exec("docker", [
				"container",
				"run",
				"--detach",
				`--volume=${actionsPath}/scripts:/scripts:z`,
				`--volume=${tempDir.path}/shared:/shared:z`,
				`--env=SHARED_DIR=/shared`,
				`--env=${inputs.projectPath}=/project`,
				`--env=PROJECT_PATH=/project`,
				`--volume=${path.resolve(process.env.GITHUB_WORKSPACE || process.cwd(), inputs.artifactsPath)}:/artifacts:z`,
				`--env=ARTIFACTS_PATH=/artifacts`,
				`--name=${licenceClientContainer}`,
				`--cpus=${inputs.dockerCpuLimit}`,
				`--memory=${inputs.dockerMemoryLimit}`,
				licenseServerImageTag,
				"sleep",
				"infinity",
			]);
		});

		await core.group("Installing required tools", async () => {
			await exec("docker", [
				"container",
				"exec",
				"--user=0:0",
				unityCIImageTag,
				"sh",
				"-c",
				"apt-get update && apt-get install socat -y --no-install-recommends",
			]);
		});

		await core.group("Running", async () => {
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

			await Promise.all([licenseClient, unityTester]);
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

await run();
