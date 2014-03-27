(function(app) {;

  Backbone.eventLogger.configure({
    instrumented: [ app ],
    constructors: app.constructors,
    getTypeOf: app.typeOf,

    aliases: [
      {
        name: 'rk',
        match: function(obj) {
          return window['rk'] === obj;
        }
      },
      {
        name: 'all',
        expanded: ['*rk', 'model', 'collection', 'view', 'router', 'controller'],
        match: function(obj, log) {
          var constrName, objType;
          constrName = app.typeOf(obj).toLowerCase();
          return _.any(this.expanded, function(p) { return RegExp(p + '$','i').test(constrName) });
        }
      },
      {
        name: 'search-results',
        expanded: [
          '*rk',
          'LocationModel',
          'GeocircleModel',
          'PolygonModel',
          'SearchModel',
          'HotelRouter',
          'HotelController',
          '*collect-search-results',
          '*render-hotel-cards'
        ]
      },
      {
        name: 'collect-search-results',
        expanded: [
          'AllHotelsCollection',
          'BasicHotelsCollection',
          'HotelsCollection',
          'SponsoredHotelsCollection',
          'HookLogicCollection',
          'RatesCollection',
          'HookLogicModel',
          'SponsoredModel',
          'ReboundFactory',
          'AttributeSort',
          'SponsoredFilter',
          'AvailabilityFilter',
          'AndFilter',
          'AllPassFilter',
          'OrFilter',
          'PartnerFilter',
          'BrandFilter'
        ]
      },
      {
        name: 'render-hotel-cards',
        expanded: [
          'rk',
          'AppView',
          'HotelsResultsView',
          'HotelsResultsGridView'
        ]
      }
    ],

    formatters: [
      {
        name: 'rk',
        match: function(eventInfo) {
          return app === eventInfo.obj;
        },
        formatTitle: function(eventInfo) {
          return 'rk';
        }
      },
      {
        name: 'route matched',
        match: function(eventInfo) {
          return eventInfo.name.match(/^route:/);
        },
        formatTitle: function(eventInfo) {
          return eventInfo.name;
        }
      },
      {
        name: 'collection',
        match: function(eventInfo) {
          var constructorName = app.typeOf(eventInfo.obj);
          return ~constructorName.indexOf('Collection');
        },
        formatTitle: function(eventInfo) {
          var obj = eventInfo.obj;
          return app.typeOf(obj) + '(length: ' + obj.length + ')';
        }
      },
      {
        name: 'model',
        match: function(eventInfo) {
          var constructorName = app.typeOf(eventInfo.obj);
          return ~constructorName.indexOf('Model');
        },
        formatTitle: function(eventInfo) {
          var obj = eventInfo.obj,
              idProp = obj.id ? 'id' : 'cid';
          return app.typeOf(obj) + '(' + idProp + ': ' + obj[idProp] + ')';
        },
      },
      {
        name: 'view',
        match: function(eventInfo) {
          var constructorName = app.typeOf(eventInfo.obj);
          return ~constructorName.indexOf('View');
        },
        formatTitle: function(eventInfo) {
          var obj = eventInfo.obj,
              idProp = obj.id ? 'id' : 'cid';
          return app.typeOf(obj) + '(' + idProp + ': ' + obj[idProp] + ')';
        },
        prependLogContent: function(eventInfo) {
          console.log('Element: %o', eventInfo.obj.el);
        }
      }
    ]
  });


}(rk));
