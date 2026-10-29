import type { LayoutData, Edge, Node } from '../../rendering-util/types.js';
import { getConfig } from '../../diagram-api/diagramAPI.js';
import {
  clear as commonClear,
  getAccDescription,
  getAccTitle,
  getDiagramTitle,
  setAccDescription,
  setAccTitle,
  setDiagramTitle,
} from '../common/commonDb.js';
import type {
  ChenAST,
  ChenAggregationNode,
  ChenAttributeDecl,
  ChenAttributeNode,
  ChenClassDef,
  ChenDB,
  ChenDirection,
  ChenEntityNode,
  ChenLeg,
  ChenRelationshipLink,
  ChenRelationshipNode,
  ChenSpecializationDecl,
  ChenSpecializationNode,
  ChenSymbolKind,
} from './chenTypes.js';
import { kindOfSymbol, validateChenModel } from './chenValidator.js';

interface AggregationScope {
  /** Entities declared directly inside the block. */
  entities: Set<string>;
  /** Relationships declared directly inside the block. */
  relationships: Set<string>;
  /** Aggregations declared directly inside the block. */
  aggregations: Set<string>;
  /** Ordered `[relationship, target]` pairs of the links written directly inside the block. */
  links: ChenRelationshipLink[];
}

interface PendingLeg {
  leg: ChenLeg;
  scope?: string;
}

const DEFAULT_DIRECTION: ChenDirection = 'TB';

export class ChenDb implements ChenDB {
  private symbols = new Map<string, ChenSymbolKind>();
  private entities = new Map<string, ChenEntityNode>();
  private relationships = new Map<string, ChenRelationshipNode>();
  private aggregations = new Map<string, ChenAggregationNode>();
  private specializations = new Map<string, ChenSpecializationNode>();
  private attributes = new Map<string, ChenAttributeNode>();
  private links: ChenRelationshipLink[] = [];
  private legs: PendingLeg[] = [];
  private scopes = new Map<string, AggregationScope>();
  private scopeStack: string[] = [];
  private classes = new Map<string, ChenClassDef>();
  private classAssignments = new Map<string, string[]>();
  private styleAssignments = new Map<string, string[]>();
  private direction: ChenDirection = DEFAULT_DIRECTION;
  private finalized = false;

  constructor() {
    this.clear();
  }

  public setAccTitle = setAccTitle;
  public getAccTitle = getAccTitle;
  public setAccDescription = setAccDescription;
  public getAccDescription = getAccDescription;
  public setDiagramTitle = setDiagramTitle;
  public getDiagramTitle = getDiagramTitle;

  public clear(): void {
    this.symbols = new Map();
    this.entities = new Map();
    this.relationships = new Map();
    this.aggregations = new Map();
    this.specializations = new Map();
    this.attributes = new Map();
    this.links = [];
    this.legs = [];
    this.scopes = new Map();
    this.scopeStack = [];
    this.classes = new Map();
    this.classAssignments = new Map();
    this.styleAssignments = new Map();
    this.direction = DEFAULT_DIRECTION;
    this.finalized = false;
    commonClear();
  }

  private currentScope(): AggregationScope | undefined {
    const id = this.scopeStack.at(-1);
    return id === undefined ? undefined : this.scopes.get(id);
  }

  private register(id: string, kind: ChenSymbolKind): void {
    const existing = this.symbols.get(id);
    if (existing) {
      throw new Error(`Symbol '${id}' is already defined as a ${existing}`);
    }
    this.symbols.set(id, kind);
  }

  public addEntity(id: string, label: string | undefined, weak: boolean): ChenEntityNode {
    this.register(id, 'entity');
    const entity: ChenEntityNode = {
      kind: 'entity',
      id,
      label: label ?? id,
      weak,
      attributes: [],
      cssClasses: [],
      cssStyles: [],
    };
    this.entities.set(id, entity);
    this.currentScope()?.entities.add(id);
    return entity;
  }

  public addRelationship(
    id: string,
    label: string | undefined,
    identifying: boolean
  ): ChenRelationshipNode {
    this.register(id, 'relationship');
    const relationship: ChenRelationshipNode = {
      kind: 'relationship',
      id,
      label: label ?? id,
      identifying,
      attributes: [],
      cssClasses: [],
      cssStyles: [],
    };
    this.relationships.set(id, relationship);
    this.currentScope()?.relationships.add(id);
    return relationship;
  }

  public addAttribute(decl: ChenAttributeDecl): string {
    const id = decl.explicitId ?? `${decl.ownerId}__${decl.name}`;
    this.register(id, 'attribute');
    this.attributes.set(id, {
      kind: 'attribute',
      id,
      name: decl.name,
      label: decl.label ?? decl.name,
      attrType: decl.attrType,
      ownerId: decl.ownerId,
      // Resolved in `finalize`, once every owner has been declared.
      ownerKind: 'entity',
      children: [],
      cssClasses: [],
      cssStyles: [],
    });
    return id;
  }

  public addLeg(leg: ChenLeg): void {
    this.legs.push({ leg, scope: this.scopeStack.at(-1) });
  }

  public addSpecialization(decl: ChenSpecializationDecl): void {
    this.register(decl.id, 'specialization');
    this.specializations.set(decl.id, {
      kind: 'specialization',
      ...decl,
      subtypeIds: [...decl.subtypeIds],
      cssClasses: [],
      cssStyles: [],
    });
  }

  public beginAggregation(id: string, label: string | undefined): void {
    this.register(id, 'aggregation');
    const parentId = this.scopeStack.at(-1);
    this.aggregations.set(id, {
      kind: 'aggregation',
      id,
      label: label ?? '',
      participants: [],
      relationshipIds: [],
      parentId,
      cssClasses: [],
      cssStyles: [],
    });
    this.scopes.set(id, {
      entities: new Set(),
      relationships: new Set(),
      aggregations: new Set(),
      links: [],
    });
    this.currentScope()?.aggregations.add(id);
    this.scopeStack.push(id);
  }

  public endAggregation(): void {
    this.scopeStack.pop();
  }

  public setDirection(direction: ChenDirection): void {
    this.direction = direction;
  }

  public getDirection(): ChenDirection {
    return this.direction;
  }

  public addClass(ids: string[], styles: string[]): void {
    for (const id of ids) {
      let classDef = this.classes.get(id);
      if (!classDef) {
        classDef = { id, styles: [], textStyles: [] };
        this.classes.set(id, classDef);
      }
      for (const style of styles) {
        if (/color/.test(style)) {
          classDef.textStyles.push(style.replace('fill', 'bgFill'));
        }
        classDef.styles.push(style);
      }
    }
  }

  public setClass(ids: string[], classNames: string[]): void {
    for (const id of ids) {
      this.classAssignments.set(id, [...(this.classAssignments.get(id) ?? []), ...classNames]);
    }
  }

  public addCssStyles(ids: string[], styles: string[]): void {
    for (const id of ids) {
      this.styleAssignments.set(id, [...(this.styleAssignments.get(id) ?? []), ...styles]);
    }
  }

  // --------------------------------------------------------------------------------------------
  // Finalization
  // --------------------------------------------------------------------------------------------

  private ensureEntity(id: string): void {
    if (!this.symbols.has(id)) {
      this.addEntity(id, undefined, false);
    }
  }

  private resolveLeg({ leg, scope }: PendingLeg): ChenRelationshipLink {
    const { left, right, connector } = leg;
    let side = leg.relationshipSide;
    if (side === undefined) {
      const leftIsRel = this.relationships.has(left);
      const rightIsRel = this.relationships.has(right);
      if (leftIsRel && rightIsRel) {
        throw new Error(
          `Invalid relationship endpoint '${leftIsRel ? right : left}': expected entity or aggregation, got relationship`
        );
      }
      if (!leftIsRel && !rightIsRel) {
        throw new Error(
          `Cannot tell which of '${left}' and '${right}' is the relationship; declare it with 'rel <id>'`
        );
      }
      side = leftIsRel ? 'left' : 'right';
    }
    const relationshipId = side === 'left' ? left : right;
    const targetId = side === 'left' ? right : left;

    if (!this.symbols.has(relationshipId)) {
      this.addRelationship(relationshipId, undefined, false);
      if (scope) {
        this.scopes.get(scope)!.relationships.add(relationshipId);
      }
    } else if (!this.relationships.has(relationshipId)) {
      throw new Error(
        `Expected a relationship in '${left} ${right}' but '${relationshipId}' is a ${this.symbols.get(relationshipId)}`
      );
    }

    this.ensureEntity(targetId);
    const targetKind = this.symbols.get(targetId)!;
    if (targetKind !== 'entity' && targetKind !== 'aggregation') {
      throw new Error(
        `Invalid relationship endpoint '${targetId}': expected entity or aggregation, got ${targetKind}`
      );
    }

    // The arrowhead must sit at the target end of the connector.
    const arrowAtTarget = side === 'left' ? connector.arrowRight : connector.arrowLeft;
    const arrowAtRelationship = side === 'left' ? connector.arrowLeft : connector.arrowRight;
    if (arrowAtRelationship) {
      throw new Error(
        `Arrowhead must point at the entity or aggregation '${targetId}', not at relationship '${relationshipId}'`
      );
    }

    return {
      id: `link-${this.links.length}`,
      relationshipId,
      targetId,
      targetKind,
      cardinality: arrowAtTarget ? 'one' : 'many',
      cardinalityLabel: connector.cardinalityLabel,
      participation: connector.participation,
      role: leg.role,
    };
  }

  private resolveAttributes(): void {
    for (const attribute of this.attributes.values()) {
      const kind = kindOfSymbol(this.getAST(), attribute.ownerId);
      if (kind !== 'entity' && kind !== 'relationship' && kind !== 'attribute') {
        throw new Error(
          `Attribute '${attribute.name}' cannot belong to '${attribute.ownerId}' (${kind ?? 'undefined symbol'}); expected an entity, relationship or composite attribute`
        );
      }
      attribute.ownerKind = kind;
    }
    for (const attribute of this.attributes.values()) {
      if (attribute.ownerKind === 'attribute') {
        const parent = this.attributes.get(attribute.ownerId)!;
        parent.children.push(attribute.id);
        if (parent.attrType === 'simple') {
          parent.attrType = 'composite';
        }
      } else if (attribute.ownerKind === 'entity') {
        this.entities.get(attribute.ownerId)!.attributes.push(attribute.id);
      } else {
        this.relationships.get(attribute.ownerId)!.attributes.push(attribute.id);
      }
    }
  }

  private assignAggregations(): void {
    // `Map` iteration is in declaration order, so enclosing aggregations come first.
    for (const aggregation of this.aggregations.values()) {
      const scope = this.scopes.get(aggregation.id)!;
      const participants = new Set<string>([...scope.entities, ...scope.aggregations]);
      const relationships = new Set<string>(scope.relationships);
      for (const link of scope.links) {
        participants.add(link.targetId);
        relationships.add(link.relationshipId);
      }
      aggregation.participants = [...participants];
      aggregation.relationshipIds = [...relationships];

      for (const id of aggregation.participants) {
        const entity = this.entities.get(id);
        if (entity && entity.parentId === undefined) {
          entity.parentId = aggregation.id;
        }
      }
      for (const id of aggregation.relationshipIds) {
        const relationship = this.relationships.get(id);
        if (!relationship) {
          continue;
        }
        if (relationship.parentId !== undefined && relationship.parentId !== aggregation.id) {
          throw new Error(
            `Relationship '${id}' is already encapsulated by aggregation '${relationship.parentId}' and cannot also belong to '${aggregation.id}'`
          );
        }
        relationship.parentId = aggregation.id;
      }
    }

    const inherit = (attribute: ChenAttributeNode): string | undefined => {
      const owner =
        attribute.ownerKind === 'entity'
          ? this.entities.get(attribute.ownerId)
          : attribute.ownerKind === 'relationship'
            ? this.relationships.get(attribute.ownerId)
            : undefined;
      return owner
        ? owner.parentId
        : inherit(this.attributes.get(attribute.ownerId) as ChenAttributeNode);
    };
    for (const attribute of this.attributes.values()) {
      attribute.parentId = inherit(attribute);
    }
  }

  public finalize(): void {
    if (this.finalized) {
      return;
    }
    // Resolve the specialization endpoints first so unknown names become entities.
    for (const spec of this.specializations.values()) {
      this.ensureEntity(spec.supertypeId);
      for (const id of spec.subtypeIds) {
        this.ensureEntity(id);
      }
    }
    for (const pending of this.legs) {
      const link = this.resolveLeg(pending);
      this.links.push(link);
      if (pending.scope) {
        this.scopes.get(pending.scope)!.links.push(link);
      }
    }
    this.resolveAttributes();
    this.assignAggregations();
    validateChenModel(this.getAST());
    this.finalized = true;
  }

  public getAST(): ChenAST {
    return {
      entities: this.entities,
      relationships: this.relationships,
      links: this.links,
      aggregations: this.aggregations,
      specializations: this.specializations,
      attributes: this.attributes,
    };
  }

  // --------------------------------------------------------------------------------------------
  // Layout data
  // --------------------------------------------------------------------------------------------

  private compiledStyles(classNames: string[]): string[] {
    const compiled: string[] = [];
    for (const name of classNames) {
      const def = this.classes.get(name);
      if (def) {
        compiled.push(...def.styles, ...def.textStyles);
      }
    }
    return compiled.map((s) => s.trim());
  }

  /** Style/class state shared by every node kind. */
  private decorate(
    id: string,
    baseClasses: string,
    own: { cssClasses: string[]; cssStyles: string[] }
  ) {
    const classNames = [...own.cssClasses, ...(this.classAssignments.get(id) ?? [])];
    return {
      cssClasses: [baseClasses, ...classNames].join(' '),
      cssCompiledStyles: this.compiledStyles(classNames),
      cssStyles: [...own.cssStyles, ...(this.styleAssignments.get(id) ?? [])],
    };
  }

  public getData(): LayoutData {
    this.finalize();
    const config = getConfig();
    const { look } = config;
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const depthOf = (aggregation: ChenAggregationNode): number => {
      let depth = 0;
      for (let id = aggregation.parentId; id !== undefined; ) {
        depth++;
        id = this.aggregations.get(id)?.parentId;
      }
      return depth;
    };
    const clusters = [...this.aggregations.values()].sort((a, b) => depthOf(a) - depthOf(b));
    for (const aggregation of clusters) {
      const decorated = this.decorate(aggregation.id, 'chen-aggregation', aggregation);
      nodes.push({
        id: aggregation.id,
        label: aggregation.label,
        isGroup: true,
        shape: 'rect',
        rx: 8,
        ry: 8,
        padding: 14,
        parentId: aggregation.parentId,
        look,
        ...decorated,
        cssStyles: ['stroke-dasharray: 6, 4', ...decorated.cssStyles],
      });
    }

    let colorIndex = 0;
    const colorOf = new Map<string, number>();
    for (const entity of this.entities.values()) {
      colorOf.set(entity.id, colorIndex);
      nodes.push({
        id: entity.id,
        label: entity.label,
        isGroup: false,
        shape: entity.weak ? 'chenWeakEntity' : 'chenEntity',
        padding: 8,
        parentId: entity.parentId,
        look,
        colorIndex: colorIndex++,
        ...this.decorate(entity.id, 'chen-entity-node', entity),
      });
    }
    for (const relationship of this.relationships.values()) {
      colorOf.set(relationship.id, colorIndex);
      nodes.push({
        id: relationship.id,
        label: relationship.label,
        isGroup: false,
        shape: relationship.identifying ? 'chenDoubleDiamond' : 'chenDiamond',
        padding: 8,
        parentId: relationship.parentId,
        look,
        colorIndex: colorIndex++,
        ...this.decorate(relationship.id, 'chen-relationship-node', relationship),
      });
    }
    for (const spec of this.specializations.values()) {
      nodes.push({
        id: spec.id,
        label: '',
        isGroup: false,
        shape: 'chenIsa',
        padding: 0,
        parentId: spec.parentId,
        look,
        colorIndex: colorIndex++,
        ...this.decorate(spec.id, 'chen-isa-node', spec),
      });
    }
    const rootColor = (attribute: ChenAttributeNode): number | undefined =>
      attribute.ownerKind === 'attribute'
        ? rootColor(this.attributes.get(attribute.ownerId)!)
        : colorOf.get(attribute.ownerId);
    for (const attribute of this.attributes.values()) {
      nodes.push({
        id: attribute.id,
        label: attribute.label,
        isGroup: false,
        shape: 'chenAttribute',
        padding: 8,
        parentId: attribute.parentId,
        look,
        colorIndex: rootColor(attribute),
        metadata: { attrType: attribute.attrType },
        ...this.decorate(attribute.id, 'chen-attribute-node', attribute),
      });
    }

    const edgeBase = {
      type: 'normal',
      curve: 'linear',
      thickness: 'normal',
      pattern: 'solid',
      arrowTypeStart: 'none',
      look,
    } as const;

    for (const attribute of this.attributes.values()) {
      edges.push({
        ...edgeBase,
        id: `attr-${attribute.ownerId}-${attribute.id}`,
        start: attribute.ownerId,
        end: attribute.id,
        arrowTypeEnd: 'none',
        classes: 'chen-attr-edge',
      });
    }

    for (const link of this.links) {
      const total = link.participation === 'total';
      edges.push({
        ...edgeBase,
        id: link.id,
        start: link.relationshipId,
        end: link.targetId,
        label: link.role,
        labelpos: 'c',
        labelType: 'text',
        endLabelLeft: link.cardinalityLabel,
        arrowTypeEnd: link.cardinality === 'one' ? 'arrow_point' : 'none',
        classes: `relationshipLine chen-link${total ? ' chen-double-edge' : ''}`,
        metadata: { doubleLine: total },
      });
    }

    for (const spec of this.specializations.values()) {
      const total = spec.participation === 'total';
      edges.push({
        ...edgeBase,
        id: `isa-${spec.id}-super`,
        start: spec.supertypeId,
        end: spec.id,
        arrowTypeEnd: 'none',
        classes: `chen-isa-edge${total ? ' chen-double-edge' : ''}`,
        metadata: { doubleLine: total, disjointArc: spec.disjointness === 'disjoint' },
      });
      for (const subtypeId of spec.subtypeIds) {
        edges.push({
          ...edgeBase,
          id: `isa-${spec.id}-${subtypeId}`,
          start: spec.id,
          end: subtypeId,
          arrowTypeEnd: 'none',
          classes: 'chen-isa-edge',
        });
      }
    }

    return { nodes, edges, other: {}, config, direction: this.direction };
  }
}

export const db = new ChenDb();
