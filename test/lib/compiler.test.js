

describe('Test compiler', function () {

  var Compiler = require('../../lib/compiler');
  var modifiers = require('../../lib/modifiers');

  Compiler.DEBUG = true;      // DEBUG
  Compiler.BEAUTIFY = true;   //


  function execTemplate(tpl, data, partialMap) {
    var Context = require('../../lib/context');
    var ctx = new Context(data);
    var output = {
      raw: [],
      buffer: '',
      named: {}
    };
    var engine = {
      out: function out(str) {
        output.raw.push(str);
        output.buffer += str;
      },
      err: function err(err, ptr) {
        console.error("Run-time error near " + JSON.stringify(ptr) + " in template");
      },
      iterator: function (values, ctx, cb) {
        var arr;

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
      setSegment: function (name, fn) {
        output.named[name] = fn;
      },
      getSegment: function (name) {
        return output.named[name] || function (c) { return c; };
      },
      callCustom: function(path, ctx, segments, modifier) {
        var engine = this;
        var custom = ctx.get(String(path)).data;
        var promise = Promise.resolve(ctx);

        if (typeof custom === 'function') {
          return promise.then(function (ctx) {
            return custom.call(engine, ctx, segments, modifier);
          });
        } else {
          return promise;
        }
      },
      render: function (name, ctx) {
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
    var stateBeautify;
    var stateDebug;

    before(function () {
      stateBeautify = Compiler.BEAUTIFY;
      stateDebug = Compiler.DEBUG;
    });

    after(function () {
      Compiler.BEAUTIFY = stateBeautify;
      Compiler.DEBUG = stateDebug;
    });

    it('should beautify', function () {
      var parsed = [
        {
          "type": "text",
          "content": "Hello World"
        }
      ];
      var fn1;
      var fn2;

      Compiler.BEAUTIFY = false;
      Compiler.BEAUTIFY.should.be.false;
      fn1 = Compiler.compile(parsed);
      Compiler.BEAUTIFY = true;
      Compiler.BEAUTIFY.should.be.true;
      fn2 = Compiler.compile(parsed);

      fn2.toString().length.should.be.greaterThan(fn1.toString().length);

    });

    it('should debug', function () {
      Compiler.DEBUG = false;
      Compiler.DEBUG.should.be.false;
      Compiler.DEBUG = true;
      Compiler.DEBUG.should.be.true;
      Compiler.DEBUG = false;
      Compiler.DEBUG.should.be.false;
    });

    it('should ignore suspicious segments', function () {
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = false;
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS.should.be.false;
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = true;
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS.should.be.true;
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = false;
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS.should.be.false;
    });

  });


  describe('Text-only Templates', function () {

    it('should compile single text segment', function (done) {
      var parsed = [
        {
          "type": "text",
          "content": "Hello World"
        }
      ];
      var fn = Compiler.compile(parsed);

      execTemplate(fn).then(function (output) {
        output.buffer.should.equal('Hello World');
      }).then(done).catch(done);
    });

    it('should optimize consecutive text segments', function (done) {
      /// NOTE : this situation is technically impossible, but the compiler should support it anyway
      var parsed = [
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
      var fn = Compiler.compile(parsed);

      execTemplate(fn).then(function (output) {
        output.raw.length.should.equal(1);
        output.buffer.should.equal('Hello World!');
      }).then(done).catch(done);
    });

  });


  describe('Output Segments', function () {

    it('should compile single segment', function (done) {
      var parsed = [
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
      var fn = Compiler.compile(parsed);

      execTemplate(fn, {
        foo: 'John'
      }).then(function (output) {
        output.raw.should.have.lengthOf(1);
        output.buffer.should.equal('Hello John');
      }).then(done).catch(done);
    });


    it('should compile with different contexts', function (done) {
      var parsed = [
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
      var data = {
        foo: {
          add: 10
        },
        bar: {
          mul: 5
        }
      };
      var fn = Compiler.compile(parsed);

      execTemplate(fn, data).then(function (output) {
        output.raw.should.have.lengthOf(2);
        output.buffer.should.equal('12 50');
      }).then(done).catch(done);
    });

  });


  describe('Conditional Segments', function () {

    it('should compile single segment', function (done) {
      var parsed = require('../fixtures/segments/conditional1.eft');
      var fn = Compiler.compile(parsed);
      var tests = [
      [    // false
        false, null, undefined, 0, ''
      ],[  // true
        true, {}, [], function () {}, -1, 1, /./
      ]];

      Promise.all(tests.map(function(values, truthy) {
        return Promise.all(values.map(function (value) {
          var data = {
            value: value
          };

          return execTemplate(fn, data);
        })).then(function (res) {
          res.map(function (output) { return output.buffer; }).should.eql(values.map(function () {
            return truthy ? 'Hello World': '';
          }));
        });
      })).then(function () { done(); }).catch(done);
    });

    it('should compile with else segment', function (done) {
      var parsed = require('../fixtures/segments/conditional2.eft');
      var fn = Compiler.compile(parsed);
      var tests = [
      [    // false
        false, null, undefined, 0, ''
      ],[  // true
        true, {}, [], function () {}, -1, 1, /./
      ]];

      Promise.all(tests.map(function(values, truthy) {
        return Promise.all(values.map(function (value) {
          var data = {
            value: value
          };

          return execTemplate(fn, data);
        })).then(function (res) {
          res.map(function (output) { return output.buffer; }).should.eql(values.map(function () {
            return truthy ? 'Hello World': 'Good Bye';
          }));
        });
      })).then(function () { done(); }).catch(done);
    });

    it('should integrate with other segments', function (done) {
      var parsed = require('../fixtures/segments/conditional3.eft');
      var fn = Compiler.compile(parsed);
      var tests = [
      [    // false
        false, null, undefined, 0, ''
      ],[  // true
        true, {}, [], function () {}, -1, 1, /./
      ]];
      var PREVAL = '>>>';
      var POSTVAL = '<<<';

      Promise.all(tests.map(function(values, truthy) {
        return Promise.all(values.map(function (value) {
          var data = {
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
      })).then(function () { done(); }).catch(done);
    });

    it('should fail when too many segments', function () {
      var parsed = require('../fixtures/segments/conditional4.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Unexpected token else');
    });
  });


  describe('Iterator Segments', function () {

    it('should iterate arrays', function (done) {
      var parsed = require('../fixtures/segments/iterator1.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        values: ['a', 'b', 'c']
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('0aa;1bb;2cc;');
        output.raw.should.have.lengthOf(data.values.length);
      }).then(done).catch(done);
    });

    it('should iterate objects', function (done) {
      var parsed = require('../fixtures/segments/iterator1.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        values: {
          'a': 'A',
          'b': 'B',
          'c': 'C'
        }
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('0aA;1bB;2cC;');
        output.raw.should.have.lengthOf(Object.keys(data.values).length);
      }).then(done).catch(done);
    });

    it('should iterate counter', function (done) {
      var parsed = require('../fixtures/segments/iterator1.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        values: 3
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('000;111;222;');
        output.raw.should.have.lengthOf(data.values);
      }).then(done).catch(done);
    });

    it('should fail when too many segments', function () {
      var parsed = require('../fixtures/segments/iterator2.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Too many segments for iterator');
    });

  });


  describe('Named Segments', function () {

    it('should set named segments', function (done) {
      var parsed = require('../fixtures/segments/named1.eft');
      var fn = Compiler.compile(parsed);

      execTemplate(fn).then(function (output) {
        output.buffer.should.be.empty;
        output.raw.should.be.empty;
        output.named.should.have.ownProperty('foo').be.a.Function;
      }).then(done).catch(done);
    });

    it('should render named segments', function (done) {
      var parsed = require('../fixtures/segments/named2.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        'user': 'John'
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('Hello John');
        output.raw.should.have.lengthOf(1);
        output.named.should.have.ownProperty('foo').be.a.Function;
      }).then(done).catch(done);
    });

    it('should fail when too many segments (declare)', function () {
      var parsed = require('../fixtures/segments/named3.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Too many segments for named segment declare');
    });

    it('should fail when too many segments (render)', function () {
      var parsed = require('../fixtures/segments/named4.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Too many segments for named segment');
    });

  });


  describe('Custom Segments', function () {

    it('should parse custom segments', function (done) {
      var parsed = require('../fixtures/segments/custom1.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        'callback': function () {
          callbackCalled = true;
        },
        'custom': 'callback'
      };
      var callbackCalled = false;

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.be.empty;
        callbackCalled.should.be.true;
      }).then(done).catch(done);
    });

    it('should render single segments', function (done) {
      var parsed = require('../fixtures/segments/custom2.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        'callback': function (ctx, segments) {
          return segments[2](ctx);
        }
      };

      execTemplate(fn, data).then(function (output) {
        output.raw.should.have.lengthOf(1);
        output.buffer.should.equal('Seg3');
      }).then(done).catch(done);
    });

    it('should render all segments', function (done) {
      var parsed = require('../fixtures/segments/custom2.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        'callback': function (ctx, segments) {
          return segments.reduce(function (p, seg) {
            return p.then(seg(ctx));
          }, Promise.resolve(ctx));
        }
      };

      execTemplate(fn, data).then(function (output) {
        output.raw.should.have.lengthOf(5);
        output.buffer.should.equal('Seg1Seg2Seg3Seg4Seg5');
      }).then(done).catch(done);
    });

  });



  describe('Partial Segments', function () {

    it('should render partial', function (done) {
      var parsed = require('../fixtures/segments/partial1.eft');
      var partialMap = {
        'foo': Compiler.compile(require('../fixtures/segments/partial-foo.eft')),
        'bar': Compiler.compile(require('../fixtures/segments/partial-bar.eft'))
      };
      var fn = Compiler.compile(parsed);
      var data = {
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
      }).then(done).catch(done);
    });

    it('should fail when too many segments', function () {
      var parsed = require('../fixtures/segments/partial2.eft');

      (function () { Compiler.compile(parsed); }).should.throw('Too many segments for partial');
    });

  });


  describe('Expressions', function () {

    it('should honor operator priority', function (done) {
      var parsed = require('../fixtures/segments/expressions1.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        values: 5
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('45');
        output.raw.should.have.lengthOf(1);
      }).then(done).catch(done);
    });

    it('should negate', function (done) {
      var parsed = require('../fixtures/segments/expressions2.eft');
      var fn = Compiler.compile(parsed);

      execTemplate(fn).then(function (output) {
        output.buffer.should.equal('true:false:true:false:true:false');
      }).then(done).catch(done);
    })

    it('should invoke functions', function (done) {
      var parsed = require('../fixtures/segments/expressions3.eft');
      var fn = Compiler.compile(parsed);
      var data = {
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

      execTemplate(fn, data).then(function (output) {
        // 2 * 11 + 13 + 3 = 22 + 16 = 38
        output.buffer.should.equal('38');
      }).then(done).catch(done);

    });

  });



  describe('Modifiers', function () {

    it('should apply simple', function (done) {
      var parsed = require('../fixtures/segments/modifiers1.eft');
      var fn = Compiler.compile(parsed);
      var data = {
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

      execTemplate(fn, data).then(function (output) {
        var bufArr = output.buffer.split('\n');

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
      }).then(done).catch(done);
    });

    it('should chain multiple functions', function (done) {
      var parsed = require('../fixtures/segments/modifiers2.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        name: 'john'
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('xxxxxxxxJOHN');
      }).then(done).catch(done);
    });

    it('should be stackable', function (done) {
      var parsed = require('../fixtures/segments/modifiers3.eft');
      var fn = Compiler.compile(parsed);
      var data = {
        domain: 'domain.com',
        data: {
          foo: 'bar',
          buz: 123
        }
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('http://domain.com?d=%7b%22foo%22%3a%22bar%22%2c%22buz%22%3a123%7d');
      }).then(done).catch(done);
    });

  });


  describe('Suspicious segments', function () {

    before(function () {
      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = false;
    });

    it('should throw', function () {
      var parsed = require('../fixtures/suspicious.eft');

      (function () { Compiler.compile(parsed); }).should.throw(/^Suspicious segment found/);
    });

    it('should ignore', function (done) {
      var parsed = require('../fixtures/suspicious.eft');
      var fn = Compiler.compile(parsed, { ignoreSuspiciousSegments: true });

      execTemplate(fn).then(function (output) {
        output.buffer.should.equal('Hello {foo{bar}}!');
      }).then(done).catch(done);
    });

    it('should ignore globally', function () {
      var parsed = require('../fixtures/suspicious.eft');

      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = true;

      Compiler.compile(parsed);

      Compiler.IGNORE_SUSPICIOUS_SEGMENTS = false;      

      (function () { Compiler.compile(parsed); }).should.throw(/^Suspicious segment found/);
    });

  });


  describe('Handle compilation errors', function () {
    var stateDebug;

    before(function () {
      stateDebug = Compiler.DEBUG;
    });

    afterEach(function () {
      Compiler.DEBUG = stateDebug;
    });

    it('should return faulty segment', function () {
      var parsed = require('../fixtures/suspicious.eft');

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
        0, NaN
      ].forEach(function (parsed) {
        (function () { Compiler.compile(parsed); }).should.throw(/^Invalid segments/);
      });
    });


  });

});
