import type { DiagramDefinition } from '../../diagram-api/types.js';
import { db } from './chenDb.js';
import { parser } from './parser/chen.chevrotain.js';
import { renderer } from './chenRenderer.js';
import styles from './styles.js';

export const diagram: DiagramDefinition = {
  parser,
  db,
  renderer,
  styles,
};
