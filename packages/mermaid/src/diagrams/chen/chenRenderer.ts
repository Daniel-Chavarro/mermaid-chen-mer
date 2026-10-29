import { select } from 'd3';
import { getConfig } from '../../diagram-api/diagramAPI.js';
import type { DrawDefinition, SVG } from '../../diagram-api/types.js';
import { log } from '../../logger.js';
import { getDiagramElement } from '../../rendering-util/insertElementsForSize.js';
import { getRegisteredLayoutAlgorithm, render } from '../../rendering-util/render.js';
import { setupViewPortForSVG } from '../../rendering-util/setupViewPortForSVG.js';
import type { Point } from '../../types.js';
import type { LayoutData } from '../../rendering-util/types.js';
import utils from '../../utils.js';
import type { ChenDB } from './chenTypes.js';

export function decodeDataPoints(raw: string | null): Point[] | null {
  if (!raw) {
    return null;
  }
  try {
    const json = typeof atob === 'function' ? atob(raw) : Buffer.from(raw, 'base64').toString();
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const pts: Point[] = [];
    for (const p of parsed) {
      if (p && typeof p.x === 'number' && typeof p.y === 'number') {
        pts.push({ x: p.x, y: p.y });
      }
    }
    return pts.length >= 2 ? pts : null;
  } catch {
    return null;
  }
}

export function parsePathD(d: string | null): Point[] | null {
  if (!d) {
    return null;
  }
  const pts: Point[] = [];
  const re = /[ML]\s*(-?[\d.]+)[,\s]+(-?[\d.]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(d)) !== null) {
    pts.push({ x: parseFloat(match[1]), y: parseFloat(match[2]) });
  }
  return pts.length >= 2 ? pts : null;
}

export function offsetPolyline(points: Point[], offset: number): Point[] {
  if (points.length < 2) {
    return points.map((p) => ({ ...p }));
  }
  const n = points.length;
  const segNormals: Point[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      segNormals.push({ x: 0, y: 1 });
    } else {
      segNormals.push({ x: -dy / len, y: dx / len });
    }
  }

  const result: Point[] = [];
  result.push({
    x: points[0].x + offset * segNormals[0].x,
    y: points[0].y + offset * segNormals[0].y,
  });

  for (let i = 1; i < n - 1; i++) {
    const n1 = segNormals[i - 1];
    const n2 = segNormals[i];
    const nx = (n1.x + n2.x) / 2;
    const ny = (n1.y + n2.y) / 2;
    const lenSq = nx * nx + ny * ny;
    if (lenSq < 0.001) {
      result.push({
        x: points[i].x + offset * n1.x,
        y: points[i].y + offset * n1.y,
      });
    } else {
      const miter = Math.min(2.0, 1 / lenSq);
      result.push({
        x: points[i].x + offset * nx * miter,
        y: points[i].y + offset * ny * miter,
      });
    }
  }

  result.push({
    x: points[n - 1].x + offset * segNormals[n - 2].x,
    y: points[n - 1].y + offset * segNormals[n - 2].y,
  });

  return result;
}

const formatPolyline = (points: Point[]): string =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

/**
 * Rewrites each edge with `doubleLine === true` into two parallel rail subpaths offset by
 * +/- 2px from the center line.
 */
export function renderChenDoubleEdges(svg: SVG, data: LayoutData): void {
  const doubleEdges = new Map(
    data.edges
      .filter((e) => e.metadata?.doubleLine === true)
      .map((e) => [e.id, e])
  );

  svg.selectAll<SVGPathElement, unknown>('path.chen-double-edge, path[data-et="edge"]').each(function () {
    const path = select(this);
    const edgeId = path.attr('data-id');
    const edge = doubleEdges.get(edgeId);
    if (!edge && !path.classed('chen-double-edge')) {
      return;
    }

    const points =
      decodeDataPoints(path.attr('data-points')) ?? parsePathD(path.attr('d'));
    if (!points || points.length < 2) {
      return;
    }

    const hasArrow = edge?.arrowTypeEnd && edge.arrowTypeEnd !== 'none';
    const retraction = hasArrow ? 6 : 0;
    const n = points.length;

    let railPoints = points;
    let retractedEnd: Point | null = null;
    if (retraction > 0) {
      const last = points[n - 1];
      const prev = points[n - 2];
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const len = Math.hypot(dx, dy);
      if (len > retraction) {
        retractedEnd = {
          x: last.x - (dx / len) * retraction,
          y: last.y - (dy / len) * retraction,
        };
        railPoints = [...points.slice(0, n - 1), retractedEnd];
      }
    }

    const rail1 = offsetPolyline(railPoints, 2);
    const rail2 = offsetPolyline(railPoints, -2);
    let compoundD = `${formatPolyline(rail1)} ${formatPolyline(rail2)}`;

    if (hasArrow && retractedEnd) {
      const last = points[n - 1];
      compoundD += ` M${retractedEnd.x.toFixed(2)},${retractedEnd.y.toFixed(2)} L${last.x.toFixed(2)},${last.y.toFixed(2)}`;
    }

    path.attr('d', compoundD);
  });
}

/**
 * Renders a small disjointness arc across the specialization edge between supertype and triangle.
 */
export function renderChenDisjointArcs(svg: SVG, data: LayoutData): void {
  const disjointEdges = data.edges.filter((e) => e.metadata?.disjointArc === true);
  if (disjointEdges.length === 0) {
    return;
  }

  const edgePathsGroup = svg.select('.edgePaths');
  const targetGroup = edgePathsGroup.empty() ? svg : edgePathsGroup;

  for (const edge of disjointEdges) {
    const path = svg.select<SVGPathElement>(`path[data-id="${edge.id}"]`);
    const points = path.empty()
      ? null
      : decodeDataPoints(path.attr('data-points')) ?? parsePathD(path.attr('d'));

    if (!points || points.length < 2) {
      continue;
    }

    const p0 = points[0];
    const pLast = points[points.length - 1];
    const dx = pLast.x - p0.x;
    const dy = pLast.y - p0.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) {
      continue;
    }

    const tx = dx / len;
    const ty = dy / len;
    const nx = -ty;
    const ny = tx;

    const mx = (p0.x + pLast.x) / 2;
    const my = (p0.y + pLast.y) / 2;

    const span = 12;
    const bow = 12; // Control point offset gives ~6px bow at midpoint

    const sx = mx - span * nx;
    const sy = my - span * ny;
    const ex = mx + span * nx;
    const ey = my + span * ny;
    const cx = mx + bow * tx;
    const cy = my + bow * ty;

    const d = `M${sx.toFixed(2)},${sy.toFixed(2)} Q${cx.toFixed(2)},${cy.toFixed(2)} ${ex.toFixed(2)},${ey.toFixed(2)}`;

    targetGroup
      .append('path')
      .attr('class', 'chen-disjoint-arc')
      .attr('d', d)
      .attr('data-edge-id', edge.id);
  }
}

const draw: DrawDefinition = async (_text, id, _version, diag) => {
  log.info('Drawing chen diagram (unified)', id);
  const config = getConfig();
  const { securityLevel, chen: conf, layout } = config;

  const chenDb = diag.db as ChenDB;
  const data4Layout = chenDb.getData();
  const svg = getDiagramElement(id, securityLevel);

  data4Layout.type = 'chen';
  data4Layout.layoutAlgorithm = getRegisteredLayoutAlgorithm(layout);
  data4Layout.direction = chenDb.getDirection();
  data4Layout.markers = ['point'];
  data4Layout.diagramId = id;

  data4Layout.config.flowchart = data4Layout.config.flowchart ?? {};
  data4Layout.config.flowchart.nodeSpacing = conf?.nodeSpacing ?? 60;
  data4Layout.config.flowchart.rankSpacing = conf?.rankSpacing ?? 60;

  await render(data4Layout, svg);

  renderChenDoubleEdges(svg, data4Layout);
  renderChenDisjointArcs(svg, data4Layout);

  const padding = conf?.diagramPadding ?? 20;
  utils.insertTitle(
    svg,
    'chenDiagramTitleText',
    conf?.titleTopMargin ?? 25,
    chenDb.getDiagramTitle?.() ?? ''
  );

  setupViewPortForSVG(svg, padding, 'chenDiagram', conf?.useMaxWidth ?? true);
};

export const renderer = { draw };
