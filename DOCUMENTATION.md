# efficient View Engine Documentation

## Table Of Content

* [Template Syntax](#template-syntax)
  * [Text Segments](#text-segments)
  * [Output Segments](#output-segments)
  * [Typed Segments](#typed-segments)
    * [Conditional](#conditional--)
    * [Iterator](#iterator--)
    * [Custom](#custom--)
    * [Named](#named--and-)
    * [Partial](#partial--)
  * [Contexts](#contexts)
    * [Context Path](#context-path)
    * [Context Properties](#context-properties)
  * [Expressions](#expressions)
    * [Operators](#operators)
    * [Values](#values)
    * [Functions](#functions)
  * [Modifiers](#modifiers)
    * [Core Modifiers](#core-modifiers)
    * [Custom Modifiers](#custom-modifiers)
* [Public API](#public-api)
  * [Parser](#parser)
  * [Compiler](#compiler)
  * [Context](#context)
  * [Engine](#engine)
  * [Internal Engine](#internal-engine)

---

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

**Example**

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
{??{}}
  <a href="#login">Login</a>
{?{/}}
```

**Note**: the engine does not *yet* support the `if... elseif... endif` form. The equivalent, at the moment, is to do `if... else if... endif endif`.

#### Iterator : `@`
Represent an iteration (for..., loop, etc.) control flow. The expression determine the value being iterated. The `context` inside this segment will be changed to the iterator's current value, exposing `index`, `key` and `value`. The previous context being availble through the parent path (i.e. `..`).

The iterable value may be any one of these types :

* `array` : will iterate over every array elements, where `index` and `key` equal the current index of the array and `value` the value.
* `object` : will iterate over every object keys, where `index` is the `key`'s index value and `value` the actual `key`'s value.
* `number` : will iterate from `0` to `n - 1` (i.e. `[0..n[`), where `index`, `key` and `value` equal the current counter value.

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
* `lpad([n[,char]])` : pad the given string `n` characters to the left
* `rpad([n[,char]])` : pad the given string `n` characters to the right

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

The `Parser` class is generated by [PEG.js](http://pegjs.org/).

* `Parser.SyntaxError` : *`Error`* - the constructor function for the parser error instances.
* `Parser.parse(input[, options])` : *`Array`* - Parse the given `input` with the some optional `options`, and return an array of tokens.
  **Example:** `Parser.parse('Hello {{name}}!');`

### Compiler

The `Compiler` class will transform any parser data compatible into a template function.

* `Compiler.BEAUTIFY` : *`boolean`* - If set to `true`, will beautify the template function so it is human-readable. (default `false`)
* `Compiler.DEBUG` : *`boolean`* - Add debug information within the template to display source information on error. (default `false`)
* `Compiler.IGNORE_SUSPICIOUS_SEGMENTS` : *`boolean`* - The parser is very tolerant with mistypes and user errors. This option will tell the compiler to ignore anything that ressembles to a segment, which was ignored by the parser. If set to `true`, these "suspicious segments" will be echo'ed as text. If set to `false`, the compiler will emit an error. (default `false`)
* `Compiler.compile(segments[, options])` : *`function`* - Compile the given parsed segments into a template `function`. The returned function accepts two arguments : `InternalEngine` and `Context` and returns a `string`.

### Context

The `Context` class encapsulate the necessary data-manipulation API necessary for template data access.

* `context.parent` : *`Context`* - The parent context, or null.
* `context.data` : *`any`* - Return the context's data value
* `context.templateName` : *`string`* - Return the template name currently being rendered.
* `context.push(data)` : *`Context`* - Return a new `Context` instance with the specified `data` and whose parent is `this`.
* `context.pop()` : *`Context`* - Returns the parent context, or itself if there is no parent.
* `context.get(path)` : *`Context`* - Return a new context given the specified path. It does not matter if the path actually exists or not. The returned `Context` instance's parent will be `this`.

### Modifiers

All modifiers are registered via a registry. These modifiers are global and may be accessed at any time, via any instance of the engine.

* `modifiers.registry` : *`object`* - An object specifying all the modifiers. The returned object is frozen (i.e. read-only); use `registerModifier` and `unregisterModifier`.
* `modifiers.registerModifier(fn)` : *`boolean`* - Register the given modifier function. The function should have a name and receive at least one argument; a `string`. Any subsequent argument will be specified by the template. See [custom modifiers](#custom-modifiers).
* `modifiers.unregisterModifier(modifier)` : *`boolean`* - Unregister the given modifier. The argument `modifier` may be a `function` (search by equality), or a `string` (search by name). Returns `true` if the modifier was removed.

### Engine

The `Engine` is what binds the `Parser`, `Compiler` and `Context` together. Instances of this class may be used independently to render templates. The implementation allows retrieving the resulting output via a `Promise`, or through a `ReadableStream`.

* `Engine.EXT_DELIMITER` : *`string`* - The character delimiter when specifying file extensions *(readonly)* *(default `','`)*

* `engine.options` : *`object`* - The options passed to the `Engine` constructor. If no options was specified, then an empty object is returned. The returned object may be modified at any time. (Modifications are not guaranteed to be applied immediately if rendering is in progress.)
* `engine.resolve(name)` : *`Promise`* - Resolve the current template `name` through a `Promise`. The resolved value is an object with these keys: `filename` is the resolved file name, `fn` is optionally the compiled template function (ex: once the template has been rendered).
* `engine.render(name[, data])` : *`Promise`* - Render the given template. This function will trigger the function `resolve`. The returned promise will also possess a function `stream()` that will return the render stream, used to monitor or get live update when rendering the template. THe resolving promise will return the final rendered string.

  ```
  engine.render('path/to/template').stream.on('data', function (buffer) {
    // possibly multiple notifications for every template output
    console.log(buffer.toString());
  });
  ```
  or
  ```
  engine.render('path/to/template').then(function (content) {
    // single notification once template is done rendering
    console.log(content);
  });
  ```

* `engine.renderString(name, str[, data])` : *`Promise`* - Render the given string `str`. The argument `name` is optional, set to `null` if this string should *not* be cached. Note that the cached `str` should *always* be associated with the same `name`, as rendering a different strings with the sane `name` *will* return unexpected output. If the `str` has been rendered once already, only `name` is required for subsequent rendering.

  ```
  engine.renderString('foo', 'Hello world!').then(function (content) {
    // content = 'Hello world!'
  });
  ```
   then, later
  ```
  // the template string will be ignored since we already rendered, and
  // specified a key 
  engine.renderString('foo', 'something else').then(function (content) {
    // content = 'Hello world!'
  });

  // template string will not be cached
  engine.renderString(null, 'something else').then(function (content) {
    // content = 'something else'
  });
  ```

  **Note**: this method is mainly used for debugging purposes and typical use case should use the `render` method.

#### Engine Options

* `paths` : *`object`* - specify valid paths to look for templates. The object maps template path prefix with an actual file system path. For example, specifying `{ 'foo': '/path/to/foo/views' }` and rendering `foo/index` will try to locate the template in `/path/to/foo/views/index`. The key `'*'` specify the default path when no prefix match (do not specify for *no* default paths). (default `{ '*': '.' }`)
* `ext` : *`string`|`array`* - specify a list of file extensions when looking for template files. When specifying a `string`, use `Engine.EXT_DELIMITER` to separate each values. (default `['.eft', '.eft.html', '.html']`)
  
  **Note**: the engine will also try to locate the file without any extensions.

### Internal Engine

An internal engine is only created when rendering a template. It provides, to the template, a framework API to handle all the heavy lifting, keeping the template logic light and small. The same internal engine instance is passed to any rendered partials.

*TODO*