

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
  var callChain = [];

  while (iterator.current) {
    callChain.push( build(iterator, compiled) );
  }

  console.log(JSON.stringify(compiled, null, 2), callChain);

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
    }
  };
}


function build(iterator, compiled) {
  var builder = BUILDER_MAP[iterator.current.type];

  return builder(iterator, compiled);
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

  if (!compiled._outputSegmentCount) {
    compiled._outputSegmentCount = 1;
  } else {
    ++compiled._outputSegmentCount;
  }

  fnName = 'f' + compiled._outputSegmentCount;

  compiled.push('function ' + fnName + '(c){' + body + 'return c;}');

  return fnName;
}


function buildSegmentConditional(iterator, compiled) {
  iterator.next;
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
