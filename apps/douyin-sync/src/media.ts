import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { promisify } from "node:util";
import { tryit } from "radash";

const execFileAsync = promisify(execFile);

/**
 * whisper-server 官方构建不带 ffmpeg 解码，只接受 WAV。
 * 其余格式（mp4 / m4a / mp3）必须先转 16kHz 单声道 WAV 再送过去。
 */
const WAV_EXTENSIONS = new Set([".wav"]);

const ffmpegBin = (): string => process.env.TACHIKOMA_FFMPEG_BIN ?? "ffmpeg";

/**
 * 把任意音视频字节流转成 16kHz 单声道 WAV 字节流
 *
 * - 已是 WAV：原样返回，不做无谓转码
 * - ffmpeg 不可用：抛错，由调用方降级（不中断抓取主链路）
 *
 * @example
 * const wav = await toWhisperWav(mp4Buffer, "video_123.mp4");
 */
export async function toWhisperWav(
  buffer: Buffer,
  fileName: string
): Promise<Buffer> {
  const ext = (fileName.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  if (WAV_EXTENSIONS.has(ext)) return buffer;

  const workDir = await mkdtemp(join(tmpdir(), "tachikoma-asr-"));
  const inputPath = join(workDir, `input${ext || ".mp4"}`);
  const outputPath = join(workDir, "output.wav");

  const [err, wav] = await tryit(async () => {
    await writeFile(inputPath, buffer);
    await execFileAsync(
      ffmpegBin(),
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        outputPath,
      ],
      { maxBuffer: 16 * 1024 * 1024 }
    );
    return readFile(outputPath);
  })();

  await tryit(rm)(workDir, { recursive: true, force: true });

  if (err || !wav) {
    throw new Error(
      `音频转码失败（需要 ffmpeg，可用 TACHIKOMA_FFMPEG_BIN 指定路径）: ${err?.message ?? "未知错误"}`
    );
  }
  return wav;
}
