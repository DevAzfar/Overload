import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(`Release verification failed: ${message}`);
}

const root = resolve(import.meta.dirname, "..");
const expectedImages = new Map([
  ["public/favicon-32.png", [32, 32]],
  ["public/apple-touch-icon.png", [180, 180]],
  ["public/icons/overload-192.png", [192, 192]],
  ["public/icons/overload-512.png", [512, 512]],
  ["public/og.png", [1200, 630]],
]);

function pngDimensions(path) {
  const bytes = readFileSync(path);
  assert(bytes.subarray(1, 4).toString("ascii") === "PNG", `${path} must be a PNG`);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

expectedImages.forEach(([width, height], relativePath) => {
  const path = join(root, relativePath);
  assert(existsSync(path), `${relativePath} should exist`);
  const [actualWidth, actualHeight] = pngDimensions(path);
  assert(actualWidth === width && actualHeight === height, `${relativePath} should be ${width}×${height}`);
});

const html = readFileSync(join(root, "index.html"), "utf8");
assert(html.includes("<title>Overload</title>"), "document title should use Overload");
assert(html.includes("manifest.webmanifest") && html.includes("apple-touch-icon.png") && html.includes("og.png"), "brand metadata links should exist");
const manifest = JSON.parse(readFileSync(join(root, "public/manifest.webmanifest"), "utf8"));
assert(manifest.name === "Overload" && manifest.icons.length === 2, "manifest should identify Overload and both install icons");

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
assert(packageJson.name === "overload", "private package should be renamed to overload");
assert(lock.name === "overload" && lock.packages[""].name === "overload", "lockfile package names should match");
assert(Object.keys(packageJson.scripts).join(",") === "dev,build,preview", "package scripts should remain unchanged");
assert(Object.keys(packageJson.dependencies).join(",") === "react,react-dom", "runtime dependency set should remain unchanged");
assert(
  Object.keys(packageJson.devDependencies).sort().join(",") === "@types/react,@types/react-dom,@vitejs/plugin-react,typescript,vite",
  "development dependency set should remain unchanged",
);
assert(!existsSync(join(root, ".github/workflows")), "no GitHub Actions workflow should be created in this pass");

const dist = join(root, "dist");
assert(existsSync(dist), "production build output should exist before running this check");
for (const relativePath of [
  "favicon-32.png", "apple-touch-icon.png", "icons/overload-192.png", "icons/overload-512.png",
  "brand/overload-logo.png", "manifest.webmanifest", "og.png",
]) {
  assert(existsSync(join(dist, relativePath)), `${relativePath} should be included in the production build`);
}

function filesBelow(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesBelow(path) : [path];
  });
}

const bundledText = filesBelow(dist)
  .filter((path) => [".js", ".html"].includes(extname(path)))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
for (const id of ["demo-beginner-24", "demo-plateau-24", "demo-inconsistent-21"]) {
  assert(bundledText.includes(id), `${id} should be present in bundled raw demo data`);
}
assert(!bundledText.includes("RocketMark") && !bundledText.includes("LIFT OFF"), "built application should not contain obsolete visible branding");

console.log("Overload release verification passed: metadata, package identity, brand assets and bundled demo data are present.");
