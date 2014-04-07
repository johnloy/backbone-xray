(function(app) {

  Backbone.xray.configure({

    instrumented: [],

    constructors: {
      'AppView'         : app.AppView,
      'TodoView'        : app.TodoView,
      'TodoRouter'      : app.TodoRouter,
      'TodoModel'       : app.TodoModel,
      'TodosCollection' : app.TodosCollection
    },

    aliases: [
      {
        name: 'all',
        expanded: ['model', 'collection', 'view', 'router'],
        match: function(obj, log) {
          var constrName, objType;
          constrName = app.typeOf(obj).toLowerCase();
          return _.any(this.expanded, function(p) { return RegExp(p + '$','i').test(constrName) });
        }
      }
    ]
  });


}(app));
