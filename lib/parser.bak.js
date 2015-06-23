
/**
Module dependencies and declarations
*/


const RAW_SEG_TYPE_TEXT = 'TEXT';
const RAW_SEG_TYPE_CONTEXT_OUTPUT = 'CTXOUT';
const RAW_SEG_TYPE_CONDITIONAL = 'CONDITIONAL';
const RAW_SEG_TYPE_SWITCH = 'SWITCH';
const RAW_SEG_TYPE_ITERATOR = 'ITERATOR';
const RAW_SEG_TYPE_CUSTOM = 'CUSTOM';
const RAW_SEG_TYPE_NAMED_DECLARE = 'NAMEDDECLARE';
const RAW_SEG_TYPE_NAMED_RENDER = 'NAMEDRENDER';
const RAW_SEG_TYPE_PARTIAL = 'PARTIAL';

const NEAR_TEXT_LENGTH = 30;

const PATTERN_SEGMENT = /\{(.)?\{(?:(.*?):)?([^~]*?)([\/~])?\}(.*?)\}/;

const PATTERN_INVALID_CONTENT = '/===?|\[|\]/';
const PATTERN_MODIFIERS_VALIDATION = /^([^\s(]+)\s*(?:\(([^)]*)\))?$/;


var fs = require('fs');
var ParserException = require('./exceptions').ParserException;
var Parser = module.exports;


var segmentMapping = {
  '?': RAW_SEG_TYPE_CONDITIONAL,
  '*': RAW_SEG_TYPE_SWITCH,
  '@': RAW_SEG_TYPE_ITERATOR,
  '&': RAW_SEG_TYPE_CUSTOM,
  '#': RAW_SEG_TYPE_NAMED_DECLARE,
  '+': RAW_SEG_TYPE_NAMED_RENDER,
  '>': RAW_SEG_TYPE_PARTIAL
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

  if (str === undefined) {
    throw ParserException('Unspecified template');
  } else if (str !== null && typeof str !== 'string') {
    throw ParserException('Invalid template');
  }

  return new Promise(function (resolve, reject) {
    var ctx = {
      name: name,

      offset: 0,
      line: 1,
      column: 1,

      marker: {
        offset: 0,
        line: 1,
        column: 1
      },

      content: str,
      contentLength: String(str || '').length,

      forward: function (n) {
        n = n || 1;

        while (n--) {
          if (this.offset < this.contentLength) {
            if (this.content.charAt(this.offset) === '\n') {
              ++this.line;
              this.column = 1;
            } else {
              ++this.column;
            }

            ++this.offset;
          }
        }
      },

      peek: function (n) {
        if (n === 1) {
          return ctx.content.charAt(ctx.offset);
        } else if (n) {
          return ctx.content.substr(ctx.offset, n);
        } else {
          return ctx.content.substr(ctx.offset);
        }
      },

      addSegment: function (segment, advance) {
        segment.offset = this.marker.offset;
        segment.line = this.marker.line;
        segment.column = this.marker.column;

        this.segments.push(segment);

        if (advance) {
          this.forward(advance);
        }

        // reset marker
        this.marker.offset = this.offset;
        this.marker.line = this.line;
        this.marker.column = this.column;
      },

      segments: []
    };

    enterText(ctx);

    if (typeof name === 'string') {
      ctx.segments.name = name;
    }

    resolve(ctx.segments);
  });
}



function checkContext(context, ctx) {
  context = context.trim();

  // TODO : use var-validator to validate context

  return context;
}

function checkContent(content, ctx) {
  var invalid;

  if (null === content) {
    error('Missing content in segment type', ctx);
  } else {
    content = content.trim();
  }

  // TODO : add more validations and transform content into postfix notation
  // TODO : use var-validator to validate postfix contexts

  invalid = content.match(PATTERN_INVALID_CONTENT);

  if (invalid) {
    error("Invalid character '" + invalid[0] + "' in content", ctx);
  }

  return content;
}

function checkModifiers(modifiers, ctx) {
  var modifierList = modifiers.split('|').map(function (modifier) {
    var match = modifier.trim().match(PATTERN_MODIFIERS_VALIDATION);
    var args;

    if (!match) {
      error('Invalid modifier "' + modifier + '"', ctx);
    }

    // TODO : use var-validator for match[1] / fn

    args = (match[2] || '').split(',').map(function (arg) {
      arg = arg.trim();

      // TODO : validate arg

      return arg;
    }).filter(String);

    return {
      fn: match[1],
      args: args
    };
  });

  return modifierList;
}



function enterText(ctx) {
  var ch;
  var escaped = false;
  var buffer = '';

  function cleanBuffer() {
    if (!buffer.length) {
      return;
    }

    ctx.addSegment({
      type: RAW_SEG_TYPE_TEXT,
      text: buffer
    });
    buffer = '';
  }

  while (ctx.offset < ctx.contentLength) {
    var ch = ctx.peek(1);

    if (ch === '\\' && !escaped) {
      escaped = true;
    } else if (escaped) {
      buffer = buffer + ch;
      escaped = false;
      ctx.forward();
    } else if (ch === '{') {
      cleanBuffer();
      enterSegment(ctx);
    } else {
      buffer = buffer + ch;
      ctx.forward();
    }
  }

  cleanBuffer();
}



function enterSegment(ctx) {
  var match = ctx.peek().match(PATTERN_SEGMENT);
  var seg = {};

  if (match) {
    if (match[1]) {
      seg.type = segmentMapping[match[1]];

      if (!seg.type) {
        error("Unknown segment type '" + match[1] + "'", ctx);
      }

      if (match[4] === '~') {
        if (match[2]) {
          error('Unexpected context', ctx);
        } else if (match[3]) {
          error('Unexpected content', ctx);
        } else if (match[5]) {
          error('Unexpected modifier', ctx);
        }

        seg.option = 'continue';
      } else if (match[4] === '/') {
        seg.option = 'close';
      } else {
        seg.option = 'open';
      }

    } else {
      seg.type = RAW_SEG_TYPE_CONTEXT_OUTPUT;

      if (match[4] === '~') {
        error('Unexpected segment continue', ctx);
      } else if (match[4] === '/') {
        error('Unexpected segment closing', ctx);
      }

    }

    if (match[2]) {
      seg.context = checkContext(match[2], ctx);
    }
    if (match[3]) {
      seg.content = checkContent(match[3], ctx);
    }
    if (match[5]) {
      seg.modifiers = checkModifiers(match[5], ctx);
    }

    ctx.addSegment(seg, match[0].length);
  } else {
    error("Expected segment", ctx);
  }
}


function error(msg, ctx) {
  var offset = Math.max(Math.min(ctx.offset - (NEAR_TEXT_LENGTH / 2), ctx.contentLength - NEAR_TEXT_LENGTH), 0);
  var len = NEAR_TEXT_LENGTH;
  var nearText = ctx.content.substr(offset, len);

  throw ParserException(msg + ' near "' + nearText + '" (' + (ctx.name ? ctx.name + ':' : '') + ctx.line + ':' + ctx.column + ')');
}