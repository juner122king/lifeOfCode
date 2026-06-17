# Implementation Plan: TUI Milestone Display Feature

**Spec**: `docs/superpowers/specs/2026-06-17-tui-milestone-display.md`  
**Created**: 2026-06-17  
**Estimated time**: 60-90 minutes

## Overview

Add milestone information display to the TUI character card panel and create a new AttributeGrowthPanel in the top status area. This involves extending attribute data to include milestone information and expanding the visual display from 1 line per attribute to 3 lines.

## Prerequisites

- Game state must have `state.unlockedMilestones` structure populated
- `getAttributeDetails()` function must return milestone data correctly
- Existing TUI components (Box, Text, Progress, etc.) are available

## Implementation Steps

---

### Step 1: Add helper function for milestone progress bar

**File**: `C:\Users\juner\githubProjects\lifeOfCode\src\tui.js`

**Location**: After the `getAttributeUpgradeRequired()` function (around line 1321)

**Action**: Add a new helper function to calculate milestone progress bars.

**Code**:

```javascript
function calculateMilestoneProgressBar(currentLevel, targetLevel, barLength = 10) {
  if (!targetLevel || targetLevel <= 0) return "";
  const progress = Math.min(1, currentLevel / targetLevel);
  const filled = Math.floor(progress * barLength);
  return "[" + "█".repeat(filled) + "░".repeat(barLength - filled) + "]";
}
```

**Why**: This generates the visual progress bar showing how close the player is to the next milestone.

**Verification**: None needed yet (helper function).

---

### Step 2: Extend getCharacterCardAttributeRows() to include milestone data

**File**: `C:\Users\juner\githubProjects\lifeOfCode\src\tui.js`

**Location**: Inside the `getCharacterCardAttributeRows()` function, around line 1322-1365

**Action**: Import `getAttributeDetails` from game.js at the top of the file, then extend the return object to include milestone information.

**Code to add at top of file** (around line 1-20):

```javascript
const {
  createNewState,
  createTuiTicker,
  createProfile,
  defaultProfileExists,
  formatGameEvent,
  getActivityOptions,
  getAttributeDetails,  // ADD THIS LINE
  getCharacterCardOptions,
  getGameViewModel,
  getGoalOptions,
  getManagementOptions,
  getProfileOptions,
  getScheduleOptions,
  loadLastProfile,
  processCommand,
  replaceStateContents,
  saveProfile,
  settleTime,
  writeLastProfileId
} = require("./game");
```

**Code to modify** (inside `getCharacterCardAttributeRows` function, after line 1346):

Find the return statement that looks like:

```javascript
    return {
      id: attr.id,
      name: attr.name,
      label: `${attr.name} ${currentValue}`,
      initialValue,
      currentValue,
```

And extend it to include milestone data. The complete return statement should become:

```javascript
    // Get milestone data from game state
    const details = view.state ? getAttributeDetails(view.state, attr.id) : { unlockedMilestones: [], nextMilestone: null };
    
    return {
      id: attr.id,
      name: attr.name,
      label: `${attr.name} ${currentValue}`,
      initialValue,
      currentValue,
      effectiveValue,
      exp,
      growthValue,
      growthText: `+${formatTuiNumber(growthValue)}`,
      initialPercent,
      totalPercent,
      growthPercent,
      upgradeRequired,
      upgradePercent,
      expText: `${exp}/${upgradeRequired}`,
      isActive: activeAttributeExpIds.has(attr.id),
      // Milestone data
      unlockedMilestones: details.unlockedMilestones.map(m => ({
        level: m.level,
        name: m.name
      })),
      nextMilestone: details.nextMilestone ? {
        level: details.nextMilestone.level,
        name: details.nextMilestone.name,
        pointsNeeded: details.nextMilestone.pointsNeeded,
        progressBar: calculateMilestoneProgressBar(currentValue, details.nextMilestone.level, 10),
        progressPercent: Math.floor((currentValue / details.nextMilestone.level) * 100)
      } : null
    };
```

**Why**: This adds the milestone data to each attribute row so it can be displayed in the UI.

**Note**: We need to pass `view.state` to this function, which we'll handle in Step 3.

**Verification**: Run the game and check that no errors occur. The data won't be visible yet.

---

### Step 3: Pass state to getCharacterCardAttributeRows()

**File**: `C:\Users\juner\githubProjects\lifeOfCode\src\tui.js`

**Location**: All call sites of `getCharacterCardAttributeRows()`

**Action**: Modify the function signature to accept state and update all call sites.

**Modify function signature** (line ~1322):

```javascript
function getCharacterCardAttributeRows(view, state) {
```

**Modify the function to use the state parameter** (remove the line added in Step 2 that gets details, replace with):

```javascript
    // Get milestone data from game state
    const details = state ? getAttributeDetails(state, attr.id) : { unlockedMilestones: [], nextMilestone: null };
```

**Find and update call sites**:

1. In `CharacterCardPanel` (around line 1787):
   ```javascript
   const attributeRows = getCharacterCardAttributeRows(view, view.state);
   ```

2. Any other call sites (search for `getCharacterCardAttributeRows` to find them all and add `, view.state` as second parameter)

**Why**: The state object is needed to call `getAttributeDetails()`.

**Verification**: Run `npm start` and verify no errors. The TUI should load normally.

---

### Step 4: Remove radar chart from CharacterCardPanel

**File**: `C:\Users\juner\githubProjects\lifeOfCode\src\tui.js`

**Location**: Inside `CharacterCardPanel` function (around line 1785-1870)

**Action**: Remove the radar chart rendering logic.

**Lines to remove**:

1. Line that calls `getCharacterCardRadarRows`:
   ```javascript
   const radarRows = getCharacterCardRadarRows(attributeRows);
   ```

2. Line that uses `radarRows.length` in calculations (around line 1799):
   ```javascript
   const maxAttributeRows = Math.max(1, budget.mainHeight - (budget.narrow ? 8 : 4) - radarRows.length);
   ```
   
   Replace with:
   ```javascript
   const maxAttributeRows = Math.max(1, budget.mainHeight - (budget.narrow ? 8 : 4));
   ```

3. The entire radar chart rendering section. Look for code that renders `radarRows` and remove that entire section.

**Why**: The spec requires removing the radar chart to make room for the expanded attribute display.

**Verification**: Run `npm start` and verify the radar chart is gone from the character card panel (press C to view).

---

### Step 5: Expand attribute display to 3 lines in CharacterCardPanel

**File**: `C:\Users\juner\githubProjects\lifeOfCode\src\tui.js`

**Location**: Inside `CharacterCardPanel` function, in the attributes rendering section

**Action**: Find where attributes are rendered and expand each from 1 line to 3 lines.

**Find the section** that renders attributes (look for code that maps over `attributeRows`). It will look something like:

```javascript
...attributeRows.slice(0, maxAttributeRows).map((row) => 
  h(Box, { key: row.id, gap: 1 },
    // ... current attribute rendering
  )
)
```

**Replace with**:

```javascript
...attributeRows.slice(0, maxAttributeRows).flatMap((row) => {
  const lines = [];
  
  // Line 1: Experience progress (keep original format)
  lines.push(
    h(Box, { key: `${row.id}-exp`, gap: 1 },
      h(Text, { color: THEME.text, bold: true }, trimText(row.label, 7)),
      h(Text, { color: THEME.muted }, "经验"),
      h(Progress, { percent: row.upgradePercent, width: expBarWidth }),
      h(Text, { color: THEME.muted }, row.expText)
    )
  );
  
  // Line 2: Unlocked milestones
  const unlockedText = row.unlockedMilestones.length > 0
    ? row.unlockedMilestones.map(m => `✓ Lv.${m.level} ${m.name}`).join("  ")
    : "暂无";
  lines.push(
    h(Box, { key: `${row.id}-unlocked`, gap: 1, paddingLeft: 2 },
      h(Text, { color: THEME.muted }, "已获得："),
      h(Text, { color: THEME.status.good }, trimText(unlockedText, detailWidth - 12))
    )
  );
  
  // Line 3: Next milestone progress
  if (row.nextMilestone) {
    lines.push(
      h(Box, { key: `${row.id}-next`, gap: 1, paddingLeft: 2 },
        h(Text, { color: THEME.muted }, "下一个："),
        h(Text, { color: THEME.text }, row.nextMilestone.progressBar),
        h(Text, { color: THEME.status.info }, 
          trimText(`→ Lv.${row.nextMilestone.level} ${row.nextMilestone.name} (还需${row.nextMilestone.pointsNeeded}点)`, detailWidth - 24)
        )
      )
    );
  } else {
    lines.push(
      h(Box, { key: `${row.id}-next`, gap: 1, paddingLeft: 2 },
        h(Text, { color: THEME.muted }, "下一个："),
        h(Text, { color: THEME.muted }, "已达到最高里程碑")
      )
    );
  }
  
  return lines;
})
```

**Why**: This implements the 3-line display per attribute as specified in the design.

**Verification**: 
```bash
npm start
```
Press `C` to view character card. Each attribute should now show 3 lines: experience, unlocked milestones, and next milestone progress.

---

### Step 6: Create AttributeGrowthPanel component

**File**: `C:\Users\juner\githubProjects\lifeOfCode\src\tui.js`

**Location**: After the `InfoPanel` function (around line 1920)

**Action**: Add a new component that displays attribute growth summary.

**Code**:

```javascript
  function AttributeGrowthPanel({ view, budget }) {
    const attributeRows = getCharacterCardAttributeRows(view, view.state);
    const height = Math.min(8, attributeRows.length + 2);
    const width = Math.max(40, Math.floor(budget.terminalColumns * 0.4));
    const contentWidth = width - 4;
    
    // Calculate bar widths based on available space
    const attrLabelWidth = 7;
    const attrBarWidth = 10;
    const growthTextWidth = 5;
    const expLabelWidth = 4;
    const expBarWidth = 10;
    const expTextWidth = 10;
    
    return h(Box, {
      borderStyle: "single",
      borderColor: THEME.status.good,
      paddingX: 1,
      flexDirection: "column",
      height,
      width
    },
      h(SectionTitle, { color: THEME.status.good }, "属性成长"),
      ...attributeRows.map((row) => 
        h(Box, { key: row.id, gap: 1 },
          h(Text, { color: THEME.text, bold: true }, trimText(row.label, attrLabelWidth)),
          h(AttributeProgress, { row, width: attrBarWidth }),
          h(Text, { color: THEME.status.good }, row.growthText),
          h(Text, { color: THEME.muted }, "经验"),
          h(Progress, { percent: row.upgradePercent, width: expBarWidth }),
          h(Text, { color: THEME.muted }, trimText(row.expText, expTextWidth))
        )
      )
    );
  }
```

**Why**: This creates the new top panel that shows attribute growth summary.

**Verification**: Component is created but not yet integrated into layout.

---

### Step 7: Integrate AttributeGrowthPanel into top layout

**File**: `C:\Users\juner\githubProjects\lifeOfCode\src\tui.js`

**Location**: In the main App component, where InfoPanel is rendered

**Action**: Add AttributeGrowthPanel next to InfoPanel in the top area.

**Find** the section in the App component that renders InfoPanel (around line 2333):

```javascript
    return h(Box, { flexDirection: "column", paddingX: 1 },
      h(TopBar, { view, paused, budget }),
      h(MemoInfoPanel, { ticker, logs, view, budget }),
      h(TabBar, { activePanel }),
```

**Replace the InfoPanel line with**:

```javascript
    return h(Box, { flexDirection: "column", paddingX: 1 },
      h(TopBar, { view, paused, budget }),
      budget.terminalColumns > 100 
        ? h(Box, { flexDirection: "row", gap: 1 },
            h(MemoInfoPanel, { ticker, logs, view, budget }),
            h(AttributeGrowthPanel, { view, budget })
          )
        : h(MemoInfoPanel, { ticker, logs, view, budget }),
      h(TabBar, { activePanel }),
```

**Why**: This places the AttributeGrowthPanel next to InfoPanel on wide screens (>100 columns), and hides it on narrow screens.

**Verification**: 
```bash
npm start
```
Check that:
1. On wide terminal (>100 columns), both InfoPanel and AttributeGrowthPanel appear side-by-side
2. On narrow terminal (<=100 columns), only InfoPanel appears
3. The layout is clean and aligned

---

### Step 8: Adjust InfoPanel width for side-by-side layout

**File**: `C:\Users\juner\githubProjects\lifeOfCode\src\tui.js`

**Location**: Inside `InfoPanel` function (around line 1876-1880)

**Action**: Adjust the InfoPanel width calculation to make room for AttributeGrowthPanel.

**Find**:
```javascript
  function InfoPanel({ ticker, logs, view, budget }) {
    const tickerData = ticker && ticker.ticker ? ticker.ticker : ticker;
    const height = budget.infoWindowHeight || budget.logHeight;
    const width = budget.infoWindowWidth || Math.max(24, budget.terminalColumns - 2);
```

**Replace with**:
```javascript
  function InfoPanel({ ticker, logs, view, budget }) {
    const tickerData = ticker && ticker.ticker ? ticker.ticker : ticker;
    const height = budget.infoWindowHeight || budget.logHeight;
    const baseWidth = budget.infoWindowWidth || Math.max(24, budget.terminalColumns - 2);
    // If wide screen, leave room for AttributeGrowthPanel
    const width = budget.terminalColumns > 100 
      ? Math.min(baseWidth, Math.floor(budget.terminalColumns * 0.5))
      : baseWidth;
```

**Why**: This ensures InfoPanel doesn't take the full width when AttributeGrowthPanel is shown, allowing them to fit side-by-side.

**Verification**: 
```bash
npm start
```
Check that both panels fit properly side-by-side on wide terminals.

---

### Step 9: Final testing and adjustments

**Action**: Manual testing of all scenarios.

**Test cases**:

1. **Wide terminal (>100 columns)**:
   - Run `npm start`
   - Verify InfoPanel and AttributeGrowthPanel appear side-by-side
   - Verify all 6 attributes are visible in AttributeGrowthPanel
   - Press `C` to view character card
   - Verify each attribute shows 3 lines (exp, unlocked, next)
   - Verify no radar chart is present

2. **Narrow terminal (<=100 columns)**:
   - Resize terminal to <100 columns width
   - Run `npm start`
   - Verify only InfoPanel appears (no AttributeGrowthPanel)
   - Press `C` to view character card
   - Verify 3-line attribute display still works

3. **Milestone display accuracy**:
   - Check that unlocked milestones show correct ✓ marks and levels
   - Check that next milestone progress bar fills correctly
   - Check that "还需X点" calculation is accurate

4. **Edge cases**:
   - Attributes with no unlocked milestones should show "暂无"
   - Attributes at max milestone should show "已达到最高里程碑"
   - Very long milestone names should be trimmed gracefully

**Expected output**:
- No console errors
- Clean layout with proper alignment
- All milestone data displays correctly
- Responsive behavior works as specified

**If issues found**: Return to the relevant step and adjust widths, padding, or text trimming.

---

## Completion Checklist

- [ ] Step 1: Helper function added
- [ ] Step 2: getCharacterCardAttributeRows extended
- [ ] Step 3: State parameter passed correctly
- [ ] Step 4: Radar chart removed
- [ ] Step 5: 3-line attribute display working
- [ ] Step 6: AttributeGrowthPanel component created
- [ ] Step 7: Panel integrated into layout
- [ ] Step 8: InfoPanel width adjusted
- [ ] Step 9: All tests passed

## Notes

- This is a UI-only change with no game logic modifications
- Manual testing is appropriate since this is visual feature
- The implementation reuses existing components (Box, Text, Progress) for consistency
- Responsive behavior ensures the feature works across terminal sizes
- All text trimming uses the existing `trimText()` utility for consistency

## Estimated Time per Step

1. Helper function: 2 min
2. Extend data function: 5 min
3. Pass state parameter: 3 min
4. Remove radar chart: 5 min
5. 3-line display: 15 min
6. Create panel component: 10 min
7. Integrate layout: 5 min
8. Adjust widths: 5 min
9. Testing: 10 min

**Total: ~60 minutes**
