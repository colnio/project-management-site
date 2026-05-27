/**
 * EntityDashboard — dispatcher that renders the correct dashboard given entityType + entityId.
 */

import { ProjectDashboard } from './ProjectDashboard';
import { IterationDashboard } from './IterationDashboard';
import { ExperimentDashboard } from './ExperimentDashboard';
import { SampleDashboard } from './SampleDashboard';

export type EntityType = 'project' | 'iteration' | 'experiment' | 'sample';

export interface EntityDashboardProps {
  entityType: EntityType;
  entityId: string;
}

export function EntityDashboard({ entityType, entityId }: EntityDashboardProps) {
  if (!entityId) return null;
  switch (entityType) {
    case 'project':
      return <ProjectDashboard projectId={entityId} />;
    case 'iteration':
      return <IterationDashboard iterationId={entityId} />;
    case 'experiment':
      return <ExperimentDashboard experimentId={entityId} />;
    case 'sample':
      return <SampleDashboard sampleId={entityId} />;
    default:
      return null;
  }
}
