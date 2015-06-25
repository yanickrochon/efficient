

const NEWLINE = require('os').EOL;


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
  var segStack = [];
  var compiled = [];
  var templateFn;
  var i;
  var len;

  for (i = 0, len = segments.length; i < len; ++i) {
    // TODO : create segFn for each segment
  }

  console.log(compiled);

  // TODO : wrap compiled array into a single callable fn


  return templateFn;
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
