module.exports = {
  isPost,
  isString,
  isObject,
  parseRange
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

// bytes=0-1023, 1024-1025 => [ [ '0', '1023' ], [ '1024', '1025' ] ]
function parseRange(range) {
  const ranges = parseRangeString(range)
  return ranges.map(range => {
    return range.split('-')
  })
}

function parseRangeString(range) {
  if (!range.includes('bytes=')) return undefined

  const data = range.split('bytes=')[1]
  if (data.includes(',')) {
    const ranges = data.split(',')
    return ranges
  }
  return [data]
}
