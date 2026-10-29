import rough from 'roughjs';
import { getConfig } from '../../../diagram-api/diagramAPI.js';
import { stampColorSlot } from '../../../diagrams/common/colorThemeGate.js';
import type { Bounds, D3Selection, Point } from '../../../types.js';
import type { Node } from '../../types.js';
import intersect from '../intersect/index.js';
import { styles2String, userNodeOverrides } from './handDrawnShapeStyles.js';
import { getNodeClasses, labelHelper, updateNodeBounds } from './util.js';

/**
 * Shapes for the Chen entity-relationship diagram (`chen-beta`).
 *
 * Every shape is drawn centred on its local origin so that the layout can place it by its
 * centre. The inner outline of the "double" shapes (weak entity, identifying relationship) sits
 * `CHEN_DOUBLE_GAP` px inside the outer one.
 */
export const CHEN_DOUBLE_GAP = 4;

const ENTITY_PAD_X = 28;
const ENTITY_PAD_Y = 18;
const ENTITY_MIN_WIDTH = 90;
const ENTITY_MIN_HEIGHT = 40;

const DIAMOND_TEXT_SCALE = 1.6;
const DIAMOND_PAD_X = 28;
const DIAMOND_PAD_Y = 22;
const DIAMOND_MIN_WIDTH = 90;
const DIAMOND_MIN_HEIGHT = 46;

/** Half-width of the ISA triangle. */
export const CHEN_ISA_RADIUS = 24;
export const CHEN_ISA_CIRCLE_RADIUS = 8;

const ATTR_MIN_RX = 34;
const ATTR_MIN_RY = 18;
const ATTR_MULTI_GAP = 4;

export type ChenAttributeType =
  | 'simple'
  | 'key'
  | 'partialKey'
  | 'multivalued'
  | 'derived'
  | 'composite';

type ChenParent = D3Selection<SVGGraphicsElement>;

/** Vertices of an axis-aligned diamond centred on the origin. */
export const diamondPoints = (width: number, height: number): Point[] => [
  { x: 0, y: -height / 2 },
  { x: width / 2, y: 0 },
  { x: 0, y: height / 2 },
  { x: -width / 2, y: 0 },
];

/** Diamond size for a label of the given box. */
export const diamondSize = (bbox: { width: number; height: number }) => ({
  width: Math.max(bbox.width * DIAMOND_TEXT_SCALE + DIAMOND_PAD_X, DIAMOND_MIN_WIDTH),
  height: Math.max(bbox.height * DIAMOND_TEXT_SCALE + DIAMOND_PAD_Y, DIAMOND_MIN_HEIGHT),
});

/**
 * Inset of a diamond outline so that every edge of the inner diamond runs parallel to the
 * outer one at a perpendicular distance of `gap`.
 */
export const diamondInset = (width: number, height: number, gap = CHEN_DOUBLE_GAP) => {
  const hw = width / 2;
  const hh = height / 2;
  const diagonal = Math.hypot(hw, hh);
  return { dx: (gap * diagonal) / hh, dy: (gap * diagonal) / hw };
};

const pointsAttr = (points: Point[]) => points.map((p) => `${p.x},${p.y}`).join(' ');

const polygonPathData = (points: Point[]) =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';

const prepare = async <T extends SVGGraphicsElement>(parent: D3Selection<T>, node: Node) => {
  const { labelStyles, nodeStyles } = styles2String(node);
  node.labelStyle = labelStyles;
  const result = await labelHelper(parent, node, getNodeClasses(node));
  const { theme, themeVariables } = getConfig();
  stampColorSlot(result.shapeSvg, node.colorIndex, theme, themeVariables?.borderColorArray);
  return { ...result, nodeStyles };
};

const appendRough = (group: ChenParent, element: SVGGElement, nodeStyles: string) => {
  const inserted = group.append(() => element);
  if (nodeStyles) {
    inserted.attr('style', nodeStyles);
  }
};

/** Single-line rectangle: a regular entity. */
export async function chenEntity<T extends SVGGraphicsElement>(parent: D3Selection<T>, node: Node) {
  const { shapeSvg, bbox, nodeStyles } = await prepare(parent, node);

  const width = Math.max(bbox.width + ENTITY_PAD_X, node.minWidth ?? ENTITY_MIN_WIDTH);
  const height = Math.max(bbox.height + ENTITY_PAD_Y, ENTITY_MIN_HEIGHT);

  let shape;
  if (node.look === 'handDrawn') {
    // @ts-expect-error -- Passing a D3.Selection seems to work for some reason
    const rc = rough.svg(shapeSvg);
    const roughNode = rc.rectangle(-width / 2, -height / 2, width, height, userNodeOverrides(node, {}));
    shape = shapeSvg
      .insert('g', ':first-child')
      .attr('class', 'basic label-container chen-entity');
    appendRough(shape, roughNode, nodeStyles);
  } else {
    shape = shapeSvg
      .insert('rect', ':first-child')
      .attr('class', 'basic label-container chen-entity')
      .attr('style', nodeStyles)
      .attr('x', -width / 2)
      .attr('y', -height / 2)
      .attr('width', width)
      .attr('height', height);
  }

  node.width = width;
  node.height = height;
  updateNodeBounds(node, shape, { width, height });

  node.calcIntersect = (bounds: Bounds, point: Point) => intersect.rect(bounds, point);
  node.intersect = (point) => intersect.rect(node, point);

  return shapeSvg;
}

/** Double-line rectangle: a weak entity. */
export async function chenWeakEntity<T extends SVGGraphicsElement>(
  parent: D3Selection<T>,
  node: Node
) {
  const { shapeSvg, bbox, nodeStyles } = await prepare(parent, node);

  const gap = CHEN_DOUBLE_GAP;
  // The inner rectangle must still clear the label, so the outer one grows by the gap.
  const width = Math.max(bbox.width + ENTITY_PAD_X + 2 * gap, node.minWidth ?? ENTITY_MIN_WIDTH);
  const height = Math.max(bbox.height + ENTITY_PAD_Y + 2 * gap, ENTITY_MIN_HEIGHT);

  const group = shapeSvg
    .insert('g', ':first-child')
    .attr('class', 'basic label-container chen-weak-entity');

  if (node.look === 'handDrawn') {
    // @ts-expect-error -- Passing a D3.Selection seems to work for some reason
    const rc = rough.svg(shapeSvg);
    const options = userNodeOverrides(node, {});
    appendRough(group, rc.rectangle(-width / 2, -height / 2, width, height, options), nodeStyles);
    appendRough(
      group,
      rc.rectangle(-width / 2 + gap, -height / 2 + gap, width - 2 * gap, height - 2 * gap, {
        ...options,
        fill: 'none',
      }),
      nodeStyles
    );
  } else {
    group
      .append('rect')
      .attr('class', 'chen-weak-entity-outer')
      .attr('style', nodeStyles)
      .attr('x', -width / 2)
      .attr('y', -height / 2)
      .attr('width', width)
      .attr('height', height);
    group
      .append('rect')
      .attr('class', 'chen-weak-entity-inner')
      .attr('style', nodeStyles)
      .attr('x', -width / 2 + gap)
      .attr('y', -height / 2 + gap)
      .attr('width', width - 2 * gap)
      .attr('height', height - 2 * gap);
  }

  node.width = width;
  node.height = height;
  updateNodeBounds(node, group, { width, height });

  node.calcIntersect = (bounds: Bounds, point: Point) => intersect.rect(bounds, point);
  node.intersect = (point) => intersect.rect(node, point);

  return shapeSvg;
}

/** Diamond: a relationship. */
export async function chenDiamond<T extends SVGGraphicsElement>(parent: D3Selection<T>, node: Node) {
  const { shapeSvg, bbox, nodeStyles } = await prepare(parent, node);

  const { width, height } = diamondSize(bbox);
  const points = diamondPoints(width, height);

  let shape;
  if (node.look === 'handDrawn') {
    // @ts-expect-error -- Passing a D3.Selection seems to work for some reason
    const rc = rough.svg(shapeSvg);
    const roughNode = rc.path(polygonPathData(points), userNodeOverrides(node, {}));
    shape = shapeSvg
      .insert('g', ':first-child')
      .attr('class', 'basic label-container chen-diamond');
    appendRough(shape, roughNode, nodeStyles);
  } else {
    shape = shapeSvg
      .insert('polygon', ':first-child')
      .attr('class', 'basic label-container chen-diamond')
      .attr('style', nodeStyles)
      .attr('points', pointsAttr(points));
  }

  node.width = width;
  node.height = height;
  updateNodeBounds(node, shape, { width, height });

  node.calcIntersect = (bounds: Bounds, point: Point) =>
    intersect.polygon(bounds, diamondPoints(bounds.width, bounds.height), point);
  node.intersect = (point) => intersect.polygon(node, points, point);

  return shapeSvg;
}

/** Double-line diamond: an identifying relationship. */
export async function chenDoubleDiamond<T extends SVGGraphicsElement>(
  parent: D3Selection<T>,
  node: Node
) {
  const { shapeSvg, bbox, nodeStyles } = await prepare(parent, node);

  const gap = CHEN_DOUBLE_GAP;
  const base = diamondSize(bbox);
  // Grow the outer diamond by the inset so the inner one keeps the single-diamond label room.
  const { dx, dy } = diamondInset(base.width, base.height, gap);
  const width = base.width + 2 * dx;
  const height = base.height + 2 * dy;
  const outer = diamondPoints(width, height);
  const inner = diamondPoints(width - 2 * dx, height - 2 * dy);

  const group = shapeSvg
    .insert('g', ':first-child')
    .attr('class', 'basic label-container chen-double-diamond');

  if (node.look === 'handDrawn') {
    // @ts-expect-error -- Passing a D3.Selection seems to work for some reason
    const rc = rough.svg(shapeSvg);
    const options = userNodeOverrides(node, {});
    appendRough(group, rc.path(polygonPathData(outer), options), nodeStyles);
    appendRough(group, rc.path(polygonPathData(inner), { ...options, fill: 'none' }), nodeStyles);
  } else {
    group
      .append('polygon')
      .attr('class', 'chen-double-diamond-outer')
      .attr('style', nodeStyles)
      .attr('points', pointsAttr(outer));
    group
      .append('polygon')
      .attr('class', 'chen-double-diamond-inner')
      .attr('style', nodeStyles)
      .attr('points', pointsAttr(inner));
  }

  node.width = width;
  node.height = height;
  updateNodeBounds(node, group, { width, height });

  node.calcIntersect = (bounds: Bounds, point: Point) =>
    intersect.polygon(bounds, diamondPoints(bounds.width, bounds.height), point);
  node.intersect = (point) => intersect.polygon(node, outer, point);

  return shapeSvg;
}

/** Inverted triangle with a circle at its centroid: a specialization / generalization. */
export async function chenIsa<T extends SVGGraphicsElement>(parent: D3Selection<T>, node: Node) {
  const { shapeSvg, nodeStyles } = await prepare(parent, node);

  const r = CHEN_ISA_RADIUS;
  // Top base, bottom apex; the centroid is the origin.
  const triangle: Point[] = [
    { x: -r, y: -r * 0.58 },
    { x: r, y: -r * 0.58 },
    { x: 0, y: r * 1.15 },
  ];
  const width = 2 * r;
  const height = r * 0.58 + r * 1.15;
  // The triangle's bounding box is not centred on its centroid; shift so the layout centre
  // (which the edge clipping assumes is the box centre) coincides with the drawn box centre.
  const shift = -(r * 1.15 - r * 0.58) / 2;

  const group = shapeSvg
    .insert('g', ':first-child')
    .attr('class', 'basic label-container chen-isa')
    .attr('transform', `translate(0, ${shift})`);

  if (node.look === 'handDrawn') {
    // @ts-expect-error -- Passing a D3.Selection seems to work for some reason
    const rc = rough.svg(shapeSvg);
    const options = userNodeOverrides(node, {});
    appendRough(group, rc.path(polygonPathData(triangle), options), nodeStyles);
    appendRough(
      group,
      rc.circle(0, 0, CHEN_ISA_CIRCLE_RADIUS * 2, { ...options, fill: 'none' }),
      nodeStyles
    );
  } else {
    group
      .append('polygon')
      .attr('class', 'chen-isa-triangle')
      .attr('style', nodeStyles)
      .attr('points', pointsAttr(triangle));
    group
      .append('circle')
      .attr('class', 'chen-isa-circle')
      .attr('style', nodeStyles)
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', CHEN_ISA_CIRCLE_RADIUS);
  }

  node.width = width;
  node.height = height;
  updateNodeBounds(node, group, { width, height });

  node.calcIntersect = (bounds: Bounds, point: Point) => intersect.polygon(bounds, triangle, point);
  node.intersect = (point) => intersect.polygon(node, triangle, point);

  return shapeSvg;
}

/** Oval: an attribute. The variant is read from `node.metadata.attrType`. */
export async function chenAttribute<T extends SVGGraphicsElement>(
  parent: D3Selection<T>,
  node: Node
) {
  const { shapeSvg, bbox, nodeStyles } = await prepare(parent, node);
  const attrType = (node.metadata?.attrType as ChenAttributeType | undefined) ?? 'simple';

  const rx = Math.max(bbox.width / 2 + 14, ATTR_MIN_RX);
  const ry = Math.max(bbox.height / 2 + 10, ATTR_MIN_RY);
  const multi = attrType === 'multivalued';
  const outerRx = multi ? rx + ATTR_MULTI_GAP : rx;
  const outerRy = multi ? ry + ATTR_MULTI_GAP : ry;

  const ovalClass =
    attrType === 'derived'
      ? 'chen-attr-derived'
      : attrType === 'key'
        ? 'chen-attr-key'
        : attrType === 'partialKey'
          ? 'chen-attr-partial-key'
          : 'chen-attr-oval';

  const group = shapeSvg
    .insert('g', ':first-child')
    .attr('class', `basic label-container ${multi ? 'chen-attr-multi' : 'chen-attr'}`);

  if (node.look === 'handDrawn') {
    // @ts-expect-error -- Passing a D3.Selection seems to work for some reason
    const rc = rough.svg(shapeSvg);
    const options = userNodeOverrides(
      node,
      attrType === 'derived' ? { strokeLineDash: [5, 4] } : {}
    );
    appendRough(group, rc.ellipse(0, 0, outerRx * 2, outerRy * 2, options), nodeStyles);
    if (multi) {
      appendRough(
        group,
        rc.ellipse(0, 0, rx * 2, ry * 2, { ...options, fill: 'none' }),
        nodeStyles
      );
    }
  } else {
    group
      .append('ellipse')
      .attr('class', ovalClass)
      .attr('style', nodeStyles)
      .attr('rx', outerRx)
      .attr('ry', outerRy)
      .attr('cx', 0)
      .attr('cy', 0);
    if (multi) {
      group
        .append('ellipse')
        .attr('class', 'chen-attr-multi-inner')
        .attr('style', nodeStyles)
        .attr('rx', rx)
        .attr('ry', ry)
        .attr('cx', 0)
        .attr('cy', 0);
    }
    if (attrType === 'derived') {
      group.select('ellipse').attr('stroke-dasharray', '5, 4');
    }
  }

  if (attrType === 'key' || attrType === 'partialKey') {
    const y = bbox.height / 2 + 2;
    const underline = group
      .append('line')
      .attr('class', attrType === 'key' ? 'chen-key-underline' : 'chen-partial-key-underline')
      .attr('x1', -bbox.width / 2)
      .attr('x2', bbox.width / 2)
      .attr('y1', y)
      .attr('y2', y);
    if (attrType === 'partialKey') {
      underline.attr('stroke-dasharray', '4, 3');
    }
  }

  node.width = outerRx * 2;
  node.height = outerRy * 2;
  updateNodeBounds(node, group, { width: node.width, height: node.height });

  node.calcIntersect = (bounds: Bounds, point: Point) =>
    intersect.ellipse(bounds, bounds.width / 2, bounds.height / 2, point);
  node.intersect = (point) => intersect.ellipse(node, outerRx, outerRy, point);

  return shapeSvg;
}
