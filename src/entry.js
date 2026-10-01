import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// True when this module is the script node was asked to run, including via an npm bin symlink.
export function isEntryPoint(moduleUrl) {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
