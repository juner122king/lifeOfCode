const MIN_EVENT_HISTORY_ROWS = 8;
const MIN_LOG_PANEL_HEIGHT = MIN_EVENT_HISTORY_ROWS + 3;
const MIN_LIST_PAGE_SIZE = 3;
const DEFAULT_TERMINAL_ROWS = 24;
const DEFAULT_TERMINAL_COLUMNS = 80;
const TOP_BAR_HEIGHT = 6;

function getPageWindow(optionsLength, selectedIndex, pageSize) {
  const length = Math.max(0, Math.floor(Number(optionsLength) || 0));
  const size = Math.max(MIN_LIST_PAGE_SIZE, Math.floor(Number(pageSize) || MIN_LIST_PAGE_SIZE));
  if (length === 0) return { start: 0, end: 0, page: 0, pageCount: 0, pageSize: size };
  const safeSelected = Math.max(0, Math.min(length - 1, Math.floor(Number(selectedIndex) || 0)));
  const pageCount = Math.max(1, Math.ceil(length / size));
  const page = Math.min(pageCount - 1, Math.floor(safeSelected / size));
  const start = page * size;
  const end = Math.min(length, start + size);
  return { start, end, page, pageCount, pageSize: size };
}

function calculateLayoutBudget(rows, columns) {
  const terminalRows = Math.max(12, Math.floor(Number(rows) || DEFAULT_TERMINAL_ROWS));
  const terminalColumns = Math.max(40, Math.floor(Number(columns) || DEFAULT_TERMINAL_COLUMNS));
  const compact = terminalRows <= 24;
  const narrow = terminalColumns < 100;
  const topHeight = TOP_BAR_HEIGHT;
  const footerHeight = 3;
  const contentHeight = terminalRows - topHeight - footerHeight;
  const logHeightRatio = compact ? 0.60 : 0.65;
  const logHeight = Math.max(MIN_LOG_PANEL_HEIGHT, Math.floor(contentHeight * logHeightRatio));
  const mainHeight = Math.max(5, contentHeight - logHeight);
  const listHeight = narrow ? Math.max(5, Math.floor(mainHeight / 2)) : mainHeight;
  const detailHeight = narrow ? Math.max(3, mainHeight - listHeight) : mainHeight;
  const pageSize = Math.max(MIN_LIST_PAGE_SIZE, listHeight - 2);

  return {
    terminalRows,
    terminalColumns,
    narrow,
    topHeight,
    footerHeight,
    logHeight,
    mainHeight,
    listHeight,
    detailHeight,
    pageSize
  };
}

module.exports = {
  DEFAULT_TERMINAL_COLUMNS,
  DEFAULT_TERMINAL_ROWS,
  MIN_EVENT_HISTORY_ROWS,
  MIN_LIST_PAGE_SIZE,
  MIN_LOG_PANEL_HEIGHT,
  TOP_BAR_HEIGHT,
  calculateLayoutBudget,
  getPageWindow
};
