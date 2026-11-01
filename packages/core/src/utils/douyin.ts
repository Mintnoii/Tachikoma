export interface DouyinUrlOrId {
  url?: string;
  awemeId?: string;
}

/**
 * 纯函数：从任意输入文本提取抖音作品 URL 或 aweme_id
 */
export function extractDouyinUrlOrId(input: string): DouyinUrlOrId {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    const rawUrl = urlMatch[0];
    const idMatch = rawUrl.match(/(?:video\/|note\/|modal_id=)(\d+)/);
    return {
      url: rawUrl,
      awemeId: idMatch?.[1],
    };
  }

  const digitsMatch = trimmed.match(/\d{15,22}/);
  if (digitsMatch) {
    return { awemeId: digitsMatch[0] };
  }

  const numericOnly = trimmed.replace(/\D/g, "");
  return { awemeId: numericOnly || undefined };
}
