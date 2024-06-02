/* eslint-disable no-param-reassign */
/* global ReactiveTable:writable, getFilterQuery:writable, _ */
ReactiveTable = {};

ReactiveTable.publish = function (name, collectionOrFunction, selectorOrFunction, settings) {
  // eslint-disable-next-line consistent-return
  Meteor.publish(`reactive-table-${name}`, function (publicationId, filters, fields, options, rowsPerPage) {
    check(publicationId, String);
    check(filters, [Match.OneOf(String, Object, Mongo.ObjectID),]);
    check(fields, [[String,],]);
    check(options, { skip: Match.Integer, limit: Match.Integer, sort: Object, });
    check(rowsPerPage, Match.Integer);

    let collection;
    let selector;
    let initializing;
    let handle;

    if (_.isFunction(collectionOrFunction)) {
      collection = collectionOrFunction.call(this);
    } else {
      collection = collectionOrFunction;
    }

    if (!(collection instanceof Mongo.Collection)) {
      console.log("ReactiveTable.publish: no collection to publish");
      return [];
    }

    if (_.isFunction(selectorOrFunction)) {
      selector = selectorOrFunction.call(this);
    } else {
      selector = selectorOrFunction;
    }
    const self = this;
    const filterQuery = _.extend(getFilterQuery(filters, fields, settings), selector);
    if (settings && settings.fields) {
      options.fields = settings.fields;
    }

    const pageCursor = collection.find(filterQuery, options);
    const fullCursor = collection.find(filterQuery);
    let countPromise;
    if (typeof filterQuery === "object" && Object.keys(filterQuery).length === 0) {
      countPromise = collection.estimatedDocumentCount();
    } else {
      countPromise = collection.countDocuments(filterQuery);
    }

    const getRow = function (row, index) {
      return _.extend(
        {
          "reactive-table-id": publicationId,
          "reactive-table-sort": index,
        },
        row
      );
    };

    const getRows = function () {
      return _.map(pageCursor.fetch(), getRow);
    };
    const rows = {};
    _.each(getRows(), (row) => {
      rows[row._id] = row;
    });

    const updateRows = function () {
      const newRows = getRows();
      _.each(newRows, (row) => {
        const oldRow = rows[row._id];
        if (oldRow) {
          if (!_.isEqual(oldRow, row)) {
            self.changed(`reactive-table-rows-${publicationId}`, row._id, row);
            rows[row._id] = row;
          }
        } else {
          self.added(`reactive-table-rows-${publicationId}`, row._id, row);
          rows[row._id] = row;
        }
      });
    };

    countPromise.then((count) => {
      self.added("reactive-table-counts", publicationId, { count, });
      _.each(rows, (row) => {
        self.added(`reactive-table-rows-${publicationId}`, row._id, row);
      });

      if (!(settings || {}).disableRowReactivity) {
        initializing = true;

        handle = pageCursor.observeChanges({
          added() {
            if (!initializing) {
              updateRows();
            }
          },

          removed(id) {
            self.removed(`reactive-table-rows-${publicationId}`, id);
            delete rows[id];
            updateRows();
          },

          changed() {
            updateRows();
          },
        });
      }

      if (!(settings || {}).disablePageCountReactivity) {
        fullCursor.observeChanges({
          added() {
            if (!initializing) {
              self.changed("reactive-table-counts", publicationId, { count: fullCursor.count(), });
            }
          },

          removed() {
            self.changed("reactive-table-counts", publicationId, { count: fullCursor.count(), });
          },
        });
      }
      initializing = false;

      self.ready();
    });

    self.onStop(() => {
      if (handle) handle.stop();
    });
  });
};
