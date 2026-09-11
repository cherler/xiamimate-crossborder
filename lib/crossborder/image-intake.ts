/**
 * 截图入库 —— 「上传截图 / 粘贴截图」这一步的统一入口。
 *
 * 三个入口(工具页抽屉、omnibox 智能路由、Listing 医生)此前各自写了一遍
 * `FileReader.readAsDataURL`,都只判了 `type.startsWith("image/")`。两个后果:
 *
 * 1. **格式**:`image/*` 让文件对话框放行 HEIC / AVIF / TIFF / SVG,而视觉模型只认
 *    png / jpeg / webp / gif。iPhone 拍的报价单是 HEIC —— 预览是一个裂图,点「识别」
 *    换回一句上游的英文报错。用户看不出问题出在格式上。
 * 2. **体积**:客户端一个字节都不拦,服务端在 base64 长度 8,000,000 处才 400,
 *    提示「请压缩到 6MB 以内」—— 而 Retina 全屏截图动辄 8~15MB,用户手上没有压缩工具。
 *    等于把一个我们能自己解决的问题甩回给用户,还得先把 15MB 传完才知道白传了。
 *
 * 所以这里统一做三件事:能直接用的直接用;超限或格式不对的先在浏览器里转成 JPEG
 * (Safari 连 HEIC 都能解,顺手就转了);实在解不开的,报错要说清是格式还是体积。
 */

/** 视觉模型接受的 media_type。超出这四种一律先转码。 */
export const VISION_MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

/**
 * 客户端体积上限,与服务端对齐。
 * 服务端拦的是 base64 长度 8,000,000,base64 约等于原始字节 × 4/3 —— 反推即 6,000,000 字节。
 */
export const IMAGE_MAX_BYTES = 6_000_000;

/**
 * 服务端判据:base64 字符串长度上限。三个 AI 路由(import / route / facts)此前
 * 各自硬写了一遍 8_000_000,而客户端的 IMAGE_MAX_BYTES 又是另一个数 ——
 * 同一条限制四处定义,改一处就会与其余三处对不上。
 */
export const IMAGE_MAX_BASE64 = 8_000_000;

/** 转码后的长边上限。截图里的小字要留得住,不能压太狠。 */
const MAX_EDGE = 2_000;

export type IntakeImage = { preview: string; data: string; mediaType: string };

export type IntakePlan =
  | { action: "as-is" }
  | { action: "recompress"; why: "format" | "size" | "both" };

/**
 * 纯决策:这个文件能不能直接送去识别。不碰 DOM,可单测。
 * 调用方保证已经确认过是图片(`type.startsWith("image/")`)。
 */
export function planImageIntake(mediaType: string, bytes: number): IntakePlan {
  const badFormat = !(VISION_MEDIA_TYPES as readonly string[]).includes(mediaType);
  const tooBig = bytes > IMAGE_MAX_BYTES;
  if (!badFormat && !tooBig) return { action: "as-is" };
  return { action: "recompress", why: badFormat && tooBig ? "both" : badFormat ? "format" : "size" };
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // onerror 一直没人接:文件被移动/权限变化时 readAsDataURL 会失败,
    // 而 onload 永远不来 —— 界面就一直停在「没有截图」的样子,没有任何提示。
    reader.onerror = () => reject(new Error("读不到这个文件，请重新选择一次。"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function splitDataUrl(url: string, fallbackType: string): IntakeImage {
  const comma = url.indexOf(",");
  const mediaType = url.match(/^data:([^;,]+)/)?.[1] || fallbackType;
  return { preview: url, data: comma >= 0 ? url.slice(comma + 1) : "", mediaType };
}

function decode(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode-failed")); };
    img.src = url;
  });
}

/** 转成 JPEG 并压到上限以内。压不动(浏览器解不开这个格式)就抛。 */
async function recompress(file: File): Promise<IntakeImage> {
  const img = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("decode-failed");
  // 截图多半带透明通道,直接画到透明画布上转 JPEG 会出黑底,白字全糊。
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // 质量逐档下探,直到进上限。0.6 是文字仍可辨认的下限。
  for (const q of [0.9, 0.8, 0.7, 0.6]) {
    const url = canvas.toDataURL("image/jpeg", q);
    const out = splitDataUrl(url, "image/jpeg");
    // base64 长度即服务端的判据,直接按它算,不用再猜字节数
    if (out.data.length <= IMAGE_MAX_BASE64) return out;
  }
  throw new Error("too-large");
}

/**
 * 把用户选中/粘贴的文件变成可以送去识别的截图。
 * 失败时抛出**给用户看的中文**错误,调用方直接 setError 即可。
 */
export async function prepareImageForVision(file: File): Promise<IntakeImage> {
  const plan = planImageIntake(file.type, file.size);
  if (plan.action === "as-is") return splitDataUrl(await readAsDataUrl(file), file.type);

  try {
    return await recompress(file);
  } catch (e) {
    const kind = e instanceof Error ? e.message : "";
    if (kind === "too-large") {
      throw new Error("这张图太大了，压缩后仍超过上限。请截取需要识别的那一部分再上传。");
    }
    const ext = file.name.split(".").pop()?.toUpperCase() || file.type || "该格式";
    throw new Error(
      plan.why === "size"
        ? "这张图太大了，浏览器没能压缩它。请截取需要识别的那一部分再上传。"
        : `这个浏览器打不开 ${ext} 图片（iPhone 拍的照片多为 HEIC）。请把它导出/截图成 PNG 或 JPG 再上传。`,
    );
  }
}
