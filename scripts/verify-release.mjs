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
const pagesWorkflowPath = join(root, ".github/workflows/deploy-pages.yml");
assert(existsSync(pagesWorkflowPath), "the GitHub Pages workflow should exist");
const pagesWorkflow = readFileSync(pagesWorkflowPath, "utf8");
for (const expected of [
  "branches: [main]",
  "workflow_dispatch:",
  "actions/checkout@v6",
  "actions/configure-pages@v5",
  "actions/setup-node@v6",
  "npm ci",
  "npm run build",
  "actions/upload-pages-artifact@v4",
  "path: dist",
  "actions/deploy-pages@v4",
  "pages: write",
  "id-token: write",
  "cancel-in-progress: false",
]) {
  assert(pagesWorkflow.includes(expected), `Pages workflow should include ${expected}`);
}
assert(!pagesWorkflow.includes("npm install"), "Pages workflow should use the lockfile-only npm install command");
const brandLogoSource = readFileSync(join(root, "src/BrandLogo.tsx"), "utf8");
assert(brandLogoSource.includes("icons/overload-192.png") && !brandLogoSource.includes("brand/overload-logo.png"), "in-app marks should use the 192px logo derivative");
const appSource = readFileSync(join(root, "src/App.tsx"), "utf8");
const templateSelectionSource = appSource.slice(appSource.indexOf("function openTemplateSelection"), appSource.indexOf("function resetWorkoutExerciseFilters"));
assert(!templateSelectionSource.includes("setTemplateStorageMessage"), "opening template selection should preserve storage recovery warnings");

const dist = join(root, "dist");
assert(existsSync(dist), "production build output should exist before running this check");
const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");
assert(viteConfig.includes('base: "./"'), "Vite should emit relative URLs for the /Overload/ repository subpath");
const builtHtml = readFileSync(join(dist, "index.html"), "utf8");
for (const expected of ["./assets/", "./favicon-32.png", "./apple-touch-icon.png", "./manifest.webmanifest", "./og.png"]) {
  assert(builtHtml.includes(expected), `production HTML should use subpath-safe URL ${expected}`);
}
const emittedAssets = [...builtHtml.matchAll(/(?:src|href)="\.\/(assets\/[^\"]+\.(?:js|css))"/g)]
  .map((match) => match[1]);
assert(emittedAssets.some((path) => path.endsWith(".js")), "production HTML should reference an emitted JavaScript asset");
assert(emittedAssets.some((path) => path.endsWith(".css")), "production HTML should reference an emitted CSS asset");
emittedAssets.forEach((path) => assert(existsSync(join(dist, path)), `${path} should resolve inside the Pages artifact`));
const builtManifest = JSON.parse(readFileSync(join(dist, "manifest.webmanifest"), "utf8"));
assert(builtManifest.start_url === "./", "installed app start URL should remain relative to /Overload/");
assert(builtManifest.icons.every((icon) => icon.src.startsWith("./icons/")), "manifest icons should resolve relative to /Overload/");
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
assert(bundledText.includes("icons/overload-192.png") && !bundledText.includes("brand/overload-logo.png"), "production UI should select the compact logo asset");

console.log("Overload release verification passed: metadata, package identity, Pages configuration, subpath-safe assets and bundled demo data are present.");
