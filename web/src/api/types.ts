/**
 * Convenience re-exports from the generated schema, aliased to clean names.
 */
import type { components } from './schema.d.ts';

export type User = components['schemas']['UserJSON'];
export type Workspace = components['schemas']['Workspace'];
export type Project = components['schemas']['Project'];
export type Sample = components['schemas']['Sample'];
export type Experiment = components['schemas']['Experiment'];
export type Iteration = components['schemas']['Iteration'];
export type Artifact = components['schemas']['Artifact'];
export type LoginOutput = components['schemas']['LoginOutputBody_3ca2d2c'];
export type RefreshOutput = components['schemas']['RefreshOutputBody_2dfb9844'];
