import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const version = JSON.parse(fs.readFileSync("extension/package.json", "utf8")).version;
const dir = path.resolve("public/downloads");
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (/^xiamimate-collector-[\d.]+\.zip$/.test(f)) fs.unlinkSync(path.join(dir, f));
const name = "xiamimate-collector-" + version + ".zip";
execFileSync("zip", ["-X", "-qr", path.join(dir, name), "."], { cwd: "extension/dist" });
const bytes = fs.readFileSync(path.join(dir, name));
fs.writeFileSync(path.join(dir, "collector.json"), JSON.stringify({
  version, file: name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"),
}, null, 2) + "\n");
console.log("Collector download: " + name + " (" + bytes.length + " bytes)");
