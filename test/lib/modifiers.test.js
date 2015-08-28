
describe('Test Modifiers', function () {

  var modifiers = require('../../lib/modifiers');
  var coreModifiers;

  before(function () {
    coreModifiers = Object.keys(modifiers.registry);
  });


  describe('Registering custom modifiers', function () {

    it('should register', function () {
      function custom1() {}

      (custom1.name in modifiers.registry).should.be.false;

      modifiers.register(custom1).should.be.true;

      (custom1.name in modifiers.registry).should.be.true;

    });

    it('should unregister', function () {
      function custom2() {}

      modifiers.register(custom2).should.be.true;

      (custom2.name in modifiers.registry).should.be.true;

      modifiers.unregister(custom2).should.be.true;

      (custom2.name in modifiers.registry).should.be.false;

    });

    it('should unregister by name', function () {
      function custom3() {}

      modifiers.register(custom3).should.be.true;

      (custom3.name in modifiers.registry).should.be.true;

      modifiers.unregister(custom3.name).should.be.true;

      (custom3.name in modifiers.registry).should.be.false;

    });

  });


  describe('Registering validation', function () {

    it('should check for valid type', function () {
      [
        undefined, null, true, true,
        -1, 0, 1,
        '', 'test',
        /./, {}, []
      ].forEach(function (invalidModifier) {

        (function () { modifiers.register(invalidModifier); }).should.throw();

      });
    });

    it('should require modifier name', function () {
      var invalidModifier = function () {};

      (function () { modifiers.register(invalidModifier); }).should.throw();
    });

    it('should restrict overriding core modifiers', function () {
      coreModifiers.forEach(function (coreModifier) {
        var modifier = modifiers.registry[coreModifier];

        (function () { modifiers.register(modifier); }).should.throw();

      });
    });

  });


  describe('Unregistering validation', function () {

    it('should check for valid type and value', function () {
      [
        undefined, null, true, true,
        -1, 0, 1,
        '',
        /./, {}, []
      ].forEach(function (invalidModifier) {

        (function () { modifiers.unregister(invalidModifier); }).should.throw();

      });

    });

    it('should ignore anonymous functions', function () {
      modifiers.unregister(function () {}).should.equal.false;
    });

    it('should not allow unregistering core modifier', function () {
      coreModifiers.forEach(function (coreModifier) {
        var modifier = modifiers.registry[coreModifier];

        (function () { modifiers.unregister(coreModifier); }).should.throw();
        (function () { modifiers.unregister(modifier); }).should.throw();

      });
    });

    it('should ignore missing modifier', function () {
      function custom4() {}

      modifiers.register(custom4).should.be.true;

      (custom4.name in modifiers.registry).should.be.true;

      modifiers.unregister(custom4.name).should.be.true;

      (custom4.name in modifiers.registry).should.be.false;

      modifiers.unregister(custom4.name).should.be.false;

    });

  });


  describe('Test core modifiers with defaults', function () {

    it('should apply json', function () {
      modifiers.registry['json']({ foo: 'bar' }).should.equal('{"foo":"bar"}');
    });

    it('should apply mask', function () {
      modifiers.registry['mask']('foo').should.equal('***');
    });

    it('should apply mask', function () {
      modifiers.registry['substr']('foo').should.equal('foo');
    });

  });


});