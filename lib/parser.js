

/**
At some point, maybe consider using more tokens?? Is this optimal? Safe?
So far, this is the lazy road, but it works
**/
//                             1              2                 3                               4              5
const PATTERN_SEGMENT = /\{\s*(.)?\s*\{\s*(?:([^:\s]+)\s*:)?\s*((?:\\~|\\\/|[^~\/])+?(?!~))?\s*(~|\/)?\s*\}\s*((?:\\\}|[^\}])+)?\s*\}/;
const PATTERN_MODIFIER = /^\s*([a-z]\w*)(?:\s*\(\s*([^)]*)\s*\))?\s*$/i;


const RULES = [
  { pattern: /[^{]+/,          action: lexRuleAccept('text') },
  { pattern: PATTERN_SEGMENT,  action: lexRuleSegment }
];

const SEGMENT_OPTIONS = {
  '?': { type: 'conditional',  min: 1, max: 2 },
  '*': { type: 'switch',       min: 1, max: Infinity },
  '@': { type: 'iterator',     min: 1, max: 1 },
  '&': { type: 'custom',       min: 0, max: Infinity },
  '#': { type: 'namedDeclare', min: 1, max: 1 },
  '+': { type: 'namedRender',  min: 0, max: 0 },
  '>': { type: 'partial',      min: 0, max: 0 }
};
const SEGMENT_REVERSE = {
  'conditional':  '?',
  'switch':       '*',
  'iterator':     '@',
  'custom':       '&',
  'namedDeclare': '#',
  'namedRender':  '+',
  'partial':      '>'
}


var path = require('path');
var fs = require('fs');
var Tokenizr = require('tokenizr');
var ParserException = require('./exceptions').ParserException;
var ExpressionParser = require('./expr-parser');

var Parser = module.exports;
var exprParser = new ExpressionParser();

function lexRuleAccept(type) {
  return function lexRuleParenOpen(ctx, match) {
    ctx.accept(type);
  };
}

function lexRuleSegment(ctx, match) {
  var tokenType;
  var segmentOptions;
  var segment = {};

  //console.log("*** SEG", match);

  // 1. segment type
  if (match[1]) {
    segmentOptions = SEGMENT_OPTIONS[match[1]];

    if (!segmentOptions) {
      throw ParserException('Invalid segment type ' + match[1]);
    }

    segment.type = segmentOptions.type;
    tokenType = 'segment';
  } else {
    tokenType = 'output';
  }

  // 2. context
  if (match[2]) {
    segment.context = match[2];
  }

  // 3. content
  if (match[3]) {
    segment.content = exprParser.parse(match[3]);
  }

  // 4. Next or Closing
  if (match[4]) {
    if (!segmentOptions) {
      throw ParserException('Unexpected token ' + match[4]);
    } else if (match[4] === '~') {
      segment.next = true;
    } else /*if (match[4] === '/')*/ {
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
    return parseString(content, path.relative(process.cwd(), file));
  });
}

/**
Takes a string and parse it into tokens that can be compiled afterwards
*/
function parseString(str, name) {
  var lexer;
  var token;
  var activeSegmentStack = [];
  var segments = [];

  if (str === undefined) {
    throw ParserException('Unspecified template');
  } else if (str === null) {
    return segments;
  } else if (typeof str !== 'string') {
    throw ParserException('Invalid template');
  }

  if (name !== undefined && name !== null && typeof name !== 'string') {
    throw ParserException('Invalid template name : ' + String(name));
  }

  lexer = new Tokenizr();

  RULES.forEach(function (rule) {
    //if (rule.state) {
    //  lexer.rule(rule.state, rule.pattern, rule.action);
    //} else {
      lexer.rule(rule.pattern, rule.action);
    //}
  });

  lexer.input(str);

  while (token = lexer.token()) {

    //console.log("TOKEN", token);

    switch (token.type) {
      case 'EOF':
        break;
      case 'segment':
        if (token.value.next) {
          activeSegmentBodyIncrement(token.value, activeSegmentStack);
        } else if (token.value.closing) {
          activeSegmentBodyIncrement(token.value, activeSegmentStack, true);
        } else {
          activeSegmentStack.push({ type: token.value.type, count: 1 });
        }
        segments.push(token);
        break;
      case 'output':
      case 'text':
        segments.push(token);
        break;
    }
  }

  if (activeSegmentStack.length) {
    error('Missing closing segment for ' + activeSegmentStack.pop().type);
  }

  if (typeof name === 'string') {
    segments.name = name;
  }

  return segments;
}


function activeSegmentBodyIncrement(segment, activeStack, validate) {
  var activeSegment;
  var segmentOptions;

  // if segment is self closing, do not look for it in the stack, create a dummy one
  if ('content' in segment) {
    activeSegment = { type: segment.type, count: 0 };
  } else {
    activeSegment = activeStack.length && activeStack[activeStack.length - 1];

    if (!activeSegment) {
      error('Invalid segment state');
    }

    if (activeSegment.type !== segment.type) {
      error('Segment missmatch ' + segment.type);
    }
  }

  segmentOptions = SEGMENT_OPTIONS[SEGMENT_REVERSE[activeSegment.type]];

  if (validate) {
    if (activeSegment.count < segmentOptions.min) {
      error('Missing next segment: min ' + segmentOptions.min + ' but found ' + activeSegment.count);
    } else if (activeSegment.count > segmentOptions.max) {
      error('Too many segment: max ' + segmentOptions.max + ' but found ' + activeSegment.count);
    }

    activeStack.pop();
  } else {
    ++activeSegment.count;
  }

}


function error(msg, ctx) {
  //var offset = Math.max(Math.min(ctx.offset - (NEAR_TEXT_LENGTH / 2), ctx.contentLength - NEAR_TEXT_LENGTH), 0);
  //var len = NEAR_TEXT_LENGTH;
  //var nearText = ctx.content.substr(offset, len);

  //throw ParserException(msg + ' near "' + nearText + '" (' + (ctx.name ? ctx.name + ':' : '') + ctx.line + ':' + ctx.column + ')');
  throw ParserException(msg);
}