module.exports = {
  isPost,
  isString,
  isObject
}

function isPost(message) {
  return !!(message.value?.content?.type === 'post' && message.value?.content?.text)
}

function isString(s) {
  return !!(typeof s === 'string' || s instanceof String)
}

function isObject(o) {
  return !!(typeof o === 'object' && o !== null)
}
