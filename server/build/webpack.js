import path from 'path'
import webpack from 'webpack'
import resolve from 'resolve'
import CaseSensitivePathPlugin from 'case-sensitive-paths-webpack-plugin'
import WriteFilePlugin from 'write-file-webpack-plugin'
import FriendlyErrorsWebpackPlugin from 'friendly-errors-webpack-plugin'
import {getPages} from './webpack/utils'
import {
  IS_BUNDLED_PAGE
} from '../utils'
import NextJsSsrImportPlugin from './plugins/nextjs-ssr-import'
import DynamicChunksPlugin from './plugins/dynamic-chunks-plugin'
import UnlinkFilePlugin from './plugins/unlink-file-plugin'
import BuildStatsPlugin from './plugins/build-stats'
import findBabelConfig from './babel/find-config'

const nextDir = path.join(__dirname, '..', '..', '..')
const nextNodeModulesDir = path.join(nextDir, 'node_modules')
const nextPagesDir = path.join(nextDir, 'pages')
const defaultPages = [
  '_error.js',
  '_document.js'
]
const interpolateNames = new Map(defaultPages.map((p) => {
  return [path.join(nextPagesDir, p), `dist/bundles/pages/${p}`]
}))

function babelConfig (dir, {isServer, dev}) {
  const mainBabelOptions = {
    cacheDirectory: true,
    presets: [],
    plugins: [
      dev && !isServer && require.resolve('react-hot-loader/babel')
    ].filter(Boolean)
  }

  const externalBabelConfig = findBabelConfig(dir)
  if (externalBabelConfig) {
    // Log it out once
    if (!isServer) {
      console.log(`> Using external babel configuration`)
      console.log(`> Location: "${externalBabelConfig.loc}"`)
    }
    // It's possible to turn off babelrc support via babelrc itself.
    // In that case, we should add our default preset.
    // That's why we need to do this.
    const { options } = externalBabelConfig
    mainBabelOptions.babelrc = options.babelrc !== false
  } else {
    mainBabelOptions.babelrc = false
  }

  // Add our default preset if the no "babelrc" found.
  if (!mainBabelOptions.babelrc) {
    mainBabelOptions.presets.push(require.resolve('./babel/preset'))
  }

  return mainBabelOptions
}

function externalsConfig (dir, isServer) {
  const externals = []

  if (!isServer) {
    return externals
  }

  externals.push((context, request, callback) => {
    if (request === '../next-manifest.json') {
      return callback(null, `commonjs ${request}`)
    }
    resolve(request, { basedir: dir, preserveSymlinks: true }, (err, res) => {
      if (err) {
        return callback()
      }

      // Webpack itself has to be compiled because it doesn't always use module relative paths
      if (res.match(/node_modules[/\\]next[/\\]dist[/\\]pages/)) {
        return callback()
      }

      if (res.match(/node_modules[/\\]webpack/)) {
        return callback()
      }

      if (res.match(/node_modules[/\\].*\.js/)) {
        return callback(null, `commonjs ${request}`)
      }

      callback()
    })
  })

  return externals
}

function generateChunkConfig ({dev, isServer}) {
  if (isServer) {
    return {}
  }

  if (dev) {
    return {
      cacheGroups: {
        commons: {
          test: /[\\/]node_modules[\\/]/,
          name: 'static/vendors',
          chunks: 'all'
        }
      }
    }
  }

  return {
    cacheGroups: {
      commons: {
        name: 'static/commons',
        chunks: 'initial',
        minChunks: 2
      }
    }
  }
}

export default async function getBaseWebpackConfig (dir, {dev = false, isServer = false, buildId, config}) {
  const babelLoaderOptions = babelConfig(dir, {dev, isServer})

  const defaultLoaders = {
    babel: {
      loader: 'babel-loader',
      options: babelLoaderOptions
    }
  }

  // Support for NODE_PATH
  const nodePathList = (process.env.NODE_PATH || '')
    .split(process.platform === 'win32' ? ';' : ':')
    .filter((p) => !!p)

  let totalPages

  let webpackConfig = {
    mode: dev ? 'development' : 'production',
    devtool: dev ? 'source-map' : false,
    name: isServer ? 'server' : 'client',
    cache: dev,
    recordsPath: path.resolve(dir, './records.json'),
    target: isServer ? 'node' : 'web',
    externals: externalsConfig(dir, isServer),
    context: dir,
    entry: async () => {
      const pages = await getPages(dir, {dev, isServer, pageExtensions: config.pageExtensions.join('|')})
      totalPages = Object.keys(pages).length
      const mainJS = require.resolve(`../../client/next${dev ? '-dev' : ''}`)
      const clientConfig = !isServer ? {
        'static/main': [
          dev && !isServer && path.join(__dirname, '..', '..', 'client', 'webpack-hot-middleware-client'),
          dev && !isServer && path.join(__dirname, '..', '..', 'client', 'on-demand-entries-client'),
          mainJS
        ].filter(Boolean)
      } : {}
      return {
        ...clientConfig,
        ...pages
      }
    },
    output: {
      path: path.join(dir, config.distDir, isServer ? 'dist' : ''), // server compilation goes to `.next/dist`
      publicPath: '/_next/',
      filename: '[name]',
      libraryTarget: 'commonjs2',
      // This saves chunks with the name given via require.ensure()
      chunkFilename: (context) => {
        if (isServer) {
          return '[name]'
        }

        const {name} = context.chunk

        if (IS_BUNDLED_PAGE.test(name)) {
          return '[name]'
        }

        return '[name]-[chunkhash].js'
      },
      strictModuleExceptionHandling: true,
      devtoolModuleFilenameTemplate: '[absolute-resource-path]'
    },
    performance: { hints: false },
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      modules: [
        nextNodeModulesDir,
        'node_modules',
        ...nodePathList // Support for NODE_PATH environment variable
      ],
      alias: {
        next: nextDir,
        // React already does something similar to this.
        // But if the user has react-devtools, it'll throw an error showing that
        // we haven't done dead code elimination (via uglifyjs).
        // We purposly do not uglify React code to save the build time.
        // (But it didn't increase the overall build size)
        // Here we are doing an exact match with '$'
        // So, you can still require nested modules like `react-dom/server`
        react$: dev ? 'react/cjs/react.development.js' : 'react/cjs/react.production.min.js',
        'react-dom$': dev ? 'react-dom/cjs/react-dom.development.js' : 'react-dom/cjs/react-dom.production.min.js'
      }
    },
    resolveLoader: {
      modules: [
        nextNodeModulesDir,
        'node_modules',
        path.join(__dirname, 'loaders'),
        ...nodePathList // Support for NODE_PATH environment variable
      ]
    },
    optimization: {
      splitChunks: generateChunkConfig({dev, isServer}),
      minimize: !isServer && !dev
    },
    module: {
      rules: [
        !isServer && {
          test: /\.(js|jsx)(\?[^?]*)?$/,
          loader: 'page-loader',
          include: [
            path.join(dir, 'pages'),
            path.join(nextDir, 'dist', 'pages')
          ]
        },
        dev && !isServer && {
          test: /\.(js|jsx)(\?[^?]*)?$/,
          loader: 'hot-self-accept-loader',
          include: [
            path.join(dir, 'pages'),
            path.join(nextDir, 'dist', 'pages')
          ]
        },
        {
          test: /\.+(js|jsx)$/,
          include: [dir],
          exclude: /node_modules/,
          use: defaultLoaders.babel
        }
      ].filter(Boolean)
    },
    plugins: [
      new webpack.IgnorePlugin(/(precomputed)/, /node_modules.+(elliptic)/),
      dev && new webpack.NoEmitOnErrorsPlugin(),
      dev && !isServer && new FriendlyErrorsWebpackPlugin(),
      dev && !isServer && new webpack.HotModuleReplacementPlugin(), // Hot module replacement
      dev && new UnlinkFilePlugin(),
      dev && new CaseSensitivePathPlugin(), // Since on macOS the filesystem is case-insensitive this will make sure your path are case-sensitive
      dev && new webpack.LoaderOptionsPlugin({
        options: {
          context: dir,
          customInterpolateName (url, name, opts) {
            return interpolateNames.get(this.resourcePath) || url
          }
        }
      }),
      dev && new WriteFilePlugin({
        exitOnErrors: false,
        log: false,
        // required not to cache removed files
        useHashIndex: false
      }),
      !dev && new webpack.IgnorePlugin(/react-hot-loader/),
      !isServer && new BuildStatsPlugin(),
      !isServer && new DynamicChunksPlugin(),
      isServer && new NextJsSsrImportPlugin()
    ].filter(Boolean)
  }

  if (typeof config.webpack === 'function') {
    webpackConfig = config.webpack(webpackConfig, {dir, dev, isServer, buildId, config, defaultLoaders, totalPages})
  }

  return webpackConfig
}
