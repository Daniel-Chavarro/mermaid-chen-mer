import { Lexer, createToken } from 'chevrotain';
import type { CustomPatternMatcherFunc, TokenType } from 'chevrotain';

const customMatch = (text: string, offset: number, image: string): RegExpExecArray => {
  const match = [image] as unknown as RegExpExecArray;
  match.index = offset;
  match.input = text;
  return match;
};

const isLineStart = (text: string, offset: number): boolean => {
  for (let index = offset - 1; index >= 0; index--) {
    const character = text[index];
    if (character === '\n' || character === '\r') {
      return true;
    }
    if (character !== ' ' && character !== '\t') {
      return false;
    }
  }
  return true;
};

/** A token that is only recognised as the first thing on its line, and runs to the line end. */
const lineToken = (name: string, pattern: RegExp, startChar: string) => {
  const matcher: CustomPatternMatcherFunc = (text, offset) => {
    if (!isLineStart(text, offset)) {
      return null;
    }
    pattern.lastIndex = offset;
    const match = pattern.exec(text);
    return match ? customMatch(text, offset, match[0]) : null;
  };
  return createToken({ name, pattern: matcher, start_chars_hint: [startChar], line_breaks: false });
};

const matchAccDescrBlock: CustomPatternMatcherFunc = (text, offset) => {
  if (!isLineStart(text, offset)) {
    return null;
  }
  const opening = /accDescr[\t ]*{/y;
  opening.lastIndex = offset;
  const match = opening.exec(text);
  if (!match) {
    return null;
  }
  const end = text.indexOf('}', offset + match[0].length);
  return end === -1 ? null : customMatch(text, offset, text.slice(offset, end + 1));
};

export const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /[\t ]+/,
  group: Lexer.SKIPPED,
});
export const Comment = createToken({
  name: 'Comment',
  pattern: /%%[^\n\r]*/,
  group: Lexer.SKIPPED,
});
export const NewLine = createToken({ name: 'NewLine', pattern: /\r\n|\n|\r/, line_breaks: true });

export const AccDescrBlock = createToken({
  name: 'AccDescrBlock',
  pattern: matchAccDescrBlock,
  start_chars_hint: ['a'],
  line_breaks: true,
});
export const AccTitleLine = lineToken('AccTitleLine', /accTitle[\t ]*:[^\n\r]*/y, 'a');
export const AccDescrLine = lineToken('AccDescrLine', /accDescr[\t ]*:[^\n\r]*/y, 'a');
export const TitleLine = lineToken('TitleLine', /title[\t ]+[^\n\r]*/y, 't');
export const DirectionLine = lineToken(
  'DirectionLine',
  /direction[\t ]+(?:TB|TD|BT|LR|RL)\b/y,
  'd'
);
export const ClassDefLine = lineToken('ClassDefLine', /classDef[\t ]+[^\n\r]*/y, 'c');
export const ClassLine = lineToken('ClassLine', /class[\t ]+[^\n\r]*/y, 'c');
export const StyleLine = lineToken('StyleLine', /style[\t ]+[^\n\r]*/y, 's');

export const Identifier = createToken({
  name: 'Identifier',
  pattern: /[A-Z_a-z\u00C0-\u024F][\w\u00C0-\u024F]*/,
});

const keyword = (name: string, pattern: RegExp) =>
  createToken({ name, pattern, longer_alt: Identifier });

export const Header = keyword('Header', /chen-beta/);
export const Entity = keyword('Entity', /entity/);
export const Weak = keyword('Weak', /weak/);
export const Relationship = keyword('Relationship', /relationship/);
export const Rel = keyword('Rel', /rel/);
export const Idrel = keyword('Idrel', /idrel/);
export const Identifying = keyword('Identifying', /identifying/);
export const Aggregation = keyword('Aggregation', /aggregation/);
export const Isa = keyword('Isa', /isa/);
export const From = keyword('From', /from/);
export const Disjoint = keyword('Disjoint', /disjoint/);
export const Overlapping = keyword('Overlapping', /overlapping/);
export const Attr = keyword('Attr', /attr/);
export const Key = keyword('Key', /key/);
export const PartialKey = keyword('PartialKey', /partialKey/);
export const Multi = keyword('Multi', /multi/);
export const Derived = keyword('Derived', /derived/);

/**
 * `-`, `--`, `<--`, `-->`, `-(N)-`, `<-(1)-`, `-(1)->`, and the same with `=` for total
 * participation. The stroke character cannot change inside one connector.
 */
export const Connector = createToken({
  name: 'Connector',
  pattern: /<?-+(?:\([\t ]*\w+[\t ]*\)-+)?>?|<?=+(?:\([\t ]*\w+[\t ]*\)=+)?>?/,
});

export const PlainString = createToken({
  name: 'PlainString',
  pattern: /"[^\n\r"]*"|'[^\n\r']*'/,
});
export const LeftSquare = createToken({ name: 'LeftSquare', pattern: /\[/ });
export const RightSquare = createToken({ name: 'RightSquare', pattern: /]/ });
export const LeftCurly = createToken({ name: 'LeftCurly', pattern: /{/ });
export const RightCurly = createToken({ name: 'RightCurly', pattern: /}/ });
export const Comma = createToken({ name: 'Comma', pattern: /,/ });
export const Colon = createToken({ name: 'Colon', pattern: /:/ });

export const chenTokens: TokenType[] = [
  WhiteSpace,
  Comment,
  NewLine,
  AccDescrBlock,
  AccTitleLine,
  AccDescrLine,
  TitleLine,
  DirectionLine,
  ClassDefLine,
  ClassLine,
  StyleLine,
  Header,
  Entity,
  Weak,
  Relationship,
  Rel,
  Idrel,
  Identifying,
  Aggregation,
  Isa,
  From,
  Disjoint,
  Overlapping,
  Attr,
  Key,
  PartialKey,
  Multi,
  Derived,
  Connector,
  PlainString,
  LeftSquare,
  RightSquare,
  LeftCurly,
  RightCurly,
  Comma,
  Colon,
  Identifier,
];
