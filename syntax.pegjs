// http://pegjs.org/online
{
  var segStack = [];
  function enterSegment(type) { segStack.push(type); }
  function checkSegment(type) { return segStack.length && segStack[segStack.length - 1] === type; }
  function exitSegment(type) { if (checkSegment(type)) return segStack.pop(), true; else return false; }
}

start
  = segment+


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
 = op:( '+' / '-' / '*' / '/' / '%' / '&&' / '||' ) { return { type:'operator', value:op }; }

parenOpen
 = '(' { return { type:'parenOpen' }; }

parenClose
 = ')' { return { type:'parenClose' }; }

variable
 = left:letter right:(letter/digit)+ { return left + right.join(''); }
 / left:letter { return left; }

func
 = ctx:context '(' args:arguments* ')' { return { context:ctx, args:args && args[0] || [] }; }

context
 = ctx:( variable '.' context ) { return ctx.join(''); }
 / variable


// Compouned type
value
 = val:reserved { return { type:'reserved', value:val }; }
 / val:func { return { type:'funciton', value:'ctx.getContext("' + val.context + '").data', context:val.context, args:val.args }; }
 / val:context { return { type:'context', value:'ctx.getContext("' + val + '").data', context:val }; }
 / val:string { return { type:'string', value:val }; }
 / val:number { return { type:'number', value:val }; }

arguments
 = left:expression ',' right:arguments { return [left].concat(right); }
 / expr:expression { return [expr]; }


// Segments
segmentType
 = '?' { return 'conditional'; }
 / '*' { return 'swidth'; }
 / '@' { return 'iterator'; }
 / '&' { return 'custom'; }
 / '#' { return 'namedDeclare'; }
 / '+' { return 'namedRender'; }
 / '>' { return 'partial'; }

segment
 = textSegment
 / typedSegmentSelfClosing
 / typedSegmentOpen
 / typedSegmentNext
 / typedSegmentClose
 / outputSegment

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
 = space* val:value space* op:operator space* expr:expression { return [ val, op ].concat(expr); }
 / open:parenOpen expr:expression close:parenClose { return [open].concat(expr).concat([close]); }
 / space* val:value space* { return [val]; }

modifiers
 = left:( func / variable:variable { return { context:variable, args:[] }; } ) '|' right:modifiers { return [{ name:left.context, args:left.args }].concat(right); }
 / left:( func / variable:variable { return { context:variable, args:[] }; } ) { return [{ name:left.context, args:left.args }]; }
