import type { CstNode, IToken } from 'chevrotain';
import { db } from '../chenDb.js';
import type {
  ChenAttributeKind,
  ChenConnector,
  ChenDirection,
} from '../chenTypes.js';
import { chenParser } from './chen.parser.js';

type Ctx = Record<string, any>;

const BaseVisitor = chenParser.getBaseCstVisitorConstructor();

const unquote = (token: IToken): string => token.image.slice(1, -1);

const labelOf = (visitor: { visit: (node: CstNode) => string }, ctx: Ctx): string | undefined =>
  ctx.bracketLabel ? visitor.visit(ctx.bracketLabel[0]) : undefined;

/** Splits a style list on commas that are not inside parentheses (`rgb(1,2,3)`). */
const splitStyles = (text: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of text) {
    if (character === '(') {
      depth++;
    } else if (character === ')') {
      depth--;
    }
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
};

const CONNECTOR_PATTERN = /^(<)?([=-]+)(?:\([\t ]*(\w+)[\t ]*\)[=-]+)?(>)?$/;

/** Decodes a connector image such as `<-(1)-`, `==(N)==` or `-->`. */
export const decodeConnector = (image: string): ChenConnector => {
  const match = CONNECTOR_PATTERN.exec(image);
  if (!match) {
    throw new Error(`Invalid connector '${image}'`);
  }
  const [, arrowLeft, stroke, cardinalityLabel, arrowRight] = match;
  return {
    participation: stroke.startsWith('=') ? 'total' : 'partial',
    arrowLeft: arrowLeft !== undefined,
    arrowRight: arrowRight !== undefined,
    cardinalityLabel,
  };
};

const ATTRIBUTE_KINDS: [string, ChenAttributeKind][] = [
  ['Attr', 'simple'],
  ['Key', 'key'],
  ['PartialKey', 'partialKey'],
  ['Multi', 'multivalued'],
  ['Derived', 'derived'],
];

class ChenVisitor extends BaseVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  build(cst: CstNode): void {
    this.visit(cst);
  }

  start(ctx: Ctx) {
    for (const line of ctx.line ?? []) {
      this.visit(line);
    }
  }

  line(ctx: Ctx) {
    if (ctx.statement) {
      this.visit(ctx.statement);
    }
  }

  statementEnd() {
    // Pure terminator.
  }

  statement(ctx: Ctx) {
    // Exactly one alternative matched; visit it.
    this.visit(Object.values(ctx)[0] as CstNode[]);
  }

  accTitleStatement(ctx: Ctx) {
    const image = ctx.AccTitleLine[0].image as string;
    db.setAccTitle(image.slice(image.indexOf(':') + 1).trim());
  }

  accDescrStatement(ctx: Ctx) {
    const image = (ctx.AccDescrLine ?? ctx.AccDescrBlock)[0].image as string;
    if (ctx.AccDescrLine) {
      db.setAccDescription(image.slice(image.indexOf(':') + 1).trim());
    } else {
      db.setAccDescription(image.slice(image.indexOf('{') + 1, -1).trim());
    }
  }

  titleStatement(ctx: Ctx) {
    db.setDiagramTitle((ctx.TitleLine[0].image as string).slice('title'.length).trim());
  }

  directionStatement(ctx: Ctx) {
    const value = (ctx.DirectionLine[0].image as string).split(/[\t ]+/)[1];
    db.setDirection((value === 'TD' ? 'TB' : value) as ChenDirection);
  }

  classDefStatement(ctx: Ctx) {
    const match = /^classDef[\t ]+(\S+)[\t ]*(.*)$/.exec(ctx.ClassDefLine[0].image as string);
    db.addClass(splitStyles(match![1]), splitStyles(match![2]));
  }

  classStatement(ctx: Ctx) {
    const match = /^class[\t ]+(\S+)[\t ]+(\S+)\s*$/.exec(ctx.ClassLine[0].image as string);
    if (!match) {
      throw new Error(`Invalid class statement '${ctx.ClassLine[0].image}': expected 'class <ids> <className>'`);
    }
    db.setClass(splitStyles(match[1]), splitStyles(match[2]));
  }

  styleStatement(ctx: Ctx) {
    const match = /^style[\t ]+(\S+)[\t ]+(.+)$/.exec(ctx.StyleLine[0].image as string);
    if (!match) {
      throw new Error(`Invalid style statement '${ctx.StyleLine[0].image}': expected 'style <ids> <css>'`);
    }
    db.addCssStyles(splitStyles(match[1]), splitStyles(match[2]));
  }

  entityStatement(ctx: Ctx) {
    const id = ctx.Identifier[0].image as string;
    db.addEntity(id, labelOf(this, ctx), false);
    this.visitBlock(ctx, id);
  }

  weakStatement(ctx: Ctx) {
    const id = ctx.Identifier[0].image as string;
    const label = ctx.doubleBracketLabel ? this.visit(ctx.doubleBracketLabel[0]) : labelOf(this, ctx);
    db.addEntity(id, label, true);
    this.visitBlock(ctx, id);
  }

  relationshipStatement(ctx: Ctx) {
    const id = ctx.Identifier[0].image as string;
    db.addRelationship(id, labelOf(this, ctx), Boolean(ctx.Idrel ?? ctx.Identifying));
    this.visitBlock(ctx, id);
  }

  aggregationStatement(ctx: Ctx) {
    db.beginAggregation(ctx.Identifier[0].image as string, labelOf(this, ctx));
    for (const statement of ctx.statement ?? []) {
      this.visit(statement);
    }
    db.endAggregation();
  }

  isaStatement(ctx: Ctx) {
    const [id, supertype, ...subtypes] = (ctx.Identifier as IToken[]).map((t) => t.image);
    const connector = decodeConnector(ctx.Connector[0].image as string);
    this.assertPlainStroke(connector, id);
    db.addSpecialization({
      id,
      supertypeId: supertype,
      subtypeIds: subtypes,
      participation: connector.participation,
      disjointness: ctx.Disjoint ? 'disjoint' : 'overlapping',
    });
  }

  identifierStatement(ctx: Ctx) {
    const id = ctx.Identifier[0].image as string;
    if (ctx.linkTail) {
      this.visit(ctx.linkTail[0], { left: id });
    } else if (ctx.curlyLabel) {
      const { label, identifying } = this.visit(ctx.curlyLabel[0]);
      db.addRelationship(id, label, identifying);
      this.visitBlock(ctx, id);
    } else {
      const weak = Boolean(ctx.doubleBracketLabel);
      const label = this.visit((ctx.doubleBracketLabel ?? ctx.bracketLabel)[0]);
      db.addEntity(id, label, weak);
      this.visitBlock(ctx, id);
    }
  }

  linkTail(ctx: Ctx, param: { left: string }) {
    const { left } = param;
    if (ctx.attributeDeclaration) {
      this.visit(ctx.attributeDeclaration[0], { ownerId: left });
      return;
    }
    const right = ctx.Identifier[0].image as string;
    const connector = decodeConnector(ctx.Connector[0].image as string);
    const ending = ctx.linkEnding?.[0]?.children as Ctx | undefined;

    if (ending?.LeftSquare) {
      // Single-line ISA. `right` is the specialization id.
      this.assertPlainStroke(connector, right);
      db.addSpecialization({
        id: right,
        supertypeId: left,
        subtypeIds: (ending.Identifier as IToken[]).map((t) => t.image),
        participation: connector.participation,
        disjointness: ending.Disjoint ? 'disjoint' : 'overlapping',
      });
    } else if (ending?.Connector) {
      const next = decodeConnector(ending.Connector[0].image as string);
      db.addLeg({ left, right, connector, relationshipSide: 'right' });
      db.addLeg({
        left: right,
        right: ending.Identifier[0].image as string,
        connector: next,
        relationshipSide: 'left',
      });
    } else {
      const role = ending?.PlainString ? unquote(ending.PlainString[0]) : undefined;
      db.addLeg({ left, right, connector, role });
    }
  }

  linkEnding() {
    // Interpreted by `linkTail`, which also needs the identifier that precedes it.
  }

  bracketLabel(ctx: Ctx): string {
    return unquote(ctx.PlainString[0]);
  }

  doubleBracketLabel(ctx: Ctx): string {
    return unquote(ctx.PlainString[0]);
  }

  curlyLabel(ctx: Ctx): { label: string; identifying: boolean } {
    return { label: unquote(ctx.PlainString[0]), identifying: ctx.LeftCurly.length > 1 };
  }

  attributeBlock(ctx: Ctx, param: { ownerId: string }) {
    for (const declaration of ctx.attributeDeclaration ?? []) {
      this.visit(declaration, param);
    }
  }

  attributeDeclaration(ctx: Ctx, param: { ownerId: string }) {
    const [, attrType] = ATTRIBUTE_KINDS.find(([token]) => ctx[token])!;
    const name = ctx.Identifier[0].image as string;
    const label = labelOf(this, ctx);
    const hasBlock = Boolean(ctx.attributeBlock);
    if (hasBlock && attrType !== 'simple') {
      throw new Error(`Only 'attr' can declare child attributes, but '${name}' has a block`);
    }
    const id = db.addAttribute({
      name,
      attrType: hasBlock ? 'composite' : attrType,
      // `attr id["label"]` names the attribute globally; a bare name is scoped to its owner.
      explicitId: label === undefined ? undefined : name,
      label,
      ownerId: param.ownerId,
    });
    if (hasBlock) {
      this.visit(ctx.attributeBlock[0], { ownerId: id });
    }
  }

  private visitBlock(ctx: Ctx, ownerId: string) {
    if (ctx.attributeBlock) {
      this.visit(ctx.attributeBlock[0], { ownerId });
    }
  }

  private assertPlainStroke(connector: ChenConnector, id: string) {
    if (connector.arrowLeft || connector.arrowRight || connector.cardinalityLabel) {
      throw new Error(`Specialization '${id}' takes a plain connector (--- or ===)`);
    }
  }
}

export const chenVisitor = new ChenVisitor();
