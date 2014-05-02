(function(app) {

  Backbone.xray.configure({

    instrumented: ['app'],

    isRelevantStackLine: function(stackline) {
      return this.defaults.isRelevantStackLine(stackline);
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
      },
      {
        name: 'completed',
        expanded: [/completed/]
      }
    ],

    formatters: [
      {
        name: 'collection',
        prepend: function() {
          return ['%cprepended content', 'color: white; background: #000; border-radius: 24px; padding: 2px 5px;'];
        },
        foo: function() {
          return ['foo']
        }
      }
    ]
  });


}(app));
