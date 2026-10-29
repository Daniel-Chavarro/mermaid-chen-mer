# Chen ER Diagram Extension (`chen-beta`) Execution Plan

## Context

Design and implement a standalone Chen Entity-Relationship diagram extension (`chen-beta`, diagram ID `chen`) in Mermaid JS (`packages/mermaid`) along with its complete syntax, AST/data structure, rendering, and validation specification. Existing Mermaid `erDiagram` only supports Crow's Foot tabular notation (`erBox`) and lacks Chen ER constructs: entity/weak-entity rectangles, diamond/identifying-diamond relationships, oval attributes (simple, composite, multivalued, derived, primary key, partial key), ISA specialization triangles with centered circles and disjointness arcs, double-line total participation edges, and nestable $2\text{ entities} + 1\text{ relationship}$ aggregations. The end state is a working, validated `chen-beta` diagram registered in Mermaid's unified rendering pipeline with unit/integration tests and complete documentation demonstrating the full University/Library schema from the reference LaTeX TikZ diagram.

---

## Complete Notation Design Specification

### 1. Entities & Weak Entities

- **Syntax**:
  - Regular entity declaration:
    - Explicit keyword: `entity <id>["<label>"]` or `entity <id>` (label defaults to `<id>`)
    - Bracket shorthand: `<id>["<label>"]`
    - With inline attribute block:
      ```mermaid
      entity Persona["Persona"] {
        key codPersona
        attr nombre
      }
      ```
  - Weak entity declaration:
    - Explicit keyword: `weak entity <id>["<label>"]` or `weak <id>["<label>"]`
    - Double-bracket shorthand: `<id>[["<label>"]]`
    - With inline attribute block:
      ```mermaid
      weak entity Ejemplar["Ejemplar"] {
        partialKey numero_ejemplar
      }
      ```
- **Data Structure**:
  ```ts
  export interface ChenEntityNode {
    kind: 'entity';
    id: string;
    label: string;
    weak: boolean; // false = single-line rectangle, true = double-line rectangle
    attributes: string[]; // Top-level ChenAttributeNode IDs attached to this entity
    parentId?: string; // Enclosing ChenAggregationNode ID when inside an aggregation
    cssClasses: string[];
    cssStyles: string[];
  }
  ```
- **Rendering Rules**:
  - **Regular entity (`weak: false`)**: Rendered via custom shape `'chenEntity'` (`packages/mermaid/src/rendering-util/rendering-elements/shapes/chenShapes.ts`). Draws a single-line `<rect class="basic label-container chen-entity">` sized to $W = \max(\text{bbox.width} + 28, \text{minEntityWidth})$, $H = \max(\text{bbox.height} + 18, \text{minEntityHeight})$ centered at $(0, 0)$ with `intersect.rect(node, point)`.
  - **Weak entity (`weak: true`)**: Rendered via custom shape `'chenWeakEntity'`. Draws a `<g class="basic label-container chen-weak-entity">` containing an outer `<rect>` of $(W, H)$ and an inset inner `<rect>` of $(W - 2g, H - 2g)$ with concentric gap $g = 4\text{px}$ (in `handDrawn` mode, two `rc.rectangle` calls). Incident edges clip to the outer rectangle via `intersect.rect(node, point)`.
- **Validation Rules**:
  - Entity IDs must not collide with any relationship, attribute, specialization, or aggregation ID (error: `Symbol '<id>' is already defined as a <kind>`).
  - Every weak entity (`weak: true`) must participate with `participation: 'total'` in at least one identifying relationship (`identifying: true`); otherwise throw `Weak entity '<id>' must participate totally (==) in at least one identifying relationship`.
  - A regular entity (`weak: false`) cannot own a `partialKey` attribute; a weak entity (`weak: true`) must use `partialKey` instead of `key` for its discriminator.

### 2. Relationships, Identifying Relationships & Cardinality

- **Syntax**:
  - Relationship declaration:
    - Regular: `rel <id>["<label>"]` or `relationship <id>["<label>"]` or `<id>{"<label>"}`
    - Identifying: `idrel <id>["<label>"]` or `identifying rel <id>["<label>"]` or `<id>{{"<label>"}}`
    - Optional attribute block on any relationship:
      ```mermaid
      rel Imparte["Imparte"] {
        attr horario
        attr salon
        attr numero_grupo
      }
      ```
  - Relationship connections & cardinality markers:
    - **Binary chain syntax**: `<leftTarget> <leftConn> <relNode> <rightConn> <rightTarget>`
      - Example (M:N): `Asignatura -(M)- Bibliografia -(N)- Libro`
      - Example (1:N with arrow on `1` side and total participation on weak entity side): `Libro <-(1)- Tiene ==(N)== Ejemplar`
    - **Single leg syntax** (supports binary, ternary, $n$-ary, and role labels): `<relNode> <conn> <target> [: "<role>"]` or `<target> <conn> <relNode> [: "<role>"]`
    - **Connector token grammar**:
      - Participation stroke: `-` / `--` / `---` = partial participation (single line); `=` / `==` / `===` = total/mandatory participation (double line).
      - Cardinality marker: Arrowhead `<` or `>` pointing toward the entity (`<--`, `-->`, `<==`, `==>`, `<-(1)-`, `-(1)->`, `<==(1)==`, `==(1)==>`) = cardinality **one** (`'one'`); no arrowhead (`---`, `===`, `-(N)-`, `==(N)==`, `-(M)-`) = cardinality **many** (`'many'`).
      - Optional cardinality label: `(1)`, `(N)`, `(M)`, or any alphanumeric cardinality token inside parentheses in the connector (`-(1)-`, `<-(1)-`, `-(N)-`, `==(N)==`).
- **Data Structure**:
  ```ts
  export interface ChenRelationshipNode {
    kind: 'relationship';
    id: string;
    label: string;
    identifying: boolean; // false = diamond, true = double-line diamond
    attributes: string[]; // Top-level ChenAttributeNode IDs attached to this relationship
    parentId?: string; // Enclosing ChenAggregationNode ID
    cssClasses: string[];
    cssStyles: string[];
  }

  export interface ChenRelationshipLink {
    id: string;
    relationshipId: string;
    targetId: string; // Entity ID or Aggregation ID
    targetKind: 'entity' | 'aggregation';
    cardinality: 'one' | 'many'; // 'one' = arrowhead pointing to target, 'many' = plain line
    cardinalityLabel?: string; // Optional '1', 'N', 'M'
    participation: 'partial' | 'total'; // 'partial' = single line, 'total' = double line
    role?: string;
  }
  ```
- **Rendering Rules**:
  - **Regular relationship (`identifying: false`)**: Custom shape `'chenDiamond'`. Renders a 4-vertex `<polygon>` with 2:1 aspect ratio: $W = \max(\text{bbox.width} \times 1.6 + 28, 90)$, $H = \max(\text{bbox.height} \times 1.6 + 22, 46)$, vertices $(0, -H/2), (W/2, 0), (0, H/2), (-W/2, 0)$. Intersect uses `intersect.polygon(bounds, points, point)`.
  - **Identifying relationship (`identifying: true`)**: Custom shape `'chenDoubleDiamond'`. Renders outer diamond $(W, H)$ and inner concentric diamond inset by perpendicular gap $g = 4\text{px}$, where horizontal inset is $\Delta x = g \cdot \frac{\sqrt{(W/2)^2 + (H/2)^2}}{H/2}$ and vertical inset is $\Delta y = g \cdot \frac{\sqrt{(W/2)^2 + (H/2)^2}}{W/2}$, guaranteeing uniform $4\text{px}$ parallel spacing on all four diamond edges.
  - **Cardinality & Participation Edges**:
    - Each `ChenRelationshipLink` emits an `Edge` from `relationshipId` (`start`) to `targetId` (`end`).
    - `cardinality === 'one'` sets `arrowTypeEnd: 'arrow_point'` (pointing at the entity/aggregation). `cardinality === 'many'` sets `arrowTypeEnd: 'none'`.
    - `cardinalityLabel` sets `endLabelLeft: link.cardinalityLabel`; `role` sets `label: link.role`.
    - `participation === 'total'` sets `edge.metadata = { doubleLine: true }` and `edge.classes = 'relationshipLine chen-double-edge'`. Post-paint helper `renderChenDoubleEdges(svg, data)` decodes `data-points` on each `path.chen-double-edge` and rewrites `d` into two parallel subpaths offset by $\pm 2\text{px}$ along segment unit normals (retracted by $6\text{px}$ at the arrow end when `arrowTypeEnd !== 'none'` so the double rails meet the base of the arrowhead cleanly).
- **Validation Rules**:
  - Every relationship must have at least 2 links (`Relationship '<id>' must connect at least 2 entities or aggregations`).
  - Only `entity` and `aggregation` nodes may be endpoints of a `ChenRelationshipLink`; linking an `attribute` or `specialization` throws `Invalid relationship endpoint '<targetId>': expected entity or aggregation, got <kind>`.
  - Every `identifying` relationship (`identifying: true`) must have at least one link to a weak entity with `participation: 'total'` and at least one link with `cardinality: 'one'`.

### 3. Aggregations & Nested Aggregations

- **Syntax**:
  - `aggregation <id>["<optionalLabel>"] { ... }` (label defaults to `""` so no title banner crowds the dashed box unless specified):
    ```mermaid
    aggregation Imparte_Agg {
      Profesor -(1)- Imparte -(N)- Asignatura
    }
    ```
  - Nested aggregation:
    ```mermaid
    aggregation Outer_Agg {
      aggregation Imparte_Agg {
        Profesor -(1)- Imparte -(N)- Asignatura
      }
      Estudiante -(N)- Cursa -(M)- Imparte_Agg
    }
    ```
- **Data Structure**:
  ```ts
  export interface ChenAggregationNode {
    kind: 'aggregation';
    id: string;
    label: string;
    participants: [string, string]; // Exactly 2 IDs (entity or nested aggregation)
    relationshipId: string; // Exactly 1 relationship ID linking those 2 participants
    parentId?: string; // Enclosing aggregation ID when nested
    cssClasses: string[];
    cssStyles: string[];
  }
  ```
- **Rendering Rules**:
  - Emitted in `LayoutData.nodes` as a `ClusterNode` (`isGroup: true, shape: 'rect', rx: 8, ry: 8, padding: 14, cssClasses: 'chen-aggregation'`, `cssStyles: ['stroke-dasharray: 6, 4']`).
  - The 2 participant nodes, the 1 relationship diamond, and all attributes transitively owned by those entities and that relationship receive `parentId: aggregation.id` (unless already inside a deeper nested aggregation, whose `ClusterNode` itself has `parentId: aggregation.id`).
  - Relationships outside the aggregation (e.g. `Estudiante -(N)- Cursa -(M)- Imparte_Agg`) emit an `Edge` whose endpoint is the cluster ID `Imparte_Agg`. Both Dagre (`adjustClustersAndEdges` + `cutPathAtIntersect`) and ELK anchor the edge directly on the aggregation's dashed rectangular border.
- **Validation Rules**:
  - **Exact $2 + 1$ invariant**: An `aggregation` block must contain **exactly 1 relationship** and **exactly 2 distinct participants** (entities or nested aggregations) connected by that relationship. Any other count throws `Aggregation '<id>' must encapsulate exactly 2 entities/aggregations and 1 relationship between them (found <P> participants and <R> relationships)`.
  - **No cross-boundary leak**: A node already assigned to another sibling aggregation cannot be re-encapsulated unless the second aggregation is the direct parent of the first (`Nested aggregation '<child>' must be declared inside '<parent>'`).
  - **Acyclic containment**: Aggregation parent chains must be strictly acyclic.

### 4. Specialization / Generalization (ISA)

- **Syntax**:
  - Block syntax:
    ```mermaid
    isa <id> from <SupertypeEntity> <===|---> [disjoint|overlapping] {
      <SubtypeEntity1>
      <SubtypeEntity2>
    }
    ```
  - Single-line syntax:
    `<SupertypeEntity> <===|---> <id>[isa: disjoint|overlapping] --- <SubtypeEntity1>, <SubtypeEntity2>`
    - `===` between `<SupertypeEntity>` and `<id>` specifies **total/mandatory** participation (`participation: 'total'`, double line).
    - `---` between `<SupertypeEntity>` and `<id>` specifies **partial/optional** participation (`participation: 'partial'`, single line).
    - `disjoint` (default if omitted: `'overlapping'`) specifies the **disjoint constraint** (renders the arc across the supertype-to-triangle line).
- **Data Structure**:
  ```ts
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
  ```
- **Rendering Rules**:
  - **ISA Triangle with Centered Circle (`shape: 'chenIsa'`)**:
    - Draws an inverted triangle `<polygon class="chen-isa-triangle">` with top horizontal base and bottom apex: vertices $(-R, -R \cdot 0.58), (R, -R \cdot 0.58), (0, R \cdot 1.15)$ where $R = 24\text{px}$ (width $48\text{px}$, height $41.5\text{px}$), and a centered `<circle class="chen-isa-circle" cx="0" cy="0" r="8" />` at the centroid $(0, 0)$ (matching the LaTeX attachment `\node[isa] (isa) ... \node[circle] at (isa.center) {}`).
    - Intersect handler clips incident edges to the outer triangle via `intersect.polygon(bounds, triangleVertices, point)`.
  - **Supertype $\to$ Triangle Edge**:
    - Emits an `Edge` from `supertypeId` to `specialization.id`.
    - When `participation === 'total'`, sets `metadata: { doubleLine: true, disjointArc: spec.disjointness === 'disjoint' }` and class `'chen-double-edge'`.
    - When `participation === 'partial'`, sets `metadata: { doubleLine: false, disjointArc: spec.disjointness === 'disjoint' }`.
  - **Disjoint Constraint Arc (`disjointness === 'disjoint'`)**:
    - In the post-paint pass (`renderChenDisjointArcs(svg, data)`), for each specialization edge with `disjointArc: true`, computes the midpoint $M = (m_x, m_y)$ and unit tangent $\hat{t} = (t_x, t_y)$ / unit normal $\hat{n} = (-t_y, t_x)$ of the supertype-to-triangle edge segment, and appends `<path class="chen-disjoint-arc" d="M ... Q ... ..." />` spanning $\pm 12\text{px}$ normal to the line with a $6\text{px}$ bow toward the triangle.
  - **Triangle $\to$ Subtype Edges**:
    - Emits single-line `Edge`s (`pattern: 'solid'`, `arrowTypeEnd: 'none'`) from `specialization.id` to each `subtypeId`.
- **Validation Rules**:
  - `supertypeId` and every member of `subtypeIds` must be an `entity` (not a relationship, aggregation, or attribute).
  - `subtypeIds.length >= 1`, no duplicate subtype IDs in the same specialization, and `supertypeId` cannot appear in `subtypeIds`.
  - Specialization graph across the diagram must be a DAG; cycle detection via DFS throws `Cycle detected in specialization hierarchy involving entity '<id>'`.

### 5. Attributes (Simple, Composite, Multivalued, Derived, Primary Key, Partial Key)

- **Syntax**:
  - Inside an `entity`, `weak entity`, `rel`, `idrel`, or parent `attr` block:
    - Simple attribute: `attr <id>["<label>"]` or `attr <name>`
    - Primary key: `key <id>["<label>"]` or `key <name>`
    - Partial key (weak entity): `partialKey <id>["<label>"]` or `partialKey <name>`
    - Multivalued attribute: `multi <id>["<label>"]` or `multi <name>`
    - Derived attribute: `derived <id>["<label>"]` or `derived <name>`
    - Composite attribute (any `attr` with a `{ ... }` child block):
      ```mermaid
      attr direccion["direccion"] {
        attr calle["calle"]
        attr carrera["carrera"]
      }
      ```
  - Standalone inline attribute statement outside blocks:
    - `<OwnerId> --- attr <id>["<label>"]` (also `key`, `partialKey`, `multi`, `derived`).
  - Notice that inside an entity/relationship block, attribute names are scoped to their owner (`${ownerId}__${attrName}`) if an explicit global ID is not needed, so two entities (e.g. `Persona` and `Asignatura`) can both have `attr nombre` without ID collision!
- **Data Structure**:
  ```ts
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
    ownerId: string; // Entity ID, Relationship ID, or Parent Attribute ID
    ownerKind: 'entity' | 'relationship' | 'attribute';
    children: string[]; // Child attribute IDs (non-empty iff attrType === 'composite')
    parentId?: string; // Inherited aggregation cluster ID
    cssClasses: string[];
    cssStyles: string[];
  }
  ```
- **Rendering Rules**:
  - All attributes use custom shape `'chenAttribute'` (`shapes/chenShapes.ts`) reading `node.metadata.attrType`:
    - Base geometry: `<ellipse>` with $r_x = \max(\text{bbox.width} / 2 + 14, 34)$, $r_y = \max(\text{bbox.height} / 2 + 10, 18)$, `intersect.ellipse(node, outerRx, outerRy, point)`.
    - **`'simple'` & `'composite'`**: Single solid `<ellipse class="chen-attr-oval">`.
    - **`'multivalued'`**: Outer `<ellipse rx="rx + 4" ry="ry + 4">` + inner `<ellipse rx="rx" ry="ry">` inside `<g class="chen-attr-multi">`.
    - **`'derived'`**: Single `<ellipse class="chen-attr-derived" stroke-dasharray="5, 4">` (in `handDrawn` mode, `strokeLineDash: [5, 4]`).
    - **`'key'`**: Single solid `<ellipse class="chen-attr-key">` + solid SVG `<line class="chen-key-underline">` at $y = \text{bbox.height} / 2 + 2$, $x_1 = -\text{bbox.width} / 2$, $x_2 = \text{bbox.width} / 2$.
    - **`'partialKey'`**: Single solid `<ellipse class="chen-attr-partial-key">` + dashed SVG `<line class="chen-partial-key-underline" stroke-dasharray="4, 3">` at $y = \text{bbox.height} / 2 + 2$, $x_1 = -\text{bbox.width} / 2$, $x_2 = \text{bbox.width} / 2$.
  - **Edges**:
    - Top-level attributes (`ownerKind === 'entity' | 'relationship'`) emit a single solid undirected `Edge` (`ownerId` $\to$ `attr.id`).
    - Child attributes of a composite attribute (`ownerKind === 'attribute'`) emit a single solid undirected `Edge` (`parentAttr.id` $\to$ `childAttr.id`) and **never** connect directly to the entity or relationship.
- **Validation Rules**:
  - Child attributes (`ownerKind === 'attribute'`) cannot be `key` or `partialKey` and cannot have direct edges to entities or relationships.
  - `key` attributes are rejected on weak entities and relationships (`Primary key '<name>' can only belong to a strong entity`).
  - `partialKey` attributes are rejected on strong entities and relationships (`Partial key '<name>' can only belong to a weak entity`).
  - Composite attributes must contain at least 1 child attribute (`Composite attribute '<name>' must declare at least 1 child attribute`).

---

### Summary Table: Symbol $\to$ Notation Mapping

| Concept | Chen Visual Symbol | Mermaid `chen-beta` Syntax | Internal AST `kind` / `shape` | Key Validation Constraint |
| :--- | :--- | :--- | :--- | :--- |
| **Regular Entity** | Single-line rectangle | `entity E["Label"] { ... }` or `E["Label"]` | `kind: 'entity'`, `weak: false`, `shape: 'chenEntity'` | Unique ID; cannot have `partialKey` |
| **Weak Entity** | Double-line rectangle | `weak entity W["Label"] { ... }` or `W[["Label"]]` | `kind: 'entity'`, `weak: true`, `shape: 'chenWeakEntity'` | Must participate totally (`==`) in $\ge 1$ `idrel`; uses `partialKey` |
| **Regular Relationship** | Single-line diamond (2:1) | `rel R["Label"] { ... }` or `R{"Label"}` | `kind: 'relationship'`, `identifying: false`, `shape: 'chenDiamond'` | Must link $\ge 2$ entities/aggregations |
| **Identifying Relationship** | Double-line diamond (2:1) | `idrel R["Label"]` or `R{{"Label"}}` | `kind: 'relationship'`, `identifying: true`, `shape: 'chenDoubleDiamond'` | Links $\ge 1$ weak entity (`==`) and $\ge 1$ owner (`1`) |
| **Cardinality: One** | Line with arrow (`->`) to entity + optional `1` | `<--`, `-->`, `<-(1)-`, `-(1)->` | `cardinality: 'one'`, `arrowTypeEnd: 'arrow_point'` | Endpoint must be entity or aggregation |
| **Cardinality: Many** | Undirected line + optional `N`/`M` | `---`, `-(N)-`, `-(M)-` | `cardinality: 'many'`, `arrowTypeEnd: 'none'` | Endpoint must be entity or aggregation |
| **Total Participation** | Double line (`==`) | `===`, `==(N)==`, `<==(1)==` | `participation: 'total'`, `metadata.doubleLine: true` | Required on weak entity's identifying link and total ISA |
| **Partial Participation** | Single line (`--`) | `---`, `-(N)-`, `<-(1)-` | `participation: 'partial'`, `metadata.doubleLine: false` | Default participation mode |
| **Aggregation** | Dashed rounded rectangle container | `aggregation A { E1 -(1)- R -(N)- E2 }` | `kind: 'aggregation'`, `isGroup: true`, `shape: 'rect'` | Must encapsulate **exactly 2** entities/aggregations + **1** relationship |
| **Nested Aggregation** | Outer dashed box wrapping inner aggregation + entity + rel | `aggregation Outer { aggregation Inner { ... } ... }` | `kind: 'aggregation'`, `parentId: 'Outer'` | Acyclic containment; each level obeys exact $2+1$ rule |
| **Specialization / ISA** | Inverted triangle with centered circle inside | `isa I from Super === disjoint { Sub1 Sub2 }` | `kind: 'specialization'`, `shape: 'chenIsa'` | Supertype & subtypes must be entities; hierarchy must be a DAG |
| **Disjoint Constraint** | Arc across line between supertype and ISA triangle | `disjoint` modifier on `isa` | `disjointness: 'disjoint'`, `metadata.disjointArc: true` | Mutually exclusive with `overlapping` |
| **Simple Attribute** | Single-line oval | `attr name` | `attrType: 'simple'`, `shape: 'chenAttribute'` | Attaches to 1 owner (entity, rel, or composite attr) |
| **Composite Attribute** | Parent oval connected to child ovals | `attr dir { attr calle attr carrera }` | `attrType: 'composite'`, `children: [...]` | $\ge 1$ child oval; children connect **only** to parent oval |
| **Multivalued Attribute** | Double-line oval | `multi telefonos` | `attrType: 'multivalued'`, `shape: 'chenAttribute'` | Distinct from `derived` |
| **Derived Attribute** | Dashed-line oval | `derived nota_definitiva` | `attrType: 'derived'`, `shape: 'chenAttribute'` | Distinct from `multivalued` |
| **Primary Key Attribute** | Oval with solid underlined text | `key codPersona` | `attrType: 'key'`, `shape: 'chenAttribute'` | Allowed only on regular (strong) entities |
| **Partial Key Attribute** | Oval with dashed underlined text | `partialKey numero_ejemplar` | `attrType: 'partialKey'`, `shape: 'chenAttribute'` | Allowed only on weak entities |

---

### Complete Sample Diagram (University & Library Reference from LaTeX Attachment + Nested Aggregation)

```mermaid
chen-beta
  direction TB

  %% BLOQUE 1: PERSONA / ESTUDIANTE / PROFESOR / AUTOR (ISA)
  entity Persona {
    key codPersona
    attr nombre
  }

  isa isa_persona from Persona === disjoint {
    Estudiante
    Profesor
    Autor
  }

  entity Estudiante {
    attr edad
    attr direccion_electronica
    attr direccion {
      attr calle
      attr carrera
    }
    multi telefonos
  }

  entity Profesor {
    attr profesion
    attr nivel_escolaridad
  }

  entity Autor {
    key codigo_autor
    attr nacionalidad
  }

  %% BLOQUE 2: ASIGNATURA + AGREGACION (Imparte) + CURSA
  entity Asignatura {
    key codigo
    attr creditos
    attr nombre
    attr intensidad_horaria
  }

  rel Imparte {
    attr horario
    attr salon
    attr numero_grupo
  }

  aggregation Agregado_Imparte {
    Profesor -(1)- Imparte -(N)- Asignatura
  }

  rel Cursa {
    attr nota1
    attr nota2
    attr nota3
    derived nota_definitiva
  }

  Estudiante -(N)- Cursa -(M)- Agregado_Imparte

  %% BLOQUE 3: BIBLIOGRAFIA / AUTORES / EJEMPLARES / PRESTAMOS
  entity Libro {
    key codigo_libro
    attr titulo
    attr idioma
  }

  rel Bibliografia
  Asignatura -(M)- Bibliografia -(N)- Libro

  rel Escribe
  Libro -(M)- Escribe -(N)- Autor

  weak entity Ejemplar {
    partialKey numero_ejemplar
  }

  idrel Tiene
  Libro <-(1)- Tiene ==(N)== Ejemplar

  rel Presta {
    attr fecha_prestamo
    attr fecha_limite
    attr fecha_entrega
    derived dias_mora
  }

  Estudiante -(1)- Presta -(N)- Ejemplar
```

---

## Approach

### Step 1: Register Chen ER Custom Shapes in Shared Rendering Elements
- **Create** `packages/mermaid/src/rendering-util/rendering-elements/shapes/chenShapes.ts` implementing 5 shape handlers using `labelHelper`, `updateNodeBounds`, `styles2String`, `userNodeOverrides`, `stampColorSlot`, and `intersect` (`intersect.rect`, `intersect.polygon`, `intersect.ellipse`) from `packages/mermaid/src/rendering-util/rendering-elements/shapes/util.ts` and `intersect/index.js`:
  - `chenEntity(parent, node)`: single-line `<rect>` with `minWidth = node.minWidth ?? 90`, `minHeight = 40`.
  - `chenWeakEntity(parent, node)`: concentric outer `<rect>` and inner `<rect>` inset by `gap = 4` on all 4 sides, supporting both SVG and `rough.svg(shapeSvg)` (`node.look === 'handDrawn'`).
  - `chenDiamond(parent, node)`: 2:1 aspect diamond `<polygon>` ($W = \max(\text{bbox.width} \times 1.6 + 28, 90)$, $H = \max(\text{bbox.height} \times 1.6 + 22, 46)$) with `intersect.polygon`.
  - `chenDoubleDiamond(parent, node)`: outer 2:1 diamond `<polygon>` and inner diamond `<polygon>` inset by uniform perpendicular distance $g = 4\text{px}$ ($\Delta x = g \cdot \frac{\sqrt{(W/2)^2 + (H/2)^2}}{H/2}$, $\Delta y = g \cdot \frac{\sqrt{(W/2)^2 + (H/2)^2}}{W/2}$).
  - `chenIsa(parent, node)`: inverted triangle `<polygon>` with vertices $(-24, -14), (24, -14), (0, 28)$ and centered `<circle cx="0" cy="0" r="8" />` at $(0, 0)$, with `intersect.polygon` on the triangle vertices.
  - `chenAttribute(parent, node)`: `<ellipse>` reading `node.metadata?.attrType` (`'simple' | 'composite' | 'multivalued' | 'derived' | 'key' | 'partialKey'`), drawing outer+inner `<ellipse>` for `'multivalued'`, `stroke-dasharray="5, 4"` for `'derived'`, solid `<line class="chen-key-underline">` below label bbox for `'key'`, and dashed `<line class="chen-partial-key-underline" stroke-dasharray="4, 3">` below label bbox for `'partialKey'`.
- **Edit** `packages/mermaid/src/rendering-util/rendering-elements/shapes.ts`: import `chenEntity`, `chenWeakEntity`, `chenDiamond`, `chenDoubleDiamond`, `chenIsa`, and `chenAttribute` from `./shapes/chenShapes.js` and add all 6 keys to `undocumentedShapes`.

### Step 2: Define Chen ER Types, AST, DB, and Semantic Validator
- **Create** `packages/mermaid/src/diagrams/chen/chenTypes.ts` defining `ChenEntityNode`, `ChenRelationshipNode`, `ChenRelationshipLink`, `ChenAggregationNode`, `ChenSpecializationNode`, `ChenAttributeNode`, `ChenAttributeKind`, `ChenAST`, and `ChenDB` interface extending `DiagramDB`.
- **Create** `packages/mermaid/src/diagrams/chen/chenValidator.ts` exporting `validateChenModel(ast: ChenAST): void`:
  - Validates weak entity participation (`weak: true` requires $\ge 1$ link to an `identifying: true` relationship with `participation: 'total'`).
  - Validates identifying relationships (`identifying: true` requires $\ge 1$ weak entity link with `participation: 'total'` and $\ge 1$ link with `cardinality: 'one'`).
  - Validates relationship degree ($\ge 2$ links) and endpoint kinds (`'entity' | 'aggregation'`).
  - Validates aggregation $2+1$ invariant (each `ChenAggregationNode` must encapsulate exactly 2 participants of kind `'entity' | 'aggregation'` and 1 `ChenRelationshipNode` whose links connect those 2 participants) and checks for aggregation cycles.
  - Validates specialization endpoints (all supertypes and subtypes must be `'entity'`) and checks for cycles in the specialization graph via DFS.
  - Validates attribute rules (`key` only on strong entities, `partialKey` only on weak entities, `composite` attributes must have $\ge 1$ child, child attributes cannot connect directly to entities/relationships).
- **Create** `packages/mermaid/src/diagrams/chen/chenDb.ts` implementing `ChenDB`:
  - Stores maps for `entities`, `relationships`, `links`, `aggregations`, `specializations`, `attributes`, `classes`, `direction`, and accessibility fields (`setAccTitle`, `getAccTitle`, `setAccDescription`, `getAccDescription`, `setDiagramTitle`, `getDiagramTitle` from `../common/commonDb.js`).
  - Propagates `parentId` from `ChenAggregationNode`s to their 2 participants, 1 relationship, and transitively to all `ChenAttributeNode`s owned by those entities and that relationship.
  - Implements `getData(): LayoutData` emitting `ClusterNode`s for aggregations (outermost first), `NonClusterNode`s for entities, relationships, specializations, and attributes, and `Edge`s for attribute attachments, relationship links (with `arrowTypeEnd: link.cardinality === 'one' ? 'arrow_point' : 'none'`, `endLabelLeft: link.cardinalityLabel`, `metadata: { doubleLine: link.participation === 'total' }`), and specialization links (with `metadata: { doubleLine: spec.participation === 'total', disjointArc: spec.disjointness === 'disjoint' }`).

### Step 3: Implement Chevrotain Lexer, Parser, and CST Visitor for `chen-beta`
- **Create** `packages/mermaid/src/diagrams/chen/parser/chen.tokens.ts`, `chen.lexer.ts`, `chen.parser.ts`, `chen.visitor.ts`, and `chen.chevrotain.ts` reusing `runChevrotainParse` and `isKnownLocation` from `packages/mermaid/src/diagrams/common/parser/runChevrotainParse.ts` (following the `usecase` pattern in `packages/mermaid/src/diagrams/usecase/parser/`):
  - Header token: `chen-beta`.
  - Statements supported:
    - `direction TB | BT | LR | RL`, `title`, `accTitle`, `accDescr`, `classDef`, `class`, `style`.
    - `entity <id>["<label>"] [{ <attrDecls> }]`, `weak entity <id>["<label>"] [{ <attrDecls> }]`, `weak <id>["<label>"] [{ <attrDecls> }]`, `<id>["<label>"]`, `<id>[["<label>"]]`.
    - `rel <id>["<label>"] [{ <attrDecls> }]`, `relationship ...`, `idrel <id>["<label>"] [{ <attrDecls> }]`, `identifying rel ...`, `<id>{"<label>"}`, `<id>{{"<label>"}}`.
    - Attribute declarations inside `{ ... }` or standalone `<owner> --- <attrKeyword> <name>["<label>"]`: `attr`, `key`, `partialKey`, `multi`, `derived`, with nested `{ ... }` blocks on `attr` producing `attrType: 'composite'` and populating `children`.
    - Binary chain links (`<targetA> <connA> <rel> <connB> <targetB>`) and single-leg links (`<target> <conn> <rel> [: "<role>"]` or `<rel> <conn> <target> [: "<role>"]`), parsing connectors `<-(1)-`, `-(1)->`, `<--`, `-->`, `<==(1)==`, `==(1)==>`, `<==`, `==>`, `-(N)-`, `-(M)-`, `---`, `==(N)==`, `==(M)==`, `===`.
    - `aggregation <id>["<label>"] { ... }` blocks (supporting nested `aggregation` blocks, entity/rel declarations, and relationship links inside).
    - `isa <id> from <Supertype> <===|---> [disjoint|overlapping] { <SubtypeList> }` and inline `<Supertype> <===|---> <id>[isa: disjoint|overlapping] --- <Subtype1>, <Subtype2>`.
  - After CST visitation populates `db`, `chen.chevrotain.ts` invokes `db.validate()` (`validateChenModel`) so invalid models fail at parse time with descriptive errors.

### Step 4: Implement Unified Renderer, Post-Paint Double Lines & Disjoint Arcs, Styles, and Registration
- **Create** `packages/mermaid/src/diagrams/chen/chenRenderer.ts`:
  - Calls `const data4Layout = diag.db.getData()`, sets `data4Layout.type = 'chen'`, `data4Layout.layoutAlgorithm = getRegisteredLayoutAlgorithm(layout)`, `data4Layout.markers = ['point']`, and invokes `await render(data4Layout, svg)`.
  - Post-paint pass 1 (`renderChenDoubleEdges(svg, data4Layout)`): selects `path[data-et="edge"]` whose `Edge.metadata?.doubleLine === true`, decodes `data-points` (base64 JSON `Point[]`), computes parallel polylines offset by $\pm 2\text{px}$ along each segment's unit normal (retracting the arrow end by $6\text{px}$ if `arrowTypeEnd === 'arrow_point'`), and updates the path `d` attribute to the two-rail compound path `M... L... M... L...`.
  - Post-paint pass 2 (`renderChenDisjointArcs(svg, data4Layout)`): for each specialization edge with `Edge.metadata?.disjointArc === true`, computes the midpoint and normal of the supertype-to-triangle segment and appends `<path class="chen-disjoint-arc">` in `.edgePaths`.
  - Calls `utils.insertTitle` and `setupViewPortForSVG(svg, padding, 'chenDiagram', conf?.useMaxWidth ?? true)`.
- **Create** `packages/mermaid/src/diagrams/chen/styles.ts`: defines CSS rules for `.chen-entity`, `.chen-weak-entity`, `.chen-diamond`, `.chen-double-diamond`, `.chen-isa-triangle`, `.chen-isa-circle`, `.chen-attr-oval`, `.chen-key-underline`, `.chen-partial-key-underline`, `.chen-aggregation rect`, `.chen-disjoint-arc`, and theme palette slots via `colorThemeGate.ts`.
- **Create** `packages/mermaid/src/diagrams/chen/chenDiagram.ts` and `packages/mermaid/src/diagrams/chen/chenDetector.ts` (`id = 'chen'`, detector `/^\s*chen-beta(?:\s|$)/`).
- **Edit** `packages/mermaid/src/diagram-api/diagram-orchestration.ts`: import `chen` from `../diagrams/chen/chenDetector.js` and add `chen` to `registerLazyLoadedDiagrams(...)`.
- **Edit** `packages/mermaid/src/schemas/config.schema.yaml`, `packages/mermaid/src/defaultConfig.ts`, and regenerate `packages/mermaid/src/config.type.ts`: add `ChenDiagramConfig` (`chen` property on `MermaidConfig`) and spread `chen: { ...defaultConfigJson.chen }` in `defaultConfig.ts`.
- **Create** `packages/mermaid/src/docs/syntax/chen.md` containing the complete Chen ER Notation Design Specification (Syntax, Data structures, Rendering rules, Validation rules, Summary table, and the full University/Library sample diagram).

---

## Critical Files & Anchors

- `packages/mermaid/src/rendering-util/rendering-elements/shapes.ts:545-615` (`generateShapeMap` / `undocumentedShapes`) — Register `chenEntity`, `chenWeakEntity`, `chenDiamond`, `chenDoubleDiamond`, `chenIsa`, and `chenAttribute`.
- `packages/mermaid/src/diagrams/common/parser/runChevrotainParse.ts:16-41` (`runChevrotainParse`) — Shared Chevrotain lexer/parser runner to reuse for `chen.chevrotain.ts`.
- `packages/mermaid/src/diagram-api/diagram-orchestration.ts:90-126` (`addDiagrams`) — Register lazy-loaded `chen` diagram detector.
- `packages/mermaid/src/diagram-api/diagram-beta-policy.spec.ts:77-108` (`new diagram types require -beta in syntax`) — Enforces that `id = 'chen'` accepts `chen-beta` and rejects bare `chen`.
- `packages/mermaid/src/schemas/config.schema.yaml:445-455` & `packages/mermaid/src/defaultConfig.ts:295-305` — Add `ChenDiagramConfig` schema definition and runtime default mapping.

---

## Verification

1. **Parser, AST, and Validation Unit Tests (`packages/mermaid/src/diagrams/chen/chen.spec.ts`)**:
   - Run: `pnpm --filter mermaid test src/diagrams/chen/chen.spec.ts --run`
   - Verify parsing of the complete LaTeX University/Library diagram (`Persona`, `Estudiante`, `Profesor`, `Autor`, `Asignatura`, `Imparte`, `Agregado_Imparte`, `Cursa`, `Libro`, `Bibliografia`, `Escribe`, `Ejemplar`, `Tiene`, `Presta`) and nested aggregations (`Outer_Agg` wrapping `Agregado_Imparte`).
   - Verify every validation rule rejects invalid input with exact error substrings:
     - Aggregation with 1 entity or 3 entities or 2 relationships $\to$ throws `must encapsulate exactly 2 entities/aggregations and 1 relationship`.
     - Weak entity without total participation in an identifying relationship $\to$ throws `Weak entity`.
     - `partialKey` on strong entity or `key` on weak entity $\to$ throws key constraint error.
     - Specialization cycle (`A` specializes `B` specializes `A`) $\to$ throws `Cycle detected in specialization hierarchy`.
2. **End-to-End SVG Rendering & Shape/Edge Geometry Tests (`packages/mermaid/src/diagrams/chen/chenRenderer.spec.ts`)**:
   - Run: `pnpm --filter mermaid test src/diagrams/chen/chenRenderer.spec.ts --run`
   - Render the full University/Library `chen-beta` diagram in JSDOM/Vitest and assert:
     - Double-line rectangle (`g.chen-weak-entity` with 2 `<rect>` children) is rendered for `Ejemplar`.
     - Double-line diamond (`g.chen-double-diamond` with 2 `<polygon>` children) is rendered for `Tiene`.
     - ISA symbol (`g.chen-isa` with `<polygon class="chen-isa-triangle">` and `<circle class="chen-isa-circle">`) and disjoint arc (`path.chen-disjoint-arc`) are rendered for `isa_persona`.
     - Double-line edges (`path.chen-double-edge` with two `M` subpaths in `d`) are rendered for `Persona === isa_persona` and `Tiene ==(N)== Ejemplar`, and arrowhead marker (`marker-end`) points to `Libro` on `Libro <-(1)- Tiene`.
     - Composite attribute `direccion` connects to `Estudiante` and to child ovals `calle` and `carrera`, while neither `calle` nor `carrera` has an edge to `Estudiante`.
     - Multivalued (`g.chen-attr-multi` with 2 `<ellipse>` children), derived (`ellipse.chen-attr-derived` with `stroke-dasharray`), primary key (`line.chen-key-underline`), and partial key (`line.chen-partial-key-underline` with `stroke-dasharray`) render their distinct SVG elements.
     - Aggregation `Agregado_Imparte` renders as `g.cluster.chen-aggregation` containing `Profesor`, `Asignatura`, `Imparte`, and their attributes, with `Cursa` edge connected to `Agregado_Imparte`.
3. **Global Policy & Config Schema Checks**:
   - Run: `pnpm --filter mermaid test src/diagram-api/diagram-beta-policy.spec.ts src/config.appearance.spec.ts --run`
   - Run: `pnpm --filter mermaid types:verify-config`

---

## Assumptions & Contingencies

- **Diagram Keyword**: Uses `chen-beta` (with diagram ID `'chen'`) to comply with `packages/mermaid/src/diagram-api/diagram-beta-policy.spec.ts`, which freezes `NEVER_BETA_DIAGRAMS` and requires `-beta` for all new diagram IDs.
- **Attribute Scoping**: Attribute names declared inside an entity or relationship block (`entity Persona { attr nombre }`) are automatically namespaced internally as `${ownerId}__${attrName}` so multiple entities can have attributes with the same display name (e.g., `nombre` on both `Persona` and `Asignatura`, matching the LaTeX guide) without requiring manual ID disambiguation. If a user writes `attr customId["nombre"]`, `customId` is used as the explicit attribute ID.
- **Fallback for Layout Engine Differences**: Both `dagre` and `elk` support cluster-to-node edges (`edge.fromCluster` / `edge.toCluster` in Dagre, compound nodes in ELK). If Dagre's `adjustClustersAndEdges` fails to clip an edge between a nested aggregation cluster and an inner relationship node, `chenDb.getData()` will route the edge to the inner aggregation's `relationshipId` with `fromCluster`/`toCluster` metadata so layout never stalls.
