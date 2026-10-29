import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './chenDb.js';
import { parser } from './parser/chen.chevrotain.js';

export const UNIVERSITY_LIBRARY = `chen-beta
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
`;

const parse = async (text: string) => {
  await parser.parse(text);
  return db.getAST();
};

describe('chen-beta parser', () => {
  beforeEach(() => db.clear());

  describe('reference University/Library diagram', () => {
    it('parses every symbol', async () => {
      const ast = await parse(UNIVERSITY_LIBRARY);
      expect([...ast.entities.keys()]).toEqual([
        'Persona',
        'Estudiante',
        'Profesor',
        'Autor',
        'Asignatura',
        'Libro',
        'Ejemplar',
      ]);
      expect([...ast.relationships.keys()]).toEqual([
        'Imparte',
        'Cursa',
        'Bibliografia',
        'Escribe',
        'Tiene',
        'Presta',
      ]);
      expect(ast.entities.get('Ejemplar')!.weak).toBe(true);
      expect(ast.relationships.get('Tiene')!.identifying).toBe(true);
      expect(ast.specializations.get('isa_persona')).toMatchObject({
        supertypeId: 'Persona',
        subtypeIds: ['Estudiante', 'Profesor', 'Autor'],
        participation: 'total',
        disjointness: 'disjoint',
      });
    });

    it('scopes attribute ids to their owner so two owners can share a name', async () => {
      const ast = await parse(UNIVERSITY_LIBRARY);
      expect(ast.attributes.get('Persona__nombre')).toMatchObject({ ownerId: 'Persona' });
      expect(ast.attributes.get('Asignatura__nombre')).toMatchObject({ ownerId: 'Asignatura' });
    });

    it('builds composite attributes whose children attach only to the parent', async () => {
      const ast = await parse(UNIVERSITY_LIBRARY);
      const direccion = ast.attributes.get('Estudiante__direccion')!;
      expect(direccion.attrType).toBe('composite');
      expect(direccion.children).toEqual([
        'Estudiante__direccion__calle',
        'Estudiante__direccion__carrera',
      ]);
      expect(ast.attributes.get('Estudiante__direccion__calle')).toMatchObject({
        ownerKind: 'attribute',
        ownerId: 'Estudiante__direccion',
      });
      expect(ast.entities.get('Estudiante')!.attributes).not.toContain(
        'Estudiante__direccion__calle'
      );
    });

    it('assigns attribute kinds', async () => {
      const ast = await parse(UNIVERSITY_LIBRARY);
      expect(ast.attributes.get('Persona__codPersona')!.attrType).toBe('key');
      expect(ast.attributes.get('Ejemplar__numero_ejemplar')!.attrType).toBe('partialKey');
      expect(ast.attributes.get('Estudiante__telefonos')!.attrType).toBe('multivalued');
      expect(ast.attributes.get('Cursa__nota_definitiva')!.attrType).toBe('derived');
    });

    it('decodes cardinality, participation and arrow direction', async () => {
      const ast = await parse(UNIVERSITY_LIBRARY);
      const tiene = ast.links.filter((l) => l.relationshipId === 'Tiene');
      expect(tiene).toMatchObject([
        { targetId: 'Libro', cardinality: 'one', cardinalityLabel: '1', participation: 'partial' },
        { targetId: 'Ejemplar', cardinality: 'many', cardinalityLabel: 'N', participation: 'total' },
      ]);
    });

    it('encapsulates exactly two participants and one relationship in an aggregation', async () => {
      const ast = await parse(UNIVERSITY_LIBRARY);
      const aggregation = ast.aggregations.get('Agregado_Imparte')!;
      expect(aggregation.participants.sort()).toEqual(['Asignatura', 'Profesor']);
      expect(aggregation.relationshipIds).toEqual(['Imparte']);
      expect(ast.entities.get('Profesor')!.parentId).toBe('Agregado_Imparte');
      expect(ast.relationships.get('Imparte')!.parentId).toBe('Agregado_Imparte');
      expect(ast.attributes.get('Imparte__horario')!.parentId).toBe('Agregado_Imparte');
      expect(ast.attributes.get('Profesor__profesion')!.parentId).toBe('Agregado_Imparte');
      expect(ast.relationships.get('Cursa')!.parentId).toBeUndefined();
    });

    it('links an entity to an aggregation as a target', async () => {
      const ast = await parse(UNIVERSITY_LIBRARY);
      expect(ast.links.find((l) => l.relationshipId === 'Cursa' && l.targetKind === 'aggregation'))
        .toMatchObject({ targetId: 'Agregado_Imparte', cardinalityLabel: 'M' });
    });
  });

  describe('declaration forms', () => {
    it('accepts shorthand entities, weak entities and relationships', async () => {
      const ast = await parse(`chen-beta
  Libro["Book"]
  Ejemplar[["Copy"]]
  Tiene{{"Has"}}
  Escribe{"Writes"} {
    attr fecha
  }
  Libro <-- Tiene === Ejemplar
  Libro -- Escribe -- Libro2
`);
      expect(ast.entities.get('Libro')).toMatchObject({ label: 'Book', weak: false });
      expect(ast.entities.get('Ejemplar')).toMatchObject({ label: 'Copy', weak: true });
      expect(ast.relationships.get('Tiene')).toMatchObject({ label: 'Has', identifying: true });
      expect(ast.relationships.get('Escribe')).toMatchObject({ identifying: false });
      expect(ast.attributes.has('Escribe__fecha')).toBe(true);
    });

    it('accepts keyword forms with labels and an explicit attribute id', async () => {
      const ast = await parse(`chen-beta
  entity Persona["Persona"] {
    key id["Identifier"]
  }
  weak Child["Child"] {
    partialKey n
  }
  identifying relationship Has["Has"]
  relationship Knows
  Persona <-- Has === Child
  Persona -- Knows -- Persona2
`);
      expect(ast.attributes.get('id')).toMatchObject({ label: 'Identifier', ownerId: 'Persona' });
      expect(ast.entities.get('Child')!.weak).toBe(true);
      expect(ast.relationships.get('Has')!.identifying).toBe(true);
    });

    it('creates undeclared chain middles as relationships and undeclared ends as entities', async () => {
      const ast = await parse(`chen-beta
  A -(1)- R -(N)- B
`);
      expect(ast.relationships.has('R')).toBe(true);
      expect(ast.entities.has('A')).toBe(true);
      expect(ast.entities.has('B')).toBe(true);
    });

    it('reads a role on a single leg and standalone attributes', async () => {
      const ast = await parse(`chen-beta
  entity Person
  rel Supervises
  Supervises --- Person : "boss"
  Person -- Supervises : "worker"
  Person --- attr age
  Person --- key pid["Person ID"]
`);
      expect(ast.links.map((l) => l.role)).toEqual(['boss', 'worker']);
      expect(ast.attributes.get('Person__age')).toBeDefined();
      expect(ast.attributes.get('pid')).toMatchObject({ attrType: 'key', label: 'Person ID' });
    });

    it('supports n-ary relationships', async () => {
      const ast = await parse(`chen-beta
  rel Supply
  Supplier -- Supply
  Part -- Supply
  Project -- Supply
`);
      expect(ast.links.filter((l) => l.relationshipId === 'Supply')).toHaveLength(3);
    });

    it('supports the single-line ISA form with an overlapping default', async () => {
      const ast = await parse(`chen-beta
  entity Vehicle
  Vehicle --- isa1[isa] --- Car, Truck
  Vehicle === isa2[isa: disjoint] --- Bike
`);
      expect(ast.specializations.get('isa1')).toMatchObject({
        participation: 'partial',
        disjointness: 'overlapping',
        subtypeIds: ['Car', 'Truck'],
      });
      expect(ast.specializations.get('isa2')).toMatchObject({
        participation: 'total',
        disjointness: 'disjoint',
      });
    });

    it('supports nested aggregations', async () => {
      const ast = await parse(`chen-beta
  aggregation Outer_Agg {
    aggregation Inner_Agg {
      Profesor -(1)- Imparte -(N)- Asignatura
    }
    Estudiante -(N)- Cursa -(M)- Inner_Agg
  }
`);
      expect(ast.aggregations.get('Inner_Agg')!.parentId).toBe('Outer_Agg');
      expect(ast.aggregations.get('Outer_Agg')!.participants.sort()).toEqual([
        'Estudiante',
        'Inner_Agg',
      ]);
      expect(ast.relationships.get('Cursa')!.parentId).toBe('Outer_Agg');
      expect(ast.relationships.get('Imparte')!.parentId).toBe('Inner_Agg');
    });

    it('supports single-line aggregation blocks', async () => {
      const ast = await parse('chen-beta\n  aggregation A { X -- R -- Y }\n');
      expect(ast.aggregations.get('A')!.participants).toEqual(['X', 'Y']);
    });

    it('reads title, accessibility, direction and styling statements', async () => {
      await parse(`chen-beta
  title Library
  accTitle: Library schema
  accDescr: Books and copies
  direction LR
  entity Book
  classDef hot fill:#f96,stroke:#333
  class Book hot
  style Book stroke-width:3px
`);
      expect(db.getDiagramTitle()).toBe('Library');
      expect(db.getAccTitle()).toBe('Library schema');
      expect(db.getAccDescription()).toBe('Books and copies');
      expect(db.getDirection()).toBe('LR');
      const book = db.getData().nodes.find((n) => n.id === 'Book')!;
      expect(book.cssClasses).toContain('hot');
      expect(book.cssStyles).toContain('stroke-width:3px');
      expect(book.cssCompiledStyles).toContain('fill:#f96');
    });
  });

  describe('validation', () => {
    const reject = async (text: string, message: string | RegExp) => {
      await expect(parser.parse(text)).rejects.toThrow(message);
    };

    it('rejects an aggregation with one participant', async () => {
      await reject(
        'chen-beta\n  aggregation A { X -- R -- X }\n',
        'must encapsulate exactly 2 entities/aggregations and 1 relationship'
      );
    });

    it('rejects an aggregation with three participants', async () => {
      await reject(
        `chen-beta
  aggregation A {
    X -- R -- Y
    Z -- R
  }
`,
        'and 1 relationship between them (found 3 participants and 1 relationships)'
      );
    });

    it('rejects an aggregation with two relationships', async () => {
      await reject(
        `chen-beta
  aggregation A {
    X -- R1 -- Y
    X -- R2 -- Y
  }
`,
        '(found 2 participants and 2 relationships)'
      );
    });

    it('rejects an empty aggregation', async () => {
      await reject('chen-beta\n  aggregation A {\n  }\n', '(found 0 participants and 0 relationships)');
    });

    it('rejects an entity encapsulated by two aggregations', async () => {
      await reject(
        `chen-beta
  aggregation A { X -- R1 -- Y }
  aggregation B { X -- R2 -- Z }
`,
        "Node 'X' is already encapsulated by aggregation 'A'"
      );
    });

    it('rejects an aggregation used inside another that does not declare it', async () => {
      await reject(
        `chen-beta
  aggregation Inner { X -- R1 -- Y }
  aggregation Outer { W -- R2 -- Inner }
`,
        "Nested aggregation 'Inner' must be declared inside 'Outer'"
      );
    });

    it('rejects a weak entity that is not totally identified', async () => {
      await reject(
        `chen-beta
  entity Owner { key id }
  weak entity Weak { partialKey n }
  rel R
  Owner <-- R -- Weak
`,
        "Weak entity 'Weak' must participate totally (==) in at least one identifying relationship"
      );
    });

    it('rejects an identifying relationship without an owner side', async () => {
      await reject(
        `chen-beta
  entity Owner { key id }
  weak entity Weak { partialKey n }
  idrel R
  Owner -- R === Weak
`,
        "Identifying relationship 'R'"
      );
    });

    it('rejects partialKey on a strong entity and key on a weak entity', async () => {
      await reject(
        'chen-beta\n  entity E { partialKey p }\n',
        "Partial key 'p' can only belong to a weak entity"
      );
      await reject(
        `chen-beta
  entity Owner { key id }
  weak entity W { key k }
  idrel R
  Owner <-- R === W
`,
        "Primary key 'k' can only belong to a strong entity"
      );
    });

    it('rejects keys on relationships and on composite children', async () => {
      await reject(
        'chen-beta\n  rel R { key k }\n  A -- R -- B\n',
        "Primary key 'k' can only belong to a strong entity"
      );
      await reject(
        'chen-beta\n  entity E { attr c { key k } }\n',
        "Child attribute 'k' of composite attribute 'c' cannot be a key or partial key"
      );
    });

    it('rejects an empty composite attribute', async () => {
      await reject(
        'chen-beta\n  entity E { attr c { } }\n',
        "Composite attribute 'c' must declare at least 1 child attribute"
      );
    });

    it('rejects a relationship with fewer than two links', async () => {
      await reject(
        'chen-beta\n  rel R\n  A -- R\n',
        "Relationship 'R' must connect at least 2 entities or aggregations"
      );
    });

    it('rejects an arrowhead that points at the relationship', async () => {
      await reject('chen-beta\n  A --> R -- B\n', /Arrowhead must point at the entity/);
    });

    it('rejects relationship endpoints that are not entities or aggregations', async () => {
      await reject(
        `chen-beta
  entity E { attr a }
  rel R
  isa i from E --- { F }
  R -- i
  R -- E
`,
        "Invalid relationship endpoint 'i': expected entity or aggregation, got specialization"
      );
    });

    it('rejects a specialization cycle', async () => {
      await reject(
        `chen-beta
  isa i1 from A --- { B }
  isa i2 from B --- { A }
`,
        'Cycle detected in specialization hierarchy'
      );
    });

    it('rejects bad specializations', async () => {
      await reject(
        'chen-beta\n  isa i from A --- { A }\n',
        "supertype 'A' cannot also be one of its subtypes"
      );
      await reject(
        'chen-beta\n  isa i from A --- { B, B }\n',
        "lists subtype 'B' more than once"
      );
      await reject('chen-beta\n  isa i from A --- { }\n', "Specialization 'i' must have at least 1 subtype");
      await reject(
        'chen-beta\n  entity A\n  rel R\n  A -- R -- B\n  isa i from A --- { R }\n',
        "Invalid specialization 'i': 'R' must be an entity, got relationship"
      );
    });

    it('rejects a symbol defined twice', async () => {
      await reject(
        'chen-beta\n  entity A\n  rel A\n',
        "Symbol 'A' is already defined as a entity"
      );
      await reject(
        'chen-beta\n  entity E { attr n attr n }\n',
        "Symbol 'E__n' is already defined as a attribute"
      );
    });

    it('rejects an ambiguous two-node link', async () => {
      await reject('chen-beta\n  A -- B\n', "Cannot tell which of 'A' and 'B' is the relationship");
    });

    it('reports parse errors with a location', async () => {
      await reject('chen-beta\n  entity\n', /line 2/);
    });
  });
});
