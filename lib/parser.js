

const PATTERN_SEGMENT = /\{\s*(.)?\s*\{\s*(?:([^:\s]+)\s*:)?\s*([^\/~\}]+(\/)?|~|\/)\s*\}\s*((?:\\\}|[^\}])+)?\s*\}/;
const PATTERN_MODIFIER = /^\s*([a-z]\w*)(?:\s*\(\s*([^)]*)\s*\))?\s*$/i;


const RULES = [
  { pattern: /\s+/,            action: lexRuleIgnore },
  { pattern: /[^{]+/,          action: lexRuleAccept('text') },
  { pattern: PATTERN_SEGMENT,  action: lexRuleSegment }
];

const SEGMENTS_MAP = {
  '?': 'conditional',
  '*': 'switch',
  '@': 'iterator',
  '&': 'custom',
  '#': 'namedDeclare',
  '+': 'namedRender',
  '>': 'partial'
};


var fs = require('fs');
var Tokenizr = require('tokenizr');
var ParserException = require('./exceptions').ParserException;
var ExpressionParser = require('./expr-parser');

var Parser = module.exports;
var exprParser = new ExpressionParser();

function lexRuleIgnore(ctx, match) {
  ctx.ignore();
}

function lexRuleAccept(type) {
  return function lexRuleParenOpen(ctx, match) {
    ctx.accept(type);
  };
}

function lexRuleSegment(ctx, match) {
  var tokenType;
  var segment = {};

  // 1. segment type
  if (match[1]) {
    segment.type = SEGMENTS_MAP[match[1]];

    if (!segment.type) {
      throw ParserException('Invalid segment type ' + match[1]);
    }

    tokenType = 'segment';
  } else {
    tokenType = 'ctxout';
  }

  // 2. context
  if (match[2]) {
    segment.context = match[2];
  }

  // 3. content
  if (match[3]) {
    // Closing segment
    if (match[3] === '/') {
      if (tokenType === 'ctxout') {
        throw ParserException('Unexpected token ' + match[3]);
      } else {
        segment.closing = true;
      }
    } else {
      segment.content = exprParser.parse(match[3]);
    }
  }

  // 4. Next or Closing
  if (match[4]) {
    if (segment.closing || tokenType === 'ctxout') {
      throw ParserException('Unexpected token ' + match[4]);
    } else if (match[4] === '~') {
      segment.next = true;
    } else if (match[4] === '/') {
      segment.closing = true;
    }
  }

  // 5. modifiers
  if (match[5]) {
    segment.modifiers = match[5].split('|').map(function (modifier) {
      var modifierMatch = modifier.match(PATTERN_MODIFIER);
      var modifierToken;

      if (!modifierMatch) {
        throw ParserException('Invalid modifier ' + modifier);
      }

      modifierToken = { action: modifierMatch[1] };

      if (typeof modifierMatch[2] === 'string') {
        modifierToken.arguments = exprParser.parse(modifierMatch[2]);
      }

      return modifierToken;
    });
  }

  //console.log("*** SEGMENT", segment);

  ctx.accept(tokenType, segment);
}



/**
Load a file and attempt to parse it's content
*/
Parser.parseFile = parseFile;

/**
Receive a string and parse it's content
*/
Parser.parseString = parseString;


Object.freeze(Parser);


/**
Load a file and feed it to parseString
*/
function parseFile(file) {
  return new Promise(function (resolve, reject) {
    fs.readFile(file, 'utf-8', function (err, content) {
      if (err) {
        reject(err);
      } else {
        resolve(content);
      }
    });
  }).then(function (content) {
    return parseString(content, file);
  });
}

/**
Takes a string and parse it into tokens that can be compiled afterwards
*/
function parseString(str, name) {
  var lexer;
  var token;
  var segments = [];

  if (str === undefined) {
    throw ParserException('Unspecified template');
  } else if (str === null) {
    return segments;
  } else if (typeof str !== 'string') {
    throw ParserException('Invalid template');
  }

  if (name !== undefined && name !== null && typeof name !== 'string') {
    throw ParserException('Invalid name');
  }

  lexer = new Tokenizr();

  RULES.forEach(function (rule) {
    if (rule.state) {
      lexer.rule(rule.state, rule.pattern, rule.action);
    } else {
      lexer.rule(rule.pattern, rule.action);
    }
  });

  lexer.input(str);

  while (token = lexer.token()) {

    switch (token.type) {
      case 'EOF':
        break;
      case 'segment':
      case 'ctxout':
      case 'text':
        segments.push(token);
        break;
    }
  }

  if (typeof name === 'string') {
    segments.name = name;
  }

  return segments;
}


function parseSegment(lexer) {

}



function error(msg, ctx) {
  var offset = Math.max(Math.min(ctx.offset - (NEAR_TEXT_LENGTH / 2), ctx.contentLength - NEAR_TEXT_LENGTH), 0);
  var len = NEAR_TEXT_LENGTH;
  var nearText = ctx.content.substr(offset, len);

  throw ParserException(msg + ' near "' + nearText + '" (' + (ctx.name ? ctx.name + ':' : '') + ctx.line + ':' + ctx.column + ')');
}