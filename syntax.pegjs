// http://pegjs.org/online
{
  var segStack = [];
  function enterSegment(type) {
    segStack.push(type);
  }

  function checkSegment(type, closing) {
    if (segStack.length) {
      return segStack[segStack.length - 1] === type;
    } else {
      error("Unexpected " + type + " " + (closing ? "closing" : "next") + " segment");
    }
  }

  function exitSegment(type) {
    if (checkSegment(type, true)) {
      return segStack.pop(), true;
    } else {
      error("Mismatch " + segStack[segStack.length - 1] + " closing segment");
    }
  }

  function cleanup() {
    if (segStack.length) {
      error("Missing " + segStack[segStack.length - 1] + " closing segment");
    }
  }
}

start
  = seg:segment+ { return cleanup(), seg; }


// Base classes
space
 = ' '

digit
 = [0-9]

letter
 = [a-zA-Z]


// Base types
string
 = '"' str:( '\\"' / [^"] )+ '"' { return str.join(''); }
 / "'" str:( "\\'" / [^'] )+ "'" { return str.join(''); }

number
 = '+' n:number { return n; }
 / '-' n:number { return -n; }
 / i:digit+ '.' d:digit+ { return parseFloat(i.join('') + '.' + d.join(''), 10); }
 / i:digit+ { return parseInt(i.join(''), 10); }

reserved
 = 'undefined' { return undefined; }
 / 'null' { return null; }
 / 'true' { return true; }
 / 'false' { return false; }
 / 'NaN' { return NaN; }
 / 'Infinity' { return Infinity; }

operator
 = op:( '+' / '-' / '*' / '/' / '%' / '&&' / '||' / '==' { return '==='; } ) { return { type:'operator', value:op }; }

parenOpen
 = '(' { return { type:'parenOpen' }; }

parenClose
 = ')' { return { type:'parenClose' }; }

variable
 = left:letter right:(letter/digit)+ { return left + right.join(''); }
 / left:letter { return left; }

variablePath
 = left:variable space? '.' space? right:variablePath { return left + '.' + right; }
 / variable

func
 = name:variable space? '(' space? args:arguments space? ')' { return { name:name, args:args[0] }; }
 / name:variable '(' space? ')' { return { name:name, args:[] }; }

context
 = path:variablePath space? '(' space? args:arguments space? ')' { return { context:'ctx.getContext("' + path + '").data', args:args }; }
 / path:variablePath space? '(' space? ')' { return { context:'ctx.getContext("' + path + '").data', args:[] }; }
 / path:variablePath { return { context:'ctx.getContext("' + path + '").data' }; }


// Compouned type
value
 = val:reserved { return { type:'reserved', value:val }; }
 / val:context { return { type:'context', value:val }; }
 / val:string { return { type:'string', value:val }; }
 / val:number { return { type:'number', value:val }; }

arguments
 = left:expression space* ',' space* right:arguments { return [left].concat(right); }
 / expr:expression { return [expr]; }


// Segments
segmentType
 = '?' { return 'conditional'; }
 / '*' { return 'switch'; }
 / '@' { return 'iterator'; }
 / '&' { return 'custom'; }
 / '#' { return 'namedDeclare'; }
 / '+' { return 'namedRender'; }
 / '>' { return 'partial'; }

segment
 = seg:( textSegment
       / typedSegmentSelfClosing
       / typedSegmentOpen
       / typedSegmentNext
       / typedSegmentClose
       / seg:outputSegment ) { seg.offset = offset(); seg.line = line(); seg.column = column(); return seg; }

textSegment
 = txt:[^{]+ { return { type:'text', content:txt.join('') }; }

outputSegment
 = '{{' body:segmentBody '}' modifiers:modifiers? '}' { return { type:'output', content:body, modifiers:modifiers || [] }; }

typedSegmentOpen
 = '{' type:segmentType '{' body:segmentBody '}' modifiers:modifiers? '}' { enterSegment(type); return { type:type, content:body, modifiers:modifiers || [] }; }

typedSegmentSelfClosing
 = '{' type:segmentType '{' body:segmentBody '/}' modifiers:modifiers? '}' { return { type:type, content:body, modifiers:modifiers || [], closing:true }; }

typedSegmentNext
 = '{' type:segmentType '{' space* '|' space* '}}' &{ return checkSegment(type); } { return { type:type, next:true }; }

typedSegmentClose
 = '{' type:segmentType '{' space* '/' space* '}}' &{ return exitSegment(type); } { return { type:type, closing:true }; }


// Segment components
segmentBody
 = ctx:( context space* '\\' )? space* expr:expression space* { return { context:ctx && ctx[0], expression:expr }; }

expression
 = val:value space* op:operator space* expr:expression { return [ val, op ].concat(expr); }
 / open:parenOpen expr:expression close:parenClose { return [open].concat(expr).concat([close]); }
 / space* val:value space* { return [val]; }

modifiers
 = left:func '|' right:modifiers { return [{ name:left.context, args:left.args }].concat(right); }
 / left:func { return [{ name:left.name, args:left.args }]; }
 / left:variable { return [{ name:left, args:[] }]; }
