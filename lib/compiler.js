

const NEWLINE = require('os').EOL;

const BUILDER_MAP = {
  'text':    buildOutputSegment,
  'output':  buildOutputSegment,
  'segment': buildSegment
};
const SEGMENT_BUILDER_MAP = {
  'conditional':  buildSegmentConditional,
  'switch':       buildSegmentSwitch,
  'iterator':     buildSegmentIterator,
  'custom':       buildSegmentCustom,
  'namedDeclare': buildSegmentNamedDeclare,
  'namedRender':  buildSegmentNamedRender,
  'partial':      buildSegmentPartial
}


var CompilerException = require('./exceptions').CompilerException;

var Compiler = module.exports;


/**
static API
*/
Compiler.compile = compile;

/**
Compiler flags
*/
// Run JS Beautify on the template function
Compiler.BEAUTIFY = false;



Object.freeze(Compiler);



function compile(segments) {
  var iterator = segmentIterator(segments);
  var compiled = [];
  var root = build(iterator, compiled);

  //console.log(iterator.current, JSON.stringify(compiled, null, 2), root);

  // TODO : wrap compiled array into a single callable fn


  return;
}



function segmentIterator(segments) {
  var index = 0;
  var len = segments.length;
  return {
    get current() {
      return segments[index];
    },
    get peek() {
      return segments[index + 1];
    },
    get hasNext() {
      return i < len;
    },
    get next() {
      return segments[++index];
    },
    consume: function (cb) {
      var startIndex = ++index;

      while (segments[index] && !cb(segments[index])) {
        ++index;
      }

      return segmentIterator(segments.slice(startIndex, index));
    }
  };
}


function build(iterator, compiled) {
  var fName;
  var builder;
  var result;
  var segments = [];

  while (iterator.current) {
    builder = BUILDER_MAP[iterator.current.type];

    result = builder(iterator, compiled);

    if (result) {
      segments.push(result);
    }
  }

  if (segments.length) {

    fnName = getFuncName('g', compiled);

    compiled.push('function ' + fnName + '(c){Promise.resolve(c).then(' + segments.join(').then(') + ');return c;}');
  }

  return fnName;
}

function buildSegment(iterator, compiled) {
  var builder = SEGMENT_BUILDER_MAP[iterator.current.value.type];

  return builder(iterator, compiled);
}


function buildOutputSegment(iterator, compiled) {
  var fnName;
  var body = '';
  var buffer = '';
  var segment = iterator.current;
  var contextPresent = false;
  var context;

  while (segment) {

    if (segment.type === 'text') {
      buffer = buffer + segment.value;

      segment = iterator.next;
    } else if (segment.type === 'output') {

      if (!contextPresent) {
        context = segment.value.context;

        if (context) {
          body = 'var ctx=c.getContext(' + quote(context) + ');' + body;
        } else {
          body = 'var ctx=c;' + body;
        }

        contextPresent = true;
      } else if (context !== segment.value.context) {
        break;
      }

      if (buffer.length) {
        body = body + 'out(' + quote(buffer) + ');';

        buffer = '';
      }

      body = body + 'out(' + buildExpression(segment).pop() + ');';

      segment = iterator.next;
    } else {
      segment = null;
    }
  }

  if (buffer.length) {
    body = body + 'out(' + quote(buffer) + ');';
  }

  fnName = getFuncName('f', compiled);

  compiled.push('function ' + fnName + '(c){' + body + 'return c;}');

  return fnName;
}


function buildSegmentConditional(iterator, compiled) {
  var testExpr = buildExpression(iterator.current);
  var fnName;
  var segments = [];
  var subIterator;
  var body = '';

  while (iterator.current.type === 'segment' && iterator.current.value.type === 'conditional' && !iterator.current.value.closing) {
    subIterator = iterator.consume(matchEndSegmentStrategy(iterator.current));
    segments.push( build(subIterator, compiled) );
  }

  if (segments.length) {
    if (segments.length > 2) {
      throw CompilerException('Too many segments for conditional');
    }

    fnName = getFuncName('c', compiled);

    body = 'var r;';
         + 'if(' + testExpr + '){'
         +   'r=' + segments[0] + '(c);'
         + '}';

    if (segments.length === 2) {
      body = body + ' else {'
           +   'r=' + segments[1] + '(c);'
           + '}';
    }

    body = body + 'return r instanceof Promise && r.then(function(){return c;}) || c;';

    compiled.push( 'function ' + fnName + '(ctx){' + body + '}');
  }

  return fnName;
}

function buildSegmentSwitch(iterator, compiled) {
  iterator.next;
}

function buildSegmentIterator(iterator, compiled) {
  iterator.next;
}

function buildSegmentCustom(iterator, compiled) {
  iterator.next;
}

function buildSegmentNamedDeclare(iterator, compiled) {
  iterator.next;
}

function buildSegmentNamedRender(iterator, compiled) {
  iterator.next;
}

function buildSegmentPartial(iterator, compiled) {
  iterator.next;
}



function getFuncName(prefix, compiled) {
  var countKey = '_' + prefix + 'SegmentCount';

  if (!compiled[countKey]) {
    compiled[countKey] = 1;
  } else {
    ++compiled[countKey];
  }

  return prefix + compiled[countKey];
}



function matchEndSegmentStrategy(segment) {
  var depth = 1;

  return function (seg) {
    if (seg.type === segment.type && seg.value.type === segment.value.type) {
      if (seg.closing || seg.next) {
        --depth;
      } else {
        ++depth;
      }
    }

    return depth <= 0;
  };
}



function buildExpression(segment) {
  var content = segment.value.content;
  var args = [undefined];
  var argIndex = 0;
  var valueStack = [];
  var left;
  var right;

  for (var i = 0, len = content.length; i < len; ++i) {
    switch (content[i].type) {
      case 'separator':
        args.push(undefined);
        ++argIndex;
        break;
      case 'negate':
        left = valueStack.pop();

        valueStack.push(!left);
        break;
      case 'operator':
        right = valueStack.pop();
        left = valueStack.pop();

        switch (content[i].value) {
          case '^':  valueStack.push(left ^ right); break;
          case '*':  valueStack.push(left * right); break;
          case '/':  valueStack.push(left / right); break;
          case '%':  valueStack.push(left % right); break;
          case '+':  valueStack.push(left + right); break;
          case '-':  valueStack.push(left - right); break;
          case '=':  valueStack.push(left === right); break;
          case '<':  valueStack.push(left < right); break;
          case '>':  valueStack.push(left > right); break;
          case '!=': valueStack.push(left !== right); break;
          case '<=': valueStack.push(left <= right); break;
          case '>=': valueStack.push(left >= right); break;
          case '||': valueStack.push(left || right); break;
          case '&&': valueStack.push(left && right); break;
          default:
            throw CompilerException('Unknown operator ' + content[i].value + ' in expression', segment);
        }
        break;
      case 'reserved':
      case 'number':
      case 'string':
      case 'context':
        valueStack.push(content[i].value);
        break;
    }
  }

  if (valueStack.length > 1) {
    throw CompilerException('Malformed expression', segment);
  } else if (valueStack.length) {
    args[argIndex] = valueStack.pop();
  }

  return args;
}


function quote(s) {
  /*
   * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
   * string literal except for the closing quote character, backslash,
   * carriage return, line separator, paragraph separator, and line feed.
   * Any character may appear in the form of an escape sequence.
   *
   * For portability, we also escape all control and non-ASCII
   * characters. Note that "\0" and "\v" escape sequences are not used
   * because JSHint does not like the first and IE the second.
   */
  return '"' + s
    .replace(/\\/g, '\\\\')  // backslash
    .replace(/"/g, '\\"')    // closing quote character
    .replace(/\x08/g, '\\b') // backspace
    .replace(/\t/g, '\\t')   // horizontal tab
    .replace(/\n/g, '\\n')   // line feed
    .replace(/\f/g, '\\f')   // form feed
    .replace(/\r/g, '\\r')   // carriage return
    //.replace(/[\x00-\x07\x0B\x0E-\x1F\x80-\uFFFF]/g, escape)  // this cause problems with accented chars
    + '"'
  ;
}
