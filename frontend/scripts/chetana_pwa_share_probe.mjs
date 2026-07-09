import { readFile } from "node:fs/promises";

const manifestPath = new URL("../public/manifest.json", import.meta.url);
const serviceWorkerPath = new URL("../public/sw.js", import.meta.url);
const builtManifestPath = new URL("../dist/manifest.json", import.meta.url);
const builtServiceWorkerPath = new URL("../dist/sw.js", import.meta.url);

const failures = [];
const checked = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(text, needles, label) {
  for (const needle of needles) {
    expect(text.includes(needle), `${label} missing ${needle}`);
  }
}

async function readMaybe(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function checkManifest(text, label, path) {
  const manifest = JSON.parse(text);
  const shareTarget = manifest.share_target || {};
  const shareFiles = shareTarget.params?.files || [];
  const acceptedTypes = shareFiles.flatMap((file) => file.accept || []);

  expect(shareTarget.action === "/share-target", `${label} share_target action must be /share-target`);
  expect(shareTarget.method === "POST", `${label} share_target method must be POST`);
  expect(shareTarget.enctype === "multipart/form-data", `${label} share_target enctype must be multipart/form-data`);
  expect(shareTarget.params?.title === "title", `${label} title field must be title`);
  expect(shareTarget.params?.text === "text", `${label} text field must be text`);
  expect(shareTarget.params?.url === "url", `${label} url field must be url`);
  expect(shareFiles.some((file) => file.name === "media"), `${label} must post screenshot files as media`);
  expect(acceptedTypes.includes("image/*"), `${label} must accept screenshot images`);
  expect(!acceptedTypes.includes("audio/*"), `${label} must not advertise unsupported audio share intake`);
  expect(!acceptedTypes.includes("video/*"), `${label} must not advertise unsupported video share intake`);
  expect(!acceptedTypes.includes("application/pdf"), `${label} must not advertise unsupported PDF share intake`);

  checked.push({
    kind: "manifest",
    label,
    path: path.pathname,
    share_action: shareTarget.action,
    accept: acceptedTypes,
  });
}

function checkServiceWorker(serviceWorker, label, path) {
  includesAll(serviceWorker, [
    "SHARE_CACHE_NAME",
    "chetana-share",
    "/share-target",
    "url.searchParams.has(\"share\")",
    "collectSharedFiles",
    "unsupportedFileTypes",
    "shared-payload",
    "shared-file-",
    "source=share-target",
  ], `${label} service worker`);

  expect(!serviceWorker.includes("shared_text="), `${label} service worker must not duplicate shared text into redirect URL`);
  expect(serviceWorker.includes("startsWith(\"image/\")"), `${label} service worker must filter shared files to images`);

  checked.push({
    kind: "service_worker",
    label,
    path: path.pathname,
  });
}

checkManifest(await readFile(manifestPath, "utf8"), "public manifest", manifestPath);
checkServiceWorker(await readFile(serviceWorkerPath, "utf8"), "public", serviceWorkerPath);

const builtManifest = await readMaybe(builtManifestPath);
const builtServiceWorker = await readMaybe(builtServiceWorkerPath);
if (builtManifest && builtServiceWorker) {
  checkManifest(builtManifest, "built manifest", builtManifestPath);
  checkServiceWorker(builtServiceWorker, "built", builtServiceWorkerPath);
}

if (failures.length > 0) {
  console.error(JSON.stringify({
    status: "fail",
    checked,
    failures,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: "pass",
  checked,
}, null, 2));
