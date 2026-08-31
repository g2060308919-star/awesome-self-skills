import { createRequire } from "node:module";
import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { sha256File, sha256Text } from "../bundle/digests.mjs";
import { SandboxError } from "../shared/errors.mjs";

const require = createRequire(import.meta.url);
const { createWorker, OEM, PSM } = require("tesseract.js");

export async function resolveInstalledOcrPaths(packageRoot) {
  const moduleRoot = join(packageRoot, "node_modules");
  return {
    workerPath: join(moduleRoot, "tesseract.js", "src", "worker-script", "node", "index.js"),
    corePath: join(moduleRoot, "tesseract.js-core"),
    langPath: join(moduleRoot, "@tesseract.js-data", "eng", "4.0.0_best_int"),
    languageDataPath: join(moduleRoot, "@tesseract.js-data", "eng", "4.0.0_best_int", "eng.traineddata.gz"),
    enginePackagePath: join(moduleRoot, "tesseract.js", "package.json"),
    languagePackagePath: join(moduleRoot, "@tesseract.js-data", "eng", "package.json")
  };
}

async function validateLocalPath(path, kind) {
  if (typeof path !== "string" || !isAbsolute(path) || /^https?:/i.test(path)) {
    throw new SandboxError("OCR_PATH_UNSAFE", "OCR dependencies must use absolute local paths");
  }
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new SandboxError("OCR_PATH_UNSAFE", "OCR dependency path is missing");
  }
  if (metadata.isSymbolicLink() || (kind === "file" ? !metadata.isFile() : !metadata.isDirectory())) {
    throw new SandboxError("OCR_PATH_UNSAFE", "OCR dependency path is not a real local component");
  }
  return realpath(path);
}

export async function createOfflineOcr(paths) {
  const workerPath = await validateLocalPath(paths.workerPath, "file");
  const corePath = await validateLocalPath(paths.corePath, "directory");
  const langPath = await validateLocalPath(paths.langPath, "directory");
  const languageDataPath = await validateLocalPath(paths.languageDataPath, "file");
  const enginePackagePath = paths.enginePackagePath
    ? await validateLocalPath(paths.enginePackagePath, "file")
    : join(corePath, "..", "tesseract.js", "package.json");
  const languagePackagePath = paths.languagePackagePath
    ? await validateLocalPath(paths.languagePackagePath, "file")
    : join(langPath, "..", "..", "package.json");
  const enginePackage = JSON.parse(await readFile(enginePackagePath, "utf8"));
  const languagePackage = JSON.parse(await readFile(languagePackagePath, "utf8"));
  if (enginePackage.version !== "7.0.0" || languagePackage.version !== "1.0.0") {
    throw new SandboxError("OCR_VERSION_MISMATCH", "Installed OCR dependencies do not match the pinned versions");
  }
  const coreFiles = [
    "tesseract-core.wasm.js", "tesseract-core-simd.wasm.js",
    "tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"
  ];
  const coreDigests = [];
  for (const file of coreFiles) {
    coreDigests.push(await sha256File(await validateLocalPath(join(corePath, file), "file")));
  }
  const metadata = Object.freeze({
    engine: "tesseract.js@7.0.0",
    languageModel: "@tesseract.js-data/eng@1.0.0:4.0.0_best_int",
    workerSha256: await sha256File(workerPath),
    coreSetSha256: sha256Text(coreDigests.join("\n")),
    languageDataSha256: await sha256File(languageDataPath),
    offline: true
  });
  let worker;
  try {
    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      workerPath,
      corePath,
      langPath,
      cacheMethod: "none",
      gzip: true,
      logger: () => {}
    });
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      preserve_interword_spaces: "1"
    });
  } catch (error) {
    await worker?.terminate();
    throw new SandboxError("OCR_INITIALIZATION_FAILED", "Offline OCR initialization failed", {
      cause: String(error?.message ?? error)
    });
  }
  return Object.freeze({
    metadata,
    async recognize(imagePath) {
      const path = await validateLocalPath(imagePath, "file");
      try {
        const result = await worker.recognize(path);
        return { text: result.data.text, metadata };
      } catch (error) {
        throw new SandboxError("OCR_RECOGNITION_FAILED", "Offline OCR could not scan image", {
          cause: String(error?.message ?? error)
        });
      }
    },
    terminate() {
      return worker.terminate();
    }
  });
}
