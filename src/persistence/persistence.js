const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_PROFILE_ID,
  DEFAULT_PROFILE_NAME,
  SAVE_PATH
} = require("../core/constants");

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeProfileId(id) {
  if (typeof id !== "string") return "";
  const trimmed = id.trim();
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : "";
}

function normalizeProfileName(name, fallbackId = DEFAULT_PROFILE_ID) {
  if (typeof name === "string" && name.trim()) return name.trim().slice(0, 40);
  const id = normalizeProfileId(fallbackId) || DEFAULT_PROFILE_ID;
  return id === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : id;
}

function normalizeTimestamp(value, fallback) {
  if (typeof value !== "string") return fallback;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

function getSaveRoot(saveRoot) {
  return saveRoot || path.dirname(SAVE_PATH);
}

// ============================================================================
// Path Resolution
// ============================================================================

function resolveProfilePath(profileId = DEFAULT_PROFILE_ID, saveRoot) {
  const id = normalizeProfileId(profileId);
  if (!id) throw new Error(`非法档案 ID：${profileId}`);
  if (id === DEFAULT_PROFILE_ID) return path.join(getSaveRoot(saveRoot), path.basename(SAVE_PATH));
  return path.join(getSaveRoot(saveRoot), "profiles", `${id}.json`);
}

function resolveLastProfilePath(saveRoot) {
  return path.join(getSaveRoot(saveRoot), "last-profile.json");
}

// ============================================================================
// Last Profile ID Management
// ============================================================================

function readLastProfileId(options = {}) {
  const metadataPath = resolveLastProfilePath(options.saveRoot);
  if (!fs.existsSync(metadataPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    return normalizeProfileId(raw && raw.profileId) || null;
  } catch {
    return null;
  }
}

function writeLastProfileId(profileIdOrState, options = {}) {
  const rawId = typeof profileIdOrState === "object" && profileIdOrState !== null
    ? profileIdOrState.profileId
    : profileIdOrState;
  const id = normalizeProfileId(rawId);
  if (!id) throw new Error(`非法档案 ID：${rawId}`);
  const metadataPath = resolveLastProfilePath(options.saveRoot);
  fs.mkdirSync(path.dirname(metadataPath), { recursive: true });
  fs.writeFileSync(metadataPath, JSON.stringify({
    profileId: id,
    updatedAt: new Date(options.now ?? Date.now()).toISOString()
  }, null, 2));
  return id;
}

// ============================================================================
// Profile Metadata
// ============================================================================

function applyProfileMetadata(state, profileId, profileName, now = Date.now()) {
  const id = normalizeProfileId(profileId) || DEFAULT_PROFILE_ID;
  const timestamp = new Date(now).toISOString();
  state.profileId = id;
  state.profileName = normalizeProfileName(profileName, id);
  state.createdAt = normalizeTimestamp(state.createdAt, timestamp);
  state.updatedAt = normalizeTimestamp(state.updatedAt, timestamp);
  return state;
}

// ============================================================================
// Core Save/Load
// ============================================================================

function saveGame(state, savePath = SAVE_PATH) {
  fs.mkdirSync(path.dirname(savePath), { recursive: true });
  fs.writeFileSync(savePath, JSON.stringify(state, null, 2));
}

function loadGame(savePath = SAVE_PATH, now = Date.now()) {
  if (!fs.existsSync(savePath)) return null;
  const raw = JSON.parse(fs.readFileSync(savePath, "utf8"));
  return raw;
}

// ============================================================================
// Profile Operations
// ============================================================================

function saveProfile(state, options = {}) {
  const now = options.now ?? Date.now();
  const id = normalizeProfileId(state.profileId) || DEFAULT_PROFILE_ID;
  state.profileId = id;
  state.profileName = normalizeProfileName(state.profileName, id);
  state.updatedAt = new Date(now).toISOString();
  saveGame(state, resolveProfilePath(id, options.saveRoot));
  return state;
}

function readProfileState(profileId, now, saveRoot, createNewStateFn, normalizeStateFn) {
  const id = normalizeProfileId(profileId);
  if (!id) throw new Error(`非法档案 ID：${profileId}`);
  const savePath = resolveProfilePath(id, saveRoot);
  if (!fs.existsSync(savePath)) {
    if (id !== DEFAULT_PROFILE_ID) throw new Error(`没有这个档案：${id}`);
    return applyProfileMetadata(createNewStateFn(now), DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME, now);
  }
  const raw = JSON.parse(fs.readFileSync(savePath, "utf8"));
  return applyProfileMetadata(normalizeStateFn(raw, now), id, raw.profileName, now);
}

function loadProfile(profileId = DEFAULT_PROFILE_ID, now = Date.now(), options = {}) {
  if (!options.createNewState || !options.normalizeState) {
    throw new Error("loadProfile requires createNewState and normalizeState in options");
  }
  return readProfileState(profileId, now, options.saveRoot, options.createNewState, options.normalizeState);
}

function loadLastProfile(now = Date.now(), options = {}) {
  const id = readLastProfileId(options) || DEFAULT_PROFILE_ID;
  try {
    return loadProfile(id, now, options);
  } catch {
    return loadProfile(DEFAULT_PROFILE_ID, now, options);
  }
}

function createProfile(profileId, profileName, now = Date.now(), options = {}) {
  const id = normalizeProfileId(profileId);
  if (!id) throw new Error(`非法档案 ID：${profileId}`);
  if (!options.characterCardId) throw new Error("新建档案必须选择人物卡：profile new <id> --card <cardId> [name]");
  const savePath = resolveProfilePath(id, options.saveRoot);
  if (fs.existsSync(savePath)) throw new Error(`档案已存在：${id}`);
  if (!options.createNewState) {
    throw new Error("createProfile requires createNewState in options");
  }

  const state = applyProfileMetadata(
    options.createNewState(now, { characterCardId: options.characterCardId }),
    id,
    profileName || id,
    now
  );
  saveProfile(state, { saveRoot: options.saveRoot, now });
  return state;
}

function deleteProfile(profileId, options = {}) {
  const id = normalizeProfileId(profileId);
  if (!id) throw new Error(`非法档案 ID：${profileId}`);
  if (id === DEFAULT_PROFILE_ID) throw new Error("default 档案不能删除。");
  if (id === normalizeProfileId(options.currentProfileId)) throw new Error("不能删除当前正在使用的档案。");
  if (!options.confirm) throw new Error(`删除档案 ${id} 需要确认：profile delete ${id} confirm`);
  const savePath = resolveProfilePath(id, options.saveRoot);
  if (!fs.existsSync(savePath)) throw new Error(`没有这个档案：${id}`);
  fs.unlinkSync(savePath);
}

function defaultProfileExists(saveRoot) {
  return fs.existsSync(resolveProfilePath(DEFAULT_PROFILE_ID, saveRoot));
}

// ============================================================================
// Profile Listing
// ============================================================================

function profileSummaryFromFile(profileId, savePath, currentProfileId, normalizeStateFn, now, getCharacterCardNameFn) {
  const id = normalizeProfileId(profileId);
  if (!fs.existsSync(savePath)) {
    return {
      id,
      name: id === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : id,
      characterCardId: null,
      characterCardName: getCharacterCardNameFn ? getCharacterCardNameFn(null) : "未选择人物卡/旧档案",
      current: id === currentProfileId,
      exists: false,
      createdAt: null,
      updatedAt: null,
      command: `profile load ${id}`
    };
  }
  const raw = JSON.parse(fs.readFileSync(savePath, "utf8"));
  const state = normalizeStateFn ? applyProfileMetadata(normalizeStateFn(raw, now), id, raw.profileName, now) : raw;
  return {
    id,
    name: normalizeProfileName(raw.profileName, id),
    characterCardId: state.characterCardId || null,
    characterCardName: getCharacterCardNameFn ? getCharacterCardNameFn(state.characterCardId) : "未选择人物卡/旧档案",
    current: id === currentProfileId,
    exists: true,
    createdAt: normalizeTimestamp(state.createdAt, null),
    updatedAt: normalizeTimestamp(state.updatedAt, null),
    command: id === currentProfileId ? null : `profile load ${id}`
  };
}

function listProfiles(options = {}) {
  const saveRoot = getSaveRoot(options.saveRoot);
  const currentProfileId = normalizeProfileId(options.currentProfileId) || DEFAULT_PROFILE_ID;
  const profiles = [profileSummaryFromFile(
    DEFAULT_PROFILE_ID,
    resolveProfilePath(DEFAULT_PROFILE_ID, saveRoot),
    currentProfileId,
    options.normalizeState,
    options.now,
    options.getCharacterCardName
  )];
  const profilesDir = path.join(saveRoot, "profiles");
  if (fs.existsSync(profilesDir)) {
    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = normalizeProfileId(path.basename(entry.name, ".json"));
      if (!id || id === DEFAULT_PROFILE_ID) continue;
      profiles.push(profileSummaryFromFile(
        id,
        path.join(profilesDir, entry.name),
        currentProfileId,
        options.normalizeState,
        options.now,
        options.getCharacterCardName
      ));
    }
  }
  return profiles.sort((a, b) => {
    if (a.id === DEFAULT_PROFILE_ID) return -1;
    if (b.id === DEFAULT_PROFILE_ID) return 1;
    return a.id.localeCompare(b.id);
  });
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Path resolution
  resolveProfilePath,
  resolveLastProfilePath,

  // Last profile ID
  readLastProfileId,
  writeLastProfileId,

  // Profile metadata
  applyProfileMetadata,
  normalizeProfileId,
  normalizeProfileName,

  // Core save/load
  saveGame,
  loadGame,

  // Profile operations
  saveProfile,
  loadProfile,
  loadLastProfile,
  createProfile,
  deleteProfile,
  defaultProfileExists,
  listProfiles
};
