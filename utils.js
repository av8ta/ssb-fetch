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

/**
 * bytes=0-1023, 1024-1025 => [ [ 0, 1023 ], [ 1024, 1025 ] ]
 * bytes=0-1023, 1024- => [ [ 0, 1023 ], [ 1024, -1 ] ]
 *
 * -1 indicates to end of blob because:
 * blobs.getSlice(start, end+1) the end is set to zero which returns to end of blob
 **/
function parseRange(range) {
  return parseRangeString(range)
    .map(range => {
      return range.split('-')
    })
    .map(([start, end]) => (end === '' ? [Number(start), -1] : [Number(start), Number(end)]))
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
