

describe('Test engine', function () {

  var path = require('path');

  var Engine = require('../../lib/engine');

  var engineOptions = {
    paths: {
      'fixtures/testing': path.join(__dirname, '..', 'fixtures'),
      '*': path.join(__dirname, '..', 'fixtures')
    }
  };


  describe('Resolving templates', function () {
    var engine;

    before(function () {
      engine = Engine(engineOptions);
    });

    it('should resolve default path "*"', function (done) {
      engine.resolve('template1').then(function (fileName) {
        fileName.should.endWith('template1.eft');

        done();
      }).catch(done);
    });

    it('should resolve path', function (done) {
      Promise.all([
        engine.resolve('template1'),
        engine.resolve('fixtures/testing/template1'),
      ]).then(function (results) {
        results.should.have.lengthOf(2);
        Object.keys(engine._cache).should.have.lengthOf(2);
        Object.keys(Engine._cache).should.have.lengthOf(1);

        results[0].should.equal(results[1]);

        // read global cache
        return Promise.all([
          engine.resolve(path.join(__dirname, '..', 'fixtures', 'template1')),
          engine.resolve(results[0])
        ]).then(function (absResults) {
          absResults[0].should.equal(absResults[1]);
          absResults[0].should.equal(results[0]);
        });
      }).then(done).catch(done);


    });

    it('should not resolve', function (done) {
      engine.resolve('non-existent').then(function (fileName) {
        throw new Error('Should not have found ' + fileName);
      }, function (err) {
        err.should.be.instanceOf(Error);
      }).then(done).catch(done);
    });

  });


  //describe('Test modifiers', function () {

  //});


  describe('Rendering templates', function () {
    var engine;

    before(function () {
      engine = Engine(engineOptions);
    });

    it('should render correct context', function (done) {
      var data = {
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

      engine.render('template1', data).then(function (output) {

        output.indexOf('Hello World !').should.not.equal(-1);
        output.indexOf('$0:4').should.not.equal(-1);
        output.indexOf('$1:4').should.not.equal(-1);
        output.indexOf('$2:4').should.not.equal(-1);

        done();
      }).catch(done);
    });

    it('should register string template');

  });


  describe('Rendering partals', function () {
    var engine;

    before(function () {
      engine = Engine();  // no options, don't need it
    });

    it('should wrap modifiers', function (done) {
      var tmpl1 = 'Hello {>{foo\\ "tmpl2"/}upper|padLeft(10,"0")}';
      var tmpl2 = '{{text}substr(3)}';
      var data = {
        text: '***bob',
        foo: {
          text: '---john'
        }
      };

      Promise.all([
        engine.defineTemplate('tmpl1', tmpl1),
        engine.defineTemplate('tmpl2', tmpl2),
      ]).then(function () {

        engine._cache.should.have.ownProperty('tmpl1');
        engine._cache.should.have.ownProperty('tmpl2');

        return engine.render('tmpl1', data).then(function (output) {
          output.should.equal('Hello 000000JOHN');
        }).then(done);

      }).catch(done);
    });

  });


  describe('Control flow', function () {

    it('should abort rendering from custom');

    it('should abort rendering upon stop async');

    it('should abort rendering upon error in template');

  });


  describe('Iterators', function () {

    it('should iterate from object');

    it('should iterate from array');

    it('should iterate from counter');

  });


  describe('Modifiers', function () {

    it('should apply single modifier');

    it('should apply multiple modifiers in correct order');

  });


  describe('Partials', function () {

    it('should render simple partial');

    it('should render partial with correct context');

    it('should apply modifiers');

  });


  describe('Named segments', function () {

    it('should render named segment');

    it('should render with correct context');

    it('should render with compound context');

    it('should apply modifiers');

  });

});
