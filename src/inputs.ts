import * as core from "@actions/core";
import os from "os";

export interface Inputs {
	unityVersion: string | "auto";
	licenseXml: string;
	customImage: string | "";
	projectPath: string;
	customParameters: string;
	testMode: ("playmode" | "editmode")[];
	coverageOptions: string;
	artifactsPath: string;
	dockerCpuLimit: string;
	dockerMemoryLimit: string;
}

export function loadInputs(): Inputs {
	const unityVersion = core.getInput("unityVersion");
	const licenseXml = core.getInput("licenseXml");
	const customImage = core.getInput("customImage");
	const projectPath = core.getInput("projectPath");
	const customParameters = core.getInput("customParameters");
	const testModeInput = core.getInput("testMode");
	const testMode =
		testModeInput === "all"
			? ["playmode", "editmode"]
			: testModeInput.split(";").map((x) => x.toLowerCase());
	if (!testMode.every((x) => x === "playmode" || x === "editmode")) {
		throw new Error("Input testMode contains invalid value");
	}
	const coverageOptions = core.getInput("coverageOptions");
	const artifactsPath = core.getInput("artifactsPath");
	const dockerCpuLimit =
		core.getInput("dockerCpuLimit") || os.cpus().length.toString();
	const dockerMemoryLimit =
		core.getInput("dockerMemoryLimit") ||
		`${Math.floor((os.totalmem() / 1024) * 1024 * 0.9)}m`;

	return {
		unityVersion,
		licenseXml,
		customImage,
		projectPath,
		customParameters,
		testMode,
		coverageOptions,
		artifactsPath,
		dockerCpuLimit,
		dockerMemoryLimit,
	};
}
