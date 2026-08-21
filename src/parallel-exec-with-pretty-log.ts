import { type CommonSpawnOptions, spawn } from "node:child_process";
import { createInterface } from "node:readline";

export function parallelRun(
	name: string,
	command: string,
	args: string[],
	options: Omit<CommonSpawnOptions, "stdio">,
) {
	const child = spawn(command, args, {
		stdio: ["ignore", "pipe", "pipe"],
		...options,
	});

	for (const [stream, output] of [
		[child.stdout, process.stdout],
		[child.stderr, process.stderr],
	] as const) {
		const rl = createInterface({ input: stream });

		rl.on("line", (line) => {
			output.write(`[${name}] ${line}\n`);
		});
	}

	return new Promise<void>((resolve, reject) => {
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`${name} exited with code ${code}`));
			}
		});

		child.on("error", reject);
	});
}
