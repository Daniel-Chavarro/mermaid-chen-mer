import { select } from 'd3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Diagram } from '../../Diagram.js';
import * as configApi from '../../config.js';
import { addDiagrams } from '../../diagram-api/diagram-orchestration.js';
import { UNIVERSITY_LIBRARY } from './chen.spec.js';
import {
  decodeDataPoints,
  offsetPolyline,
  parsePathD,
  renderChenDisjointArcs,
  renderChenDoubleEdges,
} from './chenRenderer.js';
import type { Edge, LayoutData } from '../../rendering-util/types.js';
import type { SVG } from '../../diagram-api/types.js';
import type { ChenDB } from './chenTypes.js';

const box = (x: number, y: number, width: number, height: number): DOMRect =>
  ({
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  }) as DOMRect;
beforeAll(() => {
  addDiagrams();
});

const originalGetBBox = Object.getOwnPropertyDescriptor(SVGElement.prototype, 'getBBox');
const originalGetComputedTextLength = Object.getOwnPropertyDescriptor(
  SVGElement.prototype,
  'getComputedTextLength'
);
const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'getBoundingClientRect'
);

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, 'getBBox', {
    configurable: true,
    value(this: SVGElement) {
      const tag = this.tagName.toLowerCase();
      if (tag === 'rect') {
        const x = parseFloat(this.getAttribute('x') ?? '0');
        const y = parseFloat(this.getAttribute('y') ?? '0');
        const width = parseFloat(this.getAttribute('width') ?? '50');
        const height = parseFloat(this.getAttribute('height') ?? '30');
        return box(x, y, width, height);
      }
      if (tag === 'ellipse') {
        const rx = parseFloat(this.getAttribute('rx') ?? '30');
        const ry = parseFloat(this.getAttribute('ry') ?? '15');
        return box(-rx, -ry, rx * 2, ry * 2);
      }
      if (tag === 'circle') {
        const r = parseFloat(this.getAttribute('r') ?? '8');
        return box(-r, -r, r * 2, r * 2);
      }
      if (tag === 'polygon') {
        const pts = (this.getAttribute('points') ?? '')
          .trim()
          .split(/\s+/)
          .map((pair) => pair.split(',').map(Number));
        if (pts.length > 0 && !isNaN(pts[0][0])) {
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          return box(minX, minY, maxX - minX, maxY - minY);
        }
        return box(-45, -23, 90, 46);
      }
      if (tag === 'text' || tag === 'tspan') {
        const len = (this.textContent?.length ?? 5) * 8;
        return box(-len / 2, -8, len, 16);
      }
      const children = [...this.children].filter((c): c is SVGGraphicsElement => c instanceof SVGElement);
      if (children.length === 0) {
        return box(0, 0, 50, 20);
      }
      const boxes = children.map((c) => c.getBBox());
      const minX = Math.min(...boxes.map((b) => b.x));
      const minY = Math.min(...boxes.map((b) => b.y));
      const maxX = Math.max(...boxes.map((b) => b.x + b.width));
      const maxY = Math.max(...boxes.map((b) => b.y + b.height));
      return box(minX, minY, maxX - minX, maxY - minY);
    },
  });

  Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', {
    configurable: true,
    value(this: SVGElement) {
      return (this.textContent?.length ?? 5) * 8;
    },
  });

  Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
    configurable: true,
    value(this: Element) {
      return box(0, 0, 80, 24);
    },
  });
});

afterAll(() => {
  if (originalGetBBox) {
    Object.defineProperty(SVGElement.prototype, 'getBBox', originalGetBBox);
  }
  if (originalGetComputedTextLength) {
    Object.defineProperty(SVGElement.prototype, 'getComputedTextLength', originalGetComputedTextLength);
  }
  if (originalGetBoundingClientRect) {
    Object.defineProperty(Element.prototype, 'getBoundingClientRect', originalGetBoundingClientRect);
  }
});

describe('chenRenderer', () => {
  beforeEach(() => {
    configApi.reset();
    configApi.setConfig({ htmlLabels: false, flowchart: { htmlLabels: false } });
  });

  describe('geometry helpers', () => {
    it('offsets a horizontal polyline into parallel rails', () => {
      const points = [
        { x: 0, y: 10 },
        { x: 100, y: 10 },
      ];
      const rail1 = offsetPolyline(points, 2);
      const rail2 = offsetPolyline(points, -2);
      expect(rail1).toEqual([
        { x: 0, y: 12 },
        { x: 100, y: 12 },
      ]);
      expect(rail2).toEqual([
        { x: 0, y: 8 },
        { x: 100, y: 8 },
      ]);
    });

    it('decodes base64 data-points and parses path d as fallback', () => {
      const pts = [
        { x: 10, y: 20 },
        { x: 50, y: 60 },
      ];
      const encoded = btoa(JSON.stringify(pts));
      expect(decodeDataPoints(encoded)).toEqual(pts);
      expect(parsePathD('M 10 20 L 50 60')).toEqual(pts);
    });

    it('rewrites double-line edges into two M subpaths', () => {
      document.body.innerHTML = `
        <svg id="test-double">
          <g class="edgePaths">
            <path id="e1" class="chen-double-edge" data-et="edge" data-id="e1" d="M 0 10 L 100 10"></path>
          </g>
        </svg>
      `;
      const svg = select<SVGSVGElement, unknown>('#test-double') as SVG;
      const data: LayoutData = {
        nodes: [],
        edges: [
          {
            id: 'e1',
            start: 'A',
            end: 'B',
            arrowTypeEnd: 'none',
            metadata: { doubleLine: true },
          },
        ],
        config: configApi.getConfig(),
      };
      renderChenDoubleEdges(svg, data);
      const d = svg.select('#e1').attr('d');
      const mMatches = d.match(/M/g);
      expect(mMatches?.length).toBe(2);
    });

    it('appends a disjoint arc across specialization edges', () => {
      document.body.innerHTML = `
        <svg id="test-arc">
          <g class="edgePaths">
            <path id="isa-e" data-et="edge" data-id="isa-e" d="M 50 10 L 50 100"></path>
          </g>
        </svg>
      `;
      const svg = select<SVGSVGElement, unknown>('#test-arc') as SVG;
      const data: LayoutData = {
        nodes: [],
        edges: [
          {
            id: 'isa-e',
            start: 'Super',
            end: 'Isa',
            metadata: { disjointArc: true },
          },
        ],
        config: configApi.getConfig(),
      };
      renderChenDisjointArcs(svg, data);
      const arc = svg.select('path.chen-disjoint-arc');
      expect(arc.empty()).toBe(false);
      expect(arc.attr('d')).toContain('Q');
    });
  });

  describe('end-to-end full University/Library diagram rendering', () => {
    it('renders the complete reference diagram with all shapes and edge constructs', async () => {
      const diagramId = 'chen-univ-lib';
      document.body.innerHTML = `<svg id="${diagramId}"><g></g></svg>`;

      const diag = await Diagram.fromText(UNIVERSITY_LIBRARY);
      await diag.render(diagramId, '1.0');

      const svg = select(`#${diagramId}`);

      // 1. Weak entity: Ejemplar has g.chen-weak-entity with 2 <rect> children
      const weakEntity = svg.select('.chen-weak-entity');
      expect(weakEntity.empty()).toBe(false);
      expect(weakEntity.selectAll('rect').size()).toBe(2);

      // 2. Identifying relationship: Tiene has g.chen-double-diamond with 2 <polygon> children
      const doubleDiamond = svg.select('.chen-double-diamond');
      expect(doubleDiamond.empty()).toBe(false);
      expect(doubleDiamond.selectAll('polygon').size()).toBe(2);

      // 3. ISA symbol and disjoint arc
      const isa = svg.select('.chen-isa');
      expect(isa.empty()).toBe(false);
      expect(isa.select('polygon.chen-isa-triangle').empty()).toBe(false);
      expect(isa.select('circle.chen-isa-circle').empty()).toBe(false);
      const disjointArc = svg.select('path.chen-disjoint-arc');
      expect(disjointArc.empty()).toBe(false);

      // 4. Double-line edges with two M subpaths in d
      const doubleEdges = svg.selectAll<SVGPathElement, unknown>('path.chen-double-edge');
      expect(doubleEdges.size()).toBeGreaterThanOrEqual(2);
      doubleEdges.each(function () {
        const d = select(this).attr('d');
        const mCount = (d.match(/M/g) ?? []).length;
        expect(mCount).toBeGreaterThanOrEqual(2);
      });

      // 5. Arrowhead marker points to Libro on Libro <-(1)- Tiene
      const tieneLibroEdge = (diag.db as ChenDB)
        .getData()
        .edges.find((e: Edge) => e.start === 'Tiene' && e.end === 'Libro')!;
      const tieneLink = svg.select(`path[data-id="${tieneLibroEdge.id}"]`);
      expect(tieneLink.empty()).toBe(false);
      expect(tieneLink.attr('marker-end')).toContain('pointEnd');

      // 6. Multivalued attribute: telefonos has g.chen-attr-multi with 2 <ellipse> children
      const multiAttr = svg.select('.chen-attr-multi');
      expect(multiAttr.empty()).toBe(false);
      expect(multiAttr.selectAll('ellipse').size()).toBe(2);

      // 7. Derived attribute has stroke-dasharray
      const derivedAttr = svg.select('ellipse.chen-attr-derived');
      expect(derivedAttr.empty()).toBe(false);
      expect(derivedAttr.attr('stroke-dasharray')).toBe('5, 4');

      // 8. Primary key underline and partial key dashed underline
      const keyUnderline = svg.select('line.chen-key-underline');
      expect(keyUnderline.empty()).toBe(false);
      const partialKeyUnderline = svg.select('line.chen-partial-key-underline');
      expect(partialKeyUnderline.empty()).toBe(false);
      expect(partialKeyUnderline.attr('stroke-dasharray')).toBe('4, 3');

      // 9. Aggregation Agregado_Imparte renders as cluster with dashed border
      const aggregationCluster = svg.select('.chen-aggregation');
      expect(aggregationCluster.empty()).toBe(false);
      const clusterRect = aggregationCluster.select('rect');
      expect(clusterRect.empty()).toBe(false);
      expect(clusterRect.attr('style')).toContain('stroke-dasharray');

      // 10. Composite attribute direccion connects to Estudiante and to children
      const chenDb = diag.db as ChenDB;
      const edges = chenDb.getData().edges;
      const direccionEdges = edges.filter(
        (e: Edge) => e.start === 'Estudiante__direccion' || e.end === 'Estudiante__direccion'
      );
      expect(direccionEdges.length).toBeGreaterThanOrEqual(3); // to Estudiante, to calle, to carrera
      const calleToEstudiante = edges.find(
        (e: Edge) =>
          (e.start === 'Estudiante' && e.end === 'Estudiante__direccion__calle') ||
          (e.end === 'Estudiante' && e.start === 'Estudiante__direccion__calle')
      );
      expect(calleToEstudiante).toBeUndefined();
    });
  });
});
