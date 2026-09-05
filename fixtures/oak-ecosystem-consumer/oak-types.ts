export type OakVec3V1 = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export interface OakResourcePoolsV1 {
  readonly carbonKg: number;
  readonly nitrogenKg: number;
  readonly phosphorusKg: number;
  readonly waterLiters: number;
}

export interface OakOrganIdentityV1 {
  readonly localId: number;
  readonly generation: number;
}

export type OakOrganKindV1 =
  | 'acorn'
  | 'stem'
  | 'branch'
  | 'coarse-root'
  | 'fine-root-cohort'
  | 'bud'
  | 'leaf';

export type OakOrganStageV1 =
  | 'dormant'
  | 'germinating'
  | 'expanding'
  | 'mature'
  | 'senescing'
  | 'detached'
  | 'abscised';

export type OakOrganDevelopmentPhaseV1 =
  | 'preformed'
  | 'bud-swelling'
  | 'cell-division'
  | 'cell-expansion'
  | 'maturing'
  | 'mature'
  | 'senescing'
  | 'falling'
  | 'abscised';

interface OakOrganBaseSnapshotV1 {
  readonly key: string;
  readonly identity: OakOrganIdentityV1;
  readonly kind: OakOrganKindV1;
  readonly parentKey: string | null;
  readonly branchOrder: number;
  readonly ageDays: number;
  /** Proximal attachment point; segment length extends along `direction`. */
  readonly positionM: OakVec3V1;
  /** Unit vector in the consumer's right-handed, +Y-up coordinate space. */
  readonly direction: OakVec3V1;
  readonly lengthM: number;
  readonly radiusM: number;
  /** Stable primary-growth plan; current dimensions remain the paid tissue. */
  readonly targetLengthM: number;
  readonly targetRadiusM: number;
  readonly dryMassKg: number;
  readonly waterPotentialMpa: number;
  readonly pools: OakResourcePoolsV1;
  readonly stage: OakOrganStageV1;
  readonly developmentPhase: OakOrganDevelopmentPhaseV1;
  /** Resource-constrained primary development, bounded from zero through one. */
  readonly developmentFraction: number;
  readonly healthFraction: number;
  readonly stressFraction: number;
  /** Process-soil recipient selected from the physical contact midpoint. */
  readonly litterRecipientSoilCellKey?: string;
}

export interface OakStructuralOrganSnapshotV1
  extends OakOrganBaseSnapshotV1 {
  readonly kind: Exclude<OakOrganKindV1, 'leaf'>;
}

/** Physical node identity; it deliberately contains no renderer/lattice key. */
export interface OakLeafAttachmentV1 {
  readonly parentOrganKey: string;
  readonly nodeSite: 'distal';
  readonly restRadialUnitWorld: OakVec3V1;
}

export interface OakLeafOrganSnapshotV1 extends OakOrganBaseSnapshotV1 {
  readonly kind: 'leaf';
  readonly attachment?: OakLeafAttachmentV1;
  readonly areaM2: number;
  readonly targetAreaM2: number;
  /** Diagnostic elevation of `direction`; the renderer must not apply it again. */
  readonly inclinationRadians: number;
  /** Rotation around the already-oriented midrib `direction`. */
  readonly rollRadians: number;
  readonly chlorophyllFraction: number;
  readonly relativeWaterContentFraction: number;
  /** Present only while detached; one means the physical fall pose has settled. */
  readonly fallProgressFraction?: number;
  /** Zero-mass recolor of existing parent tissue at the base-abscission wound. */
  readonly abscissionScar?: Readonly<{
    parentKey: string;
    positionM: OakVec3V1;
    direction: OakVec3V1;
    rollRadians: number;
    searchRadiusM: number;
    fallMaterial: Readonly<{
      chlorophyllFraction: number;
      relativeWaterContentFraction: number;
      stressFraction: number;
    }>;
  }>;
}

export type OakOrganSnapshotV1 =
  | OakStructuralOrganSnapshotV1
  | OakLeafOrganSnapshotV1;

export interface OakSoilCellSnapshotV1 {
  readonly key: string;
  readonly centerM: OakVec3V1;
  readonly sizeM: OakVec3V1;
  readonly porosityFraction: number;
  readonly volumetricWaterFraction: number;
  readonly waterLiters: number;
  /** Normalized support of the declared three-sample fine-root influence kernel. */
  readonly rootUptakeWeightFraction: number;
  readonly ammoniumKg: number;
  readonly nitrateKg: number;
  readonly labilePhosphorusKg: number;
  readonly sorbedPhosphorusKg: number;
  readonly litter: Readonly<{
    carbonKg: number;
    nitrogenKg: number;
    phosphorusKg: number;
  }>;
  readonly ectomycorrhiza: Readonly<{
    carbonKg: number;
    nitrogenKg: number;
    phosphorusKg: number;
    colonizedFineRootFraction: number;
  }>;
}

export type OakResourceLevelV1 = 'ambient' | 'low';
export type OakWindRegimeV1 = 'still' | 'breeze';

export interface OakEnvironmentRegimeV1 {
  readonly water: OakResourceLevelV1;
  readonly nitrogen: OakResourceLevelV1;
  readonly phosphorus: OakResourceLevelV1;
}

export type OakPhenologyStageV1 =
  | 'imbibition'
  | 'radicle-emergence'
  | 'shoot-emergence'
  | 'first-flush'
  | 'second-flush'
  | 'third-flush'
  | 'leaf-mature'
  | 'senescence';

export interface OakResourceLedgerV1 {
  readonly initialStorage: OakResourcePoolsV1;
  readonly cumulativeSources: OakResourcePoolsV1;
  readonly cumulativeSinks: OakResourcePoolsV1;
  readonly currentStorage: OakResourcePoolsV1;
  readonly storageChange: OakResourcePoolsV1;
  /** initial + sources - sinks - current; zero is exact closure. */
  readonly residual: OakResourcePoolsV1;
}

export interface OakSimulationDiagnosticsV1 {
  readonly heightM: number;
  /** Zero until a stem actually crosses breast height (1.3 m). */
  readonly dbhM: number;
  readonly basalStemDiameterM: number;
  readonly crownRadiusM: number;
  readonly leafAreaM2: number;
  readonly fineRootLengthM: number;
  readonly organCount: number;
  readonly leafCount: number;
  readonly flushCount: number;
  readonly activeGrowthFrontCount: number;
  readonly cumulativeGrowthCarbonKg: number;
  readonly cumulativeAssimilationCarbonKg: number;
  readonly cumulativeRespirationCarbonKg: number;
  /** Explicit first-year boundary export after every primary sink is complete. */
  readonly cumulativePostPrimaryCarbonOverflowKg: number;
  readonly cumulativeTranspirationLiters: number;
  readonly cumulativeRootWaterUptakeLiters: number;
  readonly cumulativeNitrogenUptakeKg: number;
  readonly cumulativePhosphorusUptakeKg: number;
  readonly cumulativeMycorrhizalCarbonCostKg: number;
  readonly cumulativeLitterCarbonRespiredKg: number;
  readonly meanLeafWaterPotentialMpa: number;
  readonly minimumLeafWaterPotentialMpa: number;
  readonly meanWaterStressFraction: number;
  readonly meanNitrogenStressFraction: number;
  readonly meanPhosphorusStressFraction: number;
  readonly processSteps: Readonly<{
    physiology: number;
    soil: number;
    allocation: number;
    phenology: number;
  }>;
  readonly mechanicsClampedOrganCount: number;
  readonly minimumWoodOwnedToGeometryMassRatio: number;
  readonly maximumWoodOwnedToGeometryMassRatio: number;
}

export interface OakSimulationSnapshotV1 {
  readonly schemaVersion: 'oak.simulation-state/1';
  readonly epoch: string;
  readonly revision: number;
  readonly seed: number;
  readonly hostTick: number;
  readonly elapsedBiologicalSeconds: number;
  readonly paused: boolean;
  readonly timeScale: number;
  readonly phenology: OakPhenologyStageV1;
  readonly environmentRegime: OakEnvironmentRegimeV1;
  readonly wind: Readonly<{
    regime: OakWindRegimeV1;
    phaseTick: number;
    speedMPerS: number;
  }>;
  readonly plantMobilePools: OakResourcePoolsV1;
  readonly organs: readonly OakOrganSnapshotV1[];
  readonly soil: readonly OakSoilCellSnapshotV1[];
  readonly ledger: OakResourceLedgerV1;
  readonly diagnostics: OakSimulationDiagnosticsV1;
}

export interface OakRenderProjectionStateV1 {
  readonly schemaVersion: 'oak.render-projection/1';
  readonly epoch: string;
  readonly revision: number;
  readonly phenology: OakPhenologyStageV1;
  readonly environmentRegime: OakEnvironmentRegimeV1;
  readonly wind: OakSimulationSnapshotV1['wind'];
  readonly organs: readonly OakOrganSnapshotV1[];
  readonly soil: readonly OakSoilCellSnapshotV1[];
  readonly diagnostics: Pick<
    OakSimulationDiagnosticsV1,
    | 'heightM'
    | 'basalStemDiameterM'
    | 'crownRadiusM'
    | 'leafAreaM2'
    | 'activeGrowthFrontCount'
    | 'cumulativeGrowthCarbonKg'
    | 'meanWaterStressFraction'
    | 'meanNitrogenStressFraction'
    | 'meanPhosphorusStressFraction'
  >;
}
