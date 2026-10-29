import { CstParser, EMPTY_ALT, EOF } from 'chevrotain';
import type { CstNode } from 'chevrotain';
import {
  AccDescrBlock,
  AccDescrLine,
  AccTitleLine,
  Aggregation,
  Attr,
  ClassDefLine,
  ClassLine,
  Colon,
  Comma,
  Connector,
  Derived,
  DirectionLine,
  Disjoint,
  Entity,
  From,
  Header,
  Identifier,
  Identifying,
  Idrel,
  Isa,
  Key,
  LeftCurly,
  LeftSquare,
  Multi,
  NewLine,
  Overlapping,
  PartialKey,
  PlainString,
  Rel,
  Relationship,
  RightCurly,
  RightSquare,
  StyleLine,
  TitleLine,
  Weak,
  chenTokens,
} from './chen.tokens.js';

class ChenParser extends CstParser {
  declare start: () => CstNode;
  declare line: () => CstNode;
  declare statement: () => CstNode;
  declare statementEnd: () => CstNode;
  declare accTitleStatement: () => CstNode;
  declare accDescrStatement: () => CstNode;
  declare titleStatement: () => CstNode;
  declare directionStatement: () => CstNode;
  declare classDefStatement: () => CstNode;
  declare classStatement: () => CstNode;
  declare styleStatement: () => CstNode;
  declare entityStatement: () => CstNode;
  declare weakStatement: () => CstNode;
  declare relationshipStatement: () => CstNode;
  declare aggregationStatement: () => CstNode;
  declare isaStatement: () => CstNode;
  declare identifierStatement: () => CstNode;
  declare linkTail: () => CstNode;
  declare linkEnding: () => CstNode;
  declare bracketLabel: () => CstNode;
  declare doubleBracketLabel: () => CstNode;
  declare curlyLabel: () => CstNode;
  declare attributeBlock: () => CstNode;
  declare attributeDeclaration: () => CstNode;

  constructor() {
    super(chenTokens, { nodeLocationTracking: 'full' });

    this.RULE('start', () => {
      this.CONSUME(Header);
      this.OR([{ ALT: () => this.CONSUME(NewLine) }, { ALT: () => this.CONSUME(EOF) }]);
      this.MANY(() => this.SUBRULE(this.line));
    });

    this.RULE('line', () => {
      this.OR([
        { ALT: () => this.CONSUME(NewLine) },
        {
          ALT: () => {
            this.SUBRULE(this.statement);
            this.SUBRULE(this.statementEnd);
          },
        },
      ]);
    });

    // A statement ends at a line break, at the end of input, or right before the `}` that
    // closes the block it sits in (so `aggregation A { X -- R -- Y }` fits on one line).
    this.RULE('statementEnd', () => {
      this.OR([
        { ALT: () => this.CONSUME(NewLine) },
        { ALT: () => this.CONSUME(EOF) },
        { GATE: () => this.LA(1).tokenType === RightCurly, ALT: EMPTY_ALT() },
      ]);
    });

    this.RULE('statement', () => {
      this.OR([
        { ALT: () => this.SUBRULE(this.accTitleStatement) },
        { ALT: () => this.SUBRULE(this.accDescrStatement) },
        { ALT: () => this.SUBRULE(this.titleStatement) },
        { ALT: () => this.SUBRULE(this.directionStatement) },
        { ALT: () => this.SUBRULE(this.classDefStatement) },
        { ALT: () => this.SUBRULE(this.classStatement) },
        { ALT: () => this.SUBRULE(this.styleStatement) },
        { ALT: () => this.SUBRULE(this.entityStatement) },
        { ALT: () => this.SUBRULE(this.weakStatement) },
        { ALT: () => this.SUBRULE(this.relationshipStatement) },
        { ALT: () => this.SUBRULE(this.aggregationStatement) },
        { ALT: () => this.SUBRULE(this.isaStatement) },
        { ALT: () => this.SUBRULE(this.identifierStatement) },
      ]);
    });

    this.RULE('accTitleStatement', () => {
      this.CONSUME(AccTitleLine);
    });
    this.RULE('accDescrStatement', () => {
      this.OR([
        { ALT: () => this.CONSUME(AccDescrLine) },
        { ALT: () => this.CONSUME(AccDescrBlock) },
      ]);
    });
    this.RULE('titleStatement', () => {
      this.CONSUME(TitleLine);
    });
    this.RULE('directionStatement', () => {
      this.CONSUME(DirectionLine);
    });
    this.RULE('classDefStatement', () => {
      this.CONSUME(ClassDefLine);
    });
    this.RULE('classStatement', () => {
      this.CONSUME(ClassLine);
    });
    this.RULE('styleStatement', () => {
      this.CONSUME(StyleLine);
    });

    this.RULE('entityStatement', () => {
      this.CONSUME(Entity);
      this.CONSUME(Identifier);
      this.OPTION(() => this.SUBRULE(this.bracketLabel));
      this.OPTION2(() => this.SUBRULE(this.attributeBlock));
    });

    this.RULE('weakStatement', () => {
      this.CONSUME(Weak);
      this.OPTION(() => this.CONSUME(Entity));
      this.CONSUME(Identifier);
      this.OPTION2(() =>
        this.OR([
          { ALT: () => this.SUBRULE(this.bracketLabel) },
          { ALT: () => this.SUBRULE(this.doubleBracketLabel) },
        ])
      );
      this.OPTION3(() => this.SUBRULE(this.attributeBlock));
    });

    this.RULE('relationshipStatement', () => {
      this.OR([
        { ALT: () => this.CONSUME(Idrel) },
        {
          ALT: () => {
            this.CONSUME(Identifying);
            this.OR2([
              { ALT: () => this.CONSUME(Rel) },
              { ALT: () => this.CONSUME(Relationship) },
            ]);
          },
        },
        { ALT: () => this.CONSUME2(Rel) },
        { ALT: () => this.CONSUME2(Relationship) },
      ]);
      this.CONSUME(Identifier);
      this.OPTION(() => this.SUBRULE(this.bracketLabel));
      this.OPTION2(() => this.SUBRULE(this.attributeBlock));
    });

    this.RULE('aggregationStatement', () => {
      this.CONSUME(Aggregation);
      this.CONSUME(Identifier);
      this.OPTION(() => this.SUBRULE(this.bracketLabel));
      this.CONSUME(LeftCurly);
      this.MANY(() =>
        this.OR([
          { ALT: () => this.CONSUME(NewLine) },
          {
            ALT: () => {
              this.SUBRULE(this.statement);
              this.SUBRULE(this.statementEnd);
            },
          },
        ])
      );
      this.CONSUME(RightCurly);
    });

    this.RULE('isaStatement', () => {
      this.CONSUME(Isa);
      this.CONSUME(Identifier);
      this.CONSUME(From);
      this.CONSUME2(Identifier);
      this.CONSUME(Connector);
      this.OPTION(() =>
        this.OR([{ ALT: () => this.CONSUME(Disjoint) }, { ALT: () => this.CONSUME(Overlapping) }])
      );
      this.CONSUME(LeftCurly);
      this.MANY(() =>
        this.OR2([
          { ALT: () => this.CONSUME3(Identifier) },
          { ALT: () => this.CONSUME(Comma) },
          { ALT: () => this.CONSUME(NewLine) },
        ])
      );
      this.CONSUME(RightCurly);
    });

    // Everything that begins with a bare identifier: shorthand declarations, standalone
    // attributes, relationship links, and the single-line ISA form.
    this.RULE('identifierStatement', () => {
      this.CONSUME(Identifier);
      this.OR([
        {
          ALT: () => {
            this.OR2([
              { ALT: () => this.SUBRULE(this.bracketLabel) },
              { ALT: () => this.SUBRULE(this.doubleBracketLabel) },
            ]);
            this.OPTION(() => this.SUBRULE(this.attributeBlock));
          },
        },
        {
          ALT: () => {
            this.SUBRULE(this.curlyLabel);
            this.OPTION2(() => this.SUBRULE2(this.attributeBlock));
          },
        },
        { ALT: () => this.SUBRULE(this.linkTail) },
      ]);
    });

    this.RULE('linkTail', () => {
      this.CONSUME(Connector);
      this.OR([
        { ALT: () => this.SUBRULE(this.attributeDeclaration) },
        {
          ALT: () => {
            this.CONSUME(Identifier);
            this.OPTION(() => this.SUBRULE(this.linkEnding));
          },
        },
      ]);
    });

    this.RULE('linkEnding', () => {
      this.OR([
        {
          // Chain: `A - R - B`
          ALT: () => {
            this.CONSUME(Connector);
            this.CONSUME(Identifier);
          },
        },
        {
          // Single-line ISA: `Super === isa[isa: disjoint] --- Sub1, Sub2`
          ALT: () => {
            this.CONSUME(LeftSquare);
            this.CONSUME(Isa);
            this.OPTION(() => {
              this.CONSUME(Colon);
              this.OR2([
                { ALT: () => this.CONSUME(Disjoint) },
                { ALT: () => this.CONSUME(Overlapping) },
              ]);
            });
            this.CONSUME(RightSquare);
            this.CONSUME2(Connector);
            this.CONSUME2(Identifier);
            this.MANY(() => {
              this.CONSUME(Comma);
              this.CONSUME3(Identifier);
            });
          },
        },
        {
          // Role: `A - R : "role"`
          ALT: () => {
            this.CONSUME2(Colon);
            this.CONSUME(PlainString);
          },
        },
      ]);
    });

    this.RULE('bracketLabel', () => {
      this.CONSUME(LeftSquare);
      this.CONSUME(PlainString);
      this.CONSUME(RightSquare);
    });

    this.RULE('doubleBracketLabel', () => {
      this.CONSUME(LeftSquare);
      this.CONSUME2(LeftSquare);
      this.CONSUME(PlainString);
      this.CONSUME(RightSquare);
      this.CONSUME2(RightSquare);
    });

    this.RULE('curlyLabel', () => {
      this.OR([
        {
          ALT: () => {
            this.CONSUME(LeftCurly);
            this.CONSUME(PlainString);
            this.CONSUME(RightCurly);
          },
        },
        {
          ALT: () => {
            this.CONSUME2(LeftCurly);
            this.CONSUME3(LeftCurly);
            this.CONSUME2(PlainString);
            this.CONSUME2(RightCurly);
            this.CONSUME3(RightCurly);
          },
        },
      ]);
    });

    this.RULE('attributeBlock', () => {
      this.CONSUME(LeftCurly);
      this.MANY(() =>
        this.OR([
          { ALT: () => this.CONSUME(NewLine) },
          { ALT: () => this.SUBRULE(this.attributeDeclaration) },
        ])
      );
      this.CONSUME(RightCurly);
    });

    this.RULE('attributeDeclaration', () => {
      this.OR([
        { ALT: () => this.CONSUME(Attr) },
        { ALT: () => this.CONSUME(Key) },
        { ALT: () => this.CONSUME(PartialKey) },
        { ALT: () => this.CONSUME(Multi) },
        { ALT: () => this.CONSUME(Derived) },
      ]);
      this.CONSUME(Identifier);
      this.OPTION(() => this.SUBRULE(this.bracketLabel));
      this.OPTION2(() => this.SUBRULE(this.attributeBlock));
    });

    this.performSelfAnalysis();
  }
}

export const chenParser = new ChenParser();
