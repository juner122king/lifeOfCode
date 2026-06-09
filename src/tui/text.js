const GRAPHEME_SEGMENTER = typeof Intl !== "undefined" && Intl.Segmenter
  ? new Intl.Segmenter("zh-Hans", { granularity: "grapheme" })
  : null;

function splitGraphemes(value) {
  const text = String(value || "");
  if (!text) return [];
  if (!GRAPHEME_SEGMENTER) return Array.from(text);
  return Array.from(GRAPHEME_SEGMENTER.segment(text), (part) => part.segment);
}

function isZeroWidthCodePoint(codePoint) {
  return codePoint === 0x200d
    || (codePoint >= 0x0300 && codePoint <= 0x036f)
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
    || (codePoint >= 0x1ab0 && codePoint <= 0x1aff)
    || (codePoint >= 0x1dc0 && codePoint <= 0x1dff)
    || (codePoint >= 0x20d0 && codePoint <= 0x20ff);
}

function isWideCodePoint(codePoint) {
  return (codePoint >= 0x1100 && codePoint <= 0x115f)
    || codePoint === 0x2329
    || codePoint === 0x232a
    || (codePoint >= 0x2600 && codePoint <= 0x27bf)
    || (codePoint >= 0x2b00 && codePoint <= 0x2bff)
    || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
    || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0xfe10 && codePoint <= 0xfe19)
    || (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
    || (codePoint >= 0xff00 && codePoint <= 0xff60)
    || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
    || (codePoint >= 0x1f000 && codePoint <= 0x1faff)
    || (codePoint >= 0x20000 && codePoint <= 0x3fffd);
}

function getGraphemeWidth(grapheme) {
  const codePoints = Array.from(grapheme || "", (char) => char.codePointAt(0)).filter((codePoint) => !isZeroWidthCodePoint(codePoint));
  if (!codePoints.length) return 0;
  if (codePoints.some(isWideCodePoint)) return 2;
  return 1;
}

function getTextDisplayWidth(value) {
  return splitGraphemes(value).reduce((width, grapheme) => width + getGraphemeWidth(grapheme), 0);
}

function trimText(value, length) {
  const text = String(value || "");
  const width = Math.max(0, Math.floor(Number(length) || 0));
  if (getTextDisplayWidth(text) <= width) return text;
  if (width <= 0) return "";
  if (width === 1) return "…";
  const targetWidth = width - 1;
  let currentWidth = 0;
  let result = "";
  for (const grapheme of splitGraphemes(text)) {
    const graphemeWidth = getGraphemeWidth(grapheme);
    if (currentWidth + graphemeWidth > targetWidth) break;
    currentWidth += graphemeWidth;
    result += grapheme;
  }
  return `${result}…`;
}

module.exports = {
  getTextDisplayWidth,
  trimText
};
