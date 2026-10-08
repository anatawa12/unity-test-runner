export function loadMachineId(licenseXml: string): string {
	const machineIdExtractor =
		/<Identifier Id="([^"]+)" Type="Legacy.MachineBinding1" \/>/;

	const matches = licenseXml.match(machineIdExtractor);

	if (!matches || matches.length < 2) {
		throw new Error(`Failed to extract MachineId from licenseXml.`);
	}

	return matches[1];
}

export function loadUpdateDates(licenseXml: string): Date[] {
	const updateIdExtractor = /<UpdateDate>([^<]*)<\/UpdateDate>/g;
	const results: Date[] = [];

	for (const match of licenseXml.matchAll(updateIdExtractor)) {
		const date = Date.parse(match[1]);
		if (Number.isNaN(date)) throw new Error("Failed to load UpdateDate");
		results.push(new Date(date));
	}

	return results;
}
