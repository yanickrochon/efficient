

const RULES = [
  { pattern: /\s+/,                                 action: lexRuleIgnore },
  { pattern: /\(/,                                  action: lexRuleAccept('parenOpen') },
  { pattern: /\)/,                                  action: lexRuleAccept('parenClose') },
  { pattern: /(?:&&|\|\||[!<>]?=|[\+\-%\*\/\^<>])/, action: lexRuleAccept('operator') },
  { pattern: /!/,                                   action: lexRuleAccept('negate') },
  { pattern: /true|false|null|undefined/,           action: lexRuleAccept('reserved') },
  { pattern: /[-+]?(?:\d*\.\d+|\d+)/,               action: lexRuleNumber },
  { pattern: /"(?:\\\"|[^\r\n]+)+"/,                action: lexRuleAccept('string') },
  { pattern: /(?:[a-zA-Z_]\w*\.)*[a-zA-Z_]\w*/,     action: lexRuleContext },
  { pattern: /,/,                                   action: lexRuleAccept('separator') }
];


// current state > valid next states
const STATES = {
  // NOTE : spaces are ignored, no rules needed
  'default':    [ 'reserved', 'number', 'string', 'context', 'negate', 'parenOpen', 'EOF' ],
  'parenOpen':  [ 'reserved', 'number', 'string', 'context', 'parenOpen' ],
  'parenClose': [ 'operator', 'parenClose', 'EOF' ],
  'operator':   [ 'negate', 'reserved', 'number', 'string', 'context', 'parenOpen' ],
  'negate':     [ 'reserved', 'number', 'string', 'context', 'negate', 'parenOpen' ],
  'reserved':   [ 'operator', 'separator', 'parenClose', 'EOF' ],
  'number':     [ 'operator', 'separator', 'parenClose', 'EOF' ],
  'string':     [ 'operator', 'separator', 'parenClose', 'EOF' ],
  'context':    [ 'operator', 'separator', 'parenOpen', 'parenClose', 'EOF' ],
  'separator':  [ 'reserved', 'number', 'string', 'context' ]
};


const OPERATOR_PRIORITY = {
  '@': 7,   // special CALLFN operator
  ',': 6,
  '!': 5,
  '^': 4,
  '*': 4,
  '/': 4,
  '%': 4,
  '+': 3,
  '-': 3,
  '=': 2,
  '<': 2,
  '>': 2,
  '!=': 2,
  '<=': 2,
  '>=': 2,
  '||': 1,
  '&&': 1
}

var ParserException = require('./exceptions').ParserException;
var Tokenizr = require('tokenizr');



function lexRuleIgnore(ctx, match) {
  ctx.ignore();
}

function lexRuleAccept(type) {
  return function lexRuleParenOpen(ctx, match) {
    ctx.accept(type);
  };
}

function lexRuleNumber(ctx, match) {
  ctx.accept('number', parseFloat(match, 10));
}

function lexRuleContext(ctx, match) {
  ctx.accept('context', 'ctx.getContext("' + match + '").data');
}


module.exports = ExpressionParser;



function ExpressionParser() {
  var lexer = this._lexer = new Tokenizr();

  RULES.forEach(function (rule) {
    lexer.rule(rule.pattern, rule.action);
  });
};

ExpressionParser.prototype.parse = function parseExpression(expr) {
  var tokenStack = [];

  this._lexer.reset();
  this._lexer.input(expr);
  //lexer.debug(true);

  if (parseStatement(this._lexer, tokenStack) !== 'EOF') {
    throw ParserException('Unexpected closing parenthesis');
  }

  return tokenStack;
}




function parseStatement(lexer, tokenStack, state) {
  var closeTokenType = null;
  var token;
  var operatorStack = [];

  state = state || 'default';

  while (!closeTokenType && (token = lexer.token())) {
    if (state && STATES[state].indexOf(token.type) === -1) {
      throw ParserException('Unexpected token ' + token.text + ' in expression at position ' + token.pos);
    }

    // set current state
    state = token.type;

    switch (state) {
      case 'parenOpen':
        if ((state = parseStatement(lexer, tokenStack, state)) !== 'parenClose') {
          throw ParserException('Missing closing parenthesis');
        }
        break;
      case 'parenClose':
      case 'EOF':
        closeTokenType = state;
        break;
      case 'separator':
        flushOperators(tokenStack, operatorStack);
        tokenStack.push(token);
        break;
      case 'negate':
      case 'operator':
        flushOperators(tokenStack, operatorStack, token);
        operatorStack.push(token);
        break;
      case 'reserved':
      case 'number':
      case 'string':
        tokenStack.push(token);
        break;
      case 'context':
        tokenStack.push(parseContextArguments(lexer, token));
        break;
    }
  }

  flushOperators(tokenStack, operatorStack);

  return closeTokenType || 'EOF';
}


function parseContextArguments(lexer, contextToken) {
  var token;

  lexer.begin();

  token = lexer.token();

  if (token && token.type === 'parenOpen') {
    contextToken.arguments = lexer.alternatives(
      function noArgs() {
        if (lexer.token().type !== 'parenClose') {
          // NOTE : this is a placeholder error, the "hasArgs" alternative
          //        will be invoked, but we need to throw the same error as
          //        default error message...
          throw ParserException('Missing closing parenthesis');
        }

        return [];
      },
      function hasArgs() {
        var tokenStack = [];

        if (parseStatement(lexer, tokenStack, token.type) !== 'parenClose') {
          throw ParserException('Missing closing parenthesis');
        }

        return tokenStack;
      }
    );

    // was a function, commit everything and prepare next token
    lexer.commit();
  } else {

    // not a function, rollback the token we just consumed
    lexer.rollback();
  }

  return contextToken;
}


function flushOperators(tokenStack, operatorStack, token) {
  while (operatorStack.length && (!token || OPERATOR_PRIORITY[operatorStack[operatorStack.length - 1].text] > OPERATOR_PRIORITY[token.text])) {
    tokenStack.push(operatorStack.pop());
  }
}
