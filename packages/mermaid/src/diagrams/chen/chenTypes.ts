import type { DiagramDB } from '../../diagram-api/types.js';
import type { LayoutData } from '../../rendering-util/types.js';

export interface ChenEntityNode {
  kind: 'entity';
  id: string;
  label: string;
  /** `false` = single-line rectangle, `true` = double-line rectangle. */
  weak: boolean;
  /** Top-level attribute IDs attached to this entity. */
  attributes: string[];
  /** Enclosing aggregation ID. */
  parentId?: string;
  cssClasses: string[];
  cssStyles: string[];
}

export interface ChenRelationshipNode {
  kind: 'relationship';
  id: string;
  label: string;
  /** `false` = diamond, `true` = double-line diamond. */
  identifying: boolean;
  /** Top-level attribute IDs attached to this relationship. */
  attributes: string[];
  parentId?: string;
  cssClasses: string[];
  cssStyles: string[];
}

export interface ChenRelationshipLink {
  id: string;
  relationshipId: string;
  /** Entity ID or aggregation ID. */
  targetId: string;
  targetKind: 'entity' | 'aggregation';
  /** `one` = arrowhead pointing at the target, `many` = plain line. */
  cardinality: 'one' | 'many';
  /** Optional printed label such as `1`, `N` or `M`. */
  cardinalityLabel?: string;
  /** `partial` = single line, `total` = double line. */
  participation: 'partial' | 'total';
  role?: string;
}

export interface ChenAggregationNode {
  kind: 'aggregation';
  id: string;
  label: string;
  /**
   * Distinct entity / nested-aggregation IDs encapsulated by this aggregation. A valid model has
   * exactly 2; the list is kept open so the validator can report the real count.
   */
  participants: string[];
  /** Relationships encapsulated by this aggregation. A valid model has exactly 1. */
  relationshipIds: string[];
  /** Enclosing aggregation ID when nested. */
  parentId?: string;
  cssClasses: string[];
  cssStyles: string[];
}

export interface ChenSpecializationNode {
  kind: 'specialization';
  id: string;
  supertypeId: string;
  subtypeIds: string[];
  participation: 'total' | 'partial';
  disjointness: 'disjoint' | 'overlapping';
  parentId?: string;
  cssClasses: string[];
  cssStyles: string[];
}

export type ChenAttributeKind =
  | 'simple'
  | 'key'
  | 'partialKey'
  | 'multivalued'
  | 'derived'
  | 'composite';

export interface ChenAttributeNode {
  kind: 'attribute';
  id: string;
  name: string;
  label: string;
  attrType: ChenAttributeKind;
  /** Entity, relationship or parent attribute ID. */
  ownerId: string;
  ownerKind: 'entity' | 'relationship' | 'attribute';
  /** Child attribute IDs; non-empty iff `attrType === 'composite'`. */
  children: string[];
  /** Inherited aggregation ID. */
  parentId?: string;
  cssClasses: string[];
  cssStyles: string[];
}

export type ChenSymbol =
  | ChenEntityNode
  | ChenRelationshipNode
  | ChenAggregationNode
  | ChenSpecializationNode
  | ChenAttributeNode;

export type ChenSymbolKind = ChenSymbol['kind'];

export interface ChenAST {
  entities: Map<string, ChenEntityNode>;
  relationships: Map<string, ChenRelationshipNode>;
  links: ChenRelationshipLink[];
  aggregations: Map<string, ChenAggregationNode>;
  specializations: Map<string, ChenSpecializationNode>;
  attributes: Map<string, ChenAttributeNode>;
}

export type ChenDirection = 'TB' | 'BT' | 'LR' | 'RL';

export interface ChenClassDef {
  id: string;
  styles: string[];
  textStyles: string[];
}

/** A connector such as `<-(1)-`, `==(N)==` or `-->`, decoded. */
export interface ChenConnector {
  participation: 'partial' | 'total';
  /** Arrowhead at the left end of the connector. */
  arrowLeft: boolean;
  /** Arrowhead at the right end of the connector. */
  arrowRight: boolean;
  cardinalityLabel?: string;
}

/**
 * One `<left> <connector> <right>` statement. Which side is the relationship is only known once
 * every declaration has been seen, so legs are resolved when the model is finalized.
 */
export interface ChenLeg {
  left: string;
  right: string;
  connector: ChenConnector;
  role?: string;
  /** Chain legs (`A - R - B`) always have the relationship in the middle. */
  relationshipSide?: 'left' | 'right';
}

export interface ChenAttributeDecl {
  /** Written name; the id is derived from it unless `explicitId` is set. */
  name: string;
  attrType: ChenAttributeKind;
  explicitId?: string;
  label?: string;
  ownerId: string;
}

export interface ChenSpecializationDecl {
  id: string;
  supertypeId: string;
  subtypeIds: string[];
  participation: 'total' | 'partial';
  disjointness: 'disjoint' | 'overlapping';
}

export interface ChenDB extends DiagramDB {
  // parse-time API
  addEntity(id: string, label: string | undefined, weak: boolean): ChenEntityNode;
  addRelationship(
    id: string,
    label: string | undefined,
    identifying: boolean
  ): ChenRelationshipNode;
  addAttribute(decl: ChenAttributeDecl): string;
  addLeg(leg: ChenLeg): void;
  addSpecialization(decl: ChenSpecializationDecl): void;
  beginAggregation(id: string, label: string | undefined): void;
  endAggregation(): void;
  setDirection(direction: ChenDirection): void;
  addClass(ids: string[], styles: string[]): void;
  setClass(ids: string[], classNames: string[]): void;
  addCssStyles(ids: string[], styles: string[]): void;

  // model API
  /** Resolves legs, implicit nodes and aggregation membership, then validates. */
  finalize(): void;
  getAST(): ChenAST;
  getDirection(): ChenDirection;
  getData(): LayoutData;
}
