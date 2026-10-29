import type {
  DiagramDetector,
  DiagramLoader,
  ExternalDiagramDefinition,
} from '../../diagram-api/types.js';

const id = 'chen';

const detector: DiagramDetector = (txt) => {
  return /^\s*chen-beta(?:\s|$)/.test(txt);
};

const loader: DiagramLoader = async () => {
  const { diagram } = await import('./chenDiagram.js');
  return { id, diagram };
};

export const chen: ExternalDiagramDefinition = {
  id,
  detector,
  loader,
};
