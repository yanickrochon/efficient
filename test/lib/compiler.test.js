'use strict';

describe('Test compiler', function () {

  const Compiler = require('../../lib/compiler');
  const modifiers = require('../../lib/modifiers');
  const Context = require('../../lib/context');

  Compiler.DEBUG = true;      // DEBUG
  Compiler.BEAUTIFY = true;   //

  this.timeout(3000);


  function execTemplate(tpl, data, partialMap) {
    const ctx = new Context(data);
    const output = {
      raw: [],
      buffer: '',
      named: {}
    };
    const engine = {
      out: function out(str) {
        output.raw.push(str);
        output.buffer += str;
      },
      err: function err(err, ptr) {
        console.error("Run-time error near " + JSON.stringify(ptr) + " in template");
      },
      iterator: function (values, ctx, cb) {
        let arr;

        if (values instanceof Array) {
          arr = values.map(function (val, index) {
            return {
              index: index,
              value: val,
              key: val
            };
          });
        } else if (typeof values === 'number') {
          if (values > 0) {
            arr = Array.apply(null, Array(values)).map(function (undefined, index) {
              return {
                index: index,
                value: index,
                key: index
              };
            });
          } else {
            arr = [];
          }
        } else if (values !== null && typeof values === 'object') {
          arr = Object.keys(values).map(function (key, index) {
            return {
              index: index,
              value: values[key],
              key: key
            };
          })
        } else {
          arr = [];
        }

        return arr.reduce(function (p, value) {
          return p.then(function () {
            cb(ctx.push(value));
          });
        }, Promise.resolve(ctx));
      },
      setSegment: function (name, ctx, fn) {
        output.named[name] = {
          fn: fn,
          ctx: ctx
        };
      },
      getSegment: function (name) {
        const seg = output.named[name];

        if (!seg) {
          return function () {};
        } else {
          return function (ctx) {
            return seg.fn(seg.ctx.push(ctx.data));
          }
        };
      },
      callCustom: function(path, ctx, segments/*, outputModifier*/) {
        const engine = this;
        const custom = ctx.get(String(path)).data;
        const promise = Promise.resolve(ctx);

        if (typeof custom === 'function') {
          return promise.then(function (ctx) {
            return custom.call(engine, ctx, segments);
          });
        } else {
          return promise;
        }
      },
      render: function (name, ctx/*, outputModifier*/) {
        if (partialMap && partialMap[name]) {
          return partialMap[name](engine, ctx);
        } else {
          return Promise.resolve(ctx);
        }
      },
      modifier: function (name) {
        return modifiers.registry[name].apply(this, Array.prototype.slice.call(arguments, 1));
      }
    };

    return tpl(engine, ctx).then(function () {
      return output;
    }).catch(function (err) {
      //console.error(err.stack);
      throw err;
    });
  }


  describe('Test Compiler Flags', function () {
    let stateBeautify;
    let stateDebug;

    before(function () {
      stateBeautify = Compiler.BEAUTIFY;
      stateDebug = Compiler.DEBUG;
    });

    after(function () {
      Compiler.BEAUTIFY = stateBeautify;
      Compiler.DEBUG = stateDebug;
    });

    it('should beautify', function () {
      const parsed = [
        {
          "type": "text",
          "content": "Hello World"
        }
      ];

      Compiler.BEAUTIFY = false;
      Compiler.BEAUTIFY.should.equal(false);
      let fn1 = Compiler.compile(parsed);
      Compiler.BEAUTIFY = true;
      Compiler.BEAUTIFY.should.not.equal(false);   // THIS IS WEIRD AND INCONSISTENT, it's an Object now...
      let fn2 = Compiler.compile(parsed);

      fn2.toString().length.should.be.greaterThan(fn1.toString().length);

    });

    it('should debug', function () {
      Compiler.DEBUG = false;
      Compiler.DEBUG.should.equal(false);
      Compiler.DEBUG = true;
      Compiler.DEBUG.should.equal(true);
      Compiler.DEBUG = false;
      Compiler.DEBUG.should.equal(false);
    });

    it('should ignore suspicious segments', function () {
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = false;
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS.should.equal(false);
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = true;
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS.should.equal(true);
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = false;
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS.should.equal(false);
    });

  });

  describe('Debug information', function () {
    let stateDebug;

    before(function () {
      stateDebug = Compiler.DEBUG;
    });

    after(function () {
      Compiler.DEBUG = stateDebug;
    });

    it('should contain debug information', function () {
      const parsed = [
        {
          type: 'text',
          content: 'test'
        }
      ];

      Compiler.DEBUG = true;

      const compiled = Compiler.compile(parsed);

      compiled.toString().match(/var (.*?);[\s\S]*?\1\s*?=/).should.not.be.null;
    });

    it('should not contain debug information', function () {
      const parsed = [
        {
          type: 'text',
          content: 'test'
        }
      ];

      Compiler.DEBUG = false;

      const compiled = Compiler.compile(parsed);

      String(compiled.toString().match(/var (.*?);[\s\S]*?\1\s*?=/)).should.equal('null');
    });

  });


  describe('Text-only Templates', function () {

    it('should compile single text segment', function () {
      const parsed = [
        {
          "type": "text",
          "content": "Hello World"
        }
      ];
      const fn = Compiler.compile(parsed);

      return execTemplate(fn).then(function (output) {
        output.buffer.should.equal('Hello World');
      });
    });

    it('should optimize consecutive text segments', function () {
      /// NOTE : this situation is technically impossible, but the compiler should support it anyway
      const parsed = [
        {
          "type": "text",
          "content": "Hello"
        },
        {
          "type": "text",
          "content": " "
        },
        {
          "type": "text",
          "content": "World"
        },
        {
          "type": "text",
          "content": "!"
        }
      ];
      const fn = Compiler.compile(parsed);

      return execTemplate(fn).then(function (output) {
        output.raw.length.should.equal(1);
        output.buffer.should.equal('Hello World!');
      });
    });

  });


  describe('Output Segments', function () {

    it('should ignore empty output', function () {
      const parsed = [
        {
          "@template": "{{''}}",
          "type": "output",
          "context": null,
          "expression": [],
          "modifiers": [],
          "offset": 0,
          "line": 1,
          "column": 1
        }
      ];
      const fn = Compiler.compile(parsed);

      return execTemplate(fn).then(function (output) {
        output.raw.should.have.lengthOf(0);
        output.buffer.should.equal('');
      });
    });

    it('should compile single segment', function () {
      const parsed = [
        {
          "@template": "{{\"Hello \" + foo}}",
          "type": "output",
          "context": null,
          "expression": [
            {
              "type": "string",
              "value": "Hello "
            },
            {
              "type": "operator",
              "value": "+"
            },
            {
              "type": "context",
              "value": {
                "path": "foo"
              }
            }
          ],
          "modifiers": [],
          "offset": 0,
          "line": 1,
          "column": 1
        }
      ];
      const fn = Compiler.compile(parsed);

      return execTemplate(fn, {
        foo: 'John'
      }).then(function (output) {
        output.raw.should.have.lengthOf(1);
        output.buffer.should.equal('Hello John');
      });
    });


    it('should compile with different contexts', function () {
      const parsed = [
        {
          "@template": "{{foo\\ add + 2}} {{bar\\ mul * 10}}",

          "type": "output",
          "context": "foo",
          "expression": [
            {
              "type": "context",
              "value": {
                "path": "add"
              }
            },
            {
              "type": "operator",
              "value": "+"
            },
            {
              "type": "number",
              "value": 2
            }
          ],
          "modifiers": [],
          "offset": 0,
          "line": 1,
          "column": 1
        },
        {
          "type": "text",
          "content": " ",
          "offset": 16,
          "line": 1,
          "column": 17
        },
        {
          "type": "output",
          "context": "bar",
          "expression": [
            {
              "type": "context",
              "value": {
                "path": "mul"
              }
            },
            {
              "type": "operator",
              "value": "*"
            },
            {
              "type": "number",
              "value": 10
            }
          ],
          "modifiers": [],
          "offset": 17,
          "line": 1,
          "column": 18
        }
      ];
      const data = {
        foo: {
          add: 10
        },
        bar: {
          mul: 5
        }
      };
      const fn = Compiler.compile(parsed);

      return execTemplate(fn, data).then(function (output) {
        output.raw.should.have.lengthOf(2);
        output.buffer.should.equal('12 50');
      });
    });

  });


  describe('Conditional Segments', function () {

    it('should compile single segment', function () {
      const parsed = require('../fixtures/segments/conditional1.eft');
      const fn = Compiler.compile(parsed);
      const tests = [
      [    // false
        false, null, undefined, 0, ''
      ],[  // true
        true, {}, [], function () {}, -1, 1, /./
      ]];

      return Promise.all(tests.map(function(values, truthy) {
        return Promise.all(values.map(function (value) {
          const data = {
            value: value
          };

          return execTemplate(fn, data);
        })).then(function (res) {
          res.map(function (output) { return output.buffer; }).should.eql(values.map(function () {
            return truthy ? 'Hello World': '';
          }));
        });
      })).then(function () {});
    });

    it('should compile with else segment', function () {
      const parsed = require('../fixtures/segments/conditional2.eft');
      const fn = Compiler.compile(parsed);
      const tests = [
      [    // false
        false, null, undefined, 0, ''
      ],[  // true
        true, {}, [], function () {}, -1, 1, /./
      ]];

      return Promise.all(tests.map(function(values, truthy) {
        return Promise.all(values.map(function (value) {
          const data = {
            value: value
          };

          return execTemplate(fn, data);
        })).then(function (res) {
          res.map(function (output) { return output.buffer; }).should.eql(values.map(function () {
            return truthy ? 'Hello World': 'Good Bye';
          }));
        });
      })).then(function () {});
    });

    it('should integrate with other segments', function () {
      const parsed = require('../fixtures/segments/conditional3.eft');
      const fn = Compiler.compile(parsed);
      const tests = [
      [    // false
        false, null, undefined, 0, ''
      ],[  // true
        true, {}, [], function () {}, -1, 1, /./
      ]];
      const PREVAL = '>>>';
      const POSTVAL = '<<<';

      return Promise.all(tests.map(function(values, truthy) {
        return Promise.all(values.map(function (value) {
          const data = {
            pre: PREVAL,
            foo: {
              value: value,
            },
            post: POSTVAL
          };

          return execTemplate(fn, data);
        })).then(function (res) {
          res.map(function (output) { return output.buffer; }).should.eql(values.map(function () {
            return PREVAL + (truthy ? 'Hello World': 'Bye World') + POSTVAL;
          }));
        });
      })).then(function () {});
    });

    it('should handle else if', function () {
      const parsed = require('../fixtures/segments/conditional4.eft');
      const fn = Compiler.compile(parsed);

      return Promise.all([
        execTemplate(fn, { a: true }).then(function (output) {
          output.buffer.should.equal('a');
        }),
        execTemplate(fn, { b: true }).then(function (output) {
          output.buffer.should.equal('b');
        }),
        execTemplate(fn, { c: true }).then(function (output) {
          output.buffer.should.equal('c');
        }),
        execTemplate(fn).then(function (output) {
          output.buffer.should.equal('d');
        })
      ]).then(function () {});
    });

    it('should fail when too many segments', function () {
      const parsed = require('../fixtures/segments/conditional5.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Unexpected token else');
    });

    it('should fail if missing segment body', function () {
      const parsed = require('../fixtures/segments/conditional6.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Missing conditional body');
    });

  });


  describe('Iterator Segments', function () {

    it('should iterate arrays', function () {
      const parsed = require('../fixtures/segments/iterator1.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        values: ['a', 'b', 'c']
      };

      return execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('0aa;1bb;2cc;');
        output.raw.should.have.lengthOf(data.values.length);
      });
    });

    it('should iterate objects', function () {
      const parsed = require('../fixtures/segments/iterator1.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        values: {
          'a': 'A',
          'b': 'B',
          'c': 'C'
        }
      };

      return execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('0aA;1bB;2cC;');
        output.raw.should.have.lengthOf(Object.keys(data.values).length);
      });
    });

    it('should iterate counter', function () {
      const parsed = require('../fixtures/segments/iterator1.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        values: 3
      };

      return execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('000;111;222;');
        output.raw.should.have.lengthOf(data.values);
      });
    });

    it('should fail when too many segments', function () {
      const parsed = require('../fixtures/segments/iterator2.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Too many segments for iterator');
    });

  });


  describe('Named Segments', function () {

    it('should set named segments', function () {
      const parsed = require('../fixtures/segments/named1.eft');
      const fn = Compiler.compile(parsed);

      return execTemplate(fn).then(function (output) {
        output.buffer.should.be.empty;
        output.raw.should.be.empty;
        //console.log(JSON.stringify(output.named, null, 2));
        //output.named.should.have.ownProperty('foo').be.instanceOf(Function);
      });
    });

    it('should render named segments', function () {
      const parsed = require('../fixtures/segments/named2.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        'user': 'John'
      };

      return execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('Hello John');
        output.raw.should.have.lengthOf(1);
        //output.named.should.have.ownProperty('foo').be.instanceOf(Function)
      });
    });

    it('should fail when too many segments (declare)', function () {
      const parsed = require('../fixtures/segments/named3.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Too many segments for named segment declare');
    });

    it('should fail when too many segments (render)', function () {
      const parsed = require('../fixtures/segments/named4.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Too many segments for named segment');
    });


    it('should pass correct context', function () {
      const parsed = require('../fixtures/segments/named5.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        named: {
          declare: {
            test: {
              foo: { user: 'John' }
            }
          },
          render: {
            test: {
              bar: { user: 'Bob' }
            }
          }
        }
      };

      return execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('Hello Bob and John');
      });
    });


    it('should eval async', function () {
      const parsed = require('../fixtures/segments/named6.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        name: function () {
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve('test');
            }, 50);
          });

        },
        foo: function () {
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve('Hello');
            }, 50);
          });
        },
        bar: function () {
          return new Promise(function (resolve) {
            setTimeout(function () {
              resolve('World');
            }, 20);
          });
        }
      };

      return execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('Hello World!');
      });
    });

  });


  describe('Custom Segments', function () {

    it('should parse custom segments', function () {
      const parsed = require('../fixtures/segments/custom1.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        'callback': function () {
          callbackCalled = true;
        },
        'custom': 'callback'
      };
      let callbackCalled = false;

      return execTemplate(fn, data).then(function (output) {
        output.buffer.should.be.empty;
        callbackCalled.should.equal(true);
      });
    });

    it('should render single segments', function () {
      const parsed = require('../fixtures/segments/custom2.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        'callback': function (ctx, segments) {
          return segments[2](ctx);
        }
      };

      return execTemplate(fn, data).then(function (output) {
        output.raw.should.have.lengthOf(1);
        output.buffer.should.equal('Seg3');
      });
    });

    it('should render all segments', function () {
      const parsed = require('../fixtures/segments/custom2.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        'callback': function (ctx, segments) {
          return segments.reduce(function (p, seg) {
            return p.then(seg(ctx));
          }, Promise.resolve(ctx));
        }
      };

      return execTemplate(fn, data).then(function (output) {
        output.raw.should.have.lengthOf(5);
        output.buffer.should.equal('Seg1Seg2Seg3Seg4Seg5');
      });
    });

  });



  describe('Partial Segments', function () {

    it('should render partial', function () {
      const parsed = require('../fixtures/segments/partial1.eft');
      const partialMap = {
        'foo': Compiler.compile(require('../fixtures/segments/partial-foo.eft')),
        'bar': Compiler.compile(require('../fixtures/segments/partial-bar.eft'))
      };
      const fn = Compiler.compile(parsed);
      const data = {
        foo: {
          name: 'Foo'
        },
        bar: {
          name: 'Bar'
        }
      }

      execTemplate(fn, data, partialMap).then(function (output) {
        output.buffer.should.equal('Start:Hello Foo !Bye Bar !:End');
        output.raw.should.have.lengthOf(4);
      });
    });

    it('should fail when too many segments', function () {
      const parsed = require('../fixtures/segments/partial2.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Too many segments for partial');
    });

  });


  describe('Expressions', function () {

    it('should honor operator priority', function () {
      const parsed = require('../fixtures/segments/expressions1.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        values: 5
      };

      return execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('45');
        output.raw.should.have.lengthOf(1);
      });
    });

    it('should negate', function () {
      const parsed = require('../fixtures/segments/expressions2.eft');
      const fn = Compiler.compile(parsed);

      return execTemplate(fn).then(function (output) {
        output.buffer.should.equal('true:false:true:false:true:false');
      });
    })

    it('should invoke functions', function () {
      const parsed = require('../fixtures/segments/expressions3.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        a: 2,
        b: 3,
        fn1: function fn1(a, b) {
          return a * b;
        },
        foo: {
          bar: {
            fn2: function fn2(a, b) {
              return a + b;
            }
          }
        }
      };

      return execTemplate(fn, data).then(function (output) {
        // 2 * 11 + 13 + 3 = 22 + 16 = 38
        output.buffer.should.equal('38');
      });

    });

  });



  describe('Modifiers', function () {

    it('should apply simple', function () {
      const parsed = require('../fixtures/segments/modifiers1.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        encodeURIComponent: 'http://w3schools.com/my test.asp?name=ståle&car=saab',
        decodeURIComponent: 'http%3A%2F%2Fw3schools.com%2Fmy%20test.asp%3Fname%3Dst%C3%A5le%26car%3Dsaab',
        encodeURI: 'my test.asp?name=ståle&car=saab',
        decodeURI: 'my%20test.asp?name=st%C3%A5le&car=saab',
        encodeHTML: 'a>"&bé"',
        decodeHTML: 'a&gt;&quot;&amp;b&eacute;&quot;',
        encodeXML: 'a>"&bé"',
        decodeXML: 'a&gt;&quot;&amp;b&#xE9;&quot;',
        json: { foo: 'bar' },
        upper: 'hello',
        lower: 'WORLD',
        mask: "p4s5w0rd",
        padLeft: 123,
        padRight: 456
      };

      return execTemplate(fn, data).then(function (output) {
        const bufArr = output.buffer.split('\n');

        bufArr.should.have.lengthOf(Object.keys(data).length);

        bufArr.should.eql([
          data.decodeURIComponent,
          data.encodeURIComponent,
          data.decodeURI,
          data.encodeURI,
          data.decodeHTML,
          data.encodeHTML,
          data.decodeXML,
          data.encodeXML,
          '{"foo":"bar"}',
          'HELLO',
          'world',
          '?????????',
          '---123',
          '456+++'
        ]);
      });
    });

    it('should chain multiple functions', function () {
      const parsed = require('../fixtures/segments/modifiers2.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        name: 'john'
      };

      return execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('xxxxxxxxJOHN');
      });
    });

    it('should be stackable', function () {
      const parsed = require('../fixtures/segments/modifiers3.eft');
      const fn = Compiler.compile(parsed);
      const data = {
        domain: 'domain.com',
        data: {
          foo: 'bar',
          buz: 123
        }
      };

      return execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('http://domain.com?d=%7b%22foo%22%3a%22bar%22%2c%22buz%22%3a123%7d');
      });
    });

  });


  describe('Suspicious segments', function () {

    before(function () {
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = false;
    });

    it('should throw', function () {
      const parsed = require('../fixtures/suspicious.eft');

      (function () { Compiler.compile(parsed); }).should.throw(/^Suspicious segment found/);
    });

    it('should ignore', function () {
      const parsed = require('../fixtures/suspicious.eft');
      const fn = Compiler.compile(parsed, { ignoreSuspiciousSegments: true });

      return execTemplate(fn).then(function (output) {
        output.buffer.should.equal('Hello {foo{bar}}!');
      });
    });

    it('should ignore globally', function () {
      const parsed = require('../fixtures/suspicious.eft');

      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = true;

      Compiler.compile(parsed);

      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = false;

      (function () { Compiler.compile(parsed); }).should.throw(/^Suspicious segment found/);
    });

  });


  describe('Handle compilation errors', function () {
    let stateDebug;

    before(function () {
      stateDebug = Compiler.DEBUG;
    });

    afterEach(function () {
      Compiler.DEBUG = stateDebug;
    });

    it('should return faulty segment', function () {
      const parsed = require('../fixtures/suspicious.eft');

      try {
        Compiler.DEBUG = true;

        Compiler.compile(parsed);
        throw new Error('Test failed');
      } catch (err) {
        err.should.be.an.Error;
        err.name.should.equal('CompilerException');
        err.should.have.ownProperty('segment').be.an.Object;
        err.segment.should.have.ownProperty('offset').equal(10);
        err.segment.should.have.ownProperty('line').equal(1);
        err.segment.should.have.ownProperty('column').equal(11);
      }
    });

    it('should throw "Invalid segment"', function () {
      [
        undefined, true, false,
        'bob',
        0, NaN,
        {}, function () {}, /./
      ].forEach(function (parsed) {
        (function () { Compiler.compile(parsed); }).should.throw(/^Invalid segments/);
      });
    });

    it('should throw "Malformed parsed data"', function () {
      Compiler.DEBUG = false;

      [
        true,
        'bob',
        {}, function () {}, /./
      ].forEach(function (parsed) {
        (function () { Compiler.compile([parsed]); }).should.throw('Malformed parsed data');
      });
    });

  });

});
