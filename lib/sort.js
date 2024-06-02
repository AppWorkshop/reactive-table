/* eslint-disable no-param-reassign */
/* global _  */
// eslint-disable-next-line no-undef
normalizeSort = function (field, oldField) {
  // preserve user sort settings
  if (oldField && _.has(oldField, "sortOrder")) {
    field.sortOrder = oldField.sortOrder;
  }
  if (oldField && _.has(oldField, "sortDirection")) {
    field.sortDirection = oldField.sortDirection;
  }

  // backwards-compatibility
  if (!_.has(field, "sortOrder") && _.has(field, "sort")) {
    console.warn(
      'reactiveTable warning: The "sort" option for fields is deprecated'
    );
    field.sortOrder = 0;
    field.sortDirection = field.sort;
  }

  let sortOrder;

  if (!_.has(field, "sortOrder")) {
    sortOrder = Infinity;
    field.sortOrder = new ReactiveVar();
  } else if (field.sortOrder instanceof ReactiveVar) {
    sortOrder = field.sortOrder.get();
  } else {
    sortOrder = field.sortOrder;
    field.sortOrder = new ReactiveVar();
  }

  if (!_.isNumber(sortOrder) || sortOrder < 0) {
    console.error(
      `reactiveTable error - sortOrder must be a postive number: ${sortOrder}`
    );
    sortOrder = Infinity;
  }
  field.sortOrder.set(sortOrder);

  let sortDirection;

  if (!_.has(field, "sortDirection")) {
    sortDirection = 1;
    field.sortDirection = new ReactiveVar();
  } else if (field.sortDirection instanceof ReactiveVar) {
    sortDirection = field.sortDirection.get();
  } else {
    sortDirection = field.sortDirection;
    field.sortDirection = new ReactiveVar();
  }

  if (
    sortDirection === "desc"
    || sortDirection === "descending"
    || sortDirection === -1
  ) {
    sortDirection = -1;
  } else if (sortDirection) {
    sortDirection = 1;
  }
  field.sortDirection.set(sortDirection);
};

// eslint-disable-next-line no-undef
getSortedFields = function (fields, multiColumnSort) {
  let filteredFields = _.filter(
    fields,
    (field) => field.sortOrder.get() < Infinity
  );
  if (!filteredFields.length) {
    const firstSortableField = _.find(
      fields,
      (field) => _.isUndefined(field.sortable) || field.sortable !== false
    );
    if (firstSortableField) {
      filteredFields = [firstSortableField];
    }
  }
  const sortedFields = _.sortBy(filteredFields, (field) => field.sortOrder.get());
  return multiColumnSort ? sortedFields : sortedFields.slice(0, 1);
};

// eslint-disable-next-line no-undef
getSortQuery = function (fields, multiColumnSort) {
  // eslint-disable-next-line no-undef
  const sortedFields = getSortedFields(fields, multiColumnSort);
  const sortQuery = {};
  _.each(sortedFields, (field) => {
    sortQuery[field.key] = field.sortDirection.get();
  });
  return sortQuery;
};

// eslint-disable-next-line no-undef
sortWithFunctions = function (rows, fields, multiColumnSort) {
  // eslint-disable-next-line no-undef
  const sortedFields = getSortedFields(fields, multiColumnSort);
  let sortedRows = rows;

  _.each(sortedFields.reverse(), (field) => {
    if (field.sortFn) {
      // eslint-disable-next-line no-undef
      sortedRows = _.sortBy(sortedRows, (row) => field.sortFn(get(row, field.key), row));
    } else if (field.sortByValue || !field.fn) {
      sortedRows = _.sortBy(sortedRows, field.key);
    } else {
      // eslint-disable-next-line no-undef
      sortedRows = _.sortBy(sortedRows, (row) => field.fn(get(row, field.key), row));
    }
    if (field.sortDirection.get() === -1) {
      sortedRows.reverse();
    }
  });
  return sortedRows;
};

// eslint-disable-next-line no-undef
getPrimarySortField = function (fields, multiColumnSort) {
  // eslint-disable-next-line no-undef
  return getSortedFields(fields, multiColumnSort)[0];
};

// eslint-disable-next-line no-undef
changePrimarySort = function (fieldId, fields, multiColumnSort) {
  // eslint-disable-next-line no-undef
  const primarySortField = getPrimarySortField(fields, multiColumnSort);
  if (primarySortField && primarySortField.fieldId === fieldId) {
    const sortDirection = -1 * primarySortField.sortDirection.get();
    primarySortField.sortDirection.set(sortDirection);
    primarySortField.sortOrder.set(0);
  } else {
    _.each(fields, (field) => {
      if (field.fieldId === fieldId) {
        field.sortOrder.set(0);
        if (primarySortField) {
          field.sortDirection.set(primarySortField.sortDirection.get());
        }
      } else {
        const sortOrder = 1 + field.sortOrder.get();
        field.sortOrder.set(sortOrder);
      }
    });
  }
};
