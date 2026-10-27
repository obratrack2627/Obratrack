function storage() {
  const data = {};
  Object.defineProperties(data, {
    getItem: { value: (key) => (Object.hasOwn(data, key) ? data[key] : null) },
    setItem: {
      value: (key, value) => {
        data[key] = String(value);
      },
    },
    removeItem: {
      value: (key) => {
        delete data[key];
      },
    },
    clear: {
      value: () => Object.keys(data).forEach((key) => delete data[key]),
    },
  });
  return data;
}
module.exports = () => {
  global.localStorage = storage();
  global.sessionStorage = storage();
  global.window = {
    dispatchEvent() {},
    addEventListener() {},
    removeEventListener() {},
  };
  window.localStorage = localStorage;
};
