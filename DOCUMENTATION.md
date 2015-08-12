# efficient View Engine Documentation

## Template Syntax

Templates are separated in segments. There are three (3) types of segments :

### Text Segments

Text segments are any literal chunks of text in the template. They can be any string values not equal to an output or typed segment.

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
#### Conditional : `?`
Represent a simple conditional one-way or two-way branching control flow. If the segment's expression is `true`, then the first child segment will be rendered, otherwise the next child segment will be rendered if exists.

**Example**

```
{?{user}}
  Hello {{user.name}}{?{meessages}} ({{messages:length}}){?{/}}
{?{|}}
  <a href="#login">Login</a>
{?{/}}
```

#### Switch : `*`
  Represent a simple conditional multiple branching control flow. The child segment being rendered is the one represented by the segment's expression. The value of the expression should numeric. 

  The last child segment will always be the default one being rendered. In other words, a switch segment will *always* render one of it's child segment.

  **Example**

  ```
  {*{amount}}
    None
  {*{|}}
    One
  {*{|}}
    Two
  {*{|}}
    Few
  {*{|}}
    Many
  {*{/}}`
  ```

#### Iterator : `@`
Represent an iteration (for..., loop, etc.) control flow. The expression determine the value being iterated. The value may be any one of these types :

* `array` : will iterate over every array elements
* `object` : will iterate over every object keys
* `number` : will iterate from `0` to `n` (exclusively)
  
The `context` inside this segment will be changed to the iterator's current value, exposing `index`, `key` and `value`. The previous context being availble through the parent path (i.e. `..`).

If the iterator has nothing to iterate, the child segment will never be rendered.

**Example**

```
{@{users}}
  <div class="row">
    <div class="col-sm-1">{{index}}</div>
    <div class="col-sm-4">{{value.name}}</div>
    <div class="col-sm-3">{{value.lastLogon}}</div>
    <div class="col-sm-4">...</div>
  </div>
{@{/}}
```

#### Custom : `&`
Represent an external function to execute within the template. The expression's value determine the name of the function to execute relative to the current context.

**Example**

```
{&{user\ "avatarPicture" /}}
```

Would invoke a function assuming a template `context` similar to this :

```
{
  user: {
    id: 123,
    avatarPicture: function (ctx, segments, modifier) {
      // "this" is the internal engine instance
      this.out(generateUserAvatar(ctx.data.id));
    }
  }
}
```

To invoke an asynchronous handler, simply return a `Promise`.

```
{
  user: {
    id: 123,
    avatarPicture: function (ctx, segments, modifier) {
      var engine = this;
      return fetchUserAvatar(ctx.data.id).then(function (img) {}
        engine.out('<img src="' + img.src + '" alt="' + img.name + '">');
      });
    }
  }
}
```

#### Named : `#` and `+`
Represent reusable blocks, or segments, that may be rendered multiple times, optionally using different contexts. In order to render named segments, these need to be declared using the declaration segment type (`#`), then invoked (or rendered) using the render segment (`+`). The `expression` defines the name of the segment (either when declaring and rendering).

The named segment receives it's current `context` at render time. And the parent context is the current context at declare time. In other words, `{{.}}` is the context when rendering the named segment and `{{..}}` is the context when declaring it.

**Example**

```
{#{"userRow"}}
  <div class="row">
    <div class="col-sm-1">{{id}}</div>
    <div class="col-sm-4">{{name}}</div>
    <div class="col-sm-3">{{lastLogon}}</div>
    <div class="col-sm-4">...</div>
  </div>
{#{/}}

{@{users}}
  {+{value\ "userRow" /}}
{@{/}}
```

#### Partial : `>`
Represents an external template to render at the segment's position, optionally using the given context and having all output being filtered through the specified modifiers. The segment's `expression` defines the partial to render.

Partials are cached within the engine, therefore the value may specify a file or a named template.

**Example**

```
{>{users\ "path/to/users.table.html" /}}
```


## Contexts

Contexts are traversable, dynamic data passed to the template. The efficient engine does not allow setting data beyound [named segments](#named--and-), therefore it offers this means of passing data around. The key benefits of using contexts over direct data manipulations are

* decoupling data, models and views
* guaranteed safe data access (no need to check if data is available)
* increase template reusability
* stacked contexts that remembers previous states
* etc.

### Context Path

Accessing contexts are done through paths, similar to how files are accessed in a file system, except with a few key difference :

* The path separator character is `.`. The root parent is `~`. The root parent is the context data initially passed to the template when invoking the engine's `render` method. For example :
  * `.` *(current context)*
  * `~` *(root context)*
  * `.foo.bar` is the same as `foo.bar`
  * `..` the most recent parent context

* Parent contexts are relative to their previous state. This is true in any direction. Consider an initial context `.` is equal to `~`.
  1. Switching to `foo`, the parent is `~`
  2. Switching to `bar.buz`, the parent is `foo`
  3. Switching to `~`, the parent is `foo.bar.buz`
  4. Switching to `....` would pop out all parent contexts and would restore to a clean initial state.

* Parent contexts can only be used at the start of a path.
  **Valid parent contexts**
  * `.` *(current context)*
  * `..` *(parent context)*
  * `..foo.bar` *(access context `foo.bar` starting from the parent context)*
  * `~` *(root context)*
  * `~foo.bar` *(accessing context `foo.bar` starting from the root context)*

  **Invalid parent contexts**
  * `~.` or `~~` or `~..` *(... because it makes no sense)*
  * `foo..bar` *(would be the same as writing `bar`, so it makes no sense)*
  * `foo~bar`

* The parent context of the root path is itself. In essence, if the current context `.` is equal to `~`, then all the following are equivalent: `.`, `..`, `.....`, etc.

* A path may include safe and unsafe data access (context properties)
  * Safe: `foo.bar`
  * Unsafe: `.:foo.bar`
  See [context properties](#context-properties) for more information.

* When switching to a new context, if any member in the path has data of type array, the final context will be an aggregation of all items of this array. The same is applied if arrays are nested. For example, given an initial context data of :

  ```
  {
    "foo": [
      {
        "bar": [
          {
            "buz": "item1"
          },
          {
            "buz": "item2"
          }
        ]
      },
      {
        "bar": [
          {
            "buz": "item3"
          },
          {
            "buz": "item4"
          }
        ]
      },
      {
        "bar": "item5"
      },
      {
        "bar": {
          "buz": "item6"
        }
      }
    ]
  }
  ```

  and a path of `foo.bar.buz`, would produce a context data of

  ```
  [
    "item1",
    "item2",
    "item3",
    "item4",
    "item6"
  ]
  ```

### Context Properties

Context properties are unsafe ways to access the context data directly. Consider this context data :

```
{
  "users": [
    {
      "id": 123`
    }
  ]
}
```

Trying to output `{{users.length}}` would result with `null`, not `1`. This is because the `Context` class does not try to play smart, for performance purposes, by doing the template author's job. "What if the context data really has a `length` attribute for each users?"

In fact, when trying to access a property of an object for a given path, it should always be using context properties. For example :

```
{
  "items": [
    "JavaScript",
    "Node",
    "V8"
  ]
}
```

Consider these two paths :

1. `{{items.length}json}` *(would echo `[10, 4, 2]`)*
2. `{{items:length}json}` *(would echo `3`)*

However, context properties are unsafe as they are not checked by the `Context` class and may thow errors! For example, `{{items:foo.bar}}` will throw a `TypeError: Cannot read property 'bar' of undefined`.

## Expressions

An expression is essentially a `value`, and a `value` may be defined by the rules: `value` or `value operator expression`, 

### Operators

* Basic arithmetics : `+`, `-`, `*`, `/` (ex: `{{foo + bar}}`)
* Modulus : `%`  (ex: `{{foo % 3}}`)
* Negate : `!`  (ex: `{{!foo}}`)
* Bitwise : `&`, `|`, `^`  (ex: `{{foo & bar}}`)
* Logical : `&&`, `||` (ex: `{{foo || bar}}`)
* Equality : `=`, `!=` or `<>`  (ex: `{{foo = bar}}`)
* Parenthesis : `(` and `)`  (ex: `{{(foo + bar) * buz}}`)

### Values

* Numeric (ex: `{{2}}`, `{{3.141592}}`)
* String (ex: `{{"Hello"}}`, `{{'Hello'}}`)
* Context (ex: `{{foo}}`, `{{foo.bar.buz}}`, `{{foo.bar:length}}`)
* Reserved : `undefined`, `null`, `true`, `false`, `NaN`, `Infinity`

### Functions

Functions may be called within an expression. In fact, functions my be called even as part of another function's argument. In order to use this feature, the functions must be specified as part of the template context. For example:

```
{
  userAvatar: function (fullName, imageUrl) {
    return fullName + ' <img src="' + imageUrl + '">';
  },

  users: [
    {
      id: 123,
      firstName: 'John',
      lastName: 'Smith',
      fullName: function () {
        return this.firstName + ' ' + this.fullName;
      },
      imageUrl: function () {
        return 'http://domain.com/avatar/' + this.id;
      }
    }
  ]
}
```

```
{@{users}}
  <span>{{ ~userAvatar(value:fullName(), value:imageUrl()) }}</span>
{@{/}}
```

**NOTE:** In the last template, the context property was used (i.e. `value:fullName`) instead of a full context path (i.e. `value.fullName`) to have the JavaScript keyword `this`, inside the function equal to the current iterator `value` object. Otherwise, `this` would have been the current `Context` instance object (the function), losing the ability to fetch the current iterator `value`, as it would not have been stacked.

As a limitation, functions may only be specified through a context path (optionally with property path) only. It is not possible to invoke a function any other way.

## Modifiers

### Core Modifiers

* `encodeURIComponent` : See [encodeURIComponent()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent) for more information.
* `decodeURIComponent` : See [decodeURIComponent()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/decodeURIComponent) for more information.
* `encodeURI` : See [encodeURI()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURI) for more information.
* `decodeURI` : See [decodeURI()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/decodeURI) for more information.
* `encodeHtml` : encode HTML entities
* `decodeHtml` : decode HTML entities
* `encodeXml` : encode XML entities
* `decodeXml` : decode XML entities
* `json([replacer[,space]])` : convert a JSON object to string. See [JSON.stringify()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) for more information.
* `upper` : convert all characters to upper case
* `lower` : convert all characters to lower case
* `mask([char])`  : change all characters into the specified `char`, or `*`

### Custom Modifiers

Modifiers may be globally registered through the `Engine` class. A modifier is a function receiving a a value, and optionally extra arguments, returning a string.

**Note:** Modifiers are synchronous only. Use **Custom Segments** for asynchronous handlers.

**Example**

Let's create a simple function that will scan for URLs and automatically create HTML links.

```
const URL_PATTERN = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;

var Engine = require('efficient').Engine;

Engine.registerModifier(function autoURL(text) {
  return text.replace(URL_PATTERN, function (m) {
    return '<a href="' + encodeURI(m) + '">' + m + '</a>';
  });
});
```

And use this modifier like so, for example :

```
{{some.description}autoURL}
```

or

```
{?{some\ .}autoURL}
  <dl>
    <dt>Name</dt>
    <dd>{{name}}</dd>
    <dt>Description</dt>
    <dd>{{description}}</dd>
  </dl>
{?{/}}
```


## Public API

### Parser

*TODO*

### Compiler

*TODO*

### Engine

*TODO*