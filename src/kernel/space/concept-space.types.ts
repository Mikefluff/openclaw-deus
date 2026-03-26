/**
 * Adaptive Concept Space types.
 *
 * Dimensions are born from conflicts, not predefined.
 * Traces have positions that evolve through experience.
 * Abstractions are centroids of spatial clusters.
 */

export interface Dimension {
  id: number;
  born_at_cycle: number;
  born_from_conflict: { trace_a: string; trace_b: string };

  // Emergent labels — discovered from exemplars, not assigned
  positive_exemplars: string[];
  negative_exemplars: string[];
  label?: string;

  // Statistics
  variance: number;
  usage_count: number;
}

export interface SpatialConflict {
  trace_a_id: string;
  trace_b_id: string;
  trace_a_content: string;
  trace_b_content: string;
  distance: number;
  severity: number;          // 1/distance — closer = more severe
  resolved: boolean;
  resolved_by_dimension?: number;
}

export interface SpatialMovement {
  trace_id: string;
  delta: number[];
  reason: string;
}

export interface SpatialCluster {
  centroid: number[];
  traces: string[];
  radius: number;
  shared_words: string[];
}
