# efficient Documentation

## Template Syntax

Templates are separated in segments. There are three (3) types of segments :

### Text Segments

Text segments are any literal chunks of text in the template. They can be anything and everything.

### Output Segments

* `{{expression}}`
* `{{context\ expression}}`
* `{{expression}modifiers}`
* `{{context\ expression}modifiers}`

Output segments will echo whatever `expression` is specified using any specified `context`, passing the value through any specified `modifiers`.

#### Examples

```
{{foo}}
{{"foo"}} {{'foo'}}
{{2 + 3}}
{{foo || bar}}
```


### Typed Segments

* `{type{expression /}}`
* `{type{context\ expression /}}`
* `{type{expression /}modifiers}`
* `{type{expression}} ... {type{/}}`
* `{type{expression}modifiers} ... {type{/}}`
* `{type{context\ expression}modifiers} ... {type{/}}`
* `{type{expression}} ... {type{|}} ... {type{/}}`
* `{type{expression}modifiers} ... {type{|}} ... {type{/}}`
* `{type{context\ expression}modifiers} ... {type{|}} ... {type{/}}`
* etc.

Typed segments are control flow segments. Their `expression` are evaluated using any specified `context`, and the resulting values are sent to the segment handlers when rendering the templates. Any output within the child segments, or handlers, may or may not be sent through the specified `modifiers`.

#### Segment Types

* **Conditional** : `?`
  Represent a simple conditional one-way or two-way branching control flow. If the segment's expression is `true`, then the first child segment will be rendered, otherwise the next child segment will be rendered if exists.

* **Switch** : `*`
  Represent a simple conditional multiple branching control flow. The child segment being rendered is the one represented by the segment's expression. The value of the expression should numeric. 

  The last child segment will always be the default one being rendered. In other words, a switch segment will *always* render one of it's child segment.

* **Iterator** : `@`
  Represent an iteration (for..., loop, etc.) control flow. The expression determine the value being iterated. The value may be any one of these types :
  * `array` : will iterate over every array elements
  * `object` : will iterate over every object keys
  * `number` : will iterate from `0` to `n` (exclusively)
  
  The `context` inside this segment will be changed to the iterator's current value, exposing `index`, `key` and `value`. The previous context being availble through the parent path (i.e. `..`).

  If the iterator has nothing to iterate, the child segment will never be rendered.

* **Custom** : `&`
  Represent an external function to execute within the template. The expression's value determine the name of the function to execute relative to the current context.

* **Named** : `#` and `+`
  Represent reusable blocks, or segments, that may be rendered multiple times, optionally using different contexts. In order to render named segments, these need to be declared using the declaration segment type (`#`), then invoked (or rendered) using the render segment (`+`). The `expression` defines the name of the segment (either when declaring and rendering).

* **Partial** : `>`
  Represents an external template to render at the segment's position, optionally using the given context and having all output being filtered through the specified modifiers. The segment's `expression` defines the partial to render.

  Partials are cached within the engine, therefore the value may specify a file or a named template.


## Contexts

*TODO*

## Expressions

*TODO*

## Modifiers

*TODO*

## Public API

### Parser

*TODO*

### Compiler

*TODO*

### Engine

*TODO*