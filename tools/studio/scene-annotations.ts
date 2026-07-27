/**
 * Private, per-scene review notes. The renderer never sees these records: they
 * preserve a reviewer's words together with the exact Studio view and phase
 * that made those words meaningful.
 */
import { MAX_SCENE_POSE_REPLAY_ID_LENGTH } from './scene.js';
export const SCENE_ANNOTATIONS_SCHEMA_V1 = 'studio.scene-annotations/1';
export const SCENE_ANNOTATIONS_KEY = 'voxel-studio-scene-annotations/1';
export const SCENE_ANNOTATIONS_QUARANTINE_KEY = 'voxel-studio-scene-annotations-quarantine/1';
export const SCENE_ANNOTATION_MAX_SCENES = 64;
export const SCENE_ANNOTATION_MAX_PINS = 64;
export const SCENE_ANNOTATION_MAX_BRIEF_LENGTH = 8_000;
export const SCENE_ANNOTATION_MAX_PIN_TEXT_LENGTH = 1_000;
const MAX_REFERENCE_LENGTH = 256;
const MAX_WORLD_COORDINATE = 1_000_000;
const MAX_VIEWPORT_EDGE = 32_768;
const MAX_PIN_ID = Number.MAX_SAFE_INTEGER - 1;
export interface SceneViewPinReplayRefV1 {
  readonly id: string;
  readonly inputHash: string;
  readonly finalHash: string;
}
export interface SceneViewPinV1 {
  readonly sceneId: string;
  readonly id: number;
  readonly text: string;
  readonly createdAt: string;
  readonly sceneFingerprint: string;
  readonly spot: { readonly u: number; readonly v: number };
  readonly timeMs: number;
  readonly orbit: {
    readonly yawDegrees: number;
    readonly pitchDegrees: number;
    readonly viewHeight: number;
  };
  readonly panCenter: readonly [number, number, number];
  readonly depth: boolean;
  readonly lit: boolean;
  readonly edges: boolean;
  readonly selectedPlacementId: string | null;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly replay?: SceneViewPinReplayRefV1;
}

export type SceneViewPinDraftV1 = Omit<SceneViewPinV1, 'sceneId' | 'id' | 'createdAt'>;

export interface SceneAnnotationsV1 {
  readonly sceneId: string;
  readonly brief: string;
  readonly pins: readonly SceneViewPinV1[];
}

export interface SceneAnnotationStorageV1 {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SceneAnnotationPersistenceResultV1 {
  readonly persisted: boolean;
  readonly message: string;
}

export interface SceneAnnotationStoreOptionsV1 {
  readonly storage?: SceneAnnotationStorageV1 | null;
  readonly now?: () => Date;
}

interface StoredSceneV1 {
  sceneId: string;
  brief: string;
  nextPinId: number;
  pins: SceneViewPinV1[];
}

interface StoredDocumentV1 {
  schemaVersion: typeof SCENE_ANNOTATIONS_SCHEMA_V1;
  scenes: StoredSceneV1[];
}

function record(value: unknown, subject: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${subject} must be an object; received ${value === null ? 'null' : typeof value}.`);
  }
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, subject: string, maximum: number, trim: boolean): string {
  if (typeof value !== 'string') {
    throw new Error(`${subject} must be text; received ${typeof value}.`);
  }
  const cleaned = trim ? value.trim() : value;
  if (trim && cleaned.length === 0) {
    throw new Error(`${subject} must contain at least one non-whitespace character.`);
  }
  if (cleaned.length > maximum) {
    throw new Error(`${subject} must be at most ${String(maximum)} characters; received ${String(cleaned.length)}.`);
  }
  for (const character of cleaned) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
      throw new Error(`${subject} cannot contain control characters.`);
    }
  }
  return cleaned;
}
export function validateSceneAnnotationBriefV1(value: unknown): string {
  return boundedString(value, 'Scene brief', SCENE_ANNOTATION_MAX_BRIEF_LENGTH, false);
}

function identity(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error(`${subject} must be non-empty text; received ${typeof value === 'string' ? "''" : typeof value}.`);
  return value;
}
function sceneId(value: unknown): string { return identity(value, 'Scene id'); }
function finite(value: unknown, subject: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(
      `${subject} must be a finite number from ${String(minimum)} through ${String(maximum)}; received ${String(value)}.`,
    );
  }
  return value;
}

function integer(value: unknown, subject: string, minimum: number, maximum: number): number {
  const number = finite(value, subject, minimum, maximum);
  if (!Number.isInteger(number)) {
    throw new Error(`${subject} must be a whole number; received ${String(number)}.`);
  }
  return number;
}

function isoDate(value: unknown): string {
  const text = boundedString(value, 'Pin createdAt', 40, true);
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== text) {
    throw new Error(`Pin createdAt must be a canonical ISO timestamp such as 2026-07-27T12:00:00.000Z; received '${text}'.`);
  }
  return text;
}

function replayRef(value: unknown): SceneViewPinReplayRefV1 | undefined {
  if (value === undefined) return undefined;
  const source = record(value, 'Pin replay reference');
  const reference = {
    id: boundedString(source.id, 'Pin replay id', MAX_SCENE_POSE_REPLAY_ID_LENGTH, true),
    inputHash: boundedString(source.inputHash, 'Pin replay inputHash', MAX_REFERENCE_LENGTH, true),
    finalHash: boundedString(source.finalHash, 'Pin replay finalHash', MAX_REFERENCE_LENGTH, true),
  };
  for (const [field, hash] of [['inputHash', reference.inputHash], ['finalHash', reference.finalHash]] as const) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(hash)) {
      throw new Error(
        `Pin replay ${field} must use canonical 'sha256:' plus 64 lowercase hexadecimal characters; received '${hash}'.`,
      );
    }
  }
  return reference;
}

/** Validates, normalizes, and defensively copies one complete stored pin. */
export function validateSceneViewPinV1(value: unknown): SceneViewPinV1 {
  const source = record(value, 'Scene view pin');
  const spot = record(source.spot, 'Pin spot');
  const orbit = record(source.orbit, 'Pin orbit');
  const viewport = record(source.viewport, 'Pin viewport');
  if (!Array.isArray(source.panCenter) || source.panCenter.length !== 3) {
    throw new Error('Pin panCenter must contain exactly three finite world coordinates.');
  }
  if (typeof source.depth !== 'boolean') {
    throw new Error(`Pin depth must be true or false; received ${String(source.depth)}.`);
  }
  if (typeof source.lit !== 'boolean') {
    throw new Error(`Pin lit must be true or false; received ${String(source.lit)}.`);
  }
  if (typeof source.edges !== 'boolean') {
    throw new Error(`Pin edges must be true or false; received ${String(source.edges)}.`);
  }
  const replay = replayRef(source.replay);
  const selectedPlacementId = source.selectedPlacementId === null
    ? null
    : identity(source.selectedPlacementId, 'Pin selectedPlacementId');
  const pin: SceneViewPinV1 = {
    sceneId: sceneId(source.sceneId),
    id: integer(source.id, 'Pin id', 1, MAX_PIN_ID),
    text: boundedString(source.text, 'Pin text', SCENE_ANNOTATION_MAX_PIN_TEXT_LENGTH, true),
    createdAt: isoDate(source.createdAt),
    sceneFingerprint: boundedString(source.sceneFingerprint, 'Pin sceneFingerprint', MAX_REFERENCE_LENGTH, true),
    spot: {
      u: finite(spot.u, 'Pin spot.u', 0, 1),
      v: finite(spot.v, 'Pin spot.v', 0, 1),
    },
    timeMs: finite(source.timeMs, 'Pin timeMs', 0, Number.MAX_SAFE_INTEGER),
    orbit: {
      yawDegrees: ((finite(orbit.yawDegrees, 'Pin orbit.yawDegrees', -1_000_000, 1_000_000) % 360) + 360) % 360,
      pitchDegrees: finite(orbit.pitchDegrees, 'Pin orbit.pitchDegrees', -85, 85),
      viewHeight: finite(orbit.viewHeight, 'Pin orbit.viewHeight', 0.25, 256),
    },
    panCenter: [
      finite(source.panCenter[0], 'Pin panCenter[0]', -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
      finite(source.panCenter[1], 'Pin panCenter[1]', -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
      finite(source.panCenter[2], 'Pin panCenter[2]', -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
    ],
    depth: source.depth,
    lit: source.lit,
    edges: source.edges,
    selectedPlacementId,
    viewport: {
      width: integer(viewport.width, 'Pin viewport.width', 1, MAX_VIEWPORT_EDGE),
      height: integer(viewport.height, 'Pin viewport.height', 1, MAX_VIEWPORT_EDGE),
    },
    ...(replay ? { replay } : {}),
  };
  return pin;
}

function copyPin(pin: SceneViewPinV1): SceneViewPinV1 {
  return validateSceneViewPinV1(pin);
}

function message(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : String(error);
}

/** Returns browser localStorage when it can be acquired, or null outside/behind a blocked browser. */
export function browserSceneAnnotationStorage(): SceneAnnotationStorageV1 | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export class SceneAnnotationStore {
  readonly #storage: SceneAnnotationStorageV1 | null;
  readonly #now: () => Date;
  readonly #scenes = new Map<string, StoredSceneV1>();
  readonly #warnings: string[] = [];
  #writesBlocked: string | null = null;

  constructor(options: SceneAnnotationStoreOptionsV1 = {}) {
    this.#storage = options.storage === undefined ? browserSceneAnnotationStorage() : options.storage;
    this.#now = options.now ?? (() => new Date());
    this.#load();
  }

  get loadWarnings(): readonly string[] {
    return [...this.#warnings];
  }

  readScene(id: string): SceneAnnotationsV1 {
    const validId = sceneId(id);
    this.#syncLatest();
    const stored = this.#scenes.get(validId);
    return {
      sceneId: validId,
      brief: stored?.brief ?? '',
      pins: stored?.pins.map(copyPin) ?? [],
    };
  }

  setBrief(id: string, brief: string): SceneAnnotationPersistenceResultV1 {
    const validId = sceneId(id);
    const validBrief = validateSceneAnnotationBriefV1(brief);
    this.#syncLatest();
    const stored = this.#sceneForWrite(validId);
    stored.brief = validBrief;
    return this.#persist();
  }

  addPin(
    id: string,
    draft: SceneViewPinDraftV1,
  ): { readonly pin: SceneViewPinV1; readonly persistence: SceneAnnotationPersistenceResultV1 } {
    const validId = sceneId(id);
    this.#syncLatest();
    const stored = this.#sceneForWrite(validId);
    if (stored.pins.length >= SCENE_ANNOTATION_MAX_PINS) {
      throw new Error(
        `Scene '${validId}' already has the maximum ${String(SCENE_ANNOTATION_MAX_PINS)} pins; remove one before adding another.`,
      );
    }
    if (stored.nextPinId > MAX_PIN_ID) {
      throw new Error(`Scene '${validId}' exhausted its safe numeric pin ids; start a new annotation schema before adding another.`);
    }
    const createdAt = this.#now().toISOString();
    const pin = validateSceneViewPinV1({ ...draft, sceneId: validId, id: stored.nextPinId, createdAt });
    stored.nextPinId += 1;
    stored.pins.push(pin);
    return { pin: copyPin(pin), persistence: this.#persist() };
  }

  removePin(id: string, pinId: number): {
    readonly removed: boolean;
    readonly persistence: SceneAnnotationPersistenceResultV1;
  } {
    const validId = sceneId(id);
    integer(pinId, 'Pin id to remove', 1, MAX_PIN_ID);
    this.#syncLatest();
    const stored = this.#scenes.get(validId);
    const index = stored?.pins.findIndex((pin) => pin.id === pinId) ?? -1;
    if (!stored || index < 0) {
      return { removed: false, persistence: this.#storageStatus('No pin matched, so nothing was changed.') };
    }
    stored.pins.splice(index, 1);
    return { removed: true, persistence: this.#persist() };
  }

  clearScene(id: string): SceneAnnotationPersistenceResultV1 {
    const validId = sceneId(id);
    this.#syncLatest();
    const stored = this.#scenes.get(validId);
    if (!stored || stored.brief.length === 0 && stored.pins.length === 0) {
      return this.#storageStatus('The scene already has no brief or pins, so nothing was changed.');
    }
    stored.brief = '';
    stored.pins = [];
    return this.#persist();
  }

  #sceneForWrite(id: string): StoredSceneV1 {
    const existing = this.#scenes.get(id);
    if (existing) return existing;
    if (this.#scenes.size >= SCENE_ANNOTATION_MAX_SCENES) {
      const empty = [...this.#scenes.values()].find((scene) =>
        scene.brief.length === 0 && scene.pins.length === 0);
      if (empty) {
        this.#scenes.delete(empty.sceneId);
      } else {
        throw new Error(
          `The annotation store already has ${String(SCENE_ANNOTATION_MAX_SCENES)} non-empty scenes; `
            + `clear one before annotating '${id}'.`,
        );
      }
    }
    const created: StoredSceneV1 = { sceneId: id, brief: '', nextPinId: 1, pins: [] };
    this.#scenes.set(id, created);
    return created;
  }

  #load(): void {
    this.#syncLatest(true);
  }

  #syncLatest(initial = false): void {
    if (this.#storage === null) {
      if (initial) {
        this.#warnings.push('Scene annotations are available in memory only because browser localStorage is unavailable.');
      }
      return;
    }
    if (this.#writesBlocked !== null) return;
    let raw: string | null;
    try {
      raw = this.#storage.getItem(SCENE_ANNOTATIONS_KEY);
    } catch (error) {
      this.#writesBlocked = `the existing annotation data could not be read (${message(error)})`;
      this.#warnings.push(`Scene annotations opened in memory only because ${this.#writesBlocked}.`);
      return;
    }
    if (raw === null) {
      if (!initial) this.#scenes.clear();
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.#recoverCorrupt(raw, `Stored scene annotations are not valid JSON (${message(error)}).`);
      return;
    }
    const source = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
    if (source?.schemaVersion !== SCENE_ANNOTATIONS_SCHEMA_V1) {
      this.#recoverCorrupt(
        raw,
        `Stored scene annotations use unsupported schema '${String(source?.schemaVersion)}'; expected '${SCENE_ANNOTATIONS_SCHEMA_V1}'.`,
      );
      return;
    }
    const recovered = new Map<string, StoredSceneV1>();
    const warnings = this.#recoverScenes(source.scenes, recovered);
    this.#scenes.clear();
    for (const [id, scene] of recovered) this.#scenes.set(id, scene);
    if (warnings.length > 0) this.#recoverCorrupt(raw, ...warnings);
  }

  #recoverScenes(value: unknown, target = this.#scenes): string[] {
    if (!Array.isArray(value)) return ['Stored scene annotations have no valid scenes array.'];
    const warnings: string[] = [];
    for (let sceneIndex = 0; sceneIndex < value.length; sceneIndex += 1) {
      if (target.size >= SCENE_ANNOTATION_MAX_SCENES) {
        warnings.push(`Stored scene annotations exceeded ${String(SCENE_ANNOTATION_MAX_SCENES)} scenes; later scenes were dropped.`);
        break;
      }
      try {
        const source = record(value[sceneIndex], `Stored scene ${String(sceneIndex)}`);
        const id = sceneId(source.sceneId);
        if (target.has(id)) throw new Error(`Stored scene '${id}' appears more than once.`);
        const brief = boundedString(source.brief, `Stored scene '${id}' brief`, SCENE_ANNOTATION_MAX_BRIEF_LENGTH, false);
        const pinsSource = Array.isArray(source.pins) ? source.pins : [];
        if (!Array.isArray(source.pins)) warnings.push(`Stored scene '${id}' pins were not an array and were dropped.`);
        const pins: SceneViewPinV1[] = [];
        const ids = new Set<number>();
        for (let pinIndex = 0; pinIndex < pinsSource.length && pins.length < SCENE_ANNOTATION_MAX_PINS; pinIndex += 1) {
          try {
            const pin = validateSceneViewPinV1(pinsSource[pinIndex]);
            if (pin.sceneId !== id) throw new Error(`Pin sceneId '${pin.sceneId}' does not match '${id}'.`);
            if (ids.has(pin.id)) throw new Error(`Pin id ${String(pin.id)} is duplicated.`);
            ids.add(pin.id);
            pins.push(pin);
          } catch (error) {
            warnings.push(`Stored scene '${id}' pin ${String(pinIndex)} was dropped: ${message(error)}`);
          }
        }
        if (pinsSource.length > SCENE_ANNOTATION_MAX_PINS) {
          warnings.push(`Stored scene '${id}' exceeded ${String(SCENE_ANNOTATION_MAX_PINS)} pins; later pins were dropped.`);
        }
        const minimumNextId = Math.max(0, ...pins.map((pin) => pin.id)) + 1;
        let nextPinId: number;
        try {
          nextPinId = integer(source.nextPinId, `Stored scene '${id}' nextPinId`, 1, Number.MAX_SAFE_INTEGER);
          if (nextPinId < minimumNextId) throw new Error(`it must be at least ${String(minimumNextId)}.`);
        } catch (error) {
          nextPinId = minimumNextId;
          warnings.push(`Stored scene '${id}' nextPinId was repaired to ${String(nextPinId)}: ${message(error)}`);
        }
        target.set(id, { sceneId: id, brief, nextPinId, pins });
      } catch (error) {
        warnings.push(`Stored scene ${String(sceneIndex)} was dropped: ${message(error)}`);
      }
    }
    return warnings;
  }

  #recoverCorrupt(raw: string, ...warnings: string[]): void {
    this.#warnings.push(...warnings);
    if (this.#storage === null) return;
    let quarantineKey = SCENE_ANNOTATIONS_QUARANTINE_KEY;
    try {
      let suffix = 2;
      while (this.#storage.getItem(quarantineKey) !== null) {
        quarantineKey = `${SCENE_ANNOTATIONS_QUARANTINE_KEY}/${String(suffix)}`;
        suffix += 1;
      }
      this.#storage.setItem(quarantineKey, raw);
      this.#warnings.push(`The original stored text was preserved at '${quarantineKey}' before recovery.`);
    } catch (error) {
      this.#writesBlocked = `the original stored text could not be quarantined (${message(error)})`;
      this.#warnings.push(`Recovered annotations remain in memory only because ${this.#writesBlocked}; the original key was not overwritten.`);
      return;
    }
    const result = this.#persist();
    if (!result.persisted) this.#warnings.push(result.message);
  }

  #document(): StoredDocumentV1 {
    return {
      schemaVersion: SCENE_ANNOTATIONS_SCHEMA_V1,
      scenes: [...this.#scenes.values()].map((scene) => ({
        sceneId: scene.sceneId,
        brief: scene.brief,
        nextPinId: scene.nextPinId,
        pins: scene.pins.map(copyPin),
      })),
    };
  }

  #persist(): SceneAnnotationPersistenceResultV1 {
    if (this.#writesBlocked !== null) {
      return {
        persisted: false,
        message: `Scene annotations remain available for this visit, but were not saved because ${this.#writesBlocked}.`,
      };
    }
    if (this.#storage === null) {
      return {
        persisted: false,
        message: 'Scene annotations remain available for this visit, but were not saved because browser localStorage is unavailable.',
      };
    }
    try {
      this.#storage.setItem(SCENE_ANNOTATIONS_KEY, JSON.stringify(this.#document()));
      return { persisted: true, message: 'Scene annotations were saved.' };
    } catch (error) {
      this.#writesBlocked = `storage refused the save (${message(error)})`;
      return {
        persisted: false,
        message: `Scene annotations remain available for this visit, but ${this.#writesBlocked}.`,
      };
    }
  }

  #storageStatus(success: string): SceneAnnotationPersistenceResultV1 {
    if (this.#writesBlocked !== null || this.#storage === null) return this.#persist();
    return { persisted: true, message: success };
  }
}
