

describe('Test compiler', function () {

  var Compiler = require('../../lib/compiler');

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
      callCustom: function (path, ctx, segments) {
        var custom = ctx.getContext(String(path)).data;
        var promise = Promise.resolve(ctx);

        if (typeof custom === 'function') {
          promise = promise.then(custom(ctx, segments));
        }

        return promise.then(function () {
          return ctx;
        });
      },
      render: function (name, ctx) {
        if (partialMap && partialMap[name]) {
          return partialMap[name](engine, ctx);
        } else {
          return Promise.resolve(ctx);
        }
      }
    };

    return tpl(engine, ctx).then(function () {
      return output;
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
    })

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
          "@template": "{{foo\\ add + 2}}",

          "type": "output",
          "content": {
            "context": "foo",
            "expression": [
              {
                "type": "context",
                "value": {
                  "context": "add"
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
            ]
          },
          "modifiers": [],
          "offset": 0,
          "line": 1,
          "column": 1
        }
      ];
      var fn = Compiler.compile(parsed);

      execTemplate(fn, {
        foo: {
          add: 10
        }
      }).then(function (output) {
        output.buffer.should.equal('12');
      }).then(done).catch(done);
    });

    it('should compile more segments', function (done) {
      var parsed = [
        {
          "@template": "{{foo\\ add + 2}} {{bar\\ mul * 10}}",
          "type": "output",
          "content": {
            "context": "foo",
            "expression": [
              {
                "type": "context",
                "value": {
                  "context": "add"
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
            ]
          },
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
          "content": {
            "context": "bar",
            "expression": [
              {
                "type": "context",
                "value": {
                  "context": "mul"
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
            ]
          },
          "modifiers": [],
          "offset": 17,
          "line": 1,
          "column": 18
        }
      ];
      var fn = Compiler.compile(parsed);

      execTemplate(fn, {
        foo: {
          add: 10
        },
        bar: {
          mul: 5
        }
      }).then(function (output) {
        output.buffer.should.equal('12 50');
      }).then(done).catch(done);
    });

    it('should optimize', function (done) {
      var parsed = [
        {
          "@template": "Hello {{foo\\ bar}}!",
          "type": "text",
          "content": "Hello ",
          "offset": 0,
          "line": 1,
          "column": 1
        },
        {
          "type": "output",
          "content": {
            "context": "foo",
            "expression": [
              {
                "type": "context",
                "value": {
                  "context": "bar"
                }
              }
            ]
          },
          "modifiers": [],
          "offset": 6,
          "line": 1,
          "column": 7
        },
        {
          "type": "text",
          "content": "!",
          "offset": 18,
          "line": 1,
          "column": 19
        }
      ];
      var data = {
        foo: {
          bar: 'John'
        }
      };
      var fn = Compiler.compile(parsed);

      execTemplate(fn, data).then(function (output) {
        output.raw.length.should.equal(1);
        output.buffer.should.equal('Hello John!');
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
            return PREVAL + (truthy ? 'Hello World': 'Good Bye') + POSTVAL;
          }));
        });
      })).then(function () { done(); }).catch(done);
    });
  });


  describe('Switch Segments', function () {

    it('should compile single segment', function (done) {
      var parsed = require('../fixtures/segments/switch1.eft');
      var fn = Compiler.compile(parsed);
      var values = ['0', '0', '0', '0', '0', '0', '0', '0', '0', '0'];

      Promise.all(values.map(function(t, value) {
        var data = {
          value: value
        };

        return execTemplate(fn, data);
      })).then(function (res) {
        res.map(function (output) { return output.buffer; }).should.eql(values);
      }).then(done).catch(done);
    });

    it('should compile with more segments', function (done) {
      var parsed = require('../fixtures/segments/switch2.eft');
      var fn = Compiler.compile(parsed);
      var values = ['a', 'b', 'c', '3', '4', '5', '6', '7', '8', '9', '10'];

      Promise.all(values.map(function(t, value) {
        var data = {
          value: value
        };

        return execTemplate(fn, data);
      })).then(function (res) {
        res.map(function (output) { return output.buffer; }).should.eql(values);
      }).then(done).catch(done);
    });

    it('should integrate with other segments', function (done) {
      var parsed = require('../fixtures/segments/switch3.eft');
      var fn = Compiler.compile(parsed);
      var values = ['0', '1', '2', '3'];

      Promise.all(values.map(function(value, index) {
        var data = {
          foo: {
            index: index,
            value: value
          }
        };

        return execTemplate(fn, data);
      })).then(function (res) {
        res.map(function (output) {
          return output.buffer;
        }).should.eql(values.map(function (val) {
          return 'pre' + val + 'post';
        }));
      }).then(done).catch(done);
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
        output.buffer.should.equal('0Aa;1Bb;2Cc;');
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
        output.buffer.should.equal('Start:Hello Foo!Bye Bar!:End');
        output.raw.should.have.lengthOf(4);
      }).then(done).catch(done);
    });

  });


  describe('Expressions', function () {

    it('should honor operator priority');

    it('should invoke functions', function (done) {
      done();
    });

  });



  describe('Modifiers', function () {

    it('should apply simple');

    it('should chain multiple functions');

    it('should be stackable');

  });



  describe('Parsed template', function () {

    it('should compile simple template', function (done) {
      var parsed = require('../fixtures/simple-2.eft');
      var data = {
        name: 'John',
        messages: ['message A', 'message B']
      };
      var fn = Compiler.compile(parsed);

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('Hello John, you have two messages');
      }).then(done).catch(done);

    });

  });


  describe('Parser Integration', function () {

    var Parser = require('../../lib/parser');

    it('should compile parsed template', function (done) {
      var template = 'Hello {{name}}!';
      var parsed = Parser.parse(template);
      var fn = Compiler.compile(parsed);
      var data = {
        name: 'John'
      };

      execTemplate(fn, data).then(function (output) {
        output.buffer.should.equal('Hello John!');
        output.raw.should.have.lengthOf(1);
      }).then(done).catch(done);
    });

  });



});
