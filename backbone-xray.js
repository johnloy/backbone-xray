/* ==========================================================================
 * Backbone-Xray: backbone-xray.js v@VERSION
 * https://github.com/johnloy/backbone-xray/blob/master/backbone-xray.js
 * ==========================================================================
 * Copyright 2014 John Loy
 * Licensed under MIT (https://github.com/johnloy/backbone-xray/blob/master/LICENSE)
 * ========================================================================== */

(function(root, factory) {

  // Support AMD
  if(typeof define === 'function' && define.amd) {
    define([ 'exports', 'backbone', 'underscore', 'jquery' ], factory);
  }
  // Support Node.js or CommonJS.
  else if(typeof exports === 'object') {
    factory(exports, require('backbone'), require('underscore'), require('jquery'));
  }
  // Support browser global Backbone var. Use `root` here as it references `window`.
  else {
    factory(root, root.Backbone, root._, root.jQuery);
  }

}(this, function( exports, Backbone, _, $) {

  'use strict';

  var xray = { VERSION: '@VERSION' },
      BBXR_DEVELOPMENT = true;

  var noop = $.noop,

      // start matching after: comment start block => ! or @preserve => optional whitespace => newline
      // stop matching before: last newline => optional whitespace => comment end block
      reCommentContents = /\/\*!?(?:\@preserve)?[ \t]*(?:\r\n|\n)([\s\S]*?)(?:\r\n|\n)\s*\*\//;

  var backboneConstructors = {
    'Model'      : Backbone.Model,
    'Collection' : Backbone.Collection,
    'View'       : Backbone.View,
    'Router'     : Backbone.Router
  };


 /**
  * ## Utilities
  * ======================================================================== */

  var util = {

    parseUri: function(url) {
      var a, url, lastPathSep, query, subdomains;

      a = $('<a>', { href: url } )[0];
      lastPathSep = a.pathname.lastIndexOf('/');
      query = a.search.substr(1); // remove leading /
      subdomains = a.hostname.split('.').slice(0, -2);

      return {
        directory: a.pathname.substr(0, lastPathSep),
        file: a.pathname.slice(lastPathSep + 1),
        hash: a.hash.slice(1), // remove leading #
        host: a.hostname,
        path: a.pathname,
        params: util.parseQueryParams(query),
        protocol: a.protocol.slice(0, -1), // remove trailing :
        query: query,
        subdomains: subdomains,
        tld: a.hostname.substr(a.hostname.lastIndexOf('.') +1),
        userInfo: {
          user: a.username,
          password: a.password
        }
      }
    },

    parseQueryParams: function(query) {
      var re = /([^&=]+)=?([^&]*)/g,
          decodeRE = /\+/g,  // Regex for replacing addition symbol with a space
          decode = function (str) {return decodeURIComponent( str.replace(decodeRE, " ") );},
          params = {},
          matches = null;

      while ( matches = re.exec(query) ) {
          var k = decode( matches[1] ), v = decode( matches[2] );
          if (k.substring(k.length - 2) === '[]') {
              k = k.substring(0, k.length - 2);
              (params[k] || (params[k] = [])).push(v);
          }
          else params[k] = v;
      }

      return params;
    },

    // Mad props to Sindre Sorhus for this great multiline string hack
    // https://github.com/sindresorhus/multiline
    multilineString: function(fn) {
      if (typeof fn !== 'function') {
        throw new TypeError('Expected a function.');
      }

      var match = reCommentContents.exec(fn.toString());

      if (!match) {
        throw new TypeError('Multiline comment missing.');
      }

      return this.stripIndent(match[1]);
    },

    stripIndent: function(str) {
      var match = str.match(/^[ \t]*(?=[^\s])/gm);

      if (!match) {
        return str;
      }

      var indent = Math.min.apply(Math, match.map(function (el) { return el.length }));
      var re = new RegExp('^[ \\t]{' + indent + '}', 'gm');

      return indent > 0 ? str.replace(re, '') : str;
    }

  };


 /**
  * ## Settings
  * ======================================================================== */

  var SETTINGS_STORAGE_KEY = 'backbone-xray.settings',
      persistedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY),
      persistSettingsOpt = persistedSettings ? true : false;

  var _initPersistedSettings = function () {

    Object.defineProperty(xray, 'settings', {
      get: function() {
        var settings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
        if(!settings) settings = {};
        return settings;
      },
      set: function(settings) {
        var settingsSerialized = JSON.stringify(settings);
        localStorage.setItem(SETTINGS_STORAGE_KEY, settingsSerialized);
      }
    });

    xray.settings = xray.settings || {};
  };

  var _destroyPersistedSettings = function () {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  };

  // Public API

  Object.defineProperty(xray, 'persistSettings', {
    get: function() {
      return persistSettingsOpt;
    },
    set: function(persist) {
      if(persist) {
        _initPersistedSettings();
      }
      else {
        _destroyPersistedSettings();
      }
      persistSettingsOpt = persist;
      return persist;
    }
  });

  if(persistedSettings) {
    xray.settings = persistedSettings;
    _initPersistedSettings();
    xray.persistSettings = true;
  } else {
    xray.settings = {};
    xray.persistSettings = persistSettingsOpt;
  }
 
  xray.applySetting = function(name, val) {
    if(arguments.length == 2 && typeof name === 'string') {
      var settingPair = {};
      settingPair[name] = val;
      xray.settings = _.extend(xray.settings, settingPair);
      return settingPair;
    }
  };

  xray.removeSetting = function(name) {
    if(arguments.length > 0 && typeof name === 'string' && typeof xray.settings[name] !== 'undefined') {
      xray.settings = _.omit(xray.settings, name);
    }
  };


 /**
  * ## Instrumentation of Backbone.Events.trigger and other arbitrary methods
  * ======================================================================== */

  var origTrigger = Backbone.Events.trigger,
      trigger     = origTrigger;

  var _isRelevantLine = function (stackLine) {
   if( ~stackLine.indexOf('events.js') ||
       ~stackLine.indexOf('_base.js')) return false;
   return (/\/javascripts\//).test(stackLine);
  };

  // TODO: Extend this so it isn't totally based on Chrome's error stack implementation
  var _trace = function (){

    try { throw Error(); }
    catch(err) {
      var stackLines = err.stack.split("\n").slice(4),
          relevantLine = _.find(stackLines, _isRelevantLine),
          details = [];

      details[0] = "\n" + stackLines.join("\n");

      if(relevantLine) {
        var url = relevantLine.match(/\((.*)\)/);
        details[1] = url ? url[1] : undefined;
      }

      return details;
    }
  };

  var _triggerWithLogging = function (eventName, data) {
    var self = this,
        timeElapsed = null;

    if( xray.isLoggingEventsFor.call(xray, this, eventName) &&
        !~eventName.indexOf('xray-logging')) {

      var firstTiming = window.performance.getEntriesByName('xray-taken').length === 0;

      if(!firstTiming) {
        timeElapsed =  window.performance.now() - _.last(window.performance.getEntriesByType('mark')).startTime;
      }
      window.performance.mark('xray-taken');

      var traceDetails = _trace();
      _.defer(function() {
        xray.log(self, eventName, data, traceDetails[0], traceDetails[1], timeElapsed);
      });
    }

    origTrigger.apply(this, arguments);
  };

  var _addInstrumentation = function () {
    if(xray.config.instrumented) {
      _.each(xray.instrumented, function(obj) {
        obj.trigger = _triggerWithLogging;
      });
    }
    Backbone.Model.prototype.trigger      =
    Backbone.Collection.prototype.trigger =
    Backbone.View.prototype.trigger       =
    Backbone.Router.prototype.trigger     = _triggerWithLogging;
  };

  var _removeInstrumentation = function () {
    if(xray.config.instrumented) {
      _.each(xray.instrumented, function(obj) {
        obj.trigger = origTrigger;
      });
    }
    Backbone.Model.prototype.trigger      =
    Backbone.Collection.prototype.trigger =
    Backbone.View.prototype.trigger       =
    Backbone.Router.prototype.trigger     = origTrigger;
  };

  Backbone.on('xray-logging-start', _addInstrumentation);
  Backbone.on('xray-logging-stop' , _removeInstrumentation);


 /**
  * ## Optional loading of a UI on demand
  * ======================================================================== */

  xray.openUi = function(initView) {
    var thisScript, baseName, fileName, uiUrl;
    var chromeExtensionPrefix = 'chrome-extension://kjomdambjjdfjoihpccpanpelcjhgfhd/';
    thisScript = document.querySelector('script[src$="/backbone-xray.js"]').src;

    var scriptUrlParts = thisScript.split('/');
    baseName = scriptUrlParts.slice(0, -1).join('/');
    fileName = scriptUrlParts.slice(-1);

    if(~baseName.indexOf('file://')) {
      uiUrl = chromeExtensionPrefix + 'backbone-xray-ui.js?init_view=' + initView;
    }
    else {

    }

    $('<script />', { src: uiUrl }).appendTo('body');
  };


 /**
  * ## Defaults
  * ======================================================================== */

 var defaults = {

    chromeExtensionId: null,

    config: {

      instrumented : [],

      constructors : backboneConstructors,

      getTypeOf    : function (obj) {
        var constructors = this.constructors,
            constrName;

        for(constrName in constructors) {
          if(obj.constructor === constructors[constrName]) return constrName;
        }
        for(constrName in constructors) {
          if(obj instanceof constructors[constrName]) return constrName;
        }
        return 'Object';
      },

      formatters   : [],

      aliases      : [
        {
          name: 'backbone',
          expanded: ['Model', 'Collection', 'View', 'Router']
        },
        {
          name: 'backbone-data',
          expanded: ['Model', 'Collection']
        }
      ]

    }

  };


 /**
  * ## Main API
  * ======================================================================== */

  var eventSpecifiersParsed = false;

  // Private methods

  var _compareEventSpecifiers = function (a, b) {
    if( (_.isString(a) && a[0].match(/[A-Z]/)) ||
       _.isFunction(a) ) {
      return -1;
    }
    return 1;
  };

  var _containsUnexpandedAlias = function (expanded) {
    return ~(expanded.join('').indexOf('*'));
  };

  var _expandEventAliases = function (alias) {

    if(!alias.expanded) {
      alias.expanded = [alias.name];
    }

    while(_containsUnexpandedAlias(alias.expanded)) {
      alias.expanded = _.chain(alias.expanded).map(function(expansion) {
        var unexpanded = ~expansion.indexOf('*'),
        resolveKey;
        if(unexpanded) {
          resolveKey = expansion.slice(1);
          return _.findWhere(xray.config.aliases, {name: resolveKey}).expanded;
        }
        return expansion;
      }).flatten().uniq().value();
    }

    return alias;
  };

  var _isInstanceOf = function (obj, constr) {
    constr = typeof constr === 'function' ? constr : xray.config.constructors[constr];
    if(typeof constr !== 'undefined') return (obj instanceof constr);
    return false;
  };

  var _isPatternSpecifier = function (specifier) {
    return _.isString(specifier) && specifier[0] === '/';
  };

  var _isValidEventSpecifier = function () {
    var specifiers = _.toArray(arguments);
    return _.all(specifiers, function(specifier) {
      return _.any( [ _.isString, _.isRegExp ],
                   function(test) { return test(specifier); }
                  );
    });
  };

  var _stringifyEventSpecifiers = function (eventSpecifiers) {
    return _.map(eventSpecifiers, function(specifier) {
      if(specifier instanceof RegExp) return _toRegExpString(specifier);
      return specifier;
    });
  };

  var _patternStrToRegExp = function (patternStr) {
    return RegExp(patternStr.slice(1,-1));
  };

  // We can't store RegExp objects in xray.loggedEvents, as identical RegExp
  // instances aren't ===, so comparison's don't work (WTF ???)
  var _toRegExpString = function (pattern) {
    if(_isPatternSpecifier(pattern.toString())) {
      return pattern.toString();
    }
    else {
      return '/' + pattern + '/';
    }
  };

  // Public API

  xray = _.extend(xray, {

    defaults: defaults,

    config: $.extend({}, defaults.config),

    loggedEvents: (
      function initLoggedEvents() {
        var logSettings = xray.settings;
        if(logSettings && logSettings.loggedEvents) {
          return logSettings.loggedEvents;
        }
        return [];
      }()
    ),

    eventSpecifiers: (
      function initEventSpecifiers() {
        var logSettings = xray.settings;
        if(logSettings && logSettings.eventSpecifiers) {
          return logSettings.eventSpecifiers;
        }
        return [];
      }()
    ),

    configure: function(config) {
      // Omit aliases for now, because the aliases need to be parsed by addAliases
      this.config = $.extend(true, {}, this.config, _.omit(config, 'aliases'));

      if(config.aliases) this.addAliases.apply(this, config.aliases);

      if(config.instrumented) _addInstrumentation(config.instrumented);

      this.parseEventSpecifiers();
    },

    help: function() {
      this.openUi('help');
    },

    logEvents: function() {

     /**
      * Turn on event logging by supplying event specifiers as arguments. These specifiers
      * limit logged events to only ones triggered on specified objects and with specified
      * event names.
      *
      * Specifiers can reference an object, a predefined class of objects, or an event name
      * pattern. Any number of specifier arguments in any order can be supplied. If none
      * are supplied, event logging is disabled.
      *
      * When both object and event name specifiers exist, only events matching both one
      * of the object specifiers and one of the event name specifiers will be logged.
      *
      * When only event name specifiers exist, events triggered on any object matching the
      * name pattern will be logged.
      *
      * When only object specifiers exist, all events triggered on only those objects will
      * be logged.
      *
      * Object specifiers may take any of the following forms:
      *  - A string of the name of a constructor function (example: 'HotelModel')
      *  - A reference to a constructor function
      *  - A string representing a class of objects (example: 'model')
      *
      * Event name specifiers may take any of the following forms:
      *  - A string to be searched for as a substring within event names
      *  - A regular expression to be matched against event names
      *
      * @method logEvents
      * @param {Object} context The object that will have its dependencies
      */

      if(_.isUndefined(arguments[0])) {
        this.stopLoggingEvents();
        return;
      }

      this.eventSpecifiers = _.toArray(arguments).sort(_compareEventSpecifiers);
      this.validateEventSpecifiers();
      this.parseEventSpecifiers();
      this.startLoggingEvents();

      return this.loggedEvents;
    },

    startLoggingEvents: function() {
      if(this.eventSpecifiers.length === 0) {
        throw new Error('No event pattern specifiers have yet been provided. Call Backbone.xray.logEvents() \
                         with at least one argument before calling Backbone.xray.startLoggingEvents');
      }

      if(!eventSpecifiersParsed) {
        this.parseEventSpecifiers();
      };

      Backbone.trigger('xray-logging-start');
    },

    stopLoggingEvents: function() {
      Backbone.trigger('xray-logging-stop');
      this.loggedEvents = [];
      xray.removeSetting('loggedEvents');
    },

    pauseLoggingEvents: function() {
      Backbone.trigger('xray-logging-pause');
    },

    parseEventSpecifiers: function() {
      var self = this,
          loggedEvents = this.loggedEvents = [],
          eventObjMatchers = this.eventObjMatchers = [];

      _.each(this.eventSpecifiers, function(specifier) {
        var alias;

        // Constructor name
        if(self.isConstructorName(specifier)) {
          loggedEvents.push(specifier);
        }

        // Alias
        else if(typeof specifier === 'string' && specifier[0] === '*' && self.config.aliases.length) {
          alias = _.findWhere(self.config.aliases, {name: specifier.slice(1)});
          if(alias) {
            loggedEvents = loggedEvents.concat(alias.expanded);
            if(_.isFunction(alias.match)) eventObjMatchers.push(_.bind(alias.match, alias));
          }
        }

        // String or Regexp event name specifier
        else {
          loggedEvents.push(_toRegExpString(specifier));
        }
      });

      this.loggedEvents = _.uniq(loggedEvents);

      if(xray.persistSettings) {
        xray.applySetting('loggedEvents', loggedEvents);
        xray.applySetting('eventSpecifiers', _stringifyEventSpecifiers(this.eventSpecifiers));
      }

      eventSpecifiersParsed = true;
    },

    validateEventSpecifiers: function() {
      if(!_isValidEventSpecifier.apply(this, this.eventSpecifiers)) {
        throw new Error('Specifier for types of events to log must be a String or RexExp.');
      }
    },

    isEventNameLogged: function(eventName) {
      var loggedPatterns = _.select(this.loggedEvents, _isPatternSpecifier),
          regexes = _.map(loggedPatterns, _patternStrToRegExp),
          eventNameMatches = function(regex) { return regex.test(eventName); };
      return _.isEmpty(loggedPatterns) || _.any(regexes, eventNameMatches);
    },

    isConstructorName: function(testStr) {
      return (typeof testStr === 'string' && testStr.match(/^[A-Z]/) !== null);
    },

    getLoggedConstructorNames: function() {
      return _.select(this.loggedEvents, this.isConstructorName);
    },

    isObjLogged: function(obj) {
      return this.isObjLoggedInstance(obj) || this.doesObjMatchAlias(obj);
    },

    isObjLoggedInstance: function(obj) {
       return _.any(this.getLoggedConstructorNames(), _.bind(_isInstanceOf, this, obj));
    },

    doesObjMatchAlias: function(obj) {
      var self = this;
      return _.any(this.eventObjMatchers, function(matcher) {
        return matcher(obj, self);
      });
    },

    isLoggingEventsFor: function(obj, eventName) {
      return this.isObjLogged(obj) && this.isEventNameLogged(eventName, obj);
    },

    defaultEventTitleFormat: function(eventInfo) {
      var self = this,
          label = null,
          obj = eventInfo.obj,
          strategies = [
            function getName() {
              var name = eventInfo.obj.name || _.isFunction(eventInfo.obj.get) ? obj.get('name') : undefined;
              return name ? self.config.getTypeOf(obj) + '(name: "' + name + '")' : undefined;
            },
            function getId() {
              var obj = eventInfo.obj,
                  idProp = obj.id ? 'id' : 'cid';
              if(obj[idProp]) {
                return self.config.getTypeOf(obj) + '(' + idProp + ': ' + obj[idProp] + ')';
              }
            },
            function getLength() {
              if(obj instanceof Backbone.Collection) {
                return self.config.getTypeOf(obj) + '(length: ' + obj.length + ')';
              }
            }
          ].reverse(),
          i = strategies.length;

      while(i--) {
        label = strategies[i]();
        if(label) return label;
      }

    },

    addFormatters: function() {
      var formatters = _.toArray(arguments)
      this.config.formatters = this.config.formatters.concat(formatters);
    },

    getEventFormatter: function(eventInfo) {
      var formatters = this.config.formatters.reverse(),
          i = formatters.length,
          defaultTitleFormatter = _.bind(this.defaultEventTitleFormat, this),
          matches, title, prependLogContent, appendLogContent,
          formatTitleMethod, prependLogContentMethod, appendLogContentMethod;

      while(i--) {
        matches = formatters[i].match(eventInfo);
        if(matches) {
          title = formatters[i].formatTitle || defaultTitleFormatter;
          prependLogContent = formatters[i].prependLogContent || noop;
          appendLogContent = formatters[i].appendLogContent || noop;
          break;
        }
      }

      return {
        title: title || defaultTitleFormatter,
        prependLogContent: prependLogContent || noop,
        appendLogContent: appendLogContent || noop
      };
    },

    addAliases: function() {
      this.config.aliases = _.union(this.config.aliases, _.toArray(arguments));
      this.config.aliases = _.map(this.config.aliases, _.bind(_expandEventAliases, this));
      this.parseEventSpecifiers();
    },

    log: _.throttle(function(obj, name, data, stack, location, timeElapsed) {
      var self = this, c = console, eventInfo;

      eventInfo = {
        obj: obj,
        name: name,
        data: data,
        stack: stack,
        location: location,
        timeElapsed: timeElapsed
      };

      var formatter = this.getEventFormatter(eventInfo);

      _.defer(_.bind(function(){
        if(xray.settings.logEventNameOnly) {
          c.log('Event: %s ❯ %s', formatter.title(eventInfo), name);
        }
        else {
          c.groupCollapsed('Event: %s ❯ %s', formatter.title(eventInfo), name);

            formatter.prependLogContent(eventInfo);

            c.log('Triggered on: ', obj);

            if(obj._events && obj._events[eventInfo.name]) {
              c.groupCollapsed('Listeners: ');

              _.each(obj._events[eventInfo.name], function(listener, i) {
                var funcStr = listener.callback.toString();
                var funcName = (function() {
                  var logRef = funcStr.match(/@logref\s(\w+#[a-zA-Z0-9_]+)/);
                  if(logRef) return logRef[1] + ':';
                }());

                c.groupCollapsed(funcName || '(anonymous): ');
                  console.log(listener.callback.toString());
                c.groupEnd();
              });

              c.groupEnd();
            }

            if(location) c.log('At (file:line): ', location);
            if(data) c.log('Data: ', data);
            if(timeElapsed) c.log('Time since previous event logged: ' + timeElapsed / 1000 + ' seconds');
            c.groupCollapsed('Call stack: ');
              c.log(stack);
            c.groupEnd();
            formatter.appendLogContent(eventInfo);
          c.groupEnd();
        }
      }, this));
    }, 100),

    util : util

  });

  // Alias these for semantic convenience
  xray.addFormatter = xray.addFormatters;
  xray.addAlias = xray.addAliases;

  // Start logging if persistSettings is true
  if(xray.eventSpecifiers.length) xray.startLoggingEvents();

  Backbone.logEvents = _.bind(xray.logEvents, xray);

  // Export the module to Backbone in the browser, and AMD and Node via return
  return (Backbone.xray = xray);

}));
