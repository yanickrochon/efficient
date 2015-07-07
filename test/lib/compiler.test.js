

describe('Test compiler', function () {

  var Compiler = require('../../lib/compiler');


  describe('Text-only templates', function () {

    it('should compile single text segment');

    it('should optimize consecutive text segments');

  });


  describe('Output segments', function () {

    it('should compile single segment');

    it('should compile more segments');

    it('should optimize');

    it('should integrate with other segments');

  });


  describe('Conditional segments', function () {

    it('should compile single segment');

    it('should compile with else segment');

    it('should integrate with other segments');

  });


  describe('Switch segments', function () {

    it('should compile single segment');

    it('should compile with more segments');

    it('should integrate with other segments');

  });


  describe('Iterator segments', function () {

    it('should compile single segment');

    it('should integrate with other segments');

  });


  describe('Parsed template', function () {

    it('should compile', function () {
      var parsed = require('../fixtures/simple-2.eft');

      var fn = Compiler.compile(parsed);


      //console.log("*** COMPILED", fn && fn.toString());

    });

  });


});
