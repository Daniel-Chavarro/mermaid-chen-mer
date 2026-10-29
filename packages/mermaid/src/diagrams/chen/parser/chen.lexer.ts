import { Lexer } from 'chevrotain';
import { chenTokens } from './chen.tokens.js';

/** Singleton lexer; construction and validation happen once at module load. */
export const chenLexer = new Lexer(chenTokens);
