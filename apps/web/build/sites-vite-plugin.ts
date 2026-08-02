import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function sites(): Plugin {
  let root = process.cwd();

  return {
    name: "sites",
    apply: "build",
    configResolved(config) {
      root = config.root;
    },
    async closeBundle() {
      const workerOutput = resolve(root, "dist", "lumadrop", "index.js");
      const workerConfig = resolve(root, "dist", "lumadrop", "wrangler.json");
      const serverDirectory = resolve(root, "dist", "server");
      const outputDirectory = resolve(root, "dist", ".openai");
      const hostingConfig = resolve(root, ".openai", "hosting.json");

      if (await exists(workerOutput)) {
        await mkdir(serverDirectory, { recursive: true });
        await cp(workerOutput, resolve(serverDirectory, "index.js"));
      }
      if (await exists(workerConfig)) {
        await cp(workerConfig, resolve(root, "dist", "wrangler.json"));
      }
      await rm(outputDirectory, { recursive: true, force: true });
      await mkdir(outputDirectory, { recursive: true });
      if (await exists(hostingConfig)) {
        await cp(hostingConfig, resolve(outputDirectory, "hosting.json"));
      }
    }
  };
}
