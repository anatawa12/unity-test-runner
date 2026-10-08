import * as core from "@actions/core";

export interface Inputs {
	licenseXml: string;
	unityEmail: string;
	unityPassword: string;
	secrets: TargetSecret[];
	githubSecret: string;

	addDummyCommitToRepository: boolean;
	onlyIfExpiresSoon: boolean;
}

// 'organization/secret', 'owner/repo/secret', or 'owner/repo/environment/secret'
export type TargetSecret =
	| OrganizationTargetSecret
	| RepositoryTargetSecret
	| EnvironmentTargetSecret;

export interface OrganizationTargetSecret {
	type: "org";
	organization: string;
	secret: string;
}

export interface RepositoryTargetSecret {
	type: "repo";
	owner: string;
	repo: string;
	secret: string;
}

export interface EnvironmentTargetSecret {
	type: "environment";
	owner: string;
	repo: string;
	environment: string;
	secret: string;
}

export function loadInputs(): Inputs {
	const licenseXml = core.getInput("licenseXml");
	const unityEmail = core.getInput("unityEmail");
	const unityPassword = core.getInput("unityPassword");
	const secrets = parseTargetSecrets(core.getInput("secrets"));
	const githubSecret = core.getInput("githubSecret");
	const addDummyCommitToRepository = core.getBooleanInput(
		"addDummyCommitToRepository",
	);
	const onlyIfExpiresSoon = core.getBooleanInput("onlyIfExpiresSoon");

	return {
		licenseXml,
		unityEmail,
		unityPassword,
		secrets,
		githubSecret,
		addDummyCommitToRepository,
		onlyIfExpiresSoon,
	};
}

function parseTargetSecrets(input: string): TargetSecret[] {
	const lines = input.split(/\r?\n/);
	const result: TargetSecret[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.length === 0) continue;

		const components = line.split("/");

		switch (components.length) {
			case 2:
				result.push({
					type: "org",
					organization: components[0],
					secret: components[1],
				});
				break;
			case 3:
				result.push({
					type: "repo",
					owner: components[0],
					repo: components[1],
					secret: components[2],
				});
				break;
			case 4:
				result.push({
					type: "environment",
					owner: components[0],
					repo: components[1],
					environment: components[2],
					secret: components[3],
				});
				break;
			default:
				throw new Error(`Invalid secrets: invalid line at line ${i + 1}`);
		}
	}

	if (result.length === 0)
		throw new Error(`Invalid secrets: No secrets were defined`);

	return result;
}
