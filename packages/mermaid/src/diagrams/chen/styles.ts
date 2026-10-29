import type { DiagramStylesProvider } from '../../diagram-api/types.js';
import {
  hasPalette,
  isColorTheme,
  paletteSlotCount,
  safeLook,
} from '../common/colorThemeGate.js';

interface ChenStyleOptions {
  theme?: string;
  look?: string;
  mainBkg: string;
  nodeBorder: string;
  lineColor: string;
  textColor?: string;
  nodeTextColor?: string;
  titleColor?: string;
  fontFamily: string;
  fontSize?: string;
  edgeLabelBackground?: string;
  tertiaryColor?: string;
  clusterBkg?: string;
  clusterBorder?: string;
  strokeWidth?: string;
  borderColorArray?: string[];
  bkgColorArray?: string[];
}

const genColor: DiagramStylesProvider = (options: ChenStyleOptions) => {
  const { theme, bkgColorArray, borderColorArray } = options;
  if (!isColorTheme(theme, borderColorArray) || !hasPalette(borderColorArray)) {
    return '';
  }
  const look = safeLook(options.look);
  const hasBkgColors = hasPalette(bkgColorArray);
  let sections = '';

  for (let i = 0; i < paletteSlotCount(borderColorArray); i++) {
    const borderColor = borderColorArray[i];
    const fill = hasBkgColors ? `fill: ${bkgColorArray[i % bkgColorArray.length]};` : '';
    sections += `
    [data-look="${look}"][data-color-id="color-${i}"].node path,
    [data-look="${look}"][data-color-id="color-${i}"].node rect,
    [data-look="${look}"][data-color-id="color-${i}"].node polygon,
    [data-look="${look}"][data-color-id="color-${i}"].node ellipse,
    [data-look="${look}"][data-color-id="color-${i}"].node circle {
      stroke: ${borderColor};
      ${fill}
    }
    `;
  }
  return sections;
};

const getStyles: DiagramStylesProvider = (options: ChenStyleOptions) => {
  const { look, strokeWidth } = options;
  const stroke = look === 'neo' ? (strokeWidth ?? '1.5px') : '1.5px';

  return `
    ${genColor(options)}

    .node rect,
    .node polygon,
    .node ellipse,
    .node circle {
      fill: ${options.mainBkg};
      stroke: ${options.nodeBorder};
      stroke-width: ${stroke};
    }

    .chen-entity {
      fill: ${options.mainBkg};
      stroke: ${options.nodeBorder};
    }

    .chen-weak-entity rect {
      fill: ${options.mainBkg};
      stroke: ${options.nodeBorder};
    }
    .chen-weak-entity .chen-weak-entity-inner {
      fill: none;
    }

    .chen-diamond,
    .chen-double-diamond {
      fill: ${options.mainBkg};
      stroke: ${options.nodeBorder};
    }
    .chen-double-diamond .chen-double-diamond-inner {
      fill: none;
    }

    .chen-isa-triangle {
      fill: ${options.mainBkg};
      stroke: ${options.nodeBorder};
    }

    .chen-isa-circle {
      fill: ${options.mainBkg};
      stroke: ${options.nodeBorder};
    }

    .chen-attr-oval,
    .chen-attr-key,
    .chen-attr-partial-key {
      fill: ${options.mainBkg};
      stroke: ${options.nodeBorder};
    }

    .chen-attr-derived {
      fill: ${options.mainBkg};
      stroke: ${options.nodeBorder};
      stroke-dasharray: 5, 4;
    }

    .chen-attr-multi ellipse {
      fill: ${options.mainBkg};
      stroke: ${options.nodeBorder};
    }
    .chen-attr-multi .chen-attr-multi-inner {
      fill: none;
    }

    .chen-key-underline {
      stroke: ${options.nodeTextColor || options.textColor || options.nodeBorder};
      stroke-width: 1.5px;
    }

    .chen-partial-key-underline {
      stroke: ${options.nodeTextColor || options.textColor || options.nodeBorder};
      stroke-width: 1.5px;
      stroke-dasharray: 4, 3;
    }

    .chen-aggregation rect {
      fill: ${options.clusterBkg ?? 'none'};
      stroke: ${options.clusterBorder ?? options.nodeBorder};
      stroke-dasharray: 6, 4;
      stroke-width: 1.5px;
    }

    .chen-disjoint-arc {
      fill: none;
      stroke: ${options.lineColor};
      stroke-width: 1.5px;
    }

    .relationshipLine,
    .chen-attr-edge,
    .chen-isa-edge,
    .chen-link {
      fill: none;
      stroke: ${options.lineColor};
      stroke-width: ${stroke};
    }

    .chen-double-edge {
      fill: none;
      stroke: ${options.lineColor};
      stroke-width: 1.2px;
    }

    .edgeLabel {
      background-color: ${options.edgeLabelBackground ?? options.mainBkg};
      text-align: center;
    }
    .edgeLabel .label rect {
      fill: ${options.edgeLabelBackground ?? options.mainBkg};
    }
    .edgeLabel .label text {
      fill: ${options.textColor};
    }

    .label {
      font-family: ${options.fontFamily};
      color: ${options.nodeTextColor || options.textColor};
      font-size: ${options.fontSize ?? '14px'};
    }
  `;
};

export default getStyles;
