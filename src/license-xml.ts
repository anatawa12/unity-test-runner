export function loadMachineId(licenseXml: string): string {
	const machineIdExtractor =
		/<Identifier Id="([^"]+)" Type="Legacy.MachineBinding1" \/>/;

	const matches = licenseXml.match(machineIdExtractor);

	if (!matches || matches.length < 2) {
		throw new Error(`Failed to extract MachineId from licenseXml.`);
	}

	return matches[1];
}
