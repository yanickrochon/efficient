'use strict';

const pad = require('string-padder');
const entities = require('entities');

const CORE_MODIFIERS = {
  'encodeURIComponent': encodeURIComponent,
  'decodeURIComponent': decodeURIComponent,
  'encodeURI': encodeURI,
  'decodeURI': decodeURI,
  'encodeHTML': encodeHTML,
  'decodeHTML': decodeHTML,
  'encodeXML': encodeXML,
  'decodeXML': decodeXML,
  'json': json,
  'upper': upper,
  'lower': lower,
  'mask': mask,
  'padLeft': pad.padLeft,
  'padRight': pad.padRight,
  'padBoth': pad.padBoth,
  'substr': substr
};

var modifiers = {};


// push all block rules...
for (var modifier in CORE_MODIFIERS) {
   modifiers[modifier] = CORE_MODIFIERS[modifier];
}

Object.freeze(modifiers);


Object.defineProperties(module.exports, {
  'registry': {
    configurable: false,
    enumerable: false,
    get: modifierRegistry
  },

  'register': {
    configurable: false,
    enumerable: false,
    writable: false,
    value: registerModifier
  },

  'unregister': {
    configurable: false,
    enumerable: false,
    writable: false,
    value: unregisterModifier
  }
});


function registerModifier(modifier) {
  var temp;

  if (!(modifier instanceof Function)) {
    throw EngineException('Not a modifier function');
  } else if (!modifier.name) {
    throw EngineException('Anonymous modifier function');
  } else if (modifier.name in CORE_MODIFIERS) {
    throw EngineException('Illegal modifier');
  }

  temp = modifiers;
  modifiers = {};

  for (var mKey in temp) {
    modifiers[mKey] = temp[mKey];
  }

  modifiers[modifier.name] = modifier;

  Object.freeze(modifiers);

  return true;
}

function unregisterModifier(modifier) {
  var oldModifiers;

  if (modifier instanceof Function) {
    if (!modifier.name) {
      return false;
    }

    if (modifier.name in CORE_MODIFIERS) {
      throw EngineException('Illegal modifier');
    }

    oldModifiers = modifiers;
    modifiers = {};

    for (var mKey in oldModifiers) {
      if (oldModifiers[mKey] !== modifier) {
        modifiers[mKey] = oldModifiers[mKey];
      }
    }
  } else {
    if (!modifier || typeof modifier !== 'string') {
      throw EngineException('Invalid modifier');
    } else if (modifier in CORE_MODIFIERS) {
      throw EngineException('Illegal modifier');
    }

    if (!modifiers[modifier]) {
      return false;
    }

    oldModifiers = modifiers;
    modifiers = {};

    for (var mKey in oldModifiers) {
      if (mKey !== modifier) {
        modifiers[mKey] = oldModifiers[mKey];
      }
    }

    modifier = oldModifiers[modifier];
  }

  Object.freeze(modifiers);

  return true;
}


function modifierRegistry() {
  return modifiers;
}



/**
Modifier
*/
function json(val, replacer, space) {
  return JSON.stringify(val, replacer || null, space || 0);
}

/**
Modifier
*/
function upper(val) {
  return String(val).toLocaleUpperCase();
}

/**
Modifier
*/
function lower(val) {
  return String(val).toLocaleLowerCase();
}

/**
Modifier
*/
function mask(val, maskChar) {
  return String(val).replace(/./g, maskChar || '*');
}

/**
Modifier
*/
function encodeHTML(val) {
  return entities.encodeHTML(String(val));
}

/**
Modifier
*/
function decodeHTML(val) {
  return entities.decodeHTML(String(val));
}

/**
Modifier
*/
function encodeXML(val) {
  return entities.encodeXML(String(val));
}

/**
Modifier
*/
function decodeXML(val) {
  return entities.decodeXML(String(val));
}

/**
Modifier
*/
function substr(val, from, to) {
  return String(val).substr(from, to);
}
