/* eslint-disable no-param-reassign */
/* global _ , ReactiveTable:writable, */
const parseFilterString = function (filterString) {
  const startQuoteRegExp = /^['"]/;
  const endQuoteRegExp = /['"]$/;
  const filters = [];
  const words = filterString.split(" ");

  let inQuote = false;
  let quotedWord = "";
  _.each(words, (word) => {
    if (inQuote) {
      if (endQuoteRegExp.test(word)) {
        filters.push(`${quotedWord} ${word.slice(0, word.length - 1)}`);
        inQuote = false;
        quotedWord = "";
      } else {
        quotedWord = `${quotedWord} ${word}`;
      }
    } else if (startQuoteRegExp.test(word)) {
      if (endQuoteRegExp.test(word)) {
        filters.push(word.slice(1, word.length - 1));
      } else {
        inQuote = true;
        quotedWord = word.slice(1, word.length);
      }
    } else {
      filters.push(word);
    }
  });
  return filters;
};

const escapeRegex = function (text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

const getFieldMatches = function (field) {
  const fieldMatches = [];
  const keys = field.split(".");
  let previousKeys = "";
  _.each(keys, (key) => {
    fieldMatches.push(previousKeys + key);
    previousKeys += `${key}.`;
  });
  const extraMatch = field.replace(/\.\d+\./g, ".");
  if (fieldMatches.indexOf(extraMatch) === -1) fieldMatches.push(extraMatch);
  return fieldMatches;
};

// eslint-disable-next-line no-undef
getFilterQuery = function (filterInputs, filterFields, settings) {
  settings = settings || {};
  if (settings.enableRegex === undefined) {
    settings.enableRegex = false;
  }
  if (settings.filterOperator === undefined) {
    settings.filterOperator = "$and";
  }
  if (settings.fields) {
    _.each(filterInputs, (filter, index) => {
      if (_.any(settings.fields, (include) => include)) {
        filterFields[index] = _.filter(filterFields[index], (field) => _.any(getFieldMatches(field), (fieldMatch) => {
          // ensure that the _id field is filtered on, even if it is not explicitly mentioned
          if (fieldMatch === "_id") return true;
          return settings.fields[fieldMatch];
        }));
      } else {
        filterFields[index] = _.filter(filterFields[index], (field) => _.all(
          getFieldMatches(field),
          (fieldMatch) => _.isUndefined(settings.fields[fieldMatch])
              || settings.fields[fieldMatch]
        ));
      }
    });
  }
  const numberRegExp = /^\d+$/;
  const queryList = [];
  _.each(filterInputs, (filter, index) => {
    if (filter) {
      if (_.isObject(filter)) {
        const fieldQueries = _.map(filterFields[index], (field) => {
          const query = {};
          query[field] = filter;
          return query;
        });
        if (fieldQueries.length) {
          queryList.push({ "$or": fieldQueries });
        }
      } else {
        const filters = parseFilterString(filter);
        _.each(filters, (filterWord) => {
          if (settings.enableRegex === false) {
            filterWord = escapeRegex(filterWord);
          }
          const filterQueryList = [];
          _.each(filterFields[index], (field) => {
            const boolQuery = {};

            const filterRegExp = new RegExp(filterWord, "i");
            const query = {};
            query[field] = filterRegExp;
            filterQueryList.push(query);

            if (numberRegExp.test(filterWord)) {
              const numberQuery = {};
              numberQuery[field] = parseInt(filterWord, 10);
              filterQueryList.push(numberQuery);
            }

            if (filterWord === "true") {
              boolQuery[field] = true;
              filterQueryList.push(boolQuery);
            } else if (filterWord === "false") {
              boolQuery[field] = false;
              filterQueryList.push(boolQuery);
            }
          });

          if (filterQueryList.length) {
            const filterQuery = { "$or": filterQueryList };
            queryList.push(filterQuery);
          }
        });
      }
    }
  });

  const query = {};

  if (queryList.length) {
    query[settings.filterOperator] = queryList;
  }

  return query;
};

if (Meteor.isClient) {
  ReactiveTable = ReactiveTable || {};

  const reactiveTableFilters = {};
  const callbacks = {};

  ReactiveTable.Filter = function (id, fields) {
    if (reactiveTableFilters[id]) {
      reactiveTableFilters[id].fields = fields;
      return reactiveTableFilters[id];
    }

    const filter = new ReactiveVar();

    this.fields = fields;

    this.get = function () {
      return filter.get() || "";
    };

    this.set = function (filterString) {
      filter.set(filterString);
      _.each(callbacks[id], (callback) => {
        callback();
      });
    };

    reactiveTableFilters[id] = this;
    return undefined;
  };

  ReactiveTable.clearFilters = function (filterIds) {
    _.each(filterIds, (filterId) => {
      if (reactiveTableFilters[filterId]) {
        reactiveTableFilters[filterId].set("");
      }
    });
  };

  // eslint-disable-next-line no-undef
  dependOnFilters = function (filterIds, callback) {
    _.each(filterIds, (filterId) => {
      if (_.isUndefined(callbacks[filterId])) {
        callbacks[filterId] = [];
      }
      callbacks[filterId].push(callback);
    });
  };

  // eslint-disable-next-line no-undef
  getFilterStrings = function (filterIds) {
    return _.map(filterIds, (filterId) => {
      if (_.isUndefined(reactiveTableFilters[filterId])) {
        reactiveTableFilters[filterId] = new ReactiveTable.Filter(filterId);
      }
      return reactiveTableFilters[filterId].get();
    });
  };

  // eslint-disable-next-line no-undef
  getFilterFields = function (filterIds, allFields) {
    return _.map(filterIds, (filterId) => {
      if (_.isUndefined(reactiveTableFilters[filterId])) {
        return _.map(allFields, (field) => field.key);
      }
      if (_.isEmpty(reactiveTableFilters[filterId].fields)) {
        return _.map(allFields, (field) => field.key);
      }
      return reactiveTableFilters[filterId].fields;
    });
  };

  Template.reactiveTableFilter.helpers({
    "class": function () {
      return this.class || "input-group";
    },

    "filter": function () {
      if (_.isUndefined(reactiveTableFilters[this.id])) {
        // eslint-disable-next-line no-new
        new ReactiveTable.Filter(this.id, this.fields);
      } else if (_.isUndefined(reactiveTableFilters[this.id].fields)) {
        reactiveTableFilters[this.id].fields = this.fields;
      }
      return reactiveTableFilters[this.id].get();
    }
  });

  const updateFilter = _.debounce((template, filterText) => {
    reactiveTableFilters[template.data.id].set(filterText);
  }, 200);

  Template.reactiveTableFilter.events({
    "keyup .reactive-table-input, input .reactive-table-input": function (
      event
    ) {
      const template = Template.instance();
      const filterText = $(event.target).val();
      updateFilter(template, filterText);
    }
  });
}
