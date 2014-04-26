(function(app) {

  Backbone.xray.configure({

    instrumented: [app],

    isRelevantStackLine: function(stackline) {
      return this.defaults.config.isRelevantStackLine(stackline);
    },

    constructors: {
      'AppView'         : app.AppView,
      'TodoView'        : app.TodoView,
      'TodoRouter'      : app.TodoRouter,
      'TodoModel'       : app.TodoModel,
      'TodosCollection' : app.TodosCollection
    },

    aliases: [

      // An example of how to match events for objects with certain attributes.
      // Match events for models with a title containing 'hello'.
      {
        name: 'hello-todos',
        match: function(obj, xray) {
          var title = obj.get && obj.get('title');
          return (/hello/i).test(title);
        }
      }
    ],

    formatters: [
      {
        name: 'method',
        prepend: function() {
          return ['prepended content'];
        }
      }
    ]
  });


}(app));
