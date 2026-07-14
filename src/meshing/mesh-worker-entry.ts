import {
  MESH_WORKER_ENTRY_SCHEMA_V1,
} from './mesh-worker-contract.js';
import { GREEDY_OPAQUE_MESHER_V1 } from './greedy-opaque-mesher.js';
import { installMeshWorkerEndpointV1 } from './mesh-worker-endpoint.js';
import { VISIBLE_FACE_ORACLE_MESHER_V1 } from './visible-face-oracle.js';

/** Marker used by packed/offline artifact verification. */
export const meshWorkerEntrySchemaV1 = MESH_WORKER_ENTRY_SCHEMA_V1;

installMeshWorkerEndpointV1(globalThis, [
  GREEDY_OPAQUE_MESHER_V1,
  VISIBLE_FACE_ORACLE_MESHER_V1,
]);
