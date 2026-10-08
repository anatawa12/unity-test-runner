import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as core from "@actions/core";
import { exec } from "@actions/exec";
import { getOctokit } from "@actions/github";
import sodium from "libsodium-wrappers";
import { containerHostname, licenseServerImageTag } from "../containers.js";
import { loadMachineId, loadUpdateDates } from "../license-xml.js";
import { loadInputs } from "./inputs.js";

interface Outputs {
	updated: boolean;
}

const actionsPath = path.dirname(
	path.dirname(path.dirname(import.meta.filename)),
);

async function main(): Promise<Outputs> {
	const inputs = loadInputs();

	core.setSecret(inputs.unityPassword); // for safety

	if (inputs.onlyIfExpiresSoon) {
		const dates = loadUpdateDates(inputs.licenseXml);
		const updateIfExpiresAfter = Date.now() - 30 * 60 * 60 * 1000;

		if (dates.some((date) => date.getTime() >= updateIfExpiresAfter)) {
			core.info(
				"The license xml provided does not expires in 30 hours. skipping.",
			);

			return { updated: false };
		}
	}

	const machineId = loadMachineId(inputs.licenseXml);

	const client = getOctokit(inputs.githubSecret);

	await using tempDir = await fs.mkdtempDisposable(
		path.join(os.tmpdir(), "unity-test-runner-"),
	);

	await core.group("Updating License", async () => {
		await exec(
			"docker",
			[
				"container",
				"run",
				`--hostname=${containerHostname}`,
				`--volume=${tempDir.path}:/outputs:z`,
				`--volume=${actionsPath}/scripts:/scripts:z`,
				"--env=MACHINE_ID",
				"--env=UNITY_EMAIL",
				"--env=UNITY_PASSWORD",
				licenseServerImageTag,
				"/scripts/license-updater.sh",
			],
			{
				env: {
					MACHINE_ID: machineId,
					UNITY_EMAIL: inputs.unityEmail,
					UNITY_PASSWORD: inputs.unityPassword,
				},
			},
		);
	});

	let newLicenseXml: string | null = null;
	try {
		newLicenseXml = await fs.readFile(
			path.join(tempDir.path, "UnityEntitlementLicense.xml"),
			"utf-8",
		);
	} catch (e) {
		core.error(e as never);
	}

	if (newLicenseXml == null) {
		core.error(
			"Failed to update UnityEntitlementLicense.xml. See log for more details",
		);
		return { updated: false };
	}

	core.setSecret(newLicenseXml);

	core.info(
		"We successfully updated UnityEntitlementLicense.xml. Updating GitHub Secrets...",
	);

	// Finished

	for (const target of inputs.secrets) {
		switch (target.type) {
			case "org": {
				const pk = await client.rest.actions.getOrgPublicKey({
					org: target.organization,
				});
				const secret = await client.rest.actions.getOrgSecret({
					org: target.organization,
					secret_name: target.organization,
				});
				await client.rest.actions.createOrUpdateOrgSecret({
					org: target.organization,
					secret_name: target.organization,
					encrypted_value: await encryptSecret(pk.data.key, newLicenseXml),
					key_id: pk.data.key_id,
					visibility: secret.data.visibility,
				});
				break;
			}
			case "repo": {
				const pk = await client.rest.actions.getRepoPublicKey({
					owner: target.owner,
					repo: target.repo,
				});
				await client.rest.actions.createOrUpdateRepoSecret({
					owner: target.owner,
					repo: target.repo,
					secret_name: target.secret,
					encrypted_value: await encryptSecret(pk.data.key, newLicenseXml),
					key_id: pk.data.key_id,
				});
				break;
			}
			case "environment": {
				const pk = await client.rest.actions.getEnvironmentPublicKey({
					owner: target.owner,
					repo: target.repo,
					environment_name: target.environment,
				});
				await client.rest.actions.createOrUpdateEnvironmentSecret({
					owner: target.owner,
					repo: target.repo,
					environment_name: target.environment,
					secret_name: target.secret,
					encrypted_value: await encryptSecret(pk.data.key, newLicenseXml),
					key_id: pk.data.key_id,
				});
				break;
			}
		}
	}

	return {
		updated: true,
	};
}

async function run(): Promise<void> {
	try {
		const outputs = await main();
		core.setOutput("updated", outputs.updated);
	} catch (error) {
		if (error instanceof Error) core.setFailed(error);
		else throw error;
	}

	process.exit(process.exitCode);
}

async function encryptSecret(key: string, value: string): Promise<string> {
	await sodium.ready;

	const messageBytes = Buffer.from(value);
	const keyBytes = Buffer.from(key, "base64");

	const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
	return Buffer.from(encryptedBytes).toString("base64");
}

await run();
