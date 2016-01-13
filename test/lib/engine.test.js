'use strict';

describe('Test engine', function () {

  const path = require('path');
  const Engine = require('../../lib/engine');

  const FIXTURES_PATH = path.join(__dirname, '..', 'fixtures');
  

  describe('Resolving templates', function () {
    let engine;
    const engineOptions = {
      paths: {
        'foo/bar': FIXTURES_PATH,
        'fixtures/testing': FIXTURES_PATH,
        '*': FIXTURES_PATH,
        'a/b': FIXTURES_PATH,
        'a/b/c/d/': FIXTURES_PATH,
      },
      ext: '.txt, bob,      .eft,'
    };

    before(function () {
      engine = Engine(engineOptions);
    });

    it('should resolve default path "*"', function () {
      return engine.resolve('template1').then(function (fileName) {
        fileName.should.endWith('template1.eft');
      });
    });

    it('should resolve path', function () {
      const otherEngine = new Engine({
        paths: { '*': FIXTURES_PATH }
      });

      return Promise.all([
        engine.resolve('template1'),
        engine.resolve('fixtures/testing/template1'),
        engine.resolve('a/b/c/d/template1'),
        engine.resolve('foo/bar/../fixtures/template1'),
        engine.resolve('a/b/template1')
      ]).then(function (results) {
        
        Object.keys(engine._cache).should.have.lengthOf(results.length);
        Object.keys(Engine._cache).should.have.lengthOf(1);

        for (let i = 1; i < results.length; ++i) {
          results[0].should.equal(results[i]);
        }

        Engine._cache.should.have.ownProperty(results[0]);
        engine._cache.should.not.have.ownProperty(results[0]);
        otherEngine._cache.should.not.have.ownProperty(results[0]);

        return otherEngine.resolve(results[0]).then(function (file) {
          Object.keys(otherEngine._cache).should.have.lengthOf(0); // got from global
          Object.keys(Engine._cache).should.have.lengthOf(1);

          engine._cache.should.not.have.ownProperty(file);

          file.should.equal(results[0]);
        });
      });
    });

    it('should not resolve', function () {
      return engine.resolve('non-existent').then(function (fileName) {
        throw new Error('Should not have found ' + fileName);
      }, function (err) {
        err.should.be.instanceOf(Error);
      });
    });

    it('should fail to read file', function () {
      const fs = require('fs');
      const _readFile = fs.readFile;

      fs.readFile = function (file, options, cb) {
        cb(new Error('Test I/O error'));
      };

      delete engine._cache['tempalte1'];

      return engine.render('template1').then(function () {
        fs.readFile = _readFile;        

        throw new Error('Should have failed reading file');
      }, function (err) {
        fs.readFile = _readFile;

        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Test I/O error');
      });
    });
  });


  describe('Defining templates', function () {
    let engine;

    before(function () {
      engine = Engine();
    });

    it('should throw on invalid template', function () {
      (function () {
        engine.defineTemplate('tpl', '{?{/}}');
      }).should.throw(/^Unexpected conditional closing segment/);
    });

  });


  describe('Rendering templates', function () {
    let engine;

    before(function () {
      engine = Engine({
        paths: {
          '*': FIXTURES_PATH
        },
        timeout: 50
      });
    });

    it('should render correct context', function () {
      const data = {
        subject: 'World',
        value: 1,
        foo: {
          value: 2
        },
        bar: {
          value: 3
        },
        buz: {
          fn: function (ctx, segments) {
            this.out('$');
            return segments[0](ctx);
          },
          value: 4
        }
      };

      return engine.render('template1', data).then(function (output) {
        output.indexOf('Hello World !').should.not.equal(-1);
        output.indexOf('$0:4').should.not.equal(-1);
        output.indexOf('$1:4').should.not.equal(-1);
        output.indexOf('$2:4').should.not.equal(-1);
      });
    });

    it('should register string template', function () {
      const tpl = 'Test';
      const globalKeys = Object.keys(Engine._cache);
      const localKeys = Object.keys(engine._cache);

      engine.defineTemplate('tpl', tpl)

      globalKeys.should.eql(Object.keys(Engine._cache));
      localKeys.should.not.eql(Object.keys(engine._cache));

      engine._cache.should.have.ownProperty('tpl');
    });

    it('should fail when parsing', function () {
      return engine.render('error').then(function () {
        throw new Error("Should have failed when parsing file");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Missing conditional closing segment (error:1:1)');
      });
    });

    it('should timeout', function () {
      const tpl = '{{timer()}}';
      const data = {
        timer: function () {
          return tplPromise = new Promise(function (resolve) {
            setTimeout(function () {
              resolve();
            }, 100);
          });
        }
      };
      let tplPromise;

      engine.defineTemplate('timeout', tpl);

      return engine.render('timeout', data).then(function () {
        throw new Error("Should have timed out");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Rendering timeout (50ms)');

        return tplPromise;
      });
    });

  });


  describe('Rendering partals', function () {
    let engine;

    before(function () {
      engine = Engine();  // no options, don't need it
    });

    it('should wrap modifiers', function () {
      const tmpl1 = 'Hello {>{foo\\ "tmpl2"/}upper|padLeft(10,"0")}';
      const tmpl2 = '{{text}substr(3)}';
      const data = {
        text: '***bob',
        foo: {
          text: '---john'
        }
      };

      engine.defineTemplate('tmpl1', tmpl1);
      engine.defineTemplate('tmpl2', tmpl2);

      Engine._cache.should.not.have.ownProperty('templ1');

      engine._cache.should.have.ownProperty('tmpl1');
      engine._cache.should.have.ownProperty('tmpl2');

      return engine.render('tmpl1', data).then(function (output) {
        output.should.equal('Hello 000000JOHN');
      });
    });

  });


  describe('Control flow', function () {
    let engine;

    before(function () {
      engine = Engine({
        timeout: 100  // 1 sec timeout
      });
    });

    it('should abort rendering from expression', function () {
      const tmpl = 'Hello {{foo()}} !';
      const data = {
        foo: function () {
          throw new Error('Aborted from expression');
        }
      };

      engine.defineTemplate('tmpl.expr', tmpl);

      return engine.render('tmpl.expr', data).then(function (output) {
        throw new Error("Rendering was not aborted");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Aborted from expression');
      })
    });

    it('should abort rendering from custom (reject)', function () {
      const tmpl = 'Hello {&{"foo"/}} !';
      const data = {
        foo: function () {
          return new Promise(function (resolve, reject) {
            setTimeout(function () {
              reject(new Error('Aborted from custom reject'));
            }, 10);
          });
        }
      };

      engine.defineTemplate('tmpl.custom.reject', tmpl);

      return engine.render('tmpl.custom.reject', data).then(function (output) {
        throw new Error("Rendering was not aborted");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Aborted from custom reject');
      });
    });

    it('should abort rendering from custom (throw)', function () {
      const tmpl = 'Hello {&{"foo"/}} !';
      const data = {
        foo: function () {
          return new Promise(function () {
            throw new Error('Aborted from custom async throw');
          });
        }
      };

      engine.defineTemplate('tmpl.custom.throw', tmpl);

      return engine.render('tmpl.custom.throw', data).then(function (output) {
        throw new Error("Rendering was not aborted");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Aborted from custom async throw');
      });
    });

    it('should abort rendering upon stop async', function () {
      const tmpl = 'Hello {&{"foo"/}} !';
      const data = {
        foo: function () {
          let engine = this;
          return Promise.resolve().then(function () {
            engine.stop();
          });
        }
      };

      engine.defineTemplate('tmpl.custom.stop', tmpl);

      return engine.render('tmpl.custom.stop', data).then(function (output) {
        throw new Error("Rendering was not aborted");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Rendering aborted');
      });
    });

    it('should abort rendering upon stop async with custom message', function () {
      const tmpl = 'Hello {&{"foo"/}} !';
      const data = {
        foo: function () {
          let engine = this;
          return Promise.resolve().then(function () {
            engine.stop('Custom message test');
          });
        }
      };

      engine.defineTemplate('tmpl.custom.stop.msg', tmpl);

      return engine.render('tmpl.custom.stop.msg', data).then(function (output) {
        throw new Error("Rendering was not aborted");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Rendering aborted : Custom message test');
      });
    });

    it('should timeout', function () {
      const tmpl = 'Hello {&{"foo"/}}';
      const data = {
        foo: function () {
          return new Promise(function () {
            // will not resolve....
          });
        }
      };

      engine.defineTemplate('tmpl.custom.timeout', tmpl);

      return engine.render('tmpl.custom.timeout', data).then(function (output) {
        throw new Error("Rendering did not timeout");
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Rendering timeout (100ms)');
      });
    });

  });


  describe('Custom', function () {
    let engine;

    before(function () {
      engine = Engine({
        timeout: 100
      });
    });

    it('should ignore missing custom functions', function () {
      engine.defineTemplate('custom', '{&{"foo" /}}');

      return Promise.all([
        engine.render('custom').then(function (output) {
          output.should.be.empty;
        }),
        engine.render('custom', {
          foo: function () {
            this.out('foo');
          }
        }).then(function (output) {
          output.should.equal('foo');
        })
      ]).then(function () {});
    });

    it('should pass modifier', function () {
      const data = {
        foo: function (ctx, segments) {
          this.out('john');
        }
      };
      engine.defineTemplate('custom.modifier', '{&{"foo" /}upper|padLeft(10,"x")}');

      return engine.render('custom.modifier', data).then(function (output) {
        output.should.equal('xxxxxxJOHN');
      });
    });

  });


  describe('Iterators', function () {
    let engine;

    before(function () {
      engine = Engine({
        timeout: 100
      });
      engine.defineTemplate('iterator', '{@{foo}}{{index}}:{{key}}:{{value}};{@{/}}');
    });

    it('should iterate from object', function () {
      let obj = {
        foo: {
          a: 'A',
          b: 'B',
          c: 'C'
        }
      };

      return engine.render('iterator', obj).then(function (output) {
        output.should.equal('0:a:A;1:b:B;2:c:C;');
      });
    });

    it('should iterate from array', function () {
      let obj = {
        foo: [
          'A',
          'B',
          'C'
        ]
      };

      return engine.render('iterator', obj).then(function (output) {
        output.should.equal('0:0:A;1:1:B;2:2:C;');
      });
    });

    it('should iterate from counter', function () {
      let obj = {
        foo: 3
      };

      return engine.render('iterator', obj).then(function (output) {
        output.should.equal('0:0:0;1:1:1;2:2:2;');
      });
    });

    it('should skip invalid or empty iterators', function () {
      return Promise.all([
        undefined, null, true, false,
        0, NaN,
        function () {}, /./, 
        {}, []
      ].map(function (iterator) {
        return engine.render('iterator', { foo: iterator }).then(function (output) {
          output.should.be.empty();
        });
      })).then(function () {});
    });

  });


  describe('Modifiers', function () {
    let engine;

    before(function () {
      engine = Engine({
        timeout: 100
      });
    });

    it('should apply single modifier', function () {
      engine.defineTemplate('modifier.single', '{{foo}upper}');

      return engine.render('modifier.single', {
        foo: 'hello'
      }).then(function (output) {
        output.should.equal('HELLO');
      });
    });

    it('should apply multiple modifiers in correct order', function () {
      const data = {
        foo: 'b'
      };

      engine.defineTemplate('modifier.multiple.1', '{{foo}upper|padLeft(2,"a")|padRight(3,"c")}');
      engine.defineTemplate('modifier.multiple.2', '{{foo}padLeft(2,"a")|upper|padRight(3,"c")}');
      engine.defineTemplate('modifier.multiple.3', '{{foo}padLeft(2,"a")|padRight(3,"c")|upper}');

      return Promise.all([
        engine.render('modifier.multiple.1', data).then(function (output) {
          output.should.equal('aBc');
        }),
        engine.render('modifier.multiple.2', data).then(function (output) {
          output.should.equal('ABc');
        }),
        engine.render('modifier.multiple.3', data).then(function (output) {
          output.should.equal('ABC');
        })
      ]).then(function () {});
    });

    it('should call with multiple arguments', function () {
      const modifiers = require('../../lib/modifiers');
      const data = {
        foo: 1
      };

      modifiers.register(function adder(val, a, b, c, d, e) {
        return val + (a||0) + (b||0) + (c||0) + (d||0) + (e||0);
      });

      engine.defineTemplate('modifier.args.0', '{{foo}adder()}');
      engine.defineTemplate('modifier.args.1', '{{foo}adder(2)}');
      engine.defineTemplate('modifier.args.2', '{{foo}adder(2,3)}');
      engine.defineTemplate('modifier.args.3', '{{foo}adder(2,3,4)}');
      engine.defineTemplate('modifier.args.4', '{{foo}adder(2,3,4,5)}');
      engine.defineTemplate('modifier.args.5', '{{foo}adder(2,3,4,5,6)}');

      return Promise.all([
        engine.render('modifier.args.0', data).then(function (output) {
          output.should.equal('1');
        }),
        engine.render('modifier.args.1', data).then(function (output) {
          output.should.equal('3');
        }),
        engine.render('modifier.args.2', data).then(function (output) {
          output.should.equal('6');
        }),
        engine.render('modifier.args.3', data).then(function (output) {
          output.should.equal('10');
        }),
        engine.render('modifier.args.4', data).then(function (output) {
          output.should.equal('15');
        }),
        engine.render('modifier.args.5', data).then(function (output) {
          output.should.equal('21');
        })
      ]).then(function () {
        modifiers.unregister('adder');
      });
    });

    it('should fail with invalid modifier', function () {
      engine.defineTemplate('modifier.invalid', '{{foo}invalid}');

      return engine.render('modifier.invalid').then(function () {
        throw new Error('Test should have failed');
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Invalid modifier invalid');
      });
    })

  });


  describe('Partials', function () {
    let engine;

    before(function () {
      engine = Engine({
        timeout: 100
      });
    });

    it('should render simple partial', function () {
      engine.defineTemplate('partial.simple.master', 'Hello {>{"partial.simple.secondary"/}} !');
      engine.defineTemplate('partial.simple.secondary', 'John');

      return engine.render('partial.simple.master').then(function (output) {
        output.should.equal('Hello John !');
      });
    });

    it('should render partial with correct context', function () {
      engine.defineTemplate('partial.context.master', 'Hello {>{foo\\ "partial.context.secondary"/}} !');
      engine.defineTemplate('partial.context.secondary', '{>{bar\\ "partial.context.third"/}}');
      engine.defineTemplate('partial.context.third', '{>{"partial.context.fourth"/}}');
      engine.defineTemplate('partial.context.fourth', '{{name}}');

      return engine.render('partial.context.master', {
        foo: {
          bar: {
            name: 'Max'
          }
        }
      }).then(function (output) {
        output.should.equal('Hello Max !');
      });
    });

    it('should apply modifiers', function () {
      engine.defineTemplate('partial.modifier.master', 'Hello {>{"partial.modifier.secondary"/}lower} !');
      engine.defineTemplate('partial.modifier.secondary', '{>{"partial.modifier.third"/}padLeft(5,"-")}');
      engine.defineTemplate('partial.modifier.third', '{{name}upper}');

      return engine.render('partial.modifier.master', {
        name: 'Bob'
      }).then(function (output) {
        output.should.equal('Hello --bob !');
      });
    });

    it('should fail with template not found', function () {
      engine.defineTemplate('partial.found.master', 'Hello {>{"partial.found.secondary"/}} !');

      return engine.render('partial.found.master', {
        name: 'Bob'
      }).then(function (output) {
        throw new Error('Should have failed when template not found');
      }, function (err) {
        err.should.be.instanceOf(Error).and.have.ownProperty('message').equal('Template not found : partial.found.secondary');
      });
    })

  });


  describe('Named segments', function () {
    let engine;

    before(function () {
      engine = Engine({
        timeout: 100
      });
    });

    it('should render named segment', function () {
      engine.defineTemplate('named.declare', '{#{"custom"}}Hello{#{/}}');
      engine.defineTemplate('named.render', '{#{"custom"}}Hello{#{/}}{+{"custom" /}}');

      return Promise.all([
        engine.render('named.declare'),
        engine.render('named.render')
      ]).then(function (results) {
        results[0].should.be.empty;
        results[1].should.equal('Hello');
      });
    });

    it('should render with correct context', function () {
      const data = {
        foo: {
          greeting: 'Test'
        },
        bar: {
          name: 'template'
        }
      };

      engine.defineTemplate('named.render.context', '{#{foo\\ "custom"}}{{..greeting}} {{name}}{#{/}}{+{bar\\ "custom" /}}');

      return engine.render('named.render.context', data).then(function (output) {
        output.should.equal('Test template');
      });
    });

    it('should ignore missing segments', function () {
      engine.defineTemplate('named.render.missing', 'Hello {+{"missing"/}} !');

      return engine.render('named.render.missing').then(function (output) {
        output.should.equal('Hello  !');
      });

    })

    it('should apply modifiers', function () {
      const data = {
        foo: {
          greeting: 'Test'
        },
        bar: {
          name: 'template'
        }
      };

      engine.defineTemplate('named.render.context', '{#{foo\\ "custom"}lower}{{..greeting}} {{name}padLeft(10,"0")}{#{/}}{+{bar\\ "custom" /}upper}');

      return engine.render('named.render.context', data).then(function (output) {
        output.should.equal('TEST 00TEMPLATE');
      });
    });

  });

});
