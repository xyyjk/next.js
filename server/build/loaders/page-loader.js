import { resolve, relative } from 'path'

module.exports = function (content, sourceMap) {
  this.cacheable()

  const route = getRoute(this)

  // Webpack has a built in system to prevent default from colliding, giving it a random letter per export.
  // We can safely check if Component is undefined since all other pages imported into the entrypoint don't have __webpack_exports__.default
  this.callback(null, `${content}
    ;(function (Component, route) {
      if(!Component) return
      __NEXT_REGISTER_PAGE(${JSON.stringify(route)}, function() {             
        return {page: Component}
      })
    })(typeof __webpack_exports__ !== 'undefined' ? __webpack_exports__.default : (module.exports.default || module.exports), ${JSON.stringify(route)})
  `, sourceMap)
}

const nextPagesDir = resolve(__dirname, '..', '..', '..', 'pages')

function getRoute (loaderContext) {
  const pagesDir = resolve(loaderContext.rootContext, 'pages')
  const { resourcePath } = loaderContext
  const dir = [pagesDir, nextPagesDir]
  .find((d) => resourcePath.indexOf(d) === 0)
  const path = relative(dir, resourcePath)
  return '/' + path.replace(/((^|\/)index)?\.js$/, '')
}
