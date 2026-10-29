import type {
  ChenAST,
  ChenAttributeNode,
  ChenRelationshipLink,
  ChenSymbolKind,
} from './chenTypes.js';

/** Kind of the symbol registered under `id`, if any. */
export const kindOfSymbol = (ast: ChenAST, id: string): ChenSymbolKind | undefined => {
  if (ast.entities.has(id)) {
    return 'entity';
  }
  if (ast.relationships.has(id)) {
    return 'relationship';
  }
  if (ast.aggregations.has(id)) {
    return 'aggregation';
  }
  if (ast.specializations.has(id)) {
    return 'specialization';
  }
  if (ast.attributes.has(id)) {
    return 'attribute';
  }
  return undefined;
};

const linksByRelationship = (ast: ChenAST): Map<string, ChenRelationshipLink[]> => {
  const result = new Map<string, ChenRelationshipLink[]>();
  for (const link of ast.links) {
    const list = result.get(link.relationshipId);
    if (list) {
      list.push(link);
    } else {
      result.set(link.relationshipId, [link]);
    }
  }
  return result;
};

const validateSymbolsAreUnique = (ast: ChenAST): void => {
  const seen = new Map<string, ChenSymbolKind>();
  const groups: [ChenSymbolKind, Iterable<string>][] = [
    ['entity', ast.entities.keys()],
    ['relationship', ast.relationships.keys()],
    ['aggregation', ast.aggregations.keys()],
    ['specialization', ast.specializations.keys()],
    ['attribute', ast.attributes.keys()],
  ];
  for (const [kind, ids] of groups) {
    for (const id of ids) {
      const previous = seen.get(id);
      if (previous) {
        throw new Error(`Symbol '${id}' is already defined as a ${previous}`);
      }
      seen.set(id, kind);
    }
  }
};

const validateRelationships = (ast: ChenAST, links: Map<string, ChenRelationshipLink[]>): void => {
  for (const link of ast.links) {
    const kind = kindOfSymbol(ast, link.targetId);
    if (kind !== 'entity' && kind !== 'aggregation') {
      throw new Error(
        `Invalid relationship endpoint '${link.targetId}': expected entity or aggregation, got ${kind ?? 'undefined symbol'}`
      );
    }
  }

  for (const relationship of ast.relationships.values()) {
    const own = links.get(relationship.id) ?? [];
    if (own.length < 2) {
      throw new Error(
        `Relationship '${relationship.id}' must connect at least 2 entities or aggregations`
      );
    }
    if (relationship.identifying) {
      const ownsWeakEntity = own.some(
        (link) =>
          link.participation === 'total' &&
          link.targetKind === 'entity' &&
          ast.entities.get(link.targetId)?.weak === true
      );
      const hasOwner = own.some((link) => link.cardinality === 'one');
      if (!ownsWeakEntity || !hasOwner) {
        throw new Error(
          `Identifying relationship '${relationship.id}' must link a weak entity with total participation (==) and an owner with cardinality one (<-- or -->)`
        );
      }
    }
  }
};

const validateEntities = (ast: ChenAST): void => {
  for (const entity of ast.entities.values()) {
    if (!entity.weak) {
      continue;
    }
    const identified = ast.links.some(
      (link) =>
        link.targetId === entity.id &&
        link.participation === 'total' &&
        ast.relationships.get(link.relationshipId)?.identifying === true
    );
    if (!identified) {
      throw new Error(
        `Weak entity '${entity.id}' must participate totally (==) in at least one identifying relationship`
      );
    }
  }
};

const validateAttributes = (ast: ChenAST): void => {
  const check = (attribute: ChenAttributeNode) => {
    if (attribute.ownerKind === 'attribute') {
      const parent = ast.attributes.get(attribute.ownerId);
      if (parent?.attrType !== 'composite') {
        throw new Error(
          `Child attribute '${attribute.name}' must belong to a composite attribute`
        );
      }
      if (attribute.attrType === 'key' || attribute.attrType === 'partialKey') {
        throw new Error(
          `Child attribute '${attribute.name}' of composite attribute '${parent.name}' cannot be a key or partial key`
        );
      }
    } else {
      const owner =
        attribute.ownerKind === 'entity'
          ? ast.entities.get(attribute.ownerId)
          : ast.relationships.get(attribute.ownerId);
      if (!owner) {
        throw new Error(
          `Attribute '${attribute.name}' has unknown ${attribute.ownerKind} owner '${attribute.ownerId}'`
        );
      }
      const strongEntity = attribute.ownerKind === 'entity' && !ast.entities.get(attribute.ownerId)!.weak;
      const weakEntity = attribute.ownerKind === 'entity' && !strongEntity;
      if (attribute.attrType === 'key' && !strongEntity) {
        throw new Error(`Primary key '${attribute.name}' can only belong to a strong entity`);
      }
      if (attribute.attrType === 'partialKey' && !weakEntity) {
        throw new Error(`Partial key '${attribute.name}' can only belong to a weak entity`);
      }
    }
    if (attribute.attrType === 'composite' && attribute.children.length === 0) {
      throw new Error(
        `Composite attribute '${attribute.name}' must declare at least 1 child attribute`
      );
    }
    if (attribute.attrType !== 'composite' && attribute.children.length > 0) {
      throw new Error(
        `Attribute '${attribute.name}' of type ${attribute.attrType} cannot have child attributes`
      );
    }
  };
  for (const attribute of ast.attributes.values()) {
    check(attribute);
  }
};

const validateSpecializations = (ast: ChenAST): void => {
  const requireEntity = (specId: string, id: string) => {
    const kind = kindOfSymbol(ast, id);
    if (kind !== 'entity') {
      throw new Error(
        `Invalid specialization '${specId}': '${id}' must be an entity, got ${kind ?? 'undefined symbol'}`
      );
    }
  };

  for (const spec of ast.specializations.values()) {
    requireEntity(spec.id, spec.supertypeId);
    if (spec.subtypeIds.length < 1) {
      throw new Error(`Specialization '${spec.id}' must have at least 1 subtype`);
    }
    const seen = new Set<string>();
    for (const subtype of spec.subtypeIds) {
      requireEntity(spec.id, subtype);
      if (subtype === spec.supertypeId) {
        throw new Error(
          `Specialization '${spec.id}': supertype '${subtype}' cannot also be one of its subtypes`
        );
      }
      if (seen.has(subtype)) {
        throw new Error(`Specialization '${spec.id}' lists subtype '${subtype}' more than once`);
      }
      seen.add(subtype);
    }
  }

  // The supertype -> subtype graph must be a DAG.
  const children = new Map<string, string[]>();
  for (const spec of ast.specializations.values()) {
    const list = children.get(spec.supertypeId) ?? [];
    list.push(...spec.subtypeIds);
    children.set(spec.supertypeId, list);
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string): void => {
    const current = state.get(id);
    if (current === 'done') {
      return;
    }
    if (current === 'visiting') {
      throw new Error(`Cycle detected in specialization hierarchy involving entity '${id}'`);
    }
    state.set(id, 'visiting');
    for (const child of children.get(id) ?? []) {
      visit(child);
    }
    state.set(id, 'done');
  };
  for (const id of children.keys()) {
    visit(id);
  }
};

const validateAggregations = (ast: ChenAST, links: Map<string, ChenRelationshipLink[]>): void => {
  for (const aggregation of ast.aggregations.values()) {
    const participants = aggregation.participants.length;
    const relationships = aggregation.relationshipIds.length;
    if (participants !== 2 || relationships !== 1) {
      throw new Error(
        `Aggregation '${aggregation.id}' must encapsulate exactly 2 entities/aggregations and 1 relationship between them (found ${participants} participants and ${relationships} relationships)`
      );
    }

    const relationshipId = aggregation.relationshipIds[0];
    const targets = new Set((links.get(relationshipId) ?? []).map((link) => link.targetId));
    const connectsExactly =
      targets.size === 2 && aggregation.participants.every((id) => targets.has(id));
    if (!connectsExactly) {
      throw new Error(
        `Aggregation '${aggregation.id}' must encapsulate exactly 2 entities/aggregations and 1 relationship between them (relationship '${relationshipId}' does not connect exactly '${aggregation.participants.join("' and '")}')`
      );
    }

    for (const id of aggregation.participants) {
      const entity = ast.entities.get(id);
      const nested = ast.aggregations.get(id);
      const owner = (entity ?? nested)?.parentId;
      if (nested) {
        if (owner !== aggregation.id) {
          throw new Error(`Nested aggregation '${id}' must be declared inside '${aggregation.id}'`);
        }
      } else if (entity) {
        if (owner !== aggregation.id) {
          throw new Error(
            `Node '${id}' is already encapsulated by aggregation '${owner ?? '?'}' and cannot also belong to '${aggregation.id}'`
          );
        }
      } else {
        throw new Error(
          `Aggregation '${aggregation.id}' participant '${id}' must be an entity or an aggregation`
        );
      }
    }
  }

  // Containment chains must be acyclic.
  for (const aggregation of ast.aggregations.values()) {
    const chain = new Set<string>([aggregation.id]);
    let parentId = aggregation.parentId;
    while (parentId !== undefined) {
      if (chain.has(parentId)) {
        throw new Error(`Aggregation containment cycle involving '${parentId}'`);
      }
      chain.add(parentId);
      const parent = ast.aggregations.get(parentId);
      if (!parent) {
        throw new Error(`Aggregation '${aggregation.id}' has unknown parent '${parentId}'`);
      }
      parentId = parent.parentId;
    }
  }
};

/**
 * Semantic validation of a Chen model. Throws on the first violated rule, with a message that
 * names the offending symbol.
 */
export function validateChenModel(ast: ChenAST): void {
  const links = linksByRelationship(ast);
  validateSymbolsAreUnique(ast);
  validateRelationships(ast, links);
  validateAttributes(ast);
  validateEntities(ast);
  validateSpecializations(ast);
  validateAggregations(ast, links);
}
