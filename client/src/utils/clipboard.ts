const ANSI_REGEX = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_REGEX, "");
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export async function readTextFromClipboard(): Promise<string | null> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.readText === "function") {
      const text = await navigator.clipboard.readText();
      return text || null;
    }
  } catch {
    return null;
  }
  return null;
}

export function tryFormatJson(raw: string): string | null {
  const clean = stripAnsi(raw).trim();
  if (!clean) return null;
  try {
    const parsed: unknown = JSON.parse(clean);
    return JSON.stringify(parsed, null, 2);
  } catch {
    const firstBrace = clean.search(/[\[{]/);
    if (firstBrace > 0) {
      try {
        const sub = clean.slice(firstBrace);
        const parsed: unknown = JSON.parse(sub);
        return clean.slice(0, firstBrace).trimEnd() + "\n\n" + JSON.stringify(parsed, null, 2);
      } catch {
        return null;
      }
    }
    return null;
  }
}
