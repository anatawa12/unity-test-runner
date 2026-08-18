import * as core from "@actions/core";

async function run(): Promise<void> {
	try {
		console.log("works!");
	} catch (error) {
		if (error instanceof Error) core.setFailed(error);
		else throw error;
	}
}

run();
