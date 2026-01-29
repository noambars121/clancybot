import fs from "node:fs";
import path from "node:path";

export function loadJsonFile(pathname: string): unknown {
  try {
    if (!fs.existsSync(pathname)) return undefined;
    const raw = fs.readFileSync(pathname, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

export function saveJsonFile(pathname: string, data: unknown) {
  const dir = path.dirname(pathname);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      // If mkdir fails, try to create parent directories manually
      const parts = dir.split(path.sep).filter(Boolean);
      let current = dir.startsWith(path.sep) ? path.sep : "";
      for (const part of parts) {
        current = path.join(current, part);
        if (!fs.existsSync(current)) {
          try {
            fs.mkdirSync(current, { mode: 0o700 });
          } catch (mkdirErr) {
            // If it still fails, throw with more context
            throw new Error(
              `Failed to create directory ${current}: ${mkdirErr instanceof Error ? mkdirErr.message : String(mkdirErr)}`
            );
          }
        }
      }
    }
  }
  fs.writeFileSync(pathname, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.chmodSync(pathname, 0o600);
}
