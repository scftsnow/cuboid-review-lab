import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_OUTPUT = "artifacts/deployment-qr.png";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function readDeploymentUrl(args) {
  let url = "";
  let out = "";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--url" || arg === "--deployment-url") {
      url = args[++index] ?? "";
    } else if (
      arg.startsWith("--url=") ||
      arg.startsWith("--deployment-url=")
    ) {
      url = arg.slice(arg.indexOf("=") + 1);
    } else if (arg === "--out" || arg === "--output") {
      out = args[++index] ?? "";
    } else if (arg.startsWith("--out=") || arg.startsWith("--output=")) {
      out = arg.slice(arg.indexOf("=") + 1);
    } else if (!url) {
      url = arg;
    } else if (!out) {
      out = arg;
    }
  }

  url = (
    url ||
    process.env.DEPLOYMENT_URL ||
    process.env.PAGES_URL ||
    ""
  ).trim();
  if (!url) fail("DEPLOY_URL_MISSING");

  try {
    if (new URL(url).protocol !== "https:") fail("DEPLOY_URL_NOT_HTTPS");
  } catch (error) {
    if (error?.code === "DEPLOY_URL_NOT_HTTPS") throw error;
    fail("DEPLOY_URL_NOT_HTTPS");
  }

  return { url, out: out || DEFAULT_OUTPUT };
}

async function main() {
  const { url, out } = readDeploymentUrl(process.argv.slice(2));
  const outputPath = path.resolve(REPO_ROOT, out);
  await mkdir(path.dirname(outputPath), { recursive: true });

  try {
    await QRCode.toFile(outputPath, url, {
      errorCorrectionLevel: "M",
      margin: 4,
      width: 264,
      color: { dark: "#000000ff", light: "#ffffffff" },
    });
  } catch {
    fail("QR_WRITE_FAILED");
  }

  const relative = path
    .relative(REPO_ROOT, outputPath)
    .split(path.sep)
    .join("/");
  process.stdout.write(
    `${JSON.stringify({ deployment_url: url, qr_png: relative, url_text: url })}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ error: error.code || "QR_WRITE_FAILED", message: error.message })}\n`,
  );
  process.exitCode = 1;
});
